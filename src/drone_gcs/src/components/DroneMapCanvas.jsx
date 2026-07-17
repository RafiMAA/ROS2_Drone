// ─────────────────────────────────────────────────────────
// DroneMapCanvas.jsx — Main canvas: static map background,
// drone triangle marker, waypoint markers, zoom/pan
// ─────────────────────────────────────────────────────────

import { useRef, useEffect, useState, useCallback } from 'react';
import { worldToPixel, pixelToWorld } from '../utils/coordinates';
import { MAP_CONFIG } from '../config/mapConfig';

// ── Drone triangle drawing settings ──
const DRONE_SIZE = 18;
const DRONE_COLOR = '#00e5ff';
const DRONE_GLOW_COLOR = 'rgba(0, 229, 255, 0.4)';

// ── Waypoint drawing settings ──
const WP_RADIUS = 10;
const WP_FILL = '#00e5ff';
const WP_STROKE = '#ffffff';
const WP_LINE_COLOR = 'rgba(0, 229, 255, 0.5)';
const WP_LINE_DASH = [8, 6];

/**
 * @param {Array<{x: number, y: number}>} props.waypoints
 * @param {(pos) => void} props.onAddWaypoint
 * @param {() => void} props.onRemoveLastWaypoint
 * @param {Array<{x: number, y: number}>} props.surveyWaypoints — Generated grid points
 * @param {Array<Object>} props.bathymetryPoints — Measured data
 */
