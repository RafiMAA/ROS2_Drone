#!/bin/bash
# ─────────────────────────────────────────────────────────
# launch_ros.sh — Start all ROS2 nodes for drone GCS
# Ensures consistent RMW_IMPLEMENTATION across all nodes
# ─────────────────────────────────────────────────────────

set -e

# ── Force Cyclone DDS for all nodes ──
export RMW_IMPLEMENTATION=rmw_cyclonedds_cpp
export ROS_LOCALHOST_ONLY=1

# ── Source ROS2 and workspace ──
source /opt/ros/jazzy/setup.bash
source ~/Desktop/ROS2_Drone/install/setup.bash

echo "============================================"
echo "  RMW: $RMW_IMPLEMENTATION"
echo "  ROS_DOMAIN_ID: ${ROS_DOMAIN_ID:-0 (default)}"
echo "============================================"

# ── Kill any existing processes on port 9090 ──
lsof -ti:9090 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# ── Launch MAVROS (Explicitly bound to localhost to prevent QGC conflicts) ──
echo "[1/4] Launching MAVROS..."
ros2 launch mavros apm.launch fcu_url:=udp://127.0.0.1:14550@ &
MAVROS_PID=$!
sleep 5

# ── Launch rosbridge ──
echo "[2/4] Launching rosbridge on port 9090..."
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090 &
ROSBRIDGE_PID=$!
sleep 3

# ── Launch GZ bridge (Matches Gazebo's actual topic) ──
echo "[3/4] Launching GZ->ROS2 camera bridge..."
ros2 run ros_gz_bridge parameter_bridge /overhead_camera/image@sensor_msgs/msg/Image[gz.msgs.Image &
GZBRIDGE_PID=$!
sleep 2

# ── Launch map capture node ──
echo "[4/5] Launching map capture node..."
ros2 run drone_control capture_map &
CAPTURE_PID=$!
sleep 1

# ── Launch TF Bridge & Web Republisher ──
echo "[5/7] Launching TF bridge and tf2_web_republisher..."
ros2 run ros_gz_bridge parameter_bridge /model/iris_with_gimbal/pose@tf2_msgs/msg/TFMessage[gz.msgs.Pose_V /model/overhead_camera/pose@tf2_msgs/msg/TFMessage[gz.msgs.Pose_V --ros-args -r /model/iris_with_gimbal/pose:=/tf -r /model/overhead_camera/pose:=/tf &
TF_BRIDGE_PID=$!
ros2 run tf2_web_republisher tf2_web_republisher &
TF_WEB_PID=$!
sleep 1

# ── Launch GZ->ROS2 sonar bridge ──
echo "[6/11] Launching sonar GZ bridge..."
ros2 run ros_gz_bridge parameter_bridge /sonar/scan@sensor_msgs/msg/LaserScan[gz.msgs.LaserScan &
SONAR_BRIDGE_PID=$!
sleep 1

# ── Launch sonar depth node ──
echo "[7/11] Launching sonar depth node..."
ros2 run drone_control sonar_depth_node &
SONAR_NODE_PID=$!
sleep 1

# ── Launch GZ->ROS2 gimbal camera bridge (for surface classification) ──
echo "[8/11] Launching gimbal camera GZ bridge..."
ros2 run ros_gz_bridge parameter_bridge /gimbal_camera@sensor_msgs/msg/Image[gz.msgs.Image --ros-args -r /gimbal_camera:=/gimbal_camera/image &
GIMBAL_CAM_BRIDGE_PID=$!
sleep 1

# ── Launch ROS2->GZ gimbal pitch bridge ──
echo "[8b/11] Launching gimbal pitch command bridge..."
ros2 run ros_gz_bridge parameter_bridge /gimbal/cmd_pitch@std_msgs/msg/Float64]gz.msgs.Double &
GIMBAL_PITCH_BRIDGE_PID=$!
sleep 1

# ── Launch surface classifier node ──
echo "[9/10] Launching surface classifier node..."
ros2 run drone_control surface_classifier_node &
SURFACE_NODE_PID=$!
sleep 1

# ── Launch bathymetric survey node ──
echo "[10/10] Launching bathymetric survey node..."
ros2 run drone_control bathymetric_survey_node &
SURVEY_NODE_PID=$!
sleep 1

# ── Verify ──
echo ""
echo "============================================"
echo "  Checking ROS2 visibility..."
echo "============================================"
echo ""
echo "--- Topics ---"
ros2 topic list 2>/dev/null
echo ""
echo "--- MAVROS Services ---"
ros2 service list 2>/dev/null | grep mavros | head -20
echo ""
echo "============================================"
echo "  All nodes launched!"
echo "  MAVROS PID:          $MAVROS_PID"
echo "  rosbridge PID:       $ROSBRIDGE_PID"
echo "  GZ bridge PID:       $GZBRIDGE_PID"
echo "  Gimbal cam bridge:   $GIMBAL_CAM_BRIDGE_PID"
echo "  Classifier PID:      $SURFACE_NODE_PID"
echo "  Survey PID:          $SURVEY_NODE_PID"
echo ""
echo "  Press Ctrl+C to stop all"
echo "============================================"

# ── Wait for Ctrl+C, then clean up ──
trap "echo 'Shutting down...'; kill $MAVROS_PID $ROSBRIDGE_PID $GZBRIDGE_PID $TF_BRIDGE_PID $TF_WEB_PID $SONAR_BRIDGE_PID $SONAR_NODE_PID $GIMBAL_CAM_BRIDGE_PID $GIMBAL_PITCH_BRIDGE_PID $SURFACE_NODE_PID $SURVEY_NODE_PID $CAPTURE_PID 2>/dev/null; exit 0" SIGINT SIGTERM
wait
