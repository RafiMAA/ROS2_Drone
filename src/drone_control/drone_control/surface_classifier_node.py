"""
surface_classifier_node.py — ROS2 node for camera-based surface classification.

Subscribes to the gimbal camera image (bridged from Gazebo) and classifies
the terrain directly below the drone as WATER or SOIL using HSV color
thresholding on the center region of the image.

Classification logic:
  • Green-dominant (H: 35-85, S > 30) → SOIL (grass/terrain)
  • Blue-dominant  (H: 90-130, S > 30) → WATER

Publishes:
  /surface/classification  — std_msgs/String ("WATER" or "SOIL")

Exposes:
  /surface/classify        — std_srvs/Trigger (classify on demand)

CHANGES vs original:
  • Logs the timestamp of every incoming camera frame (debug level) so you
    can see exactly when /gimbal_camera/image stops publishing fresh data.
  • Tracks how many frames have been received in total, and warns if the
    same frame (by ROS header stamp) gets classified twice in a row.
  • Compares the image's header stamp against wall-clock "now" at
    classification time and WARNS if the frame is older than
    `max_image_age_sec` (new parameter, default 1.0s) — this is the
    smoking gun for a frozen camera feed.
  • Saves the classified crop to latest_crop.png, overwriting it for each waypoint.
"""

import os
import time

import rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, HistoryPolicy
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor

from sensor_msgs.msg import Image
from std_msgs.msg import String
from std_srvs.srv import Trigger

import numpy as np

# cv_bridge may not be installed — fall back to raw numpy conversion
try:
    from cv_bridge import CvBridge
    _HAS_CV_BRIDGE = True
except ImportError:
    _HAS_CV_BRIDGE = False


