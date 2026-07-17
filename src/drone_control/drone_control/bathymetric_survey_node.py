"""
bathymetric_survey_node.py — Autonomous bathymetric survey executor.

Orchestrates a complete bathymetric survey:
  1. Receives grid waypoints from the UI (MAVROS local-frame coordinates)
  2. Flies to each waypoint using GUIDED-mode position setpoints (publisher, 10Hz)
  3. Tilts gimbal straight down and classifies surface (WATER/SOIL)
  4. WATER: descends in steps until sonar submerged → reads depth → ascends
  5. SOIL: records sonar range as terrain height
  6. Publishes per-point results and overall progress
  7. After all points: computes water volume and publishes final results
  8. Commands RTL

State machine:
  IDLE → SETUP → FLYING_TO_WP → STABILIZING → CLASSIFYING →
  DESCENDING → MEASURING → ASCENDING →
  FLYING_TO_WP → ... → COMPUTING → COMPLETE

Topics subscribed:
  /bathymetric_survey/start   (String — JSON waypoint array)
  /bathymetric_survey/abort   (String — abort command)
  /mavros/local_position/pose (drone position)
  /sonar/range                (raw sonar distance)
  /sonar/water_depth          (computed depth when submerged)
  /sonar/status               (ABOVE_WATER | SUBMERGED)

Topics published:
  /mavros/setpoint_position/local  (PoseStamped — 10Hz position commands)
  /survey/progress                 (String — JSON progress)
  /survey/point_measured           (String — JSON per-point data)
  /survey/results                  (String — JSON final results + volume)

Services called:
  /mavros/set_mode       (SetMode)
  /mavros/cmd/arming     (CommandBool)
  /surface/classify      (Trigger)
"""

import json
import math
import time

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy

from geometry_msgs.msg import PoseStamped
from sensor_msgs.msg import Range
from std_msgs.msg import Float64, String
from mavros_msgs.srv import SetMode, CommandBool, ParamSet
from mavros_msgs.msg import OverrideRCIn, MountControl
from std_srvs.srv import Trigger


# ── State constants ──
IDLE = 'IDLE'
SETUP = 'SETUP'
FLYING_TO_WP = 'FLYING_TO_WP'
STABILIZING = 'STABILIZING'
CLASSIFYING = 'CLASSIFYING'
DESCENDING = 'DESCENDING'
MEASURING = 'MEASURING'
ASCENDING = 'ASCENDING'
COMPUTING = 'COMPUTING'
COMPLETE = 'COMPLETE'
ABORTED = 'ABORTED'


