// ─────────────────────────────────────────────────────────
// App.jsx — Root layout for the Drone GCS
// ─────────────────────────────────────────────────────────

import { useState, useCallback } from 'react';
import DroneMapCanvas from './components/DroneMapCanvas';
import ControlPanel from './components/ControlPanel';
import SurveyPanel from './components/SurveyPanel';
import BathymetryPanel from './components/BathymetryPanel';
import Bathymetry3DView from './components/Bathymetry3DView';
import TelemetryBar from './components/TelemetryBar';
import { useRos } from './hooks/useRos';
import { useDronePose } from './hooks/useDronePose';
import { useDroneState } from './hooks/useDroneState';
import { useSurveyData } from './hooks/useSurveyData';
import { MAP_CONFIG } from './config/mapConfig';
import './App.css';

export default function App() {
  const { ros, connected } = useRos();
  const { pose: dronePose, mavrosOffset } = useDronePose(ros);
  const droneState = useDroneState(ros);
  const { progress: surveyProgress, surveyPoints, volumeData, surveyActive, clearSurveyData } = useSurveyData(ros);

  // ── Waypoint state ──
  const [waypoints, setWaypoints] = useState([]);

  const handleAddWaypoint = useCallback((worldPos) => {
    setWaypoints((prev) => [
      ...prev,
      {
        x: worldPos.x,
        y: worldPos.y,
        alt: MAP_CONFIG.defaultAltitude,
      },
    ]);
  }, []);

  const handleRemoveLastWaypoint = useCallback(() => {
    setWaypoints((prev) => prev.slice(0, -1));
  }, []);

  const handleClearWaypoints = useCallback(() => {
    setWaypoints([]);
  }, []);

  // ── Survey State ──
  const [surveyWaypoints, setSurveyWaypoints] = useState([]);

  // ── 3D View modal ──
  const [show3DView, setShow3DView] = useState(false);

  const handleClearSurvey = useCallback(() => {
    setSurveyWaypoints([]);
  }, []);

  // Show right sidebar when survey has data
  const showBathymetryPanel = surveyActive || surveyPoints.length > 0 || volumeData;

  return (
    <div className="gcs-app">
      {/* ── Top Branding Bar ── */}
      <header className="top-bar">
        <div className="brand">
          <span className="brand-icon">◇</span>
          <h1 className="brand-title">DRONE GCS</h1>
          <span className="brand-sub">ArduPilot Ground Control</span>
        </div>
        <div className="top-status">
          <span className={`conn-indicator ${connected ? 'online' : 'offline'}`}>
            <span className="conn-pulse" />
            {connected ? 'CONNECTED' : 'NO LINK'}
          </span>
        </div>
      </header>

      {/* ── Main Content ── */}
      <div className="gcs-main">
        {/* Left: Control Panel */}
        <aside className="gcs-sidebar">
          <ControlPanel
            ros={ros}
            connected={connected}
            droneState={droneState}
            waypoints={waypoints}
            mavrosOffset={mavrosOffset}
            onClearWaypoints={handleClearWaypoints}
          />
          <div className="sidebar-divider" />
          <SurveyPanel
            waypoints={waypoints}
            onSetSurveyWaypoints={setSurveyWaypoints}
            onClearSurvey={handleClearSurvey}
            ros={ros}
            mavrosOffset={mavrosOffset}
            surveyActive={surveyActive}
            surveyProgress={surveyProgress}
          />
        </aside>

        {/* Center: Map Canvas */}
        <main className="gcs-map-area">
          <DroneMapCanvas
            dronePose={dronePose}
            waypoints={waypoints}
            onAddWaypoint={handleAddWaypoint}
            onRemoveLastWaypoint={handleRemoveLastWaypoint}
            surveyWaypoints={surveyWaypoints}
            bathymetryPoints={surveyPoints}
          />
        </main>

        {/* Right: Bathymetry Panel (conditional) */}
        {showBathymetryPanel && (
          <aside className="gcs-sidebar gcs-sidebar-right">
            <BathymetryPanel
              progress={surveyProgress}
              surveyPoints={surveyPoints}
              volumeData={volumeData}
              surveyActive={surveyActive}
              onView3D={() => setShow3DView(true)}
              onClearData={clearSurveyData}
            />
          </aside>
        )}
      </div>

      {/* ── Bottom Telemetry Bar ── */}
      <TelemetryBar
        dronePose={dronePose}
        droneState={droneState}
        rosConnected={connected}
        waypointCount={waypoints.length}
      />

      {/* ── 3D Visualization Modal ── */}
      {show3DView && (
        <Bathymetry3DView
          surveyPoints={surveyPoints}
          volumeData={volumeData}
          onClose={() => setShow3DView(false)}
        />
      )}
    </div>
  );
}
