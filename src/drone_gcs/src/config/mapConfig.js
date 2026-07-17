// ─────────────────────────────────────────────────────────
// mapConfig.js — World bounds ↔ pixel dimension mapping
// ─────────────────────────────────────────────────────────
// This configuration defines the calibration between the
// static top-down Gazebo screenshot (map.png) and the
// ENU local coordinate frame used by ArduPilot / MAVROS.
//
// After capturing your map.png, update imageWidth/imageHeight
// to match the actual image resolution, and set the world
// bounds to match the area visible in the screenshot.
// ─────────────────────────────────────────────────────────

export const MAP_CONFIG = {
  // ── Image dimensions (pixels) ──
  // Must match the actual resolution of public/map.png
  imageWidth: 1920,
  imageHeight: 1920,

  // ── World bounds (meters, ENU local frame) ──
  // X axis = East direction in ENU
  // Y axis = North direction in ENU
  // Calculated exactly from camera Z=1200m and FOV=1.39626
  worldXMin: -1006.92,  // meters — left edge of the image
  worldXMax: 1006.92,   // meters — right edge of the image
  worldYMin: -1006.92,  // meters — bottom edge of the image
  worldYMax: 1006.92,   // meters — top edge of the image

  // ── Default altitude for waypoints (meters above ground) ──
  defaultAltitude: 10,

  // ── Overhead camera height (must match the SDF camera Z position) ──
  cameraHeight: 1200,
};

export default MAP_CONFIG;
