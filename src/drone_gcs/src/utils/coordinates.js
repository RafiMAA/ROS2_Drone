// ─────────────────────────────────────────────────────────
// coordinates.js — Pixel ↔ World coordinate transforms
// ─────────────────────────────────────────────────────────
// Maps between canvas pixel positions and ENU local frame
// meters using the calibration data from mapConfig.js.
//
// ENU convention:
//   X = East  (increases rightward on screen)
//   Y = North (increases upward — but canvas Y increases
//              downward, so we invert)
// ─────────────────────────────────────────────────────────

import { MAP_CONFIG } from '../config/mapConfig';

/**
 * Convert world ENU coordinates (meters) to canvas pixel coordinates.
 *
 * @param {number} worldX — East position in meters
 * @param {number} worldY — North position in meters
 * @param {number} [canvasWidth]  — current canvas width (defaults to image width)
 * @param {number} [canvasHeight] — current canvas height (defaults to image height)
 * @returns {{ px: number, py: number }}
 */
export function worldToPixel(worldX, worldY, canvasWidth, canvasHeight) {
  const {
    imageWidth, imageHeight,
    worldXMin, worldXMax,
    worldYMin, worldYMax,
  } = MAP_CONFIG;

  const cw = canvasWidth || imageWidth;
  const ch = canvasHeight || imageHeight;

  // Normalize to [0, 1] range
  const normalizedX = (worldX - worldXMin) / (worldXMax - worldXMin);
  const normalizedY = (worldY - worldYMin) / (worldYMax - worldYMin);

  // Map to pixel — invert Y for canvas (top = 0)
  const px = normalizedX * cw;
  const py = (1 - normalizedY) * ch;

  return { px, py };
}

/**
 * Convert canvas pixel coordinates to world ENU coordinates (meters).
 *
 * @param {number} px — pixel X on canvas
 * @param {number} py — pixel Y on canvas
 * @param {number} [canvasWidth]  — current canvas width (defaults to image width)
 * @param {number} [canvasHeight] — current canvas height (defaults to image height)
 * @returns {{ x: number, y: number }}
 */
export function pixelToWorld(px, py, canvasWidth, canvasHeight) {
  const {
    imageWidth, imageHeight,
    worldXMin, worldXMax,
    worldYMin, worldYMax,
  } = MAP_CONFIG;

  const cw = canvasWidth || imageWidth;
  const ch = canvasHeight || imageHeight;

  // Normalize pixel to [0, 1]
  const normalizedX = px / cw;
  const normalizedY = py / ch;

  // Map to world — invert Y back
  const x = worldXMin + normalizedX * (worldXMax - worldXMin);
  const y = worldYMax - normalizedY * (worldYMax - worldYMin);

  return { x, y };
}

/**
 * Convert quaternion orientation to yaw angle (heading).
 * Uses the ZYX Euler convention.
 *
 * @param {{ x: number, y: number, z: number, w: number }} q — quaternion
 * @returns {number} yaw in radians (-π to π), 0 = East, π/2 = North
 */
export function quaternionToYaw(q) {
  const siny_cosp = 2.0 * (q.w * q.z + q.x * q.y);
  const cosy_cosp = 1.0 - 2.0 * (q.y * q.y + q.z * q.z);
  return Math.atan2(siny_cosp, cosy_cosp);
}

/**
 * Convert radians to degrees.
 */
export function radToDeg(rad) {
  return (rad * 180) / Math.PI;
}
