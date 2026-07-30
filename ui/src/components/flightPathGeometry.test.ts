import { describe, expect, it } from 'vitest';
import type { TrajectoryPoint } from '../types/shot';
import {
  MIN_LATERAL_HALF_SPAN_YARDS,
  PADDING,
  SIDE_VIEW_HEIGHT,
  TOP_VIEW_HEIGHT,
  VIEW_WIDTH,
  buildPath,
  computeGeometry,
  distanceTicks,
} from './flightPathGeometry';

/** A plausible driver flight: apex 32 yd, carry 270 yd, fading right. */
function driverFlight(): TrajectoryPoint[] {
  return [
    { t: 0, x: 0, y: 0, z: 0 },
    { t: 1, x: 60, y: 0.4, z: 18 },
    { t: 2, x: 115, y: 1.8, z: 29 },
    { t: 3, x: 165, y: 4.2, z: 32 },
    { t: 4, x: 210, y: 8.0, z: 26 },
    { t: 5, x: 245, y: 13.0, z: 15 },
    { t: 6, x: 270, y: 18.5, z: 0 },
  ];
}

describe('distanceTicks', () => {
  it('uses 50 yard steps for long shots', () => {
    expect(distanceTicks(280)).toEqual([50, 100, 150, 200, 250]);
  });

  it('uses 25 yard steps for mid-range shots', () => {
    expect(distanceTicks(180)).toEqual([25, 50, 75, 100, 125, 150, 175]);
  });

  it('uses 10 yard steps for short shots', () => {
    expect(distanceTicks(60)).toEqual([10, 20, 30, 40, 50]);
  });

  it('never emits a tick at or beyond the maximum', () => {
    for (const max of [45, 90, 150, 300, 400]) {
      expect(distanceTicks(max).every((tick) => tick < max)).toBe(true);
    }
  });

  it('emits no ticks when the range is shorter than one step', () => {
    expect(distanceTicks(8)).toEqual([]);
  });
});

describe('computeGeometry', () => {
  it('rejects an empty trajectory', () => {
    expect(() => computeGeometry([])).toThrow(/empty trajectory/);
  });

  it('places launch at the left padding edge', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.sideScale.x(0)).toBeCloseTo(PADDING.left);
  });

  it('keeps the whole trace inside the viewbox', () => {
    const points = driverFlight();
    const geometry = computeGeometry(points);

    for (const point of points) {
      const x = geometry.sideScale.x(point.x);
      expect(x).toBeGreaterThanOrEqual(PADDING.left);
      expect(x).toBeLessThanOrEqual(VIEW_WIDTH - PADDING.right);

      const sideY = geometry.sideScale.y(point.z);
      expect(sideY).toBeGreaterThanOrEqual(PADDING.top);
      expect(sideY).toBeLessThanOrEqual(SIDE_VIEW_HEIGHT - PADDING.bottom);

      const topY = geometry.topScale.y(point.y);
      expect(topY).toBeGreaterThanOrEqual(PADDING.top);
      expect(topY).toBeLessThanOrEqual(TOP_VIEW_HEIGHT - PADDING.bottom);
    }
  });

  it('maps ground level to the ground line', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.sideScale.y(0)).toBeCloseTo(geometry.groundY);
  });

  it('draws greater height further up the screen', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.sideScale.y(30)).toBeLessThan(geometry.sideScale.y(10));
  });

  it('maps the target line to the centre of the top view', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.topScale.y(0)).toBeCloseTo(geometry.topCenter);
  });

  it('draws a fade below centre and a draw above it', () => {
    // Viewed from above with the shot going left-to-right, the golfer's right
    // is toward the bottom of the screen.
    const geometry = computeGeometry(driverFlight());
    expect(geometry.topScale.y(15)).toBeGreaterThan(geometry.topCenter);
    expect(geometry.topScale.y(-15)).toBeLessThan(geometry.topCenter);
  });

  it('renders left and right deviation symmetrically', () => {
    const geometry = computeGeometry(driverFlight());
    const right = geometry.topScale.y(12) - geometry.topCenter;
    const left = geometry.topCenter - geometry.topScale.y(-12);
    expect(right).toBeCloseTo(left);
  });

  it('finds the apex point', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.apex.z).toBe(32);
    expect(geometry.apex.x).toBe(165);
  });

  it('leaves headroom beyond the longest carry', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.maxDistance).toBeGreaterThan(270);
  });

  it('floors the lateral span so a straight shot does not look curved', () => {
    const straight: TrajectoryPoint[] = [
      { t: 0, x: 0, y: 0, z: 0 },
      { t: 3, x: 120, y: 0.05, z: 30 },
      { t: 6, x: 240, y: 0.1, z: 0 },
    ];
    const geometry = computeGeometry(straight);

    expect(geometry.lateralHalfSpan).toBeGreaterThanOrEqual(MIN_LATERAL_HALF_SPAN_YARDS);
    // A tenth of a yard of drift must stay visually negligible.
    const drift = Math.abs(geometry.topScale.y(0.1) - geometry.topCenter);
    expect(drift).toBeLessThan(3);
  });

  it('expands the lateral span for a big slice', () => {
    const straight = computeGeometry(driverFlight());
    const slice = computeGeometry(driverFlight().map((p) => ({ ...p, y: p.y * 4 })));
    expect(slice.lateralHalfSpan).toBeGreaterThan(straight.lateralHalfSpan);
  });

  it('survives a degenerate single-point trajectory', () => {
    const geometry = computeGeometry([{ t: 0, x: 0, y: 0, z: 0 }]);
    expect(Number.isFinite(geometry.sideScale.x(0))).toBe(true);
    expect(Number.isFinite(geometry.sideScale.y(0))).toBe(true);
    expect(Number.isFinite(geometry.topScale.y(0))).toBe(true);
  });

  it('handles the ~120 point cadence the server actually emits', () => {
    // ballistics samples every 0.05 s, so a 6 s flight is about 120 points.
    const dense: TrajectoryPoint[] = Array.from({ length: 121 }, (_, i) => {
      const t = i * 0.05;
      return { t, x: t * 45, y: t * 3, z: Math.max(0, 32 - (t - 3) ** 2 * 3.5) };
    });
    const geometry = computeGeometry(dense);
    expect(geometry.sidePath.split(' ')).toHaveLength(121);
    expect(geometry.sidePath).not.toMatch(/NaN/);
  });
});

describe('buildPath', () => {
  it('starts with a move and continues with lines', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.sidePath.startsWith('M')).toBe(true);
    expect(
      geometry.sidePath
        .split(' ')
        .slice(1)
        .every((c) => c.startsWith('L'))
    ).toBe(true);
  });

  it('emits one command per point', () => {
    const points = driverFlight();
    const geometry = computeGeometry(points);
    expect(geometry.sidePath.split(' ')).toHaveLength(points.length);
    expect(geometry.topPath.split(' ')).toHaveLength(points.length);
  });

  it('produces no NaN coordinates', () => {
    const geometry = computeGeometry(driverFlight());
    expect(geometry.sidePath).not.toMatch(/NaN/);
    expect(geometry.topPath).not.toMatch(/NaN/);
  });

  it('returns an empty string for no points', () => {
    const scale = { x: (v: number) => v, y: (v: number) => v };
    expect(buildPath([], scale, (p) => p.z)).toBe('');
  });
});
