// ─────────────────────────────────────────────────────────
// Bathymetry3DView.jsx — Three.js 3D bathymetry visualization
// ─────────────────────────────────────────────────────────
// Renders a 3D terrain mesh from survey data with:
//   • Terrain surface (Delaunay triangulation)
//   • Current water level plane (semi-transparent blue)
//   • Max-fill water level (wireframe)
//   • Volume labels
//   • OrbitControls for rotation/zoom
// ─────────────────────────────────────────────────────────

import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Grid } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Bathymetry3DView — Full-screen modal with 3D terrain visualization.
 *
 * @param {Object} props
 * @param {Array} props.surveyPoints — measured survey points
 * @param {Object} props.volumeData — volume computation results
 * @param {() => void} props.onClose — close modal
 */
export default function Bathymetry3DView({ surveyPoints, volumeData, onClose }) {
  if (!surveyPoints || surveyPoints.length === 0) return null;

  return (
    <div className="bathy-3d-modal">
      {/* ── Header ── */}
      <div className="bathy-3d-header">
        <h2 className="bathy-3d-title">
          <span style={{ color: '#4fc3f7' }}>◇</span> 3D BATHYMETRY MODEL
        </h2>
        <div className="bathy-3d-header-stats">
          {volumeData && (
            <>
              <span className="bathy-3d-stat">
                Vol: <strong>{volumeData.current_volume_m3.toFixed(0)} m³</strong>
              </span>
              <span className="bathy-3d-stat">
                Cap: <strong>{volumeData.max_capacity_m3.toFixed(0)} m³</strong>
              </span>
              <span className="bathy-3d-stat">
                Fill: <strong>{volumeData.fill_percentage.toFixed(1)}%</strong>
              </span>
            </>
          )}
        </div>
        <button className="bathy-3d-close" onClick={onClose}>✕</button>
      </div>

      {/* ── 3D Canvas ── */}
      <div className="bathy-3d-canvas">
        <Canvas
          camera={{ position: [40, 40, 30], fov: 50 }}
          gl={{ antialias: true }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[20, 30, 20]} intensity={0.8} castShadow />
          <directionalLight position={[-10, 20, -10]} intensity={0.3} />

          <TerrainScene
            surveyPoints={surveyPoints}
            volumeData={volumeData}
          />

          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            minDistance={5}
            maxDistance={200}
          />

          {/* Reference grid */}
          <Grid
            args={[200, 200]}
            position={[0, -10, 0]}
            cellSize={5}
            cellThickness={0.5}
            cellColor="#1a2a3a"
            sectionSize={20}
            sectionThickness={1}
            sectionColor="#2a3a4a"
            fadeDistance={150}
            infiniteGrid
          />
        </Canvas>
      </div>

      {/* ── Legend ── */}
      <div className="bathy-3d-legend">
        <div className="bathy-3d-legend-item">
          <span className="bathy-3d-legend-swatch" style={{ background: '#4fc3f7' }} />
          Water surface
        </div>
        <div className="bathy-3d-legend-item">
          <span className="bathy-3d-legend-swatch" style={{ background: '#1a237e' }} />
          Deep water
        </div>
        <div className="bathy-3d-legend-item">
          <span className="bathy-3d-legend-swatch" style={{ background: '#66bb6a' }} />
          Terrain (soil)
        </div>
        <div className="bathy-3d-legend-item">
          <span className="bathy-3d-legend-swatch" style={{ background: 'rgba(100,181,246,0.3)', border: '1px solid #64b5f6' }} />
          Max fill level
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// TerrainScene — The 3D content
// ─────────────────────────────────────────────────────────

function TerrainScene({ surveyPoints, volumeData }) {
  const waterPlaneRef = useRef();

  // Animate water plane opacity
  useFrame(({ clock }) => {
    if (waterPlaneRef.current) {
      waterPlaneRef.current.material.opacity =
        0.35 + 0.05 * Math.sin(clock.getElapsedTime() * 2);
    }
  });

  // ── Compute geometry data ──
  const { terrainGeom, waterGeom, maxFillGeom, center, waterSurfaceY, minSoilY } = useMemo(() => {
    const water = surveyPoints.filter((p) => p.type === 'WATER');
    const soil = surveyPoints.filter((p) => p.type === 'SOIL');
    const allPoints = [...water, ...soil];

    if (allPoints.length < 3) {
      return { terrainGeom: null, waterGeom: null, maxFillGeom: null, center: [0, 0, 0], waterSurfaceY: 0, minSoilY: 0 };
    }

    // Find center for camera focus
    let cx = 0, cy = 0;
    allPoints.forEach((p) => { cx += p.x; cy += p.y; });
    cx /= allPoints.length;
    cy /= allPoints.length;

    // Water surface Z (from volumeData or default)
    const wSurfZ = volumeData?.water_surface_z ?? -1.0;
    const mSoilZ = volumeData?.min_soil_elevation ?? 0;

    // ── Build terrain points ──
    // For water points: bottom = wSurfZ - depth
    // For soil points: terrain Z = elevation
    const terrainPoints = [];
    const colors = [];

    allPoints.forEach((p) => {
      const tx = p.x - cx;
      const ty = p.y - cy;
      let tz;

      if (p.type === 'WATER') {
        tz = wSurfZ - (p.depth || 0); // bottom of water
      } else {
        tz = p.elevation || 0;
      }

      terrainPoints.push([tx, tz, -ty]); // Convert to Three.js coords (Y-up)

      // Color by type and height
      if (p.type === 'WATER') {
        const depthNorm = Math.min(1, (p.depth || 0) / 10); // normalize to 0-1
        colors.push(
          0.1 * (1 - depthNorm),           // R
          0.15 + 0.3 * (1 - depthNorm),    // G
          0.5 + 0.5 * (1 - depthNorm),     // B — lighter blue for shallower
        );
      } else {
        const elev = p.elevation || 0;
        const elevNorm = Math.max(0, Math.min(1, (elev + 5) / 10));
        colors.push(
          0.2 + 0.3 * elevNorm,   // R — brownish
          0.4 + 0.3 * elevNorm,   // G — greenish
          0.1 + 0.1 * elevNorm,   // B
        );
      }
    });

    // ── Delaunay triangulation (simple 2D projection) ──
    const triangles = delaunay2D(terrainPoints.map(([x, , z]) => [x, z]));

    // Build BufferGeometry
    const positions = [];
    const vertColors = [];

    triangles.forEach(([a, b, c]) => {
      [a, b, c].forEach((idx) => {
        positions.push(terrainPoints[idx][0], terrainPoints[idx][1], terrainPoints[idx][2]);
        vertColors.push(colors[idx * 3], colors[idx * 3 + 1], colors[idx * 3 + 2]);
      });
    });

    const tGeom = new THREE.BufferGeometry();
    tGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    tGeom.setAttribute('color', new THREE.Float32BufferAttribute(vertColors, 3));
    tGeom.computeVertexNormals();

    // ── Water surface plane ──
    const waterPoints2D = water.map((p) => [p.x - cx, -(p.y - cy)]);
    let wGeom = null;
    if (waterPoints2D.length >= 3) {
      const waterTriangles = delaunay2D(waterPoints2D);
      const wPositions = [];
      waterTriangles.forEach(([a, b, c]) => {
        [a, b, c].forEach((idx) => {
          wPositions.push(waterPoints2D[idx][0], wSurfZ, waterPoints2D[idx][1]);
        });
      });
      wGeom = new THREE.BufferGeometry();
      wGeom.setAttribute('position', new THREE.Float32BufferAttribute(wPositions, 3));
      wGeom.computeVertexNormals();
    }

    // ── Max fill plane (at min soil elevation) ──
    let mfGeom = null;
    if (waterPoints2D.length >= 3 && mSoilZ > wSurfZ) {
      const mfPositions = [];
      const mfTriangles = delaunay2D(waterPoints2D);
      mfTriangles.forEach(([a, b, c]) => {
        [a, b, c].forEach((idx) => {
          mfPositions.push(waterPoints2D[idx][0], mSoilZ, waterPoints2D[idx][1]);
        });
      });
      mfGeom = new THREE.BufferGeometry();
      mfGeom.setAttribute('position', new THREE.Float32BufferAttribute(mfPositions, 3));
    }

    return {
      terrainGeom: tGeom,
      waterGeom: wGeom,
      maxFillGeom: mfGeom,
      center: [cx, 0, -cy],
      waterSurfaceY: wSurfZ,
      minSoilY: mSoilZ,
    };
  }, [surveyPoints, volumeData]);

  if (!terrainGeom) {
    return (
      <Text position={[0, 5, 0]} fontSize={2} color="#ff1744">
        Not enough points for 3D visualization
      </Text>
    );
  }

  return (
    <group>
      {/* Terrain mesh */}
      <mesh geometry={terrainGeom}>
        <meshStandardMaterial
          vertexColors
          side={THREE.DoubleSide}
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Water surface */}
      {waterGeom && (
        <mesh ref={waterPlaneRef} geometry={waterGeom}>
          <meshStandardMaterial
            color="#4fc3f7"
            transparent
            opacity={0.35}
            side={THREE.DoubleSide}
            roughness={0.2}
            metalness={0.3}
          />
        </mesh>
      )}

      {/* Max fill level wireframe */}
      {maxFillGeom && (
        <mesh geometry={maxFillGeom}>
          <meshBasicMaterial
            color="#64b5f6"
            transparent
            opacity={0.15}
            wireframe
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Volume labels */}
      {volumeData && (
        <>
          <Text
            position={[0, waterSurfaceY + 3, 0]}
            fontSize={1.2}
            color="#4fc3f7"
            anchorX="center"
            anchorY="bottom"
          >
            {`${volumeData.current_volume_m3.toFixed(0)} m³`}
          </Text>
          <Text
            position={[0, waterSurfaceY + 1.5, 0]}
            fontSize={0.7}
            color="#90a4ae"
            anchorX="center"
          >
            Current Volume
          </Text>
        </>
      )}

      {/* Measurement point markers */}
      {surveyPoints.map((pt, i) => {
        const x = pt.x - (surveyPoints[0]?.x || 0);
        const z = -(pt.y - (surveyPoints[0]?.y || 0));
        const y = pt.type === 'WATER'
          ? (volumeData?.water_surface_z ?? -1) - (pt.depth || 0)
          : (pt.elevation || 0);
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshBasicMaterial
              color={pt.type === 'WATER' ? '#4fc3f7' : '#66bb6a'}
            />
          </mesh>
        );
      })}

      {/* Axes helper */}
      <axesHelper args={[10]} />
    </group>
  );
}

// ─────────────────────────────────────────────────────────
// Simple 2D Delaunay Triangulation (Bowyer-Watson)
// ─────────────────────────────────────────────────────────

function delaunay2D(points) {
  if (points.length < 3) return [];

  // Create super-triangle that contains all points
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dmax = Math.max(dx, dy);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  // Super-triangle vertices (well outside the point set)
  const p0 = [midX - 2 * dmax, midY - dmax];
  const p1 = [midX + 2 * dmax, midY - dmax];
  const p2 = [midX, midY + 2 * dmax];

  const allPts = [...points, p0, p1, p2];
  const n = points.length;

  // Initial triangle using super-triangle indices
  let triangles = [[n, n + 1, n + 2]];

  // Insert each point
  for (let i = 0; i < n; i++) {
    const [px, py] = allPts[i];
    const bad = [];
    const edges = [];

    // Find all triangles whose circumcircle contains the point
    for (let t = 0; t < triangles.length; t++) {
      const [a, b, c] = triangles[t];
      if (inCircumcircle(px, py, allPts[a], allPts[b], allPts[c])) {
        bad.push(t);
        edges.push([a, b], [b, c], [c, a]);
      }
    }

    // Remove bad triangles (in reverse order to preserve indices)
    bad.sort((a, b) => b - a);
    for (const idx of bad) {
      triangles.splice(idx, 1);
    }

    // Find boundary edges (edges that are not shared)
    const boundary = [];
    for (let e = 0; e < edges.length; e++) {
      let shared = false;
      for (let f = 0; f < edges.length; f++) {
        if (e === f) continue;
        if ((edges[e][0] === edges[f][1] && edges[e][1] === edges[f][0]) ||
            (edges[e][0] === edges[f][0] && edges[e][1] === edges[f][1])) {
          shared = true;
          break;
        }
      }
      if (!shared) {
        boundary.push(edges[e]);
      }
    }

    // Create new triangles from boundary edges to the inserted point
    for (const [a, b] of boundary) {
      triangles.push([a, b, i]);
    }
  }

  // Remove triangles that share vertices with the super-triangle
  return triangles.filter(([a, b, c]) => a < n && b < n && c < n);
}

function inCircumcircle(px, py, a, b, c) {
  const ax = a[0] - px, ay = a[1] - py;
  const bx = b[0] - px, by = b[1] - py;
  const cx = c[0] - px, cy = c[1] - py;

  const det = (
    (ax * ax + ay * ay) * (bx * cy - cx * by) -
    (bx * bx + by * by) * (ax * cy - cx * ay) +
    (cx * cx + cy * cy) * (ax * by - bx * ay)
  );

  return det > 0;
}
