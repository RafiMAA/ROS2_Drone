// ─────────────────────────────────────────────────────────
// SurveyPanel.jsx — QGC-style survey planner sidebar panel
// ─────────────────────────────────────────────────────────
// Supports two survey modes:
//   LAWNMOWER  — existing zigzag path for camera coverage
//   BATHYMETRIC — dense grid for water depth measurement
// ─────────────────────────────────────────────────────────

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Topic } from 'roslib';
import { generateSurveyWaypoints, generateSurveyGrid, polygonArea } from '../utils/surveyUtils';
import { MAP_CONFIG } from '../config/mapConfig';
import { TOPICS } from '../config/rosConfig';

/**
 * SurveyPanel — Sidebar controls for Bathymetric survey planning.
 *
 * @param {Object} props
 * @param {Array<{x: number, y: number}>} props.waypoints — polygon vertices drawn by user
 * @param {(wps: Array) => void} props.onSetSurveyWaypoints — set generated preview grid
 * @param {() => void} props.onClearSurvey — clear generated waypoints
 * @param {ROSLIB.Ros | null} props.ros — ROS connection
 * @param {{ x: number, y: number }} props.mavrosOffset — offset between camera-relative and MAVROS local frames
 * @param {boolean} props.surveyActive — whether a bathymetric survey is currently running
 * @param {Object | null} props.surveyProgress — live progress from survey node
 */
