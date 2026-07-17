#!/usr/bin/env python3
"""
capture_map.py — Auto-capture overhead camera image from Gazebo.

This script:
1. Subscribes to the Gazebo overhead camera image topic via ros_gz_bridge
2. Saves the first good frame as map.png in the drone_gcs/public/ directory
3. Exits after capture

Run this after launching Gazebo with iris_gcs.sdf and the ros_gz_bridge.

Usage:
  ros2 run drone_control capture_map
  # or directly:
  python3 capture_map.py
"""

import os
import sys
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import Image

# Target path for the saved map image
# Hardcoded to the source directory so it works whether run from
# source or from the colcon install directory
MAP_PATH = '/home/abdul-rafi/Desktop/ROS2_Drone/src/drone_gcs/public/map.png'

# Overhead camera topic (bridged from Gazebo via ros_gz_bridge)
CAMERA_TOPIC = '/overhead_camera/image'


class MapCaptureNode(Node):
    def __init__(self):
        super().__init__('map_capture_node')
        self.get_logger().info(f'Waiting for overhead camera on {CAMERA_TOPIC}...')
        self.get_logger().info(f'Will save to: {MAP_PATH}')

        self.captured = False
        self.frame_count = 0
        # Skip a few initial frames to let the renderer stabilize
        self.skip_frames = 3

        self.subscription = self.create_subscription(
            Image,
            CAMERA_TOPIC,
            self.image_callback,
            1
        )

    def image_callback(self, msg):
        if self.captured:
            return

        self.frame_count += 1
        if self.frame_count <= self.skip_frames:
            self.get_logger().info(f'Skipping frame {self.frame_count}/{self.skip_frames} (renderer stabilizing)...')
            return

        self.get_logger().info(f'Received image: {msg.width}x{msg.height}, encoding={msg.encoding}')

        try:
            # Convert ROS Image to PNG
            self._save_image(msg)
            self.captured = True
            self.get_logger().info(f'✓ Map captured and saved to {MAP_PATH}')
            self.get_logger().info('You can now close this node.')

            # Schedule shutdown
            self.create_timer(1.0, self._shutdown)

        except Exception as e:
            self.get_logger().error(f'Failed to save image: {e}')

    def _save_image(self, msg):
        """Convert ROS Image message to PNG file."""
        try:
            # Try using cv_bridge if available
            from cv_bridge import CvBridge
            import cv2
            bridge = CvBridge()
            cv_image = bridge.imgmsg_to_cv2(msg, desired_encoding='bgr8')
            os.makedirs(os.path.dirname(MAP_PATH), exist_ok=True)
            cv2.imwrite(MAP_PATH, cv_image)
            return
        except ImportError:
            pass

        # Fallback: manual conversion using PIL
        try:
            from PIL import Image as PILImage
            import numpy as np

            # Determine pixel format
            if msg.encoding in ('rgb8', 'RGB8'):
                mode = 'RGB'
                channels = 3
            elif msg.encoding in ('bgr8', 'BGR8'):
                mode = 'RGB'
                channels = 3
            elif msg.encoding in ('rgba8', 'RGBA8'):
                mode = 'RGBA'
                channels = 4
            else:
                self.get_logger().warn(f'Unknown encoding {msg.encoding}, attempting RGB')
                mode = 'RGB'
                channels = 3

            # Create numpy array from raw data
            img_data = np.frombuffer(msg.data, dtype=np.uint8)
            img_data = img_data.reshape((msg.height, msg.width, channels))

            # BGR to RGB conversion if needed
            if msg.encoding in ('bgr8', 'BGR8'):
                img_data = img_data[:, :, ::-1]

            pil_image = PILImage.fromarray(img_data, mode)
            os.makedirs(os.path.dirname(MAP_PATH), exist_ok=True)
            pil_image.save(MAP_PATH, 'PNG', quality=95)
            return
        except ImportError:
            pass

        # Last resort: save raw data with dimensions info
        self.get_logger().warn('Neither cv_bridge nor PIL available. Saving raw image data.')
        os.makedirs(os.path.dirname(MAP_PATH), exist_ok=True)
        raw_path = MAP_PATH.replace('.png', '.raw')
        with open(raw_path, 'wb') as f:
            f.write(msg.data)
        self.get_logger().info(f'Raw image saved to {raw_path} ({msg.width}x{msg.height}, {msg.encoding})')

    def _shutdown(self):
        self.get_logger().info('Shutting down map capture node.')
        raise SystemExit(0)


def main(args=None):
    rclpy.init(args=args)
    node = MapCaptureNode()
    try:
        rclpy.spin(node)
    except SystemExit:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
