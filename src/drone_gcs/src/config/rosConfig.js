// ─────────────────────────────────────────────────────────
// rosConfig.js — roslibjs WebSocket configuration
// ─────────────────────────────────────────────────────────
// Centralized ROS2 topic, service, and connection settings
// for the drone GCS. All MAVROS topic names follow ROS2
// Jazzy + MAVROS 2.x conventions.
// ─────────────────────────────────────────────────────────

// ── WebSocket connection ──
export const ROS_CONFIG = {
  url: 'ws://localhost:9090',
  reconnectInterval: 3000,  // ms between reconnect attempts
};

// ── Topics ──
export const TOPICS = {
  // Drone local position (ENU frame)
  LOCAL_POSITION: {
    name: '/mavros/local_position/pose',
    messageType: 'geometry_msgs/PoseStamped',
  },

  // MAVROS state (armed, mode, connected)
  STATE: {
    name: '/mavros/state',
    messageType: 'mavros_msgs/State',
  },

  // Setpoint position (for direct position commands)
  SETPOINT_POSITION: {
    name: '/mavros/setpoint_position/local',
    messageType: 'geometry_msgs/PoseStamped',
  },

  // ── Bathymetric Survey Topics ──

  // Start bathymetric survey (UI → survey node)
  SURVEY_START: {
    name: '/bathymetric_survey/start',
    messageType: 'std_msgs/String',
  },

  // Abort bathymetric survey (UI → survey node)
  SURVEY_ABORT: {
    name: '/bathymetric_survey/abort',
    messageType: 'std_msgs/String',
  },

  // Survey progress updates (survey node → UI)
  SURVEY_PROGRESS: {
    name: '/survey/progress',
    messageType: 'std_msgs/String',
  },

  // Individual measured point (survey node → UI)
  SURVEY_POINT: {
    name: '/survey/point_measured',
    messageType: 'std_msgs/String',
  },

  // Final survey results with volume data (survey node → UI)
  SURVEY_RESULTS: {
    name: '/survey/results',
    messageType: 'std_msgs/String',
  },
};

// ── Services ──
export const SERVICES = {
  // Arm / Disarm
  ARMING: {
    name: '/mavros/cmd/arming',
    serviceType: 'mavros_msgs/CommandBool',
  },

  // Takeoff
  TAKEOFF: {
    name: '/mavros/cmd/takeoff',
    serviceType: 'mavros_msgs/CommandTOL',
  },

  // Set flight mode (GUIDED, RTL, LAND, etc.)
  SET_MODE: {
    name: '/mavros/set_mode',
    serviceType: 'mavros_msgs/SetMode',
  },

  // Push mission waypoints
  MISSION_PUSH: {
    name: '/mavros/mission/push',
    serviceType: 'mavros_msgs/WaypointPush',
  },

  // Clear mission
  MISSION_CLEAR: {
    name: '/mavros/mission/clear',
    serviceType: 'mavros_msgs/WaypointClear',
  },
};

export default { ROS_CONFIG, TOPICS, SERVICES };
