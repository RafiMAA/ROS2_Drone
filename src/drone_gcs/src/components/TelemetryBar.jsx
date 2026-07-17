// ─────────────────────────────────────────────────────────
// TelemetryBar.jsx — Live telemetry readout bar
// ─────────────────────────────────────────────────────────

import { radToDeg } from '../utils/coordinates';

/**
 * TelemetryBar — Bottom status bar showing real-time drone data.
 *
 * @param {Object} props
 * @param {{ x: number, y: number, z: number, yaw: number }} props.dronePose
 * @param {{ armed: boolean, mode: string, connected: boolean }} props.droneState
 * @param {boolean} props.rosConnected
 * @param {number} props.waypointCount
 */
export default function TelemetryBar({ dronePose, droneState, rosConnected, waypointCount }) {
  const headingDeg = radToDeg(dronePose.yaw);
  // Normalize to 0-360
  const heading360 = ((headingDeg % 360) + 360) % 360;

  // Compass direction
  const compassDir = getCompassDirection(heading360);

  return (
    <div className="telemetry-bar">
      {/* Position */}
      <div className="telem-group">
        <span className="telem-label">POS</span>
        <span className="telem-value">
          <span className="telem-axis">E</span>{dronePose.x.toFixed(2)}
          <span className="telem-sep">│</span>
          <span className="telem-axis">N</span>{dronePose.y.toFixed(2)}
        </span>
      </div>

      {/* Altitude */}
      <div className="telem-group">
        <span className="telem-label">ALT</span>
        <span className="telem-value highlight">{dronePose.z.toFixed(2)}<span className="telem-unit">m</span></span>
      </div>

      {/* Heading */}
      <div className="telem-group">
        <span className="telem-label">HDG</span>
        <span className="telem-value">
          {heading360.toFixed(1)}°
          <span className="telem-compass">{compassDir}</span>
        </span>
      </div>

      {/* Divider */}
      <div className="telem-divider" />

      {/* Mode */}
      <div className="telem-group">
        <span className="telem-label">MODE</span>
        <span className={`telem-value mode-badge ${droneState.mode?.toLowerCase()}`}>
          {droneState.mode || '---'}
        </span>
      </div>

      {/* Armed */}
      <div className="telem-group">
        <span className="telem-label">STATUS</span>
        <span className={`telem-value ${droneState.armed ? 'telem-armed' : 'telem-disarmed'}`}>
          {droneState.armed ? '● ARMED' : '○ SAFE'}
        </span>
      </div>

      {/* Waypoints */}
      <div className="telem-group">
        <span className="telem-label">WPS</span>
        <span className="telem-value">{waypointCount}</span>
      </div>

      {/* Divider */}
      <div className="telem-divider" />

      {/* ROS Connection */}
      <div className="telem-group">
        <span className={`telem-dot ${rosConnected ? 'dot-on' : 'dot-off'}`} />
        <span className="telem-value telem-conn">
          {rosConnected ? 'ROS2' : 'DISCONNECTED'}
        </span>
      </div>
    </div>
  );
}

function getCompassDirection(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const idx = Math.round(deg / 45) % 8;
  return dirs[idx];
}
