import type { TrajectoryPoint } from '../types/shot';

/**
 * Pure geometry for the flight path SVGs.
 *
 * Kept separate from the component so the projection maths can be tested
 * without a DOM, and so the rendering code stays declarative.
 *
 * Both views scale their vertical axis independently of the horizontal one. A
 * real trajectory is roughly 30 yards tall over 270 yards of carry; drawn 1:1
 * it is an unreadable sliver, so every launch monitor exaggerates the vertical.
 * The axis labels carry the true numbers.
 *
 * All inputs are in yards, matching `ballistics.TrajectoryPoint`.
 */

export const VIEW_WIDTH = 800;
export const SIDE_VIEW_HEIGHT = 300;
export const TOP_VIEW_HEIGHT = 260;
export const PADDING = { top: 24, right: 24, bottom: 32, left: 52 };

/**
 * Minimum lateral half-span for the top-down view, in yards. Without a floor, a
 * dead straight shot would zoom the lateral axis to near zero and render
 * sub-yard wobble as a dramatic curve.
 */
export const MIN_LATERAL_HALF_SPAN_YARDS = 6;

/** Extra room beyond the extremes so the trace never touches the frame. */
export const HEADROOM = 1.12;

export interface Scale {
  x: (yards: number) => number;
  y: (yards: number) => number;
}

export interface FlightPathGeometry {
  maxDistance: number;
  lateralHalfSpan: number;
  sideScale: Scale;
  topScale: Scale;
  topCenter: number;
  groundY: number;
  apex: TrajectoryPoint;
  sidePath: string;
  topPath: string;
}

/** Build an SVG path from sampled points under the given scale. */
export function buildPath(
  points: TrajectoryPoint[],
  scale: Scale,
  valueOf: (point: TrajectoryPoint) => number
): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command}${scale.x(point.x).toFixed(1)},${scale.y(valueOf(point)).toFixed(1)}`;
    })
    .join(' ');
}

/** Round-numbered distance gridlines that comfortably fit the range. */
export function distanceTicks(maxYards: number): number[] {
  const step = maxYards > 240 ? 50 : maxYards > 120 ? 25 : 10;
  const ticks: number[] = [];
  for (let yards = step; yards < maxYards; yards += step) {
    ticks.push(yards);
  }
  return ticks;
}

/**
 * Compute both projections for a trajectory.
 *
 * @param points Sampled flight path in yards. Must contain at least one point.
 */
export function computeGeometry(points: TrajectoryPoint[]): FlightPathGeometry {
  if (points.length === 0) {
    throw new Error('Cannot compute flight path geometry from an empty trajectory');
  }

  // Guard against degenerate paths (a stub trajectory at the origin) so the
  // scales never divide by zero.
  const maxDistance = Math.max(...points.map((p) => p.x), 1) * HEADROOM;
  const maxHeight = Math.max(...points.map((p) => p.z), 1) * HEADROOM;
  const lateralHalfSpan = Math.max(...points.map((p) => Math.abs(p.y)), MIN_LATERAL_HALF_SPAN_YARDS) * HEADROOM;

  const plotWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const scaleX = (yards: number) => PADDING.left + (yards / maxDistance) * plotWidth;

  const sidePlotHeight = SIDE_VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const groundY = PADDING.top + sidePlotHeight;
  const sideScale: Scale = {
    x: scaleX,
    y: (yards) => groundY - (yards / maxHeight) * sidePlotHeight,
  };

  const topPlotHeight = TOP_VIEW_HEIGHT - PADDING.top - PADDING.bottom;
  const topCenter = PADDING.top + topPlotHeight / 2;
  const topScale: Scale = {
    x: scaleX,
    // Positive y is right of the target line. Viewed from above with the shot
    // travelling left-to-right, the golfer's right is toward the bottom of the
    // screen, so a fade renders below centre.
    y: (yards) => topCenter + (yards / lateralHalfSpan) * (topPlotHeight / 2),
  };

  const apex = points.reduce((highest, p) => (p.z > highest.z ? p : highest), points[0]);

  return {
    maxDistance,
    lateralHalfSpan,
    sideScale,
    topScale,
    topCenter,
    groundY,
    apex,
    sidePath: buildPath(points, sideScale, (p) => p.z),
    topPath: buildPath(points, topScale, (p) => p.y),
  };
}
