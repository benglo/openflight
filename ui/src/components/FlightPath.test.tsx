import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Trajectory } from '../types/shot';
import { FlightPath } from './FlightPath';

function trajectory(overrides: Partial<Trajectory> = {}): Trajectory {
  return {
    carry_yards: 254.5,
    total_yards: 280.3,
    apex_yards: 31.8,
    lateral_yards: 8.2,
    flight_time_s: 6.5,
    landing_speed_mph: 59.6,
    landing_angle_deg: 30.7,
    spin_source: 'measured',
    points: [
      { t: 0, x: 0, y: 0, z: 0 },
      { t: 3, x: 130, y: 2.1, z: 31.8 },
      { t: 6.5, x: 254.5, y: 8.2, z: 0 },
    ],
    ...overrides,
  };
}

describe('FlightPath', () => {
  it('renders both views for a normal trajectory', () => {
    const html = renderToString(<FlightPath trajectory={trajectory()} />);

    expect(html).toContain('Side view');
    expect(html).toContain('Top view');
    expect(html).toContain('flight-path__trace');
    expect(html).not.toContain('flight-path--empty');
  });

  // There is no ErrorBoundary in this app, so a throw during render would
  // white-screen the whole kiosk. An empty path must degrade, not crash.
  it('falls back to the empty state instead of throwing on an empty path', () => {
    expect(() => renderToString(<FlightPath trajectory={trajectory({ points: [] })} />)).not.toThrow();

    const html = renderToString(<FlightPath trajectory={trajectory({ points: [] })} />);
    expect(html).toContain('flight-path--empty');
    expect(html).not.toContain('flight-path__trace');
  });

  it('marks a club-average spin rate as estimated', () => {
    const html = renderToString(<FlightPath trajectory={trajectory({ spin_source: 'club_typical' })} />);
    expect(html).toContain('Estimated spin');
  });

  it('does not mark a measured spin rate as estimated', () => {
    const html = renderToString(<FlightPath trajectory={trajectory()} />);
    expect(html).not.toContain('Estimated spin');
  });

  it('labels a right-finishing shot as a fade', () => {
    const html = renderToString(<FlightPath trajectory={trajectory({ lateral_yards: 12 })} />);
    expect(html).toContain('Fade');
  });

  it('labels a left-finishing shot as a draw', () => {
    const html = renderToString(<FlightPath trajectory={trajectory({ lateral_yards: -12 })} />);
    expect(html).toContain('Draw');
  });
});