class BathymetricSurveyNode(Node):

    def __init__(self):
        super().__init__('bathymetric_survey_node')

        # ── Parameters ──
        self.declare_parameter('test_mode', False)
        self.declare_parameter('survey_altitude', 10.0)
        self.declare_parameter('position_tolerance', 1.0)  # meters
        self.declare_parameter('stabilize_time', 2.0)  # seconds to hover before classifying
        self.declare_parameter('descent_step', 0.3)  # meters per descent step
        self.declare_parameter('descent_wait', 1.0)  # seconds between descent steps
        self.declare_parameter('min_altitude', -3.0)  # safety floor (local Z)
        self.declare_parameter('setpoint_rate', 10.0)  # Hz for position publisher
        self.declare_parameter('gimbal_pitch_down', -1.5708)  # 90° down

        if self.get_parameter('test_mode').value:
            self.get_logger().info('BathymetricSurveyNode started in TEST mode — exiting.')
            raise SystemExit(0)

        self.survey_alt = float(self.get_parameter('survey_altitude').value)
        self.pos_tol = float(self.get_parameter('position_tolerance').value)
        self.stab_time = float(self.get_parameter('stabilize_time').value)
        self.descent_step = float(self.get_parameter('descent_step').value)
        self.descent_wait = float(self.get_parameter('descent_wait').value)
        self.min_alt = float(self.get_parameter('min_altitude').value)
        self.setpoint_rate = self.get_parameter('setpoint_rate').value
        self.gimbal_pitch = self.get_parameter('gimbal_pitch_down').value

        # ── State ──
        self.state = IDLE
        self.waypoints = []
        self.current_wp_idx = 0
        self.survey_results = []  # list of {x, y, type, depth/elevation, ...}
        self.grid_spacing = 2.0  # will be set from UI data

        # ── Drone telemetry ──
        self._drone_x = 0.0
        self._drone_y = 0.0
        self._drone_z = 0.0
        self._sonar_range = 0.0
        self._water_depth = -1.0
        self._sonar_status = 'ABOVE_WATER'

        # ── Target setpoint (published at 10Hz) ──
        self._target_x = 0.0
        self._target_y = 0.0
        self._target_z = 0.0

        # ── Timestamps for stabilization ──
        self._arrived_time = None
        self._descent_last_step_time = None

        # ── QoS ──
        mavros_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=10,
        )

        # ── Subscribers ──
        self.create_subscription(
            String, '/bathymetric_survey/start', self._start_cb, 10)
        self.create_subscription(
            String, '/bathymetric_survey/abort', self._abort_cb, 10)
        self.create_subscription(
            PoseStamped, '/mavros/local_position/pose',
            self._pose_cb, mavros_qos)
        self.create_subscription(
            Range, '/sonar/range', self._sonar_range_cb, 10)
        self.create_subscription(
            Float64, '/sonar/water_depth', self._water_depth_cb, 10)
        self.create_subscription(
            String, '/sonar/status', self._sonar_status_cb, 10)

        # ── Publishers ──
        self.setpoint_pub = self.create_publisher(
            PoseStamped, '/mavros/setpoint_position/local', 10)
        self.progress_pub = self.create_publisher(
            String, '/survey/progress', 10)
        self.point_pub = self.create_publisher(
            String, '/survey/point_measured', 10)
        self.results_pub = self.create_publisher(
            String, '/survey/results', 10)
        # Gimbal pitch control via MAVROS mount control
        self.mount_control_pub = self.create_publisher(
            MountControl, '/mavros/mount_control/command', 10)
        # Gimbal pitch control via MAVROS RC override
        self.rc_override_pub = self.create_publisher(
            OverrideRCIn, '/mavros/rc/override', 10)
        # Parameter set client
        self.param_set_client = self.create_client(
            ParamSet, '/mavros/param/set')

        # ── Service clients ──
        self.set_mode_client = self.create_client(SetMode, '/mavros/set_mode')
        self.arming_client = self.create_client(CommandBool, '/mavros/cmd/arming')
        self.classify_client = self.create_client(Trigger, '/surface/classify')

        # ── Setpoint timer (10Hz) — always running ──
        period = 1.0 / self.setpoint_rate
        self.create_timer(period, self._setpoint_timer_cb)

        # ── State machine timer (5Hz) ──
        self.create_timer(0.2, self._state_machine_tick)

        self.get_logger().info(
            f'BathymetricSurveyNode started  |  alt={self.survey_alt}  '
            f'tol={self.pos_tol}  descent_step={self.descent_step}'
        )

    # ==================================================================
    #  CALLBACKS
    # ==================================================================

    def _start_cb(self, msg: String):
        """Receive survey waypoints from the UI and begin the survey."""
        if self.state != IDLE:
            self.get_logger().warn(
                f'Cannot start survey — current state: {self.state}')
            return

        try:
            data = json.loads(msg.data)
            if isinstance(data, dict):
                self.waypoints = data.get('waypoints', [])
                self.grid_spacing = data.get('spacing', 2.0)
                self.survey_alt = float(data.get('altitude', self.survey_alt))
            else:
                self.waypoints = data
        except json.JSONDecodeError:
            self.get_logger().error('Invalid JSON in survey start message')
            return

        if not self.waypoints:
            self.get_logger().error('No waypoints received')
            return

        self.current_wp_idx = 0
        self.survey_results = []
        self.state = SETUP

        self.get_logger().info(
            f'Survey started with {len(self.waypoints)} waypoints, '
            f'spacing={self.grid_spacing}m, alt={self.survey_alt}m'
        )
        self._publish_progress()

    def _abort_cb(self, msg: String):
        """Abort the survey and RTL."""
        if self.state in (IDLE, COMPLETE, ABORTED):
            return
        self.get_logger().warn('Survey ABORTED by user')
        self.state = ABORTED
        self._call_set_mode('RTL')
        self._publish_progress()

    def _pose_cb(self, msg: PoseStamped):
        self._drone_x = msg.pose.position.x
        self._drone_y = msg.pose.position.y
        self._drone_z = msg.pose.position.z

    def _sonar_range_cb(self, msg: Range):
        self._sonar_range = msg.range

    def _water_depth_cb(self, msg: Float64):
        self._water_depth = msg.data

    def _sonar_status_cb(self, msg: String):
        self._sonar_status = msg.data

    # ==================================================================
    #  SETPOINT PUBLISHER (10Hz)
    # ==================================================================

    def _setpoint_timer_cb(self):
        """Publish position setpoint at 10Hz — required by ArduPilot GUIDED."""
        if self.state in (IDLE, COMPLETE, ABORTED):
            return

        msg = PoseStamped()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.header.frame_id = 'map'
        msg.pose.position.x = float(self._target_x)
        msg.pose.position.y = float(self._target_y)
        msg.pose.position.z = float(self._target_z)
        # Keep yaw at 0 (north-facing)
        msg.pose.orientation.w = 1.0
        self.setpoint_pub.publish(msg)

        # Force the gimbal to look straight down continuously via RC override
        rc_msg = OverrideRCIn()
        rc_msg.channels = [65535] * 18
        rc_msg.channels[9] = 1700  # Channel 10 (0-indexed 9) = pitch straight down
        self.rc_override_pub.publish(rc_msg)

    # ==================================================================
    #  STATE MACHINE (5Hz tick)
    # ==================================================================

    def _state_machine_tick(self):
        """Main state machine — called at 5Hz."""
        if self.state == IDLE or self.state == COMPLETE or self.state == ABORTED:
            return

        if self.state == SETUP:
            self._do_setup()
        elif self.state == FLYING_TO_WP:
            self._do_flying()
        elif self.state == STABILIZING:
            self._do_stabilizing()
        elif self.state == CLASSIFYING:
            self._do_classifying()
        elif self.state == DESCENDING:
            self._do_descending()
        elif self.state == MEASURING:
            self._do_measuring()
        elif self.state == ASCENDING:
            self._do_ascending()
        elif self.state == COMPUTING:
            self._do_computing()

    # ------------------------------------------------------------------
    def _do_setup(self):
        """Switch to GUIDED mode and tilt gimbal down."""
        # Dynamically set SERVO10_FUNCTION to 1 (RCPassThru) so RC10 input maps to pitch output
        self._set_parameter('SERVO10_FUNCTION', 1)

        self.get_logger().info('SETUP: Switching to GUIDED mode...')
        self._call_set_mode('GUIDED')

        # Set first waypoint target
        wp = self.waypoints[0]
        self._target_x = float(wp['x'])
        self._target_y = float(wp['y'])
        self._target_z = self.survey_alt

        self.state = FLYING_TO_WP
        self.get_logger().info(
            f'Flying to WP 1/{len(self.waypoints)}: '
            f'({self._target_x:.1f}, {self._target_y:.1f}, {self._target_z:.1f})'
        )
        self._publish_progress()

    # ------------------------------------------------------------------
    def _do_flying(self):
        """Check if drone has arrived at current waypoint."""
        dx = self._drone_x - self._target_x
        dy = self._drone_y - self._target_y
        dz = self._drone_z - self._target_z
        dist = math.sqrt(dx * dx + dy * dy + dz * dz)

        if dist < self.pos_tol:
            self.state = STABILIZING
            self._arrived_time = time.time()
            self.get_logger().info(
                f'Arrived at WP {self.current_wp_idx + 1} — stabilizing...'
            )
            self._publish_progress()

    # ------------------------------------------------------------------
    def _do_stabilizing(self):
        """Hover for a few seconds to stabilize before classifying."""
        elapsed = time.time() - self._arrived_time
        if elapsed >= self.stab_time:
            self.state = CLASSIFYING
            self.get_logger().info('Stabilized — requesting classification...')
            self._publish_progress()

    # ------------------------------------------------------------------
    def _do_classifying(self):
        """Call the surface classifier service."""
        if not self.classify_client.service_is_ready():
            self.get_logger().warn('Classifier service not ready — waiting...')
            return

        # Call asynchronously
        future = self.classify_client.call_async(Trigger.Request())
        future.add_done_callback(self._classification_done)
        # Move to a waiting sub-state (we won't re-call until callback fires)
        self.state = '_CLASSIFYING_WAIT'

    def _classification_done(self, future):
        """Callback when classification service returns."""
        try:
            result = future.result()
            classification = result.message  # "WATER" or "SOIL"
        except Exception as e:
            self.get_logger().error(f'Classification failed: {e}')
            classification = 'SOIL'  # fallback: treat as soil

        wp = self.waypoints[self.current_wp_idx]
        self.get_logger().info(
            f'WP {self.current_wp_idx + 1}: classified as {classification}'
        )

        if classification == 'WATER':
            # Begin descent to submerge sonar
            self.state = DESCENDING
            self._descent_last_step_time = time.time()
            self.get_logger().info('WATER detected — beginning descent...')
        else:
            # SOIL: record terrain elevation from sonar range
            # sonar_range = distance from sensor to ground
            # sensor is at drone_z - 2.0 (boom length)
            # terrain_z_local = (drone_z - 2.0) - sonar_range
            terrain_z = (self._drone_z - 2.0) - self._sonar_range
            self.survey_results.append({
                'x': float(wp['x']),
                'y': float(wp['y']),
                'type': 'SOIL',
                'elevation': terrain_z,
                'sonar_range': self._sonar_range,
                'drone_z': self._drone_z,
            })
            self._publish_point(self.survey_results[-1])
            self.get_logger().info(
                f'SOIL recorded: elevation={terrain_z:.2f}m  '
                f'sonar_range={self._sonar_range:.2f}m'
            )
            self._advance_to_next_wp()

        self._publish_progress()

    # ------------------------------------------------------------------
    def _do_descending(self):
        """Descend in steps, checking sonar status at each step."""
        now = time.time()

        # Check if sonar is submerged
        if self._sonar_status == 'SUBMERGED':
            self.state = MEASURING
            self.get_logger().info(
                f'Sonar SUBMERGED at drone_z={self._drone_z:.2f}m — measuring depth...'
            )
            self._publish_progress()
            return

        # Safety check: don't descend below minimum altitude
        if self._drone_z < self.min_alt:
            self.get_logger().warn(
                f'Hit safety floor ({self.min_alt}m) without submersion — '
                f'treating as SOIL'
            )
            wp = self.waypoints[self.current_wp_idx]
            terrain_z = (self._drone_z - 2.0) - self._sonar_range
            self.survey_results.append({
                'x': float(wp['x']),
                'y': float(wp['y']),
                'type': 'SOIL',
                'elevation': terrain_z,
                'sonar_range': self._sonar_range,
                'drone_z': self._drone_z,
                'note': 'safety_floor_reached',
            })
            self._publish_point(self.survey_results[-1])
            # Ascend back
            self._target_z = self.survey_alt
            self.state = ASCENDING
            self._publish_progress()
            return

        # Descend one step every descent_wait seconds
        if now - self._descent_last_step_time >= self.descent_wait:
            self._target_z -= self.descent_step
            self._descent_last_step_time = now
            self.get_logger().debug(
                f'Descending... target_z={self._target_z:.2f}  '
                f'drone_z={self._drone_z:.2f}  status={self._sonar_status}'
            )

    # ------------------------------------------------------------------
    def _do_measuring(self):
        """Read the water depth from the submerged sonar."""
        wp = self.waypoints[self.current_wp_idx]

        if self._water_depth > 0:
            self.survey_results.append({
                'x': float(wp['x']),
                'y': float(wp['y']),
                'type': 'WATER',
                'depth': self._water_depth,
                'sonar_range': self._sonar_range,
                'drone_z': self._drone_z,
            })
            self._publish_point(self.survey_results[-1])
            self.get_logger().info(
                f'WATER depth measured: {self._water_depth:.2f}m'
            )

            # Ascend back to survey altitude
            self._target_z = self.survey_alt
            self.state = ASCENDING
            self._publish_progress()
        else:
            # Depth not available yet — wait
            self.get_logger().debug(
                f'Waiting for valid depth reading... '
                f'current={self._water_depth:.2f}'
            )

    # ------------------------------------------------------------------
    def _do_ascending(self):
        """Ascend back to survey altitude."""
        dz = abs(self._drone_z - self.survey_alt)
        if dz < self.pos_tol:
            self.get_logger().info('Back at survey altitude')
            self._advance_to_next_wp()

    # ------------------------------------------------------------------
    def _do_computing(self):
        """Compute volume and publish final results."""
        volume_data = self._compute_volume()

        results = {
            'points': self.survey_results,
            'volume': volume_data,
            'grid_spacing': self.grid_spacing,
            'survey_altitude': self.survey_alt,
            'total_points': len(self.survey_results),
        }

        # Cache the results JSON for repeated publishing
        self._final_results_json = json.dumps(results)

        msg = String()
        msg.data = self._final_results_json
        self.results_pub.publish(msg)

        self.get_logger().info(
            f'Survey COMPLETE! {len(self.survey_results)} points measured. '
            f'Volume: {volume_data["current_volume_m3"]:.1f}m³ / '
            f'{volume_data["max_capacity_m3"]:.1f}m³ '
            f'({volume_data["fill_percentage"]:.1f}%)'
        )

        # RTL
        self._call_set_mode('RTL')
        self.state = COMPLETE

        # Publish COMPLETE progress repeatedly for 3 seconds so the UI
        # reliably receives it through rosbridge throttling
        self._complete_pub_count = 0
        self._complete_timer = self.create_timer(
            0.3, self._publish_complete_repeatedly)

    def _publish_complete_repeatedly(self):
        """Publish COMPLETE state + results several times so the UI picks it up."""
        self._complete_pub_count += 1
        self._publish_progress()

        # Re-publish results so the UI gets it
        msg = String()
        msg.data = self._final_results_json
        self.results_pub.publish(msg)

        if self._complete_pub_count >= 10:  # 10 × 0.3s = 3 seconds
            self._complete_timer.cancel()
            self.get_logger().info('Finished broadcasting COMPLETE state.')

    def _set_parameter(self, param_id, int_value):
        """Set an ArduPilot parameter dynamically via MAVROS service."""
        if not self.param_set_client.service_is_ready():
            self.get_logger().warn(f'Param set service not ready for {param_id}')
            return
        req = ParamSet.Request()
        req.param_id = param_id
        req.value.integer = int(int_value)
        self.param_set_client.call_async(req)
        self.get_logger().info(f'Requested param set {param_id} = {int_value}')

    # ==================================================================
    #  VOLUME CALCULATION
    # ==================================================================

    def _compute_volume(self) -> dict:
        """Compute water volume from survey measurements."""
        water_points = [p for p in self.survey_results if p['type'] == 'WATER']
        soil_points = [p for p in self.survey_results if p['type'] == 'SOIL']

        cell_area = self.grid_spacing * self.grid_spacing  # m²

        # Current water volume: sum of depth × cell_area
        current_volume = sum(p['depth'] * cell_area for p in water_points)

        # Find minimum soil elevation (the "spill level")
        if soil_points:
            min_soil_z = min(p['elevation'] for p in soil_points)
        else:
            min_soil_z = 0.0

        # Water surface Z estimate: sensor_world_z when sonar is just submerged
        # Approximate from the sonar_depth_node: water_surface_z = -1.0 default
        water_surface_z = -1.0  # could be computed from data

        # Maximum capacity: for each water point, how deep could it be
        # if filled to the spill level
        max_capacity = 0.0
        for p in water_points:
            # bottom_z = water_surface_z - depth
            bottom_z = water_surface_z - p['depth']
            # max depth at this point = min_soil_z - bottom_z
            # (but only if min_soil_z > bottom_z, else it's already overflowing)
            max_depth = max(0.0, min_soil_z - bottom_z)
            max_capacity += max_depth * cell_area

        fill_pct = 0.0
        if max_capacity > 0:
            fill_pct = (current_volume / max_capacity) * 100.0

        return {
            'current_volume_m3': round(current_volume, 2),
            'max_capacity_m3': round(max_capacity, 2),
            'fill_percentage': round(fill_pct, 1),
            'min_soil_elevation': round(min_soil_z, 3),
            'water_surface_z': water_surface_z,
            'water_point_count': len(water_points),
            'soil_point_count': len(soil_points),
            'grid_spacing': self.grid_spacing,
        }
    # ==================================================================
    #  HELPERS
    # ==================================================================

    def _advance_to_next_wp(self):
        """Move to the next waypoint or finish the survey."""
        self.current_wp_idx += 1
        if self.current_wp_idx >= len(self.waypoints):
            self.get_logger().info('All waypoints measured — computing volume...')
            self.state = COMPUTING
        else:
            wp = self.waypoints[self.current_wp_idx]
            self._target_x = float(wp['x'])
            self._target_y = float(wp['y'])
            self._target_z = self.survey_alt
            self.state = FLYING_TO_WP
            self.get_logger().info(
                f'Flying to WP {self.current_wp_idx + 1}/{len(self.waypoints)}: '
                f'({self._target_x:.1f}, {self._target_y:.1f})'
            )
        self._publish_progress()

    def _publish_progress(self):
        """Publish current progress."""
        total = len(self.waypoints) if self.waypoints else 0
        current = min(self.current_wp_idx + 1, total)
        pct = (self.current_wp_idx / total * 100) if total > 0 else 0

        progress = {
            'state': self.state,
            'current_wp': current,
            'total_wps': total,
            'percent': round(pct, 1),
            'measured': len(self.survey_results),
        }
        msg = String()
        msg.data = json.dumps(progress)
        self.progress_pub.publish(msg)

    def _publish_point(self, point_data: dict):
        """Publish a single measured point."""
        msg = String()
        msg.data = json.dumps(point_data)
        self.point_pub.publish(msg)

    def _call_set_mode(self, mode: str):
        """Call MAVROS set_mode service (non-blocking)."""
        if not self.set_mode_client.service_is_ready():
            self.get_logger().warn(f'set_mode service not ready for {mode}')
            return
        req = SetMode.Request()
        req.base_mode = 0
        req.custom_mode = mode
        future = self.set_mode_client.call_async(req)
        future.add_done_callback(
            lambda f: self.get_logger().info(f'Set mode {mode}: {f.result()}')
        )

    def _call_arming(self, arm: bool):
        """Call MAVROS arming service (non-blocking)."""
        if not self.arming_client.service_is_ready():
            self.get_logger().warn('arming service not ready')
            return
        req = CommandBool.Request()
        req.value = arm
        future = self.arming_client.call_async(req)
        future.add_done_callback(
            lambda f: self.get_logger().info(
                f'Arming {"ON" if arm else "OFF"}: {f.result()}'
            )
        )


def main(args=None):
    rclpy.init(args=args)
    node = BathymetricSurveyNode()
    try:
        rclpy.spin(node)
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()


if __name__ == '__main__':
    main()
