"""
sonar_depth_node.py — ROS2 node for water depth measurement via sonar.

Subscribes to the Gazebo sonar sensor (bridged as LaserScan) and the
drone's local position from MAVROS.  Publishes:

  /sonar/range        – sensor_msgs/Range   (raw sonar distance)
  /sonar/water_depth  – std_msgs/Float64    (computed water depth, -1 if above water)
  /sonar/status       – std_msgs/String     ("ABOVE_WATER" | "SUBMERGED")

Logic:
  • The sonar sensor is mounted on a boom 2 m below the drone's base_link.
  • A water collision plane exists at a known Z (default −1.0 m world frame).
  • When the sensor is ABOVE the water surface the lidar ray hits the
    water_collision box → raw_range = distance to water surface.
  • When the sensor is SUBMERGED (below the water surface) the ray starts
    underneath the collision box → raw_range = distance to bottom terrain.
  • Water depth = raw_range + (water_surface_z − sensor_world_z)
    (i.e. the distance from the sensor down to the bottom PLUS the water
    column above the sensor up to the surface).
"""

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from sensor_msgs.msg import LaserScan, Range
from geometry_msgs.msg import PoseStamped
from std_msgs.msg import Float64, String


class SonarDepthNode(Node):

    def __init__(self):
        super().__init__('sonar_depth_node')

        # ── Declare parameters ──
        self.declare_parameter('water_surface_z', -1.0)
        self.declare_parameter('boom_length', 2.0)
        self.declare_parameter('drone_home_z', 0.195)  # iris_terrain spawn Z

        self.water_surface_z = self.get_parameter('water_surface_z').value
        self.boom_length = self.get_parameter('boom_length').value
        self.drone_home_z = self.get_parameter('drone_home_z').value

        # ── QoS for MAVROS topics ──
        mavros_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )

        # ── Subscribers ──
        self.create_subscription(
            LaserScan,
            '/sonar/scan',
            self._sonar_cb,
            10,
        )
        self.create_subscription(
            PoseStamped,
            '/mavros/local_position/pose',
            self._pose_cb,
            mavros_qos,
        )

        # ── Publishers ──
        self.range_pub = self.create_publisher(Range, '/sonar/range', 10)
        self.depth_pub = self.create_publisher(Float64, '/sonar/water_depth', 10)
        self.status_pub = self.create_publisher(String, '/sonar/status', 10)

        # ── State ──
        self._drone_local_z = 0.0  # ENU z from MAVROS (relative to home)

        self.get_logger().info(
            f'SonarDepthNode started  |  water_z={self.water_surface_z}  '
            f'boom={self.boom_length}  home_z={self.drone_home_z}'
        )

    # ------------------------------------------------------------------
    def _pose_cb(self, msg: PoseStamped):
        """Cache the drone's local-frame Z (ENU, relative to home)."""
        self._drone_local_z = msg.pose.position.z

    # ------------------------------------------------------------------
    def _sonar_cb(self, msg: LaserScan):
        if not msg.ranges:
            return

        raw_range = msg.ranges[0]

        # ── Publish raw range as sensor_msgs/Range ──
        r = Range()
        r.header = msg.header
        r.radiation_type = Range.ULTRASOUND
        r.field_of_view = 0.1
        r.min_range = 0.08
        r.max_range = 50.0
        r.range = raw_range
        self.range_pub.publish(r)

        # ── Compute sensor world-frame Z ──
        # MAVROS local_position is in ENU relative to home.
        # sensor_world_z = drone_home_z + local_z − boom_length
        sensor_world_z = (
            self.drone_home_z + self._drone_local_z - self.boom_length
        )

        # ── Determine submersion state and compute depth ──
        depth_msg = Float64()
        status_msg = String()

        if sensor_world_z <= self.water_surface_z:
            # Sensor is submerged — raw_range goes to the bottom.
            # Total water depth = distance-to-bottom + water above sensor
            water_above_sensor = self.water_surface_z - sensor_world_z
            depth_msg.data = raw_range + water_above_sensor
            status_msg.data = 'SUBMERGED'
        else:
            # Sensor is above water — raw_range hits water surface.
            # Water depth is unknown; publish −1.
            depth_msg.data = -1.0
            status_msg.data = 'ABOVE_WATER'

        self.depth_pub.publish(depth_msg)
        self.status_pub.publish(status_msg)

        self.get_logger().debug(
            f'range={raw_range:.2f}  sensor_z={sensor_world_z:.2f}  '
            f'status={status_msg.data}  depth={depth_msg.data:.2f}'
        )


def main(args=None):
    rclpy.init(args=args)
    node = SonarDepthNode()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