export default function DroneMapCanvas({
  dronePose,
  waypoints = [],
  onAddWaypoint,
  onRemoveLastWaypoint,
  surveyWaypoints = [],
  bathymetryPoints = [],
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const mapImageRef = useRef(null);
  const animFrameRef = useRef(null);

  // ── Zoom & Pan state ──
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });

  // ── Canvas dimensions ──
  const [canvasSize, setCanvasSize] = useState({ width: 1920, height: 1080 });

  // Load static map image
  useEffect(() => {
    const img = new Image();
    img.src = '/map.png';
    img.onload = () => {
      mapImageRef.current = img;
      // Update canvas size to match image aspect ratio
      if (containerRef.current) {
        const containerW = containerRef.current.clientWidth;
        const containerH = containerRef.current.clientHeight;
        setCanvasSize({ width: containerW, height: containerH });
      }
    };
    img.onerror = () => {
      console.warn('[DroneMapCanvas] Failed to load map.png — using grid fallback');
      mapImageRef.current = null;
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setCanvasSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Screen coordinates to world (accounting for zoom/pan) ──
  const screenToWorld = useCallback(
    (screenX, screenY) => {
      // Reverse the zoom/pan transform
      const canvasX = (screenX - panOffset.x) / zoom;
      const canvasY = (screenY - panOffset.y) / zoom;
      return pixelToWorld(canvasX, canvasY, canvasSize.width, canvasSize.height);
    },
    [zoom, panOffset, canvasSize]
  );

  // ── Mouse wheel zoom ──
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.max(0.5, Math.min(10, zoom * zoomFactor));

      // Zoom toward cursor position
      const newPanX = mouseX - ((mouseX - panOffset.x) / zoom) * newZoom;
      const newPanY = mouseY - ((mouseY - panOffset.y) / zoom) * newZoom;

      setZoom(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    },
    [zoom, panOffset]
  );

  // ── Mouse pan (middle button or Ctrl+left) ──
  const handleMouseDown = useCallback(
    (e) => {
      if (e.button === 1 || (e.button === 0 && e.ctrlKey)) {
        // Middle-click or Ctrl+click for panning
        isPanningRef.current = true;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        e.preventDefault();
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (isPanningRef.current) {
        const dx = e.clientX - lastMouseRef.current.x;
        const dy = e.clientY - lastMouseRef.current.y;
        lastMouseRef.current = { x: e.clientX, y: e.clientY };
        setPanOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      }
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
  }, []);

  // ── Click to place waypoint / survey vertex ──
  const handleClick = useCallback(
    (e) => {
      if (e.ctrlKey) return; // Ctrl+click is for panning

      const rect = canvasRef.current.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = screenToWorld(screenX, screenY);

      onAddWaypoint?.({ x: worldPos.x, y: worldPos.y });
    },
    [screenToWorld, onAddWaypoint]
  );

  // ── Right-click to remove last waypoint ──
  const handleContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      onRemoveLastWaypoint?.();
    },
    [onRemoveLastWaypoint]
  );

  // ── Render loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let pulsePhase = 0;

    const render = () => {
      const { width, height } = canvasSize;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

      // Clear
      ctx.fillStyle = '#0a0e17';
      ctx.fillRect(0, 0, width, height);

      // Apply zoom + pan transform
      ctx.save();
      ctx.translate(panOffset.x, panOffset.y);
      ctx.scale(zoom, zoom);

      // ── Layer 1: Map Background ──
      if (mapImageRef.current) {
        ctx.drawImage(mapImageRef.current, 0, 0, width, height);
      } else {
        drawGridFallback(ctx, width, height);
      }

      // ── Layer 2: Waypoint Polygon Boundary ──
      if (waypoints.length > 0) {
        ctx.beginPath();
        const first = worldToPixel(waypoints[0].x, waypoints[0].y, width, height);
        ctx.moveTo(first.px, first.py);

        for (let i = 1; i < waypoints.length; i++) {
          const wp = worldToPixel(waypoints[i].x, waypoints[i].y, width, height);
          ctx.lineTo(wp.px, wp.py);
        }

        if (waypoints.length > 2) {
          ctx.closePath();
          ctx.fillStyle = 'rgba(0, 229, 255, 0.1)';
          ctx.fill();
        }

        ctx.setLineDash(WP_LINE_DASH);
        ctx.strokeStyle = WP_LINE_COLOR;
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Layer 3: Waypoint Markers (Boundary) ──
      waypoints.forEach((wp, idx) => {
        const { px, py } = worldToPixel(wp.x, wp.y, width, height);
        const r = WP_RADIUS / zoom;

        // Outer glow
        ctx.beginPath();
        ctx.arc(px, py, r + 4 / zoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 229, 255, 0.15)';
        ctx.fill();

        // Circle
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = WP_FILL;
        ctx.strokeStyle = WP_STROKE;
        ctx.lineWidth = 2 / zoom;
        ctx.fill();
        ctx.stroke();

        // Number label
        ctx.fillStyle = '#0a0e17';
        ctx.font = `bold ${Math.max(10, 12 / zoom)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${idx + 1}`, px, py);

      });

      // ── Layer 4: Survey Grid Path (Generated) ──
      if (surveyWaypoints.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.5)';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([4 / zoom, 4 / zoom]);

        const first = worldToPixel(surveyWaypoints[0].x, surveyWaypoints[0].y, width, height);
        ctx.moveTo(first.px, first.py);

        for (let i = 1; i < surveyWaypoints.length; i++) {
          const wp = worldToPixel(surveyWaypoints[i].x, surveyWaypoints[i].y, width, height);
          ctx.lineTo(wp.px, wp.py);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw cyan markers for generated grid
        surveyWaypoints.forEach((wp, idx) => {
          const { px, py } = worldToPixel(wp.x, wp.y, width, height);
          const r = WP_RADIUS / zoom;

          // Circle
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fillStyle = WP_FILL;
          ctx.strokeStyle = WP_STROKE;
          ctx.lineWidth = 1.5 / zoom;
          ctx.fill();
          ctx.stroke();

          // Number label
          ctx.fillStyle = '#0a0e17';
          ctx.font = `bold ${Math.max(10, 12 / zoom)}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${idx + 1}`, px, py);
        });
      }

      // ── Layer 6: Drone Triangle ──
      pulsePhase += 0.05;
      const pulseScale = 1 + 0.1 * Math.sin(pulsePhase);
      drawDrone(ctx, dronePose, width, height, zoom, pulseScale);

      // ── Layer 7: Bathymetry Heatmap Points ──
      if (bathymetryPoints.length > 0) {
        // Find max depth for normalization
        let maxDepth = 1;
        for (const pt of bathymetryPoints) {
          if (pt.type === 'WATER' && pt.depth > maxDepth) maxDepth = pt.depth;
        }

        bathymetryPoints.forEach((pt) => {
          const { px, py } = worldToPixel(pt.x, pt.y, width, height);
          const r = 6 / zoom;

          if (pt.type === 'WATER') {
            // Blue with depth-proportional intensity
            const depthNorm = Math.min(1, (pt.depth || 0) / maxDepth);
            const alpha = 0.4 + 0.5 * depthNorm;
            const blue = Math.round(150 + 105 * (1 - depthNorm));
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(30, 100, ${blue}, ${alpha})`;
            ctx.fill();
            // Bright ring
            ctx.strokeStyle = `rgba(79, 195, 247, ${0.5 + 0.3 * depthNorm})`;
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
          } else {
            // Soil: green dot
            ctx.beginPath();
            ctx.arc(px, py, r * 0.8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(102, 187, 106, 0.6)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(102, 187, 106, 0.9)';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
          }
        });

        // Heatmap legend
        const legendX = width - 120;
        const legendY = 20;
        ctx.save();
        // Reset transform for HUD-space drawing
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(legendX - 8, legendY - 4, 110, 52);
        ctx.font = '9px Inter, sans-serif';
        ctx.fillStyle = '#90a4ae';
        ctx.fillText('BATHYMETRY', legendX, legendY + 8);
        // Water swatch
        ctx.fillStyle = '#4fc3f7';
        ctx.fillRect(legendX, legendY + 14, 10, 10);
        ctx.fillStyle = '#cfd8dc';
        ctx.fillText(`Water (${bathymetryPoints.filter(p => p.type === 'WATER').length})`, legendX + 14, legendY + 22);
        // Soil swatch
        ctx.fillStyle = '#66bb6a';
        ctx.fillRect(legendX, legendY + 28, 10, 10);
        ctx.fillStyle = '#cfd8dc';
        ctx.fillText(`Soil (${bathymetryPoints.filter(p => p.type === 'SOIL').length})`, legendX + 14, legendY + 36);
        ctx.restore();
        // Re-apply zoom/pan transform
        ctx.translate(panOffset.x, panOffset.y);
        ctx.scale(zoom, zoom);
      }

      ctx.restore();

      // ── HUD overlay (not affected by zoom/pan) ──
      drawHUD(ctx, width, height, zoom, dronePose);

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [canvasSize, dronePose, waypoints, zoom, panOffset, bathymetryPoints]);

  return (
    <div
      ref={containerRef}
      className="drone-map-container"
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}
    >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanningRef.current ? 'grabbing' : 'crosshair', display: 'block' }}
      />

      {/* Zoom controls */}
      <div className="zoom-controls">
        <button
          className="zoom-btn"
          onClick={() => setZoom((z) => Math.min(10, z * 1.2))}
          title="Zoom In"
        >
          +
        </button>
        <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        <button
          className="zoom-btn"
          onClick={() => setZoom((z) => Math.max(0.5, z / 1.2))}
          title="Zoom Out"
        >
          −
        </button>
        <button
          className="zoom-btn zoom-reset"
          onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }}
          title="Reset View"
        >
          ⌂
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Drawing helpers
// ─────────────────────────────────────────────────────────

function drawDrone(ctx, pose, canvasW, canvasH, zoom, pulseScale) {
  const { px, py } = worldToPixel(pose.x, pose.y, canvasW, canvasH);
  const size = (DRONE_SIZE / zoom) * pulseScale;

  ctx.save();
  ctx.translate(px, py);
  // Canvas: 0 = right (East), rotates clockwise
  // ENU yaw: 0 = East, positive = counter-clockwise
  // Canvas rotation is clockwise, so negate
  ctx.rotate(-pose.yaw);

  // Glow effect
  ctx.shadowColor = DRONE_GLOW_COLOR;
  ctx.shadowBlur = 20 / zoom;

  // Draw triangle pointing in heading direction (right = forward)
  ctx.beginPath();
  ctx.moveTo(size, 0);                                    // nose (forward)
  ctx.lineTo(-size * 0.6, -size * 0.5);                   // left wing
  ctx.lineTo(-size * 0.3, 0);                             // notch
  ctx.lineTo(-size * 0.6, size * 0.5);                    // right wing
  ctx.closePath();

  ctx.fillStyle = DRONE_COLOR;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5 / zoom;
  ctx.stroke();

  ctx.shadowBlur = 0;

  // Center dot
  ctx.beginPath();
  ctx.arc(0, 0, 2 / zoom, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();

  // Altitude label
  ctx.fillStyle = 'rgba(0, 229, 255, 0.9)';
  ctx.font = `${Math.max(9, 11 / zoom)}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`ALT ${pose.z.toFixed(1)}m`, px, py + size + 14 / zoom);
}

function drawGridFallback(ctx, width, height) {
  // Dark grid when no map.png is loaded
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  const gridSpacing = 40;
  for (let x = 0; x < width; x += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSpacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Origin crosshair
  const { px: ox, py: oy } = worldToPixel(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(ox, 0);
  ctx.lineTo(ox, height);
  ctx.moveTo(0, oy);
  ctx.lineTo(width, oy);
  ctx.stroke();
  ctx.setLineDash([]);

  // Origin label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '12px Inter, sans-serif';
  ctx.fillText('(0, 0)', ox + 6, oy - 6);

  // "No map loaded" text
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.font = '18px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('No map.png loaded — launch Gazebo to auto-capture', width / 2, height / 2);
  ctx.textAlign = 'start';
}

function drawHUD(ctx, width, height, zoom) {
  // Scale bar
  const barWorldMeters = 10;
  const worldRangeX = MAP_CONFIG.worldXMax - MAP_CONFIG.worldXMin;
  const barPixels = (barWorldMeters / worldRangeX) * width * zoom;

  const barX = 16;
  const barY = height - 24;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(barX - 4, barY - 16, barPixels + 8, 24);

  ctx.strokeStyle = '#00e5ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barPixels, barY);
  ctx.moveTo(barX, barY - 4);
  ctx.lineTo(barX, barY + 4);
  ctx.moveTo(barX + barPixels, barY - 4);
  ctx.lineTo(barX + barPixels, barY + 4);
  ctx.stroke();

  ctx.fillStyle = '#00e5ff';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${barWorldMeters}m`, barX + barPixels / 2, barY - 6);
  ctx.textAlign = 'start';
}
