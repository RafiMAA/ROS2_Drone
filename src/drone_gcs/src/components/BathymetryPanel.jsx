// ─────────────────────────────────────────────────────────
// BathymetryPanel.jsx — Right sidebar panel for bathymetric
// survey progress tracking and volume statistics display.
// ─────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';

/**
 * BathymetryPanel — Shows survey progress during operation and
 * volume statistics after completion.
 *
 * @param {Object} props
 * @param {Object | null} props.progress — live progress data
 * @param {Array} props.surveyPoints — measured survey points
 * @param {Object | null} props.volumeData — volume computation results
 * @param {boolean} props.surveyActive — whether survey is running
 * @param {() => void} props.onView3D — open 3D visualization
 * @param {() => void} props.onClearData — clear survey data
 */
export default function BathymetryPanel({
  progress,
  surveyPoints = [],
  volumeData,
  surveyActive,
  onView3D,
  onClearData,
}) {
  const [showDetails, setShowDetails] = useState(false);

  // Count water vs soil points
  const stats = useMemo(() => {
    const water = surveyPoints.filter((p) => p.type === 'WATER');
    const soil = surveyPoints.filter((p) => p.type === 'SOIL');
    const maxDepth = water.length > 0
      ? Math.max(...water.map((p) => p.depth || 0))
      : 0;
    const avgDepth = water.length > 0
      ? water.reduce((sum, p) => sum + (p.depth || 0), 0) / water.length
      : 0;
    return {
      waterCount: water.length,
      soilCount: soil.length,
      maxDepth,
      avgDepth,
      total: surveyPoints.length,
    };
  }, [surveyPoints]);

  // State color mapping
  const stateColors = {
    FLYING_TO_WP: '#4fc3f7',
    STABILIZING: '#ffab00',
    CLASSIFYING: '#ab47bc',
    DESCENDING: '#29b6f6',
    MEASURING: '#00e676',
    ASCENDING: '#ffa726',
    COMPUTING: '#7c4dff',
    COMPLETE: '#00e676',
    ABORTED: '#ff1744',
  };

  const stateColor = stateColors[progress?.state] || 'var(--text-muted)';

  return (
    <div className="bathymetry-panel">
      {/* ── Header ── */}
      <div className="panel-header">
        <h2 className="panel-title">
          <span className="panel-icon" style={{ color: '#4fc3f7' }}>◈</span>
          BATHYMETRY
        </h2>
      </div>

      {/* ── Live Progress ── */}
      {progress && (
        <div className="bathy-section">
          <span className="group-label">SURVEY STATUS</span>

          {/* Progress bar */}
          <div className="bathy-progress-wrap">
            <div
              className="bathy-progress-bar"
              style={{
                width: `${progress.percent || 0}%`,
                background: progress.state === 'COMPLETE'
                  ? 'var(--accent-success)'
                  : 'var(--accent-primary)',
              }}
            />
          </div>
          <div className="bathy-progress-text">
            {Math.round(progress.percent || 0)}% — WP {progress.current_wp}/{progress.total_wps}
          </div>

          {/* State badge */}
          <div className="bathy-state-badge" style={{ color: stateColor, borderColor: stateColor }}>
            <span className="bathy-state-dot" style={{ background: stateColor }} />
            {progress.state}
          </div>
        </div>
      )}

      {/* ── Point Summary ── */}
      {surveyPoints.length > 0 && (
        <>
          <div className="panel-divider" />
          <div className="bathy-section">
            <span className="group-label">MEASUREMENTS</span>
            <div className="bathy-stats-grid">
              <div className="bathy-stat-card">
                <span className="bathy-stat-value" style={{ color: '#4fc3f7' }}>
                  {stats.waterCount}
                </span>
                <span className="bathy-stat-label">WATER</span>
              </div>
              <div className="bathy-stat-card">
                <span className="bathy-stat-value" style={{ color: '#66bb6a' }}>
                  {stats.soilCount}
                </span>
                <span className="bathy-stat-label">SOIL</span>
              </div>
              <div className="bathy-stat-card">
                <span className="bathy-stat-value">
                  {stats.maxDepth.toFixed(1)}m
                </span>
                <span className="bathy-stat-label">MAX DEPTH</span>
              </div>
              <div className="bathy-stat-card">
                <span className="bathy-stat-value">
                  {stats.avgDepth.toFixed(1)}m
                </span>
                <span className="bathy-stat-label">AVG DEPTH</span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Volume Statistics ── */}
      {volumeData && (
        <>
          <div className="panel-divider" />
          <div className="bathy-section">
            <span className="group-label">VOLUME ANALYSIS</span>

            {/* Fill gauge */}
            <div className="bathy-fill-gauge">
              <div className="bathy-fill-bg">
                <div
                  className="bathy-fill-bar"
                  style={{ height: `${Math.min(100, volumeData.fill_percentage)}%` }}
                />
              </div>
              <div className="bathy-fill-label">
                <span className="bathy-fill-pct">{volumeData.fill_percentage.toFixed(1)}%</span>
                <span className="bathy-fill-text">FILLED</span>
              </div>
            </div>

            <div className="bathy-volume-stats">
              <div className="survey-info-row">
                <span className="survey-info-label">CURRENT VOL</span>
                <span className="survey-info-value" style={{ color: '#4fc3f7' }}>
                  {volumeData.current_volume_m3.toFixed(1)} m³
                </span>
              </div>
              <div className="survey-info-row">
                <span className="survey-info-label">MAX CAPACITY</span>
                <span className="survey-info-value">
                  {volumeData.max_capacity_m3.toFixed(1)} m³
                </span>
              </div>
              <div className="survey-info-row">
                <span className="survey-info-label">MIN SOIL Z</span>
                <span className="survey-info-value">
                  {volumeData.min_soil_elevation.toFixed(2)} m
                </span>
              </div>
              <div className="survey-info-row">
                <span className="survey-info-label">WATER SURF Z</span>
                <span className="survey-info-value">
                  {volumeData.water_surface_z.toFixed(2)} m
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Actions ── */}
      {(volumeData || surveyPoints.length > 0) && !surveyActive && (
        <>
          <div className="panel-divider" />
          <div className="bathy-section">
            <span className="group-label">ACTIONS</span>
            {volumeData && (
              <button className="ctrl-btn bathy-3d-btn" onClick={onView3D}>
                ◇ VIEW 3D MODEL
              </button>
            )}
            <button
              className="ctrl-btn clear-btn"
              onClick={() => { setShowDetails(false); onClearData(); }}
            >
              ✕ CLEAR DATA
            </button>
          </div>
        </>
      )}

      {/* ── Details toggle ── */}
      {surveyPoints.length > 0 && (
        <button
          className="bathy-details-toggle"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? '▲ Hide details' : '▼ Show details'} ({surveyPoints.length} pts)
        </button>
      )}

      {showDetails && (
        <div className="bathy-details-list">
          {surveyPoints.slice(-20).reverse().map((pt, i) => (
            <div key={i} className="bathy-detail-row">
              <span
                className="bathy-detail-dot"
                style={{ background: pt.type === 'WATER' ? '#4fc3f7' : '#66bb6a' }}
              />
              <span className="bathy-detail-coords">
                ({pt.x.toFixed(1)}, {pt.y.toFixed(1)})
              </span>
              <span className="bathy-detail-val">
                {pt.type === 'WATER'
                  ? `${(pt.depth || 0).toFixed(1)}m`
                  : `Z:${(pt.elevation || 0).toFixed(1)}`
                }
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