export default function SurveyPanel({
  waypoints,
  onSetSurveyWaypoints,
  onClearSurvey,
  ros,
  mavrosOffset,
  surveyActive = false,
  surveyProgress = null,
}) {
  const [spacing, setSpacing] = useState(20);
  const [angleDeg, setAngleDeg] = useState(0);
  const [altitude, setAltitude] = useState(MAP_CONFIG.defaultAltitude);
  const [generatedWaypoints, setGeneratedWaypoints] = useState([]);

  // Polygon area for display
  const area = useMemo(() => polygonArea(waypoints), [waypoints]);

  // ── Generate path/grid ──
  const handleGenerate = useCallback(() => {
    if (waypoints.length < 3) return;

    const wps = generateSurveyGrid(waypoints, spacing, angleDeg, altitude);
    setGeneratedWaypoints(wps);
    onSetSurveyWaypoints(wps);
  }, [waypoints, spacing, angleDeg, altitude, onSetSurveyWaypoints]);

  // ── Auto-regenerate on parameter change ──
  useEffect(() => {
    if (waypoints.length >= 3) {
      // Small timeout to debounce rapid input changes
      const t = setTimeout(() => {
        handleGenerate();
      }, 300);
      return () => clearTimeout(t);
    }
  }, [spacing, angleDeg, altitude, waypoints]);

  // ── Start bathymetric survey (publishes waypoints to ROS2 topic) ──
  const handleStartBathymetric = useCallback(() => {
    if (!ros || generatedWaypoints.length === 0) return;

    // Convert from camera-relative coords to MAVROS local coords
    const offsetX = mavrosOffset?.x || 0;
    const offsetY = mavrosOffset?.y || 0;

    const mavrosWaypoints = generatedWaypoints.map((wp) => ({
      x: wp.x - offsetX,
      y: wp.y - offsetY,
      alt: wp.alt,
    }));

    const payload = {
      waypoints: mavrosWaypoints,
      spacing: spacing,
      altitude: altitude,
    };

    const topic = new Topic({
      ros,
      name: TOPICS.SURVEY_START.name,
      messageType: TOPICS.SURVEY_START.messageType,
    });

    topic.publish({ data: JSON.stringify(payload) });
    console.log('[SurveyPanel] Bathymetric survey started with', mavrosWaypoints.length, 'waypoints');
  }, [ros, generatedWaypoints, mavrosOffset, spacing, altitude]);

  // ── Abort survey ──
  const handleAbortSurvey = useCallback(() => {
    if (!ros) return;
    const topic = new Topic({
      ros,
      name: TOPICS.SURVEY_ABORT.name,
      messageType: TOPICS.SURVEY_ABORT.messageType,
    });
    topic.publish({ data: 'ABORT' });
    console.log('[SurveyPanel] Survey aborted');
  }, [ros]);

  // ── Clear everything ──
  const handleClear = useCallback(() => {
    setGeneratedWaypoints([]);
    onClearSurvey();
  }, [onClearSurvey]);

  return (
    <div className="survey-panel">
      {/* ── Header ── */}
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon">⬡</span>
          SURVEY
        </h2>
      </div>

      {/* ── Polygon Info ── */}
      {waypoints.length > 0 && (
        <div className="survey-info">
          <div className="survey-info-row">
            <span className="survey-info-label">VERTICES</span>
            <span className="survey-info-value">{waypoints.length}</span>
          </div>
          {waypoints.length >= 3 && (
            <div className="survey-info-row">
              <span className="survey-info-label">AREA</span>
              <span className="survey-info-value">{area.toFixed(0)} m²</span>
            </div>
          )}
          {generatedWaypoints.length > 0 && (
            <div className="survey-info-row">
              <span className="survey-info-label">GRID PTS</span>
              <span className="survey-info-value survey-wp-count">{generatedWaypoints.length}</span>
            </div>
          )}
          <div className="survey-info-row">
            <span className="survey-info-label">MODE</span>
            <span className="survey-info-value" style={{ color: '#4fc3f7' }}>BATHYMETRIC</span>
          </div>
        </div>
      )}

      <div className="panel-divider" />

      {/* ── Survey Parameters ── */}
      <div className="control-group">
        <span className="group-label">PARAMETERS</span>

        {/* Spacing */}
        <div className="survey-param-row">
          <label className="survey-param-label">Spacing</label>
          <div className="survey-param-input-wrap">
            <input
              type="number"
              className="alt-input survey-param-input"
              value={spacing}
              onChange={(e) => setSpacing(Math.max(2, Number(e.target.value)))}
              min={2}
              max={500}
              step={1}
            />
            <span className="input-unit">m</span>
          </div>
        </div>

        {/* Angle */}
        <div className="survey-param-row">
          <label className="survey-param-label">Angle</label>
          <div className="survey-param-input-wrap">
            <input
              type="number"
              className="alt-input survey-param-input"
              value={angleDeg}
              onChange={(e) => setAngleDeg(Number(e.target.value) % 360)}
              min={0}
              max={359}
              step={5}
            />
            <span className="input-unit">°</span>
          </div>
        </div>

        {/* Altitude */}
        <div className="survey-param-row">
          <label className="survey-param-label">Altitude</label>
          <div className="survey-param-input-wrap">
            <input
              type="number"
              className="alt-input survey-param-input"
              value={altitude}
              onChange={(e) => setAltitude(Math.max(1, Number(e.target.value)))}
              min={1}
              max={200}
              step={1}
            />
            <span className="input-unit">m</span>
          </div>
        </div>
      </div>

      <div className="panel-divider" />

      {/* ── Actions ── */}
      <div className="control-group">
        <span className="group-label">ACTIONS</span>

        <button
          className="ctrl-btn survey-generate-btn"
          onClick={handleGenerate}
          disabled={waypoints.length < 3}
        >
          ◎ GENERATE GRID
        </button>

        {surveyActive ? (
          <button
            className="ctrl-btn survey-abort-btn"
            onClick={handleAbortSurvey}
          >
            ■ ABORT SURVEY
          </button>
        ) : (
          <button
            className="ctrl-btn survey-start-btn"
            onClick={handleStartBathymetric}
            disabled={generatedWaypoints.length === 0 || !ros}
          >
            ▶ START SURVEY
          </button>
        )}

        <div className="btn-row">
          <button
            className="ctrl-btn clear-btn"
            onClick={handleClear}
            disabled={waypoints.length === 0 && generatedWaypoints.length === 0}
          >
            ✕ CLEAR
          </button>
        </div>
      </div>

      {/* ── Live Progress ── */}
      {surveyProgress && (
        <>
          <div className="panel-divider" />
          <div className="control-group">
            <span className="group-label">SURVEY PROGRESS</span>
            <div className="survey-progress-bar-wrap">
              <div
                className="survey-progress-bar"
                style={{ width: `${surveyProgress.percent || 0}%` }}
              />
            </div>
            <div className="survey-info">
              <div className="survey-info-row">
                <span className="survey-info-label">STATE</span>
                <span className="survey-info-value survey-state-label">
                  {surveyProgress.state}
                </span>
              </div>
              <div className="survey-info-row">
                <span className="survey-info-label">WAYPOINT</span>
                <span className="survey-info-value">
                  {surveyProgress.current_wp} / {surveyProgress.total_wps}
                </span>
              </div>
              <div className="survey-info-row">
                <span className="survey-info-label">MEASURED</span>
                <span className="survey-info-value survey-wp-count">
                  {surveyProgress.measured || 0}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Help ── */}
      <div className="help-hint">
        <p>⬡ Click map to place polygon boundary waypoints</p>
        <p>◎ Generate creates a dense grid inside the boundary</p>
        <p>▶ Start launches autonomous survey</p>
      </div>
    </div>
  );
}