class SurfaceClassifierNode(Node):

    def __init__(self):
        super().__init__('surface_classifier_node')

        # ── Parameters ──
        self.declare_parameter('test_mode', False)
        self.declare_parameter('center_crop_size', 100)
        # HSV thresholds (OpenCV H is 0-180)
        self.declare_parameter('water_h_min', 78)
        self.declare_parameter('water_h_max', 140)
        self.declare_parameter('soil_h_min', 10)
        self.declare_parameter('soil_h_max', 75)
        self.declare_parameter('min_saturation', 15)
        # NEW: staleness / output params
        self.declare_parameter('max_image_age_sec', 1.0)
        self.declare_parameter('crop_output_dir', '/home/abdul-rafi/Desktop/ROS2_Drone/crops')

        if self.get_parameter('test_mode').value:
            self.get_logger().info('SurfaceClassifierNode started in TEST mode — exiting.')
            raise SystemExit(0)

        self.center_crop = self.get_parameter('center_crop_size').value
        self.water_h_min = self.get_parameter('water_h_min').value
        self.water_h_max = self.get_parameter('water_h_max').value
        self.soil_h_min = self.get_parameter('soil_h_min').value
        self.soil_h_max = self.get_parameter('soil_h_max').value
        self.min_sat = self.get_parameter('min_saturation').value
        self.max_image_age_sec = float(self.get_parameter('max_image_age_sec').value)
        self.crop_output_dir = self.get_parameter('crop_output_dir').value

        os.makedirs(self.crop_output_dir, exist_ok=True)

        if _HAS_CV_BRIDGE:
            self.bridge = CvBridge()
        else:
            self.bridge = None

        # ── State ──
        self._latest_image = None
        self._latest_classification = 'UNKNOWN'

        # NEW: staleness tracking
        self._frame_count = 0
        self._last_classified_stamp = None  # (sec, nanosec) of last frame we classified
        self._classify_call_count = 0

        # ── QoS for sensor topics ──
        sensor_qos = QoSProfile(
            reliability=ReliabilityPolicy.BEST_EFFORT,
            history=HistoryPolicy.KEEP_LAST,
            depth=1,
        )

        self.cb_group = ReentrantCallbackGroup()

        # ── Subscriber: gimbal camera image ──
        self.create_subscription(
            Image,
            '/gimbal_camera/image',
            self._image_cb,
            sensor_qos,
            callback_group=self.cb_group
        )

        # ── Publisher ──
        self.class_pub = self.create_publisher(String, '/surface/classification', 10)

        # ── Service: classify on demand ──
        self.create_service(
            Trigger, 
            '/surface/classify', 
            self._classify_service_cb,
            callback_group=self.cb_group
        )

        self.get_logger().info(
            f'SurfaceClassifierNode started  |  crop={self.center_crop}  '
            f'water_H=[{self.water_h_min},{self.water_h_max}]  '
            f'soil_H=[{self.soil_h_min},{self.soil_h_max}]  '
            f'max_image_age={self.max_image_age_sec}s  '
            f'crop_output_dir={self.crop_output_dir}'
        )

    # ------------------------------------------------------------------
    def _image_cb(self, msg: Image):
        """Cache the latest image for classification."""
        self._latest_image = msg
        self._frame_count += 1
        # Debug-level so it doesn't flood the log, but visible if you bump
        # the log level — lets you confirm frames are actually arriving.
        self.get_logger().debug(
            f'Image #{self._frame_count} received: '
            f'stamp={msg.header.stamp.sec}.{msg.header.stamp.nanosec:09d}'
        )

    # ------------------------------------------------------------------
    def _classify_service_cb(self, request, response):
        """Service callback: wait for a FRESH image, then classify and return result."""
        
        # 1) Clear any old cached image
        self._latest_image = None
        
        # 2) Wait for a new image to arrive
        wait_timeout = 5.0
        start_time = time.time()
        self.get_logger().info('Waiting for a fresh camera frame...')
        
        while self._latest_image is None and (time.time() - start_time) < wait_timeout:
            time.sleep(0.05)
            
        if self._latest_image is None:
            response.success = False
            response.message = 'UNKNOWN'
            self.get_logger().warn('No new image received from camera — cannot classify')
            return response

        img_msg = self._latest_image
        self._classify_call_count += 1

        # ── NEW: staleness checks ──
        stamp = (img_msg.header.stamp.sec, img_msg.header.stamp.nanosec)

        # 1) Same exact frame classified twice in a row → camera likely frozen
        if self._last_classified_stamp is not None and stamp == self._last_classified_stamp:
            self.get_logger().warn(
                f'STALE FRAME: classify call #{self._classify_call_count} is using '
                f'the SAME image (stamp={stamp[0]}.{stamp[1]:09d}) as the previous '
                f'call. /gimbal_camera/image is likely not publishing new frames.'
            )
        self._last_classified_stamp = stamp

        # 2) Frame is older than max_image_age_sec relative to wall clock
        img_time_sec = stamp[0] + stamp[1] * 1e-9
        now_sec = self.get_clock().now().nanoseconds * 1e-9
        age_sec = now_sec - img_time_sec
        if age_sec > self.max_image_age_sec:
            self.get_logger().warn(
                f'STALE FRAME: image is {age_sec:.2f}s old '
                f'(threshold={self.max_image_age_sec}s) — classification result '
                f'may not reflect the drone\'s current position!'
            )

        classification = self._classify_image(img_msg)
        self._latest_classification = classification

        # Publish to topic as well
        msg = String()
        msg.data = classification
        self.class_pub.publish(msg)

        response.success = True
        response.message = classification
        self.get_logger().info(
            f'Classification: {classification}  '
            f'(call #{self._classify_call_count})'
        )
        return response

    # ------------------------------------------------------------------
    def _classify_image(self, img_msg: Image) -> str:
        """Classify center region of image as WATER or SOIL using HSV."""
        try:
            import cv2
        except ImportError:
            self.get_logger().error('OpenCV (cv2) not available!')
            return 'UNKNOWN'

        # Convert ROS Image to numpy array
        if self.bridge is not None:
            cv_image = self.bridge.imgmsg_to_cv2(img_msg, desired_encoding='bgr8')
        else:
            # Manual conversion for RGB8 / BGR8 encodings
            cv_image = self._manual_image_convert(img_msg)
            if cv_image is None:
                return 'UNKNOWN'

        h, w = cv_image.shape[:2]

        # Extract bottom-center crop to guarantee we see ground even if gimbal looks forward
        crop = self.center_crop
        cx = w // 2
        half = crop // 2
        x1 = max(0, cx - half)
        x2 = min(w, cx + half)
        y2 = h - 20
        y1 = max(0, y2 - crop)
        center_region = cv_image[y1:y2, x1:x2]

        # Convert to HSV
        hsv = cv2.cvtColor(center_region, cv2.COLOR_BGR2HSV)

        # Count pixels matching water and soil thresholds
        # Water: blue-dominant
        water_mask = cv2.inRange(
            hsv,
            np.array([self.water_h_min, self.min_sat, 20]),
            np.array([self.water_h_max, 255, 255]),
        )
        water_pixels = cv2.countNonZero(water_mask)

        # Soil: green/brown-dominant
        soil_mask = cv2.inRange(
            hsv,
            np.array([self.soil_h_min, self.min_sat, 20]),
            np.array([self.soil_h_max, 255, 255]),
        )
        soil_pixels = cv2.countNonZero(soil_mask)

        total = center_region.shape[0] * center_region.shape[1]

        h_min, h_max, h_mean = np.min(hsv[:,:,0]), np.max(hsv[:,:,0]), np.mean(hsv[:,:,0])
        s_min, s_max, s_mean = np.min(hsv[:,:,1]), np.max(hsv[:,:,1]), np.mean(hsv[:,:,1])
        v_min, v_max, v_mean = np.min(hsv[:,:,2]), np.max(hsv[:,:,2]), np.mean(hsv[:,:,2])

        self.get_logger().info(
            f'water_px={water_pixels}  soil_px={soil_pixels}  total={total} | '
            f'H: min={h_min}, max={h_max}, mean={h_mean:.1f} | '
            f'S: min={s_min}, max={s_max}, mean={s_mean:.1f} | '
            f'V: min={v_min}, max={v_max}, mean={v_mean:.1f}'
        )

        # Overwrite the latest crop for each WP
        latest_path = os.path.join(self.crop_output_dir, 'latest_crop.png')
        cv2.imwrite(latest_path, center_region)

        self.get_logger().info(f'Saved crop: {latest_path}')

        if water_pixels > soil_pixels:
            return 'WATER'
        else:
            return 'SOIL'

    # ------------------------------------------------------------------
    def _manual_image_convert(self, img_msg: Image):
        """Fallback: convert ROS Image to numpy without cv_bridge."""
        if img_msg.encoding in ('rgb8', 'RGB8'):
            import cv2
            arr = np.frombuffer(img_msg.data, dtype=np.uint8)
            arr = arr.reshape((img_msg.height, img_msg.width, 3))
            return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        elif img_msg.encoding in ('bgr8', 'BGR8'):
            arr = np.frombuffer(img_msg.data, dtype=np.uint8)
            return arr.reshape((img_msg.height, img_msg.width, 3))
        else:
            self.get_logger().error(
                f'Unsupported image encoding: {img_msg.encoding}'
            )
            return None


def main(args=None):
    rclpy.init(args=args)
    node = SurfaceClassifierNode()
    executor = MultiThreadedExecutor()
    executor.add_node(node)
    try:
        executor.spin()
    except (KeyboardInterrupt, SystemExit):
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()