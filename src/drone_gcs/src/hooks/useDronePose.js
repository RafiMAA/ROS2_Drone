import { useState, useEffect, useRef } from 'react';
import { Topic } from 'roslib';
import { TOPICS } from '../config/rosConfig';
import { quaternionToYaw } from '../utils/coordinates';

/**
 * useDronePose
 * 1. Subscribes directly to /tf to get absolute Gazebo poses of camera and drone.
 * 2. Uses MAVROS local_position to compute the real-time offset.
 */
export function useDronePose(ros) {
  const [pose, setPose] = useState({ x: 0, y: 0, z: 0, yaw: 0 });
  const [mavrosOffset, setMavrosOffset] = useState({ x: 0, y: 0 });

  const cameraPosRef = useRef({ x: 0, y: 0, z: 0 });
  const dronePosRef = useRef({ x: 0, y: 0, z: 0, yaw: 0 });

  useEffect(() => {
    if (!ros) return;

    // ── 1. Subscribe directly to /tf ──
    // We bypass TFClient because roslibjs expects the old ROS 1 tf2_web_republisher action API
    const tfTopic = new Topic({
      ros: ros,
      name: '/tf',
      messageType: 'tf2_msgs/msg/TFMessage'
    });

    tfTopic.subscribe((msg) => {
      if (!msg.transforms) return;
      
      msg.transforms.forEach(t => {
        // Track the camera's absolute Gazebo position
        if (t.child_frame_id === 'overhead_camera') {
          cameraPosRef.current = {
            x: t.transform.translation.x,
            y: t.transform.translation.y,
            z: t.transform.translation.z
          };
        }
        
        // Track the drone's absolute Gazebo position
        if (t.child_frame_id === 'iris_with_gimbal') {
          const yaw = quaternionToYaw(t.transform.rotation);
          dronePosRef.current = {
            x: t.transform.translation.x,
            y: t.transform.translation.y,
            z: t.transform.translation.z,
            yaw
          };

          // Calculate drone relative to camera (the UI map origin)
          setPose({
            x: dronePosRef.current.x - cameraPosRef.current.x,
            y: dronePosRef.current.y - cameraPosRef.current.y,
            z: dronePosRef.current.z,
            yaw
          });
        }
      });
    });

    // ── 2. MAVROS Topic for Waypoint Offset Calibration ──
    const localPoseTopic = new Topic({
      ros: ros,
      name: TOPICS.LOCAL_POSITION.name,
      messageType: TOPICS.LOCAL_POSITION.messageType,
      throttle_rate: 500, // 2Hz is plenty for calibration
    });

    localPoseTopic.subscribe((msg) => {
      const mavrosX = msg.pose.position.x;
      const mavrosY = msg.pose.position.y;
      
      // We need the offset between the *camera-relative TF* and the MAVROS local frame
      const relX = dronePosRef.current.x - cameraPosRef.current.x;
      const relY = dronePosRef.current.y - cameraPosRef.current.y;

      // TF = MAVROS + Offset => Offset = TF - MAVROS
      setMavrosOffset({
        x: relX - mavrosX,
        y: relY - mavrosY,
      });
    });

    return () => {
      tfTopic.unsubscribe();
      localPoseTopic.unsubscribe();
    };
  }, [ros]);

  return { pose, mavrosOffset };
}

export default useDronePose;
