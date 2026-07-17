#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# launch_gcs.sh — Launch everything needed for the Drone GCS
#
# This script launches in order:
#   1. Gazebo with the iris_gcs world
#   2. ros_gz_bridge for overhead camera + IMU topics
#   3. rosbridge_websocket for React ↔ ROS2 communication
#   4. MAVROS for ArduPilot ↔ ROS2 bridge
#   5. Map capture node (one-shot: captures map.png then exits)
#   6. React dev server
#
# Prerequisites:
#   - ROS2 Jazzy sourced
#   - ArduPilot SITL built and in PATH
#   - MAVROS installed (ros-jazzy-mavros)
#   - rosbridge_suite installed (ros-jazzy-rosbridge-suite)
#   - ros_gz_bridge installed (ros-jazzy-ros-gz-bridge)
#   - npm dependencies installed in src/drone_gcs/
#
# Usage:
#   cd /path/to/ROS2_Drone
#   bash src/drone_gcs/launch_gcs.sh
# ═══════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
GCS_DIR="$SCRIPT_DIR"

echo "══════════════════════════════════════════════"
echo "  DRONE GCS LAUNCHER"
echo "══════════════════════════════════════════════"
echo "Workspace: $WORKSPACE_DIR"
echo "GCS Dir:   $GCS_DIR"
echo ""

# ── Ensure GZ_SIM_RESOURCE_PATH includes our models ──
export GZ_SIM_RESOURCE_PATH="${WORKSPACE_DIR}/src/ardupilot_gazebo/models:${GZ_SIM_RESOURCE_PATH}"
export GZ_SIM_RESOURCE_PATH="${WORKSPACE_DIR}/src/ardupilot_gazebo/worlds:${GZ_SIM_RESOURCE_PATH}"

echo "[1/6] Launching Gazebo with iris_gcs world..."
echo "      (Press play in Gazebo to start simulation)"
gz sim "${WORKSPACE_DIR}/src/ardupilot_gazebo/worlds/iris_gcs.sdf" &
GZ_PID=$!
sleep 5

echo "[2/6] Launching ros_gz_bridge for overhead camera..."
ros2 run ros_gz_bridge parameter_bridge \
  /overhead_camera/image@sensor_msgs/msg/Image@gz.msgs.Image &
BRIDGE_PID=$!
sleep 2

echo "[3/6] Launching rosbridge_websocket on port 9090..."
ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090 &
ROSBRIDGE_PID=$!
sleep 2

echo "[4/6] Launching MAVROS..."
echo "      Make sure ArduPilot SITL is running!"
echo "      (Run: sim_vehicle.py -v ArduCopter -f gazebo-iris --model JSON --map --console)"
ros2 launch mavros apm.launch fcu_url:="udp://127.0.0.1:14550@14555" &
MAVROS_PID=$!
sleep 3

echo "[5/6] Capturing overhead map..."
echo "      (Waiting for Gazebo to render, then capturing map.png)"
# Source the workspace overlay
source "${WORKSPACE_DIR}/install/setup.bash" 2>/dev/null || true
ros2 run drone_control capture_map &
CAPTURE_PID=$!
sleep 8

echo "[6/6] Starting React GCS dev server..."
cd "$GCS_DIR"
npm run dev -- --host &
REACT_PID=$!

echo ""
echo "══════════════════════════════════════════════"
echo "  ALL SERVICES STARTED"
echo "══════════════════════════════════════════════"
echo ""
echo "  Gazebo:         PID $GZ_PID"
echo "  ros_gz_bridge:  PID $BRIDGE_PID"
echo "  rosbridge:      PID $ROSBRIDGE_PID (ws://localhost:9090)"
echo "  MAVROS:         PID $MAVROS_PID"
echo "  Map capture:    PID $CAPTURE_PID"
echo "  React GCS:      PID $REACT_PID (http://localhost:5173)"
echo ""
echo "  Open http://localhost:5173 in your browser"
echo ""
echo "  Press Ctrl+C to stop all services"
echo "══════════════════════════════════════════════"

# Trap Ctrl+C to clean up all processes
cleanup() {
  echo ""
  echo "Stopping all services..."
  kill $REACT_PID $MAVROS_PID $ROSBRIDGE_PID $BRIDGE_PID $GZ_PID 2>/dev/null
  wait 2>/dev/null
  echo "Done."
}
trap cleanup SIGINT SIGTERM

# Wait for all background processes
wait
