// ─────────────────────────────────────────────────────────
// surveyUtils.js — Lawnmower / boustrophedon survey path
// ─────────────────────────────────────────────────────────
// Given a polygon (array of {x,y} vertices in ENU meters),
// generates a zigzag survey path that covers the area.
// ─────────────────────────────────────────────────────────

/**
 * Generate a lawnmower (boustrophedon) survey path inside a polygon.
 *
 * @param {Array<{x: number, y: number}>} polygon — vertices in ENU meters
 * @param {number} spacing — distance between parallel scan lines (meters)
 * @param {number} angleDeg — scan line angle in degrees (0 = East-West lines)
 * @param {number} altitude — flight altitude for all waypoints (meters)
 * @returns {Array<{x: number, y: number, alt: number}>} waypoints
 */
export function generateSurveyWaypoints(polygon, spacing = 20, angleDeg = 0, altitude = 10) {
  if (!polygon || polygon.length < 3) return [];

  const angleRad = (angleDeg * Math.PI) / 180;

  // Step 1: Rotate polygon so scan lines are horizontal
  const rotated = polygon.map((p) => rotatePoint(p, -angleRad));

  // Step 2: Find bounding box of rotated polygon
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of rotated) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  // Step 3: Sweep horizontal lines through the rotated polygon
  const waypoints = [];
  let lineIndex = 0;
  const margin = spacing * 0.1; // small inset so we don't clip edges

  for (let y = minY + margin; y <= maxY - margin; y += spacing) {
    const intersections = polygonLineIntersections(rotated, y);
    if (intersections.length < 2) continue;

    // Sort intersections by X
    intersections.sort((a, b) => a - b);

    // Take outermost pair (handles concave polygons with multiple intersections)
    // For each pair of intersections, generate entry/exit points
    for (let i = 0; i < intersections.length - 1; i += 2) {
      const x1 = intersections[i] + margin;
      const x2 = intersections[i + 1] - margin;
      if (x2 <= x1) continue;

      // Alternate direction for boustrophedon (zigzag)
      if (lineIndex % 2 === 0) {
        waypoints.push(rotatePoint({ x: x1, y }, angleRad));
        waypoints.push(rotatePoint({ x: x2, y }, angleRad));
      } else {
        waypoints.push(rotatePoint({ x: x2, y }, angleRad));
        waypoints.push(rotatePoint({ x: x1, y }, angleRad));
      }
      lineIndex++;
    }
  }

  // Step 4: Attach altitude to all waypoints
  return waypoints.map((wp) => ({ x: wp.x, y: wp.y, alt: altitude }));
}

/**
 * Find X-coordinates where a horizontal line at `y` intersects the polygon edges.
 */
function polygonLineIntersections(polygon, y) {
  const intersections = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];

    // Check if the edge crosses or touches the horizontal line
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      // Linear interpolation to find X at this Y
      const t = (y - a.y) / (b.y - a.y);
      intersections.push(a.x + t * (b.x - a.x));
    }
  }

  return intersections;
}

/**
 * Rotate a point around the origin by `angle` radians.
 */
function rotatePoint(p, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
}

/**
 * Compute the area of a polygon (useful for display).
 * Uses the shoelace formula.
 *
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {number} area in square meters (absolute value)
 */
export function polygonArea(polygon) {
  if (!polygon || polygon.length < 3) return 0;
  let area = 0;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += polygon[i].x * polygon[j].y;
    area -= polygon[j].x * polygon[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Generate a dense grid of survey points inside a polygon.
 * Used for bathymetric surveys where every grid cell needs measurement.
 *
 * @param {Array<{x: number, y: number}>} polygon — vertices in ENU meters
 * @param {number} spacing — distance between grid points (meters)
 * @param {number} angleDeg — grid rotation angle in degrees (0 = East-West aligned)
 * @param {number} altitude — flight altitude for all waypoints (meters)
 * @returns {Array<{x: number, y: number, alt: number}>} grid points in boustrophedon order
 */
export function generateSurveyGrid(polygon, spacing = 5, angleDeg = 0, altitude = 10) {
  if (!polygon || polygon.length < 3) return [];

  const angleRad = (angleDeg * Math.PI) / 180;

  // Step 1: Rotate polygon so grid axes are aligned with X/Y
  const rotated = polygon.map((p) => rotatePoint(p, -angleRad));

  // Step 2: Find bounding box of rotated polygon
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const p of rotated) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  // Step 3: Generate all grid intersection points inside the polygon
  const rows = [];
  for (let y = minY; y <= maxY; y += spacing) {
    const row = [];
    for (let x = minX; x <= maxX; x += spacing) {
      if (isPointInPolygon({ x, y }, rotated)) {
        // Rotate back to original frame
        const original = rotatePoint({ x, y }, angleRad);
        row.push(original);
      }
    }
    rows.push(row);
  }

  // Step 4: Order in boustrophedon (zigzag) pattern
  const gridPoints = [];
  for (let i = 0; i < rows.length; i++) {
    if (i % 2 === 1) {
      rows[i].reverse(); // Alternate direction for efficiency
    }
    for (const pt of rows[i]) {
      gridPoints.push(pt);
    }
  }

  // Step 5: Add polygon border vertices as measurement points (deduplicated)
  for (const vertex of polygon) {
    const isDuplicate = gridPoints.some(
      (p) => Math.abs(p.x - vertex.x) < 0.1 && Math.abs(p.y - vertex.y) < 0.1
    );
    if (!isDuplicate) {
      gridPoints.push({ x: vertex.x, y: vertex.y });
    }
  }

  // Step 6: Attach altitude to all points
  return gridPoints.map((p) => ({ x: p.x, y: p.y, alt: altitude }));
}

/**
 * Check if a point is inside a polygon using the ray casting algorithm.
 *
 * @param {{x: number, y: number}} point
 * @param {Array<{x: number, y: number}>} polygon
 * @returns {boolean}
 */
function isPointInPolygon(point, polygon) {
  const { x, y } = point;
  const n = polygon.length;
  let inside = false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }

  return inside;
}
