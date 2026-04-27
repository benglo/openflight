/**
 * useDashboardLayouts — owns the load/save/reset/reconcile lifecycle for
 * the editable dashboard. Each view (Live or Stats) has its own
 * responsive layout (kiosk / tablet / phone) which is persisted in
 * localStorage under a single versioned key.
 *
 * Reconciliation: if the saved layout is missing card ids that exist in
 * the current code, those ids are appended at the bottom; if the saved
 * layout has card ids that no longer exist in the code, those are
 * silently dropped. This means deploying a new version that adds or
 * removes a metric card never breaks a customised layout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Shape of a single grid item, structurally compatible with
 * react-grid-layout's `Layout` interface. We declare it locally so
 * the hook doesn't depend on the upstream @types module structure
 * (which can shift between versions and ESM/CJS differences) — the
 * EditableDashboard wrapper handles the type bridge to RGL.
 */
export interface LayoutItem {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  maxW?: number;
  minH?: number;
  maxH?: number;
  static?: boolean;
}

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'openflight.dashboard.v1';

// `erasableSyntaxOnly` is enabled in tsconfig, so we use a const object
// + a string-literal type rather than an enum. Same ergonomics, no
// runtime side-effects.
export const DashboardKey = {
  Live: 'live',
  Stats: 'stats',
} as const;
export type DashboardKey = (typeof DashboardKey)[keyof typeof DashboardKey];

export interface DashboardLayouts {
  kiosk: LayoutItem[];
  tablet: LayoutItem[];
  phone: LayoutItem[];
}

interface StoredShape {
  version: number;
  live?: DashboardLayouts;
  stats?: DashboardLayouts;
}

// --- Defaults ---
// Each layout defines positions for the cards in 12-column grid units.
// Heights are in row units (where row height is set by the grid container,
// typically 60-80px).

const DEFAULT_LIVE: DashboardLayouts = {
  kiosk: [
    { i: 'carry', x: 0, y: 0, w: 12, h: 3 },
    { i: 'club_speed', x: 0, y: 3, w: 6, h: 2 },
    { i: 'v_launch', x: 6, y: 3, w: 6, h: 2 },
    { i: 'club_aoa', x: 0, y: 5, w: 6, h: 2 },
    { i: 'club_path', x: 6, y: 5, w: 6, h: 2 },
    { i: 'spin_axis', x: 0, y: 7, w: 6, h: 2 },
    { i: 'h_launch', x: 6, y: 7, w: 6, h: 2 },
    { i: 'spin_rpm', x: 0, y: 9, w: 12, h: 2 },
    { i: 'sim_carry', x: 0, y: 11, w: 12, h: 3 },
    { i: 'sim_total', x: 0, y: 14, w: 6, h: 2 },
    { i: 'sim_lateral', x: 6, y: 14, w: 6, h: 2 },
    { i: 'sim_apex', x: 0, y: 16, w: 12, h: 2 },
  ],
  tablet: [
    { i: 'carry', x: 0, y: 0, w: 8, h: 3 },
    { i: 'club_speed', x: 0, y: 3, w: 4, h: 2 },
    { i: 'v_launch', x: 4, y: 3, w: 4, h: 2 },
    { i: 'club_aoa', x: 0, y: 5, w: 4, h: 2 },
    { i: 'club_path', x: 4, y: 5, w: 4, h: 2 },
    { i: 'spin_axis', x: 0, y: 7, w: 4, h: 2 },
    { i: 'h_launch', x: 4, y: 7, w: 4, h: 2 },
    { i: 'spin_rpm', x: 0, y: 9, w: 8, h: 2 },
    { i: 'sim_carry', x: 0, y: 11, w: 8, h: 3 },
    { i: 'sim_total', x: 0, y: 14, w: 4, h: 2 },
    { i: 'sim_lateral', x: 4, y: 14, w: 4, h: 2 },
    { i: 'sim_apex', x: 0, y: 16, w: 8, h: 2 },
  ],
  phone: [
    { i: 'carry', x: 0, y: 0, w: 4, h: 3 },
    { i: 'club_speed', x: 0, y: 3, w: 4, h: 2 },
    { i: 'v_launch', x: 0, y: 5, w: 4, h: 2 },
    { i: 'club_aoa', x: 0, y: 7, w: 4, h: 2 },
    { i: 'club_path', x: 0, y: 9, w: 4, h: 2 },
    { i: 'spin_axis', x: 0, y: 11, w: 4, h: 2 },
    { i: 'h_launch', x: 0, y: 13, w: 4, h: 2 },
    { i: 'spin_rpm', x: 0, y: 15, w: 4, h: 2 },
    { i: 'sim_carry', x: 0, y: 17, w: 4, h: 3 },
    { i: 'sim_total', x: 0, y: 20, w: 4, h: 2 },
    { i: 'sim_lateral', x: 0, y: 22, w: 4, h: 2 },
    { i: 'sim_apex', x: 0, y: 24, w: 4, h: 2 },
  ],
};

