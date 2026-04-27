import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardKey,
  SCHEMA_VERSION,
  useDashboardLayouts,
} from '../useDashboardLayouts';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});

describe('useDashboardLayouts', () => {
  it('returns the default layout on first load', () => {
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    expect(result.current.layouts.kiosk.length).toBeGreaterThan(0);
    expect(result.current.usingDefault).toBe(true);
  });

  it('persists layout changes to localStorage (debounced)', () => {
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    act(() => {
      result.current.setLayouts({
        kiosk: [{ i: 'carry', x: 0, y: 0, w: 4, h: 2 }],
        tablet: [],
        phone: [],
      });
    });
    // Advance past the 250ms debounce.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const stored = JSON.parse(localStorage.getItem('openflight.dashboard.v1') || '{}');
    expect(stored.version).toBe(SCHEMA_VERSION);
    expect(stored.live.layouts.kiosk).toEqual([
      { i: 'carry', x: 0, y: 0, w: 4, h: 2 },
    ]);
    expect(stored.live.hidden).toEqual([]);
    expect(result.current.usingDefault).toBe(false);
  });

  it('falls back to default when localStorage value is corrupt', () => {
    localStorage.setItem('openflight.dashboard.v1', '{not json');
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    expect(result.current.layouts.kiosk.length).toBeGreaterThan(0);
    expect(result.current.usingDefault).toBe(true);
  });

  it('falls back to default when schema version is older', () => {
    localStorage.setItem(
      'openflight.dashboard.v1',
      JSON.stringify({ version: 0, live: { kiosk: [], tablet: [], phone: [] } }),
    );
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    expect(result.current.usingDefault).toBe(true);
  });

  it('does not crash when localStorage.setItem throws (private mode)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
      act(() => {
        result.current.setLayouts({ kiosk: [], tablet: [], phone: [] });
      });
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(result.current.layouts).toBeDefined();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('reset reverts to the default and flags usingDefault', () => {
    const { result } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['carry', 'club_speed']),
    );
    act(() => {
      result.current.setLayouts({
        kiosk: [{ i: 'carry', x: 6, y: 0, w: 6, h: 2 }],
        tablet: [],
        phone: [],
      });
    });
    expect(result.current.usingDefault).toBe(false);
    act(() => {
      result.current.reset();
    });
    expect(result.current.usingDefault).toBe(true);
  });

  it('appends a card not in the saved layout to the bottom', () => {
    localStorage.setItem(
      'openflight.dashboard.v1',
      JSON.stringify({
        version: SCHEMA_VERSION,
        live: {
          layouts: {
            kiosk: [{ i: 'known', x: 0, y: 0, w: 4, h: 2 }],
            tablet: [],
            phone: [],
          },
          hidden: [],
        },
      }),
    );
    const { result } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['known', 'newly_added']),
    );
    const ids = result.current.layouts.kiosk.map((item) => item.i);
    expect(ids).toContain('known');
    expect(ids).toContain('newly_added');
  });

  it('drops a card present in saved layout but not in current code', () => {
    localStorage.setItem(
      'openflight.dashboard.v1',
      JSON.stringify({
        version: SCHEMA_VERSION,
        live: {
          layouts: {
            kiosk: [
              { i: 'still_here', x: 0, y: 0, w: 4, h: 2 },
              { i: 'removed_from_code', x: 4, y: 0, w: 2, h: 2 },
            ],
            tablet: [],
            phone: [],
          },
          hidden: [],
        },
      }),
    );
    const { result } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['still_here']),
    );
    const ids = result.current.layouts.kiosk.map((item) => item.i);
    expect(ids).toContain('still_here');
    expect(ids).not.toContain('removed_from_code');
  });

  it('hide() removes the card from every breakpoint layout and adds it to hidden', () => {
    const { result } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['carry', 'club_speed', 'v_launch']),
    );
    act(() => {
      result.current.hide('club_speed');
    });
    expect(result.current.hidden).toContain('club_speed');
    for (const bp of ['kiosk', 'tablet', 'phone'] as const) {
      const ids = result.current.layouts[bp].map((it) => it.i);
      expect(ids).not.toContain('club_speed');
    }
  });

  it('show() removes the card from hidden and re-appends it via reconciliation', () => {
    const { result } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['carry', 'club_speed']),
    );
    act(() => {
      result.current.hide('club_speed');
    });
    expect(result.current.layouts.kiosk.find((it) => it.i === 'club_speed')).toBeUndefined();
    act(() => {
      result.current.show('club_speed');
    });
    expect(result.current.hidden).not.toContain('club_speed');
    expect(result.current.layouts.kiosk.find((it) => it.i === 'club_speed')).toBeDefined();
  });

  it('persists hidden ids and restores them on reload', () => {
    const { result, unmount } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['carry', 'club_speed']),
    );
    act(() => {
      result.current.hide('club_speed');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    unmount();

    const { result: reloaded } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['carry', 'club_speed']),
    );
    expect(reloaded.current.hidden).toContain('club_speed');
    expect(
      reloaded.current.layouts.kiosk.find((it) => it.i === 'club_speed'),
    ).toBeUndefined();
  });

  it('reset() clears hidden alongside reverting the layout', () => {
    const { result } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['carry', 'club_speed']),
    );
    act(() => {
      result.current.hide('club_speed');
    });
    expect(result.current.hidden).toContain('club_speed');
    act(() => {
      result.current.reset();
    });
    expect(result.current.hidden).toEqual([]);
    expect(result.current.usingDefault).toBe(true);
  });
});
