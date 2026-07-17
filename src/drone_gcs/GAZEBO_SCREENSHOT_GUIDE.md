# Gazebo Screenshot & Map Capture Guide

This GCS uses a **static top-down screenshot** of your Gazebo world as the map background.
The system is designed to **auto-capture** this image when Gazebo starts.

---

## Automatic Capture (Recommended)

The `launch_gcs.sh` script handles everything automatically:

1. Launches Gazebo with `iris_gcs.sdf` (which includes an overhead camera at 1200m)
2. Bridges the overhead camera topic to ROS2 via `ros_gz_bridge`
3. Runs the `capture_map` node which:
   - Subscribes to `/overhead_camera/image`
   - Skips the first 3 frames (lets the renderer stabilize)
   - Saves the 4th frame as `public/map.png`
   - Exits automatically

```bash
# From the workspace root:
cd /home/abdul-rafi/Desktop/ROS2_Drone
bash src/drone_gcs/launch_gcs.sh
```

The map image will appear at `src/drone_gcs/public/map.png` within ~10 seconds of Gazebo starting.

---

## Manual Capture (Alternative)

If automatic capture fails or you want a custom screenshot:

### Option A: Gazebo GUI Screenshot

1. Launch Gazebo:
   ```bash
   export GZ_SIM_RESOURCE_PATH=/home/abdul-rafi/Desktop/ROS2_Drone/src/ardupilot_gazebo/models:$GZ_SIM_RESOURCE_PATH
   gz sim /home/abdul-rafi/Desktop/ROS2_Drone/src/ardupilot_gazebo/worlds/iris_gcs.sdf
   ```

2. In Gazebo GUI:
   - Navigate the camera to a **top-down view** looking straight down
   - Position it high enough to see the full 1500m × 1500m area
   - Go to the menu → **View → Orthographic** for a flat projection
   - Use the **Screenshot** plugin (if visible in the toolbar) or press the screenshot button

3. Save the screenshot as:
   ```
   src/drone_gcs/public/map.png
   ```

### Option B: CLI Capture via Gazebo Transport

```bash
# List available camera topics
gz topic -l | grep image

# Echo one frame and save (requires gz-tools)
gz topic -e -t /overhead_camera/image -n 1 > /tmp/overhead_frame.raw
```

### Option C: Using ros_gz_bridge + ros2 topic

```bash
# Bridge the camera topic
ros2 run ros_gz_bridge parameter_bridge /overhead_camera/image@sensor_msgs/msg/Image@gz.msgs.Image

# Capture one frame with ros2 CLI
ros2 run image_transport republish raw --ros-args --remap in:=/overhead_camera/image --remap out:=/overhead_camera/image_compressed

# Or run the capture node directly
ros2 run drone_control capture_map
```

---

## After Capture: Update Config

After saving `map.png`, verify the config in `src/drone_gcs/src/config/mapConfig.js`:

```js
export const MAP_CONFIG = {
  imageWidth: 1920,      // Must match actual image width
  imageHeight: 1920,     // Must match actual image height
  worldXMin: -750,       // Left edge = -750m (West)
  worldXMax: 750,        // Right edge = +750m (East)
  worldYMin: -750,       // Bottom edge = -750m (South)
  worldYMax: 750,        // Top edge = +750m (North)
};
```

> **Important:** If the camera field-of-view or position changes, the world bounds
> must be recalculated to maintain accurate pixel↔coordinate mapping.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `map.png` is black | Gazebo renderer hasn't initialized yet — increase `skip_frames` in `capture_map.py` or wait longer before capture |
| Image is too zoomed in | Increase camera height in `iris_gcs.sdf` (currently 1200m) or increase `horizontal_fov` |
| Image is too zoomed out | Decrease camera height or decrease `horizontal_fov` |
| `capture_map` can't find the topic | Ensure `ros_gz_bridge` is running with the correct topic mapping |
| Colors look wrong | Check the image encoding — the capture script handles `rgb8` and `bgr8` |