const DEFAULT_STATS: DashboardLayouts = {
  kiosk: [
    { i: 'avg_carry', x: 0, y: 0, w: 12, h: 3 },
    { i: 'shots', x: 0, y: 3, w: 4, h: 2 },
    { i: 'avg_ball', x: 4, y: 3, w: 4, h: 2 },
    { i: 'max_ball', x: 8, y: 3, w: 4, h: 2 },
    { i: 'avg_club', x: 0, y: 5, w: 4, h: 2 },
    { i: 'avg_smash', x: 4, y: 5, w: 4, h: 2 },
  ],
  tablet: [
    { i: 'avg_carry', x: 0, y: 0, w: 8, h: 3 },
    { i: 'shots', x: 0, y: 3, w: 4, h: 2 },
    { i: 'avg_ball', x: 4, y: 3, w: 4, h: 2 },
    { i: 'max_ball', x: 0, y: 5, w: 4, h: 2 },
    { i: 'avg_club', x: 4, y: 5, w: 4, h: 2 },
    { i: 'avg_smash', x: 0, y: 7, w: 8, h: 2 },
  ],
  phone: [
    { i: 'avg_carry', x: 0, y: 0, w: 4, h: 3 },
    { i: 'shots', x: 0, y: 3, w: 2, h: 2 },
    { i: 'avg_ball', x: 2, y: 3, w: 2, h: 2 },
    { i: 'max_ball', x: 0, y: 5, w: 2, h: 2 },
    { i: 'avg_club', x: 2, y: 5, w: 2, h: 2 },
    { i: 'avg_smash', x: 0, y: 7, w: 4, h: 2 },
  ],
};

const DEFAULTS: Record<DashboardKey, DashboardLayouts> = {
  [DashboardKey.Live]: DEFAULT_LIVE,
  [DashboardKey.Stats]: DEFAULT_STATS,
};

// --- Storage helpers ---

function readStored(): StoredShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed.version !== SCHEMA_VERSION) {
      console.info(
        `[dashboard] stored layout schema v${parsed.version} != current v${SCHEMA_VERSION}; using default`,
      );
      return null;
    }
    return parsed as StoredShape;
  } catch {
    return null;
  }
}

function writeStored(view: DashboardKey, layouts: DashboardLayouts) {
  try {
    const existing = readStored() ?? { version: SCHEMA_VERSION };
    const merged = { ...existing, version: SCHEMA_VERSION, [view]: layouts };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    /* private browsing / quota — silently degrade. */
  }
}

// --- Reconciliation ---

function reconcileBreakpoint(items: LayoutItem[], knownIds: readonly string[]): LayoutItem[] {
  const known = new Set(knownIds);
  const present = new Set<string>();
  const filtered = items.filter((it) => {
    if (!known.has(it.i)) return false;
    present.add(it.i);
    return true;
  });
  let nextY = filtered.reduce((max, it) => Math.max(max, it.y + it.h), 0);
  for (const id of knownIds) {
    if (!present.has(id)) {
      filtered.push({ i: id, x: 0, y: nextY, w: 6, h: 2 });
      nextY += 2;
    }
  }
  return filtered;
}

function reconcile(
  layouts: DashboardLayouts,
  knownIds: readonly string[] | undefined,
): DashboardLayouts {
  if (!knownIds) return layouts;
  return {
    kiosk: reconcileBreakpoint(layouts.kiosk, knownIds),
    tablet: reconcileBreakpoint(layouts.tablet, knownIds),
    phone: reconcileBreakpoint(layouts.phone, knownIds),
  };
}

// --- Public hook ---

export function useDashboardLayouts(view: DashboardKey, knownIds?: readonly string[]) {
  const knownKey = knownIds ? knownIds.join('|') : '';

  const initial = useMemo(() => {
    const stored = readStored();
    const fromStorage = stored?.[view];
    if (fromStorage) {
      return { layouts: reconcile(fromStorage, knownIds), usingDefault: false };
    }
    return { layouts: reconcile(DEFAULTS[view], knownIds), usingDefault: true };
    // initial computation only — knownIds drives a later effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [layouts, setLayoutsState] = useState<DashboardLayouts>(initial.layouts);
  const [usingDefault, setUsingDefault] = useState<boolean>(initial.usingDefault);

  // Debounced persistence — drag emits many events.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => writeStored(view, layouts), 250);
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [layouts, view]);

  const setLayouts = useCallback((next: DashboardLayouts) => {
    setLayoutsState(next);
    setUsingDefault(false);
  }, []);

  const reset = useCallback(() => {
    setLayoutsState(reconcile(DEFAULTS[view], knownIds));
    setUsingDefault(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, knownKey]);

  // If knownIds changes (e.g. a card is added/removed in code on a hot
  // reload), re-reconcile so the layout includes/drops the right ids.
  useEffect(() => {
    if (!knownIds) return;
    setLayoutsState((current) => reconcile(current, knownIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownKey]);

  return { layouts, setLayouts, reset, usingDefault };
}
