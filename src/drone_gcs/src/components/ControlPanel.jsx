// ─────────────────────────────────────────────────────────
// ControlPanel.jsx — Arm, Takeoff, Send WPs, Clear, RTL
// ─────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import { Service } from 'roslib';
import { SERVICES } from '../config/rosConfig';
import { MAP_CONFIG } from '../config/mapConfig';

/**
 * ControlPanel — Glassmorphic sidebar with drone control buttons.
 *
 * @param {Object} props
 * @param {ROSLIB.Ros | null} props.ros
 * @param {boolean} props.connected
 * @param {{ armed: boolean, mode: string }} props.droneState
 * @param {Array<{ x: number, y: number, alt: number }>} props.waypoints
 * @param {{ x: number, y: number }} props.mavrosOffset
 * @param {() => void} props.onClearWaypoints
 */
export default function ControlPanel({
  ros,
  connected,
  droneState,
  waypoints = [],
  mavrosOffset,
  onClearWaypoints,
}) {
  const [takeoffAlt, setTakeoffAlt] = useState(MAP_CONFIG.defaultAltitude);
  const [statusMsg, setStatusMsg] = useState('');

  // ── Helper: call a ROS service ──
  const callService = useCallback(
    (serviceConfig, request) => {
      return new Promise((resolve, reject) => {
        if (!ros) {
          reject(new Error('ROS not connected'));
          return;
        }
        const service = new Service({
          ros,
          name: serviceConfig.name,
          serviceType: serviceConfig.serviceType,
        });
        service.callService(request, resolve, reject);
      });
    },
    [ros]
  );

  // ── Set GUIDED mode ──
  const handleSetGuided = useCallback(async () => {
    try {
      setStatusMsg('Setting GUIDED mode...');
      await callService(SERVICES.SET_MODE, {
        base_mode: 0,
        custom_mode: 'GUIDED',
      });
      setStatusMsg('✓ GUIDED mode set');
    } catch (err) {
      setStatusMsg(`✗ Mode error: ${err.message || err}`);
    }
  }, [callService]);


  // ── Arm ──
  const handleArm = useCallback(async () => {
    try {
      setStatusMsg('Arming...');
      await callService(SERVICES.ARMING, { value: true });
      setStatusMsg('✓ Armed');
    } catch (err) {
      setStatusMsg(`✗ Arm error: ${err.message || err}`);
    }
  }, [callService]);

  // ── Disarm ──
  const handleDisarm = useCallback(async () => {
    try {
      setStatusMsg('Disarming...');
      await callService(SERVICES.ARMING, { value: false });
      setStatusMsg('✓ Disarmed');
    } catch (err) {
      setStatusMsg(`✗ Disarm error: ${err.message || err}`);
    }
  }, [callService]);

  // ── Takeoff ──
  const handleTakeoff = useCallback(async () => {
    try {
      setStatusMsg(`Taking off to ${takeoffAlt}m...`);
      await callService(SERVICES.TAKEOFF, {
        min_pitch: 0,
        yaw: 0,
        latitude: 0,
        longitude: 0,
        altitude: takeoffAlt,
      });
      setStatusMsg(`✓ Takeoff to ${takeoffAlt}m`);
    } catch (err) {
      setStatusMsg(`✗ Takeoff error: ${err.message || err}`);
    }
  }, [callService, takeoffAlt]);


  // ── RTL (Return to Launch) ──
  const handleRTL = useCallback(async () => {
    try {
      setStatusMsg('Setting RTL mode...');
      await callService(SERVICES.SET_MODE, {
        base_mode: 0,
        custom_mode: 'RTL',
      });
      setStatusMsg('✓ RTL mode set');
    } catch (err) {
      setStatusMsg(`✗ RTL error: ${err.message || err}`);
    }
  }, [callService]);

  // ── LAND ──
  const handleLand = useCallback(async () => {
    try {
      setStatusMsg('Setting LAND mode...');
      await callService(SERVICES.SET_MODE, {
        base_mode: 0,
        custom_mode: 'LAND',
      });
      setStatusMsg('✓ LAND mode set');
    } catch (err) {
      setStatusMsg(`✗ LAND error: ${err.message || err}`);
    }
  }, [callService]);

  return (
    <div className="control-panel">
      {/* ── Header ── */}
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon">◈</span>
          CONTROL
        </h2>
        <div className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}>
          <span className="dot-pulse" />
          {connected ? 'ONLINE' : 'OFFLINE'}
        </div>
      </div>

      {/* ── Drone Status ── */}
      <div className="status-section">
        <div className="status-row">
          <span className="status-label">MODE</span>
          <span className={`status-value mode-${droneState.mode?.toLowerCase()}`}>
            {droneState.mode || 'N/A'}
          </span>
        </div>
        <div className="status-row">
          <span className="status-label">ARMED</span>
          <span className={`status-value ${droneState.armed ? 'armed' : 'disarmed'}`}>
            {droneState.armed ? '● ARMED' : '○ DISARMED'}
          </span>
        </div>
      </div>

      <div className="panel-divider" />

      {/* ── Mode Controls ── */}
      <div className="control-group">
        <span className="group-label">FLIGHT MODE</span>
        <div className="btn-row">
          <button
            className="ctrl-btn guided-btn"
            onClick={handleSetGuided}
            disabled={!connected}
          >
            GUIDED
          </button>
        </div>
        <div className="btn-row">
          <button
            className="ctrl-btn arm-btn"
            onClick={handleArm}
            disabled={!connected}
          >
            ARM
          </button>
          <button
            className="ctrl-btn disarm-btn"
            onClick={handleDisarm}
            disabled={!connected}
          >
            DISARM
          </button>
        </div>
      </div>

      <div className="panel-divider" />

      {/* ── Takeoff ── */}
      <div className="control-group">
        <span className="group-label">TAKEOFF</span>
        <div className="input-row">
          <input
            type="number"
            className="alt-input"
            value={takeoffAlt}
            onChange={(e) => setTakeoffAlt(Number(e.target.value))}
            min={1}
            max={200}
            step={1}
            placeholder="Alt (m)"
          />
          <span className="input-unit">m</span>
        </div>
        <button
          className="ctrl-btn takeoff-btn"
          onClick={handleTakeoff}
          disabled={!connected}
        >
          ▲ TAKEOFF
        </button>
      </div>

      <div className="panel-divider" />

      {/* ── Waypoint Controls ── */}
      <div className="control-group">
        <span className="group-label">BOUNDARY WAYPOINTS ({waypoints.length})</span>
        <button
          className="ctrl-btn clear-btn"
          onClick={onClearWaypoints}
          disabled={waypoints.length === 0}
        >
          ✕ CLEAR WPS
        </button>
      </div>

      <div className="panel-divider" />

      {/* ── Emergency / RTL ── */}
      <div className="control-group">
        <span className="group-label">RETURN</span>
        <button
          className="ctrl-btn rtl-btn"
          onClick={handleRTL}
          disabled={!connected}
        >
          ⟲ RTL
        </button>
        <button
          className="ctrl-btn land-btn"
          onClick={handleLand}
          disabled={!connected}
        >
          ▼ LAND
        </button>
      </div>

      {/* ── Status Message ── */}
      {statusMsg && (
        <div className={`status-msg ${statusMsg.startsWith('✓') ? 'success' : statusMsg.startsWith('✗') ? 'error' : 'info'}`}>
          {statusMsg}
        </div>
      )}

      {/* ── Help hint ── */}
      <div className="help-hint">
        <p>🖱 Click map to place waypoints</p>
        <p>🖱 Right-click to remove last</p>
        <p>⚙ Ctrl+drag or middle-drag to pan</p>
        <p>🔍 Scroll to zoom in/out</p>
      </div>
    </div>
  );
}
