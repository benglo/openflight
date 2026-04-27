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

export const SCHEMA_VERSION = 2;
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

/**
 * Per-view persisted state. `hidden` holds the ids the user has chosen
 * to omit from the dashboard; the live layout only contains entries
 * for visible cards. Ids in `hidden` are still in `cardIds` (the parent
 * always renders the full set), but EditableDashboard filters them out
 * so RGL never sees them.
 */
interface ViewState {
  layouts: DashboardLayouts;
  hidden: string[];
}

interface StoredShape {
  version: number;
  live?: ViewState;
  stats?: ViewState;
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

function writeStored(view: DashboardKey, state: ViewState) {
  try {
    const existing = readStored() ?? { version: SCHEMA_VERSION };
    const merged = { ...existing, version: SCHEMA_VERSION, [view]: state };
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

function visibleIds(
  knownIds: readonly string[] | undefined,
  hidden: readonly string[],
): readonly string[] | undefined {
  if (!knownIds) return knownIds;
  if (hidden.length === 0) return knownIds;
  const hiddenSet = new Set(hidden);
  return knownIds.filter((id) => !hiddenSet.has(id));
}

// --- Public hook ---

export function useDashboardLayouts(view: DashboardKey, knownIds?: readonly string[]) {
  const knownKey = knownIds ? knownIds.join('|') : '';

  const initial = useMemo(() => {
    const stored = readStored();
    const fromStorage = stored?.[view];
    const hidden = fromStorage?.hidden ?? [];
    const visible = visibleIds(knownIds, hidden);
    if (fromStorage) {
      return {
        layouts: reconcile(fromStorage.layouts, visible),
        hidden,
        usingDefault: false,
      };
    }
    return {
      layouts: reconcile(DEFAULTS[view], visible),
      hidden,
      usingDefault: true,
    };
    // initial computation only — knownIds drives a later effect
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [layouts, setLayoutsState] = useState<DashboardLayouts>(initial.layouts);
  const [hidden, setHiddenState] = useState<string[]>(initial.hidden);
  const [usingDefault, setUsingDefault] = useState<boolean>(initial.usingDefault);

  // Debounced persistence — drag emits many events; hide/show is rare
  // but goes through the same path so the two stay in sync on disk.
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(
      () => writeStored(view, { layouts, hidden }),
      250,
    );
    return () => {
      if (writeTimer.current) clearTimeout(writeTimer.current);
    };
  }, [layouts, hidden, view]);

  const setLayouts = useCallback((next: DashboardLayouts) => {
    setLayoutsState(next);
    setUsingDefault(false);
  }, []);

  const reset = useCallback(() => {
    setHiddenState([]);
    setLayoutsState(reconcile(DEFAULTS[view], knownIds));
    setUsingDefault(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, knownKey]);

  const hide = useCallback((id: string) => {
    setHiddenState((curr) => (curr.includes(id) ? curr : [...curr, id]));
    setLayoutsState((curr) => ({
      kiosk: curr.kiosk.filter((it) => it.i !== id),
      tablet: curr.tablet.filter((it) => it.i !== id),
      phone: curr.phone.filter((it) => it.i !== id),
    }));
    setUsingDefault(false);
  }, []);

  // Show: drop from hidden, then let the reconcile effect re-append the
  // id at the bottom of each breakpoint's layout.
  const show = useCallback((id: string) => {
    setHiddenState((curr) => curr.filter((h) => h !== id));
    setUsingDefault(false);
  }, []);

  // If knownIds OR hidden changes (e.g. a card added in code, or the
  // user un-hid one), re-reconcile so the layout matches the visible
  // set. Hiding is handled inline above (we filter the layout there);
  // this effect catches the un-hide path and code-level changes.
  const hiddenKey = hidden.join('|');
  useEffect(() => {
    if (!knownIds) return;
    const visible = visibleIds(knownIds, hidden);
    setLayoutsState((current) => reconcile(current, visible));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownKey, hiddenKey]);

  return { layouts, setLayouts, reset, usingDefault, hidden, hide, show };
}
