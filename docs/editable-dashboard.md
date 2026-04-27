# Editable Dashboard

The Live and Stats screens are rearrangeable. Click the pencil icon
(top-right of the header) to enter edit mode; drag any metric card to
move it, drag the corner handle to resize it. Click the pencil again to
finish — your layout is saved automatically.

## What's editable

| Screen | Editable | Anchored |
|---|---|---|
| Live | All metric cards (Est. Carry, Club Speed, V. Launch, Club AoA, Club Path, Spin Axis, H. Launch, Spin Rate, Sim Carry, Sim Total, Sim Lateral, Sim Apex) | Speed gauge, Simulate Shot button |
| Stats | All cards (Avg Carry, Shots, Avg Ball, Max Ball, Avg Club, Avg Smash) | Club filter tabs, Clear Session button |

## Persistence

Layouts are stored in browser `localStorage` under `openflight.dashboard.v1`.
That means:
- One layout per device (the kiosk's saved arrangement is independent
  of your phone's).
- No cloud sync. Reinstalling the OS or clearing browser data resets
  to the default layout.
- Three breakpoints saved separately: kiosk (≥720px wide), tablet
  (600-719px), phone (<600px). Customising on one doesn't overwrite
  the others.

## Reset

In edit mode, scroll to the bottom of the editable region; there's a
"Reset Layout" button. It confirms before clearing — once you confirm,
that view's layout reverts to the default.

## What you'll see across breakpoints

- **Kiosk (≥720px)**: 12-column grid; dragging across rows works
  freely. The default arrangement matches the audited layout — Carry
  card spans full width as a hero, supporting cards in pairs below.
- **Tablet (600-719px)**: 8-column grid. Same overall pattern, slightly
  denser columns.
- **Phone (<600px)**: single 4-column grid; cards stack vertically by
  default. Editing is hidden on phone — the toggle button is
  display: none below 600px because rearranging widgets on a 4" screen
  is awkward.

## Behavior with missing data

Every metric card always renders, even when its value isn't available
yet (e.g. Club AoA needs a K-LD7 angle radar; Sim Carry needs
OpenGolfSim connected). Missing values show as `—`. This means the
dashboard layout is stable across shots — your customisations stay
exactly where you put them, regardless of which sensors are active or
what the radar picked up on a given swing.

## Robustness

Edge cases are handled silently:

- **Corrupt saved layout**: falls back to the default; logs an INFO
  message in the browser console.
- **Schema version mismatch** (older saved layout from a previous
  release): falls back to the default; same INFO log.
- **localStorage disabled** (private browsing, sandboxed contexts):
  the app runs normally, layouts work for the session, just don't
  persist.
- **New metric card added in code**: appears at the bottom of your
  saved layout on next load; the rest of your customisation is kept.
- **Old metric card removed in code**: silently dropped from the saved
  layout; no error or empty placeholder.
- **`prefers-reduced-motion`**: drag/resize transitions collapse to
  instant snaps; the rest of edit mode is unchanged.

## Reference

- `ui/src/hooks/useDashboardLayouts.ts` — load/save/reset/reconcile
  hook (8 unit tests under `__tests__/`).
- `ui/src/components/EditableDashboard.tsx` — wraps a section of cards;
  renders react-grid-layout in edit mode, plain CSS grid in view mode.
- `ui/src/components/EditModeToggle.tsx` — header button that toggles
  edit mode globally.
- `docs/superpowers/plans/2026-04-27-editable-dashboard.md` — original
  plan with acceptance criteria.
