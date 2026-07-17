import rclpy
from rclpy.node import Node
from pymavlink import mavutil

class DroneMavlinkNode(Node):
    def __init__(self):
        super().__init__('drone_mavlink_node')
        
        # MAVProxy forwards MAVLink telemetry to UDP ports 14550 and 14551 by default.
        self.get_logger().info("Connecting to ArduPilot SITL via UDP...")
        self.connection = mavutil.mavlink_connection('udp:127.0.0.1:14551')
        
        # Wait for the first heartbeat to confirm connection
        self.connection.wait_heartbeat()
        self.get_logger().info(f"Heartbeat detected! System ID: {self.connection.target_system}")
        
        # Execute an example command: Arm the drone
        self.arm_drone()

    def arm_drone(self):
        self.get_logger().info("Sending ARM command...")
        self.connection.mav.command_long_send(
            self.connection.target_system,
            self.connection.target_component,
            mavutil.mavlink.MAV_CMD_COMPONENT_ARM_DISARM,
            0,
            1, 0, 0, 0, 0, 0, 0  # 1 indicates Arming
        )
        
        # Wait for the acknowledgement from the flight controller
        msg = self.connection.recv_match(type='COMMAND_ACK', blocking=True, timeout=5)
        if msg:
            self.get_logger().info(f"Command Acknowledged: Result {msg.result}")
        else:
            self.get_logger().warn("No acknowledgement received.")

def main(args=None):
    rclpy.init(args=args)
    node = DroneMavlinkNode()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()

if __name__ == '__main__':
    main()
