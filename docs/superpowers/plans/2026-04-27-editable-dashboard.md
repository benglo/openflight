# Editable Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rearrange and resize the metric cards on the Live and Stats screens via drag-and-drop in an opt-in edit mode, with the layout persisted per-device in localStorage and a default that matches today's visual hierarchy.

**Architecture:** A new `EditableDashboard` wrapper (built on `react-grid-layout`) replaces the static grids in `ShotDisplay` and `StatsView`. Layouts live in a single `useDashboardLayouts` hook that owns the (load → render → mutate → persist → reset) lifecycle. The speed gauge and primary actions stay anchored — only the metric cards become widgets. Edit mode is a single boolean piece of UI state surfaced via a toggle in the header.

**Tech Stack:** Python backend untouched. Frontend gets `react-grid-layout` (~50KB gzipped, MIT, mature) + its required CSS. No other dependencies.

---

## Acceptance Criteria

### Happy-path / functional

1. **Edit toggle in the header**: A small icon button (pencil/edit glyph) in the existing `.header__controls` strip toggles dashboard edit mode globally. Aria-pressed state reflects on/off. Keyboard activatable.
2. **Live screen widgets**: In edit mode, every `MetricCard` on the Live screen becomes a draggable + resizable grid widget. The speed gauge and the Simulate Shot button stay anchored — they're not part of the editable grid.
3. **Stats screen widgets**: Each `.stat-card` becomes a draggable + resizable widget. The Clear Session button stays anchored.
4. **Visual cues in edit mode**: Drag-handles or a dashed border appear on each widget; a faint dotted background communicates the underlying grid; cursor becomes `grab`/`grabbing` during drag.
5. **Live mode visual parity**: When edit mode is OFF, the Live and Stats screens look exactly as they do today — no extra borders, no handles, no spacing differences. The grid system is invisible.
6. **Layout persistence**: After an edit, the layout writes to `localStorage` under the key `openflight.dashboard.v1` within 500 ms (debounced). Reloading the app restores the saved layout.
7. **Default layout**: First-time users see a layout that matches today's visual arrangement — Avg Carry as a wide hero, supporting stats below in a 3-col strip on Stats; primary cards (Est. Carry, Sim Carry) spanning full width on Live, others in a 2-col grid.
8. **Reset to default**: A "Reset Layout" button in edit mode (per view) clears that view's saved layout and restores the default. The button confirms before destructive action.
9. **Responsive layouts**: Three breakpoint layouts via `ResponsiveGridLayout`:
   - **kiosk** (`>= 800px wide`): primary view, density-tuned
   - **tablet** (`>= 600px wide`): 2-column-friendly
   - **phone** (`< 600px wide`): single-column-stacked default
   Each breakpoint has its own saved layout (a user customising on the kiosk doesn't have their changes overwrite phone view).
10. **Touch and mouse parity**: Drag and resize work identically with touch and pointer. Touch targets on resize handles ≥ 24px (handles are smaller than buttons but the audit's 44px minimum is for primary actions).
11. **Accessibility — keyboard**: Edit mode and reset are keyboard-operable. (Drag-via-keyboard is not in scope for v1; documented as a follow-up.)

### Negative-path / robustness

12. **Corrupted localStorage**: If the saved layout JSON fails to parse or fails schema validation, log a warning, ignore the saved value, and fall back to the default layout. Do NOT crash; do NOT show an error UI.
13. **localStorage disabled**: In private-browsing or sandboxed contexts where `localStorage.setItem` throws, the app runs normally — drag still works for the session, just won't persist. No console error spam.
14. **Schema version mismatch**: The saved layout has a `version` field. If a future code revision bumps the schema and the saved value is older, fall back to default (don't attempt to migrate in v1) and log a one-time INFO message.
15. **Code adds a new card**: If a `MetricCard` is rendered with an `id` that doesn't appear in the saved layout, the card is auto-appended at the bottom of the grid using sensible defaults. The user keeps their custom layout for everything else.
16. **Code removes a card**: If the saved layout references a card `id` that no longer exists in the code, the entry is silently ignored. No empty placeholder, no error.
17. **Edit prevented for anchored elements**: The speed gauge and the Simulate Shot button are not part of the grid even in edit mode. They cannot be moved or resized; no drag handles appear on them. (This is also true at the test level — we assert the gauge wrapper is never inside the GridLayout component.)
18. **Reduced-motion preference**: When `prefers-reduced-motion: reduce` is set, the drag animation collapses to a hard snap on release (no easing). Edit-mode UI is otherwise unchanged.
19. **Reset is destructive — confirm**: Clicking "Reset Layout" pops a confirmation. User can cancel.
20. **Concurrent edits across tabs**: If two browser tabs are open and one saves a layout, the other tab's view does NOT auto-update mid-session (we'd need a `storage` event listener for that). Documented as a known limitation; last-write-wins.
21. **Out-of-bounds drag**: A user can't drop a card off-grid; `react-grid-layout` constrains to the column count. Verified by test.
22. **Resize below content**: Cards have a minimum width / height (`minW`, `minH`) so they don't crush below readability. Defaults: minW 1, minH 1 for stat cards; minW 1, minH 2 for primary metric cards (because the value font size needs vertical room).

### Non-functional

23. **Bundle size**: After install, `vite build` reports the JS bundle increase. Acceptable up to +60 KB gzipped (the audit-passed CSS + bundle is currently ~9 KB CSS / 84 KB JS gzipped; +60 KB JS for `react-grid-layout` + `react-resizable` is the published baseline).
24. **No backend tests fail**: Python suite (currently 400 tests passing, 6 skipped) stays green. UI-only change.
25. **No new pylint regressions on Python**: Score stays ≥ 9.0.
26. **Audit issues stay closed**: The 20 issues fixed in the recent UI passes (type scale, semantic HTML, prefers-reduced-motion, etc.) all remain fixed after this change.

---

## File Structure

**Created:**
- `ui/src/components/EditableDashboard.tsx` — wrapper around `<ResponsiveGridLayout>` that handles edit-mode rendering, drag/resize, and saving
- `ui/src/components/EditableDashboard.css` — edit-mode visual cues (dashed borders, grid background)
- `ui/src/hooks/useDashboardLayouts.ts` — load / save / reset / fall-back logic, schema versioning
- `ui/src/state/EditModeContext.tsx` + `EditModeProvider.tsx` + `useEditMode.ts` — global edit mode state
- `ui/src/components/EditModeToggle.tsx` — the header button
- `ui/src/components/EditModeToggle.css`

**Modified:**
- `ui/src/App.tsx` — wraps the app in `EditModeProvider`; adds `EditModeToggle` to the header controls
- `ui/src/components/ShotDisplay.tsx` — wraps the metric cards in `EditableDashboard`
- `ui/src/components/ShotDisplay.css` — small adjustments where the grid takes over from the existing CSS grid
- `ui/src/components/StatsView.tsx` — same wrap pattern for stat cards
- `ui/src/components/StatsView.css` — same adjustment notes
- `ui/index.html` — adds `react-grid-layout` and `react-resizable` CSS via Vite's CSS import (probably better in `index.css` actually — finalize during impl)
- `ui/package.json` — `react-grid-layout` dep

**Tests created:**
- `ui/src/hooks/__tests__/useDashboardLayouts.test.ts` (or via vitest)
- `ui/src/components/__tests__/EditableDashboard.test.tsx`

If the project doesn't have a JS test runner yet (verify during Task 1), we install `vitest` + `@testing-library/react` as dev deps. If that's a heavier lift than expected, fall back to manual verification + Playwright smoke test.

---

## Task 1: Add `react-grid-layout` and confirm test runner

- [ ] **Step 1**: From `ui/`, run `npm install react-grid-layout @types/react-grid-layout`
- [ ] **Step 2**: Confirm whether Vitest / Jest is set up: `cat ui/package.json | grep -E "vitest|jest|test"`. If neither, install vitest + jsdom + @testing-library/react as dev deps.
- [ ] **Step 3**: Verify imports work: `import GridLayout, { Responsive, WidthProvider } from 'react-grid-layout'` — quick smoke in a temp file.
- [ ] **Step 4**: Commit dependency change.

```bash
git add ui/package.json ui/package-lock.json
git commit -m "deps(ui): add react-grid-layout for editable dashboard"
```

---

## Task 2: `useDashboardLayouts` hook

The hook owns the lifecycle: load saved layouts → expose them as state → save on change → handle missing/corrupt data → reset.

- [ ] **Step 1: Write the test**

```typescript
// ui/src/hooks/__tests__/useDashboardLayouts.test.ts
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDashboardLayouts, DashboardKey, SCHEMA_VERSION } from '../useDashboardLayouts';

describe('useDashboardLayouts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the default layout on first load', () => {
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    expect(result.current.layouts).toEqual(expect.objectContaining({ kiosk: expect.any(Array) }));
  });

  it('persists layout changes to localStorage', () => {
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    act(() => {
      result.current.setLayouts({
        kiosk: [{ i: 'carry', x: 0, y: 0, w: 4, h: 2 }],
        tablet: [],
        phone: [],
      });
    });
    const stored = JSON.parse(localStorage.getItem('openflight.dashboard.v1') || '{}');
    expect(stored.version).toBe(SCHEMA_VERSION);
    expect(stored.live.kiosk).toEqual([{ i: 'carry', x: 0, y: 0, w: 4, h: 2 }]);
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
      JSON.stringify({ version: 0, live: { kiosk: [] } }),
    );
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    expect(result.current.usingDefault).toBe(true);
  });

  it('does not crash when localStorage.setItem throws (private mode)', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = vi.fn(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    act(() => {
      result.current.setLayouts({ kiosk: [], tablet: [], phone: [] });
    });
    expect(result.current.layouts).toBeDefined();
    Storage.prototype.setItem = original;
  });

  it('resetting clears storage for that view only', () => {
    const { result } = renderHook(() => useDashboardLayouts(DashboardKey.Live));
    act(() => {
      result.current.setLayouts({ kiosk: [{ i: 'x', x: 0, y: 0, w: 1, h: 1 }], tablet: [], phone: [] });
    });
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
        live: { kiosk: [{ i: 'known', x: 0, y: 0, w: 4, h: 2 }], tablet: [], phone: [] },
      }),
    );
    const { result } = renderHook(() =>
      useDashboardLayouts(DashboardKey.Live, ['known', 'newly_added']),
    );
    const ids = result.current.layouts.kiosk.map((item) => item.i);
    expect(ids).toContain('newly_added');
  });

  it('drops a card present in saved layout but not in current code', () => {
    localStorage.setItem(
      'openflight.dashboard.v1',
      JSON.stringify({
        version: SCHEMA_VERSION,
        live: {
          kiosk: [
            { i: 'still_here', x: 0, y: 0, w: 4, h: 2 },
            { i: 'removed_from_code', x: 4, y: 0, w: 2, h: 2 },
          ],
          tablet: [],
          phone: [],
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
});
```

- [ ] **Step 2: Run test to verify it fails**

`cd ui && npx vitest run src/hooks/__tests__/useDashboardLayouts.test.ts`
Expected: file not found.

- [ ] **Step 3: Implement the hook**

```typescript
// ui/src/hooks/useDashboardLayouts.ts
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Layout, Layouts } from 'react-grid-layout';

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = 'openflight.dashboard.v1';

export enum DashboardKey {
  Live = 'live',
  Stats = 'stats',
}

export interface DashboardLayouts {
  kiosk: Layout[];
  tablet: Layout[];
  phone: Layout[];
}

interface StoredShape {
  version: number;
  live?: DashboardLayouts;
  stats?: DashboardLayouts;
}

// --- Defaults ---
// Each view has a default layout that matches the current visual design.
// Cards are identified by stable ids the components will pass through.

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
  tablet: [/* ...same logic, fewer columns... */],
  phone: [/* single-column stack */],
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
  tablet: [/* ... */],
  phone: [/* ... */],
};

const DEFAULTS: Record<DashboardKey, DashboardLayouts> = {
  [DashboardKey.Live]: DEFAULT_LIVE,
  [DashboardKey.Stats]: DEFAULT_STATS,
};

function readStored(): StoredShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (parsed.version !== SCHEMA_VERSION) {
      // eslint-disable-next-line no-console
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
    // Private browsing or quota-exceeded — silent: layout still works for the session.
  }
}

function reconcile(
  layouts: DashboardLayouts,
  knownIds: readonly string[] | undefined,
): DashboardLayouts {
  if (!knownIds) return layouts;
  const known = new Set(knownIds);
  const filterAndAppend = (items: Layout[]) => {
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
  };
  return {
    kiosk: filterAndAppend(layouts.kiosk),
    tablet: filterAndAppend(layouts.tablet),
    phone: filterAndAppend(layouts.phone),
  };
}

export function useDashboardLayouts(view: DashboardKey, knownIds?: readonly string[]) {
  const [usingDefault, setUsingDefault] = useState(false);
  const initial = useMemo(() => {
    const stored = readStored();
    const fromStorage = stored?.[view];
    if (fromStorage) {
      setUsingDefault(false);
      return reconcile(fromStorage, knownIds);
    }
    setUsingDefault(true);
    return reconcile(DEFAULTS[view], knownIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [layouts, setLayoutsState] = useState<DashboardLayouts>(initial);

  // Debounce persistence by 250ms — drag emits many events.
  useEffect(() => {
    const t = setTimeout(() => writeStored(view, layouts), 250);
    return () => clearTimeout(t);
  }, [layouts, view]);

  const setLayouts = useCallback((next: DashboardLayouts) => {
    setLayoutsState(next);
    setUsingDefault(false);
  }, []);

  const reset = useCallback(() => {
    setLayoutsState(reconcile(DEFAULTS[view], knownIds));
    setUsingDefault(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  // Hydrate from external knownIds changes — if the set of cards changes,
  // re-reconcile.
  useEffect(() => {
    setLayoutsState((current) => reconcile(current, knownIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knownIds?.join('|')]);

  return { layouts, setLayouts, reset, usingDefault };
}

export type { Layouts as RGLayouts };
```

- [ ] **Step 4: Run test to verify it passes**

`cd ui && npx vitest run src/hooks/__tests__/useDashboardLayouts.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git add ui/src/hooks/useDashboardLayouts.ts ui/src/hooks/__tests__/useDashboardLayouts.test.ts
git commit -m "feat(ui): useDashboardLayouts hook with persistence + reconciliation"
```

---

## Task 3: Edit-mode global state

- [ ] **Step 1**: Create `ui/src/state/EditModeContext.tsx`, `EditModeProvider.tsx`, `useEditMode.ts` — small context exposing `{ editMode: boolean, toggle: () => void }`. (Mirror the existing UnitPreferenceProvider pattern.)
- [ ] **Step 2**: Wrap `<AppContent />` in `<EditModeProvider>` inside `App.tsx`.
- [ ] **Step 3**: Commit.

---

## Task 4: `EditModeToggle` component in the header

- [ ] **Step 1**: Pencil icon button. `aria-pressed={editMode}`. Visible label "Edit dashboard" when active.
- [ ] **Step 2**: Place in `header__controls` strip in `App.tsx`.
- [ ] **Step 3**: Test: clicking toggles `editMode` context. Use existing visually-hidden label class for accessibility.
- [ ] **Step 4**: Commit.

---

## Task 5: `EditableDashboard` wrapper

The wrapper accepts an `id`, the layouts, a setter, and children. It:
- Renders `<ResponsiveGridLayout>` only in edit mode
- Renders children in a plain CSS grid otherwise (preserves the audit-tuned styling)
- Wires the resize/drag callbacks to call `setLayouts`
- Handles `prefers-reduced-motion` by disabling drag transitions

This is the trickiest task — careful about CSS regressions.

- [ ] Implementation, tests, commit.

---

## Task 6: Integrate into `ShotDisplay`

- [ ] Wrap the existing `.shot-display__metrics` content in `<EditableDashboard view={DashboardKey.Live} cardIds={...}>`.
- [ ] Each `<MetricCard>` rendered conditionally based on data presence gets a stable `data-grid-id`.
- [ ] Verify (manual): edit mode shows handles; live mode looks identical to today.
- [ ] Run full test suite.
- [ ] Commit.

---

## Task 7: Integrate into `StatsView`

- [ ] Same pattern. Wrap `<dl className="stats-grid">` content.
- [ ] Note: the `dl` semantic stays — react-grid-layout's wrapper becomes the `<dl>` via `as` prop, OR we keep the dl outside and let stat-cards be the grid items inside a `dl > div` structure (need to verify which works with `react-grid-layout`'s rendering).
- [ ] Commit.

---

## Task 8: Reset button + confirmation

- [ ] In edit mode, render a "Reset Layout" button at the bottom of each view.
- [ ] Use `window.confirm()` for v1 (replace with a styled confirm dialog if/when we get one).
- [ ] On confirm: call `reset()` from the hook.
- [ ] Test: covered by hook tests + manual verification.
- [ ] Commit.

---

## Task 9: Edit-mode CSS

- [ ] Dashed outline on each grid widget in edit mode.
- [ ] Faint dotted background on the grid container in edit mode.
- [ ] Cursor: `grab` / `grabbing` during drag.
- [ ] `prefers-reduced-motion` override: disable drag-anim transitions.
- [ ] Commit.

---

## Task 10: Bundle-size + final verification

- [ ] Run `cd ui && npm run build`. Note JS bundle delta.
- [ ] Run `cd .. && uv run pytest tests/ -q`. Confirm 400 passing, 6 skipped.
- [ ] Manual smoke: kiosk size (800×480), phone (390×844), tablet (768×1024). Edit + drag + reset works on each.
- [ ] Update `docs/replay-framework.md` and `docs/opengolfsim-integration.md` references — no, actually, write a NEW `docs/editable-dashboard.md` covering the user-facing feature.
- [ ] Add a README link.
- [ ] Final commit.

---

## Self-Review

**Spec coverage:**
- AC1 edit toggle in header — Task 4 ✓
- AC2-3 widgets on Live/Stats — Tasks 5-7 ✓
- AC4 visual cues — Task 9 ✓
- AC5 live-mode visual parity — Task 5 (conditional render path) ✓
- AC6 persistence — Task 2 ✓
- AC7 default layout — Task 2 ✓
- AC8 reset — Task 8 ✓
- AC9 responsive layouts — Task 2 (defaults) + Task 5 (ResponsiveGridLayout) ✓
- AC10 touch + mouse — `react-grid-layout` handles ✓
- AC11 keyboard — toggle and reset are real `<button>`s; drag-keyboard deferred and noted
- AC12-22 negative paths — covered by hook tests + design choices ✓
- AC23 bundle size — Task 10 ✓
- AC24-25 no Python regressions — Task 10 ✓
- AC26 audit issues stay closed — verified by manual test in Task 10

**Open questions:**

1. **Edit toggle placement.** Header controls strip is already crowded on phone (we collapsed connection-status to a dot). Adding another button makes that worse. Alternatives: (a) put the toggle inside a settings menu, (b) put it in the nav bar as a 6th item, (c) keep it in the header but only show on tablet+. Recommend **(c)**: hide the edit toggle on phone (< 600px) — editing is awkward on a 4" screen anyway, kiosk and tablet are the realistic edit contexts.
2. **Stats grid DL semantics.** `react-grid-layout` renders its own div container, which means our `<dl>` semantic ends up nested inside a div, and dt/dd pairs land inside grid items. This may break the screen-reader "definition list" association. Two options: (a) drop the `dl` semantic during edit mode and keep it during live mode, (b) keep the `dl` always but verify with NVDA/VO that the announcement is still useful. Need to verify during Task 7.
3. **~~Card IDs on the Live screen change with data~~ — Resolved.** Per user direction, all metric cards on the Live screen now always render with `—` as the fallback when their data isn't present (Club AoA, Club Path, Spin Axis, H. Launch, all Sim cards). Card ids are therefore stable across shots and across sim-connection state. Implemented as a preliminary commit before Task 1.

**Recommended decisions before implementation:**

- Open question 1: I'll go with **(c)** — toggle hidden on phones — unless you object.
- Open question 2: prototype during Task 7 and verify; if it breaks SR semantics, fall back to (a).
- Open question 3: resolved per user direction — all cards always render.
