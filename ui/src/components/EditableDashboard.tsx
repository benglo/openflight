import { useCallback, useMemo, useState, type ReactElement } from 'react';
// react-grid-layout v1 attaches Responsive + WidthProvider as members
// of the default export. esModuleInterop bridges the CJS module so
// named imports work at the source level.
import RGL, { Responsive, WidthProvider } from 'react-grid-layout';

// `Layout` from @types is the single grid-item shape; `Layouts` is the
// breakpoint map.
type Layout = RGL.Layout;
type Layouts = RGL.Layouts;

import { useEditMode } from '../state/useEditMode';
import {
  type DashboardKey,
  type DashboardLayouts,
  useDashboardLayouts,
} from '../hooks/useDashboardLayouts';

import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import './EditableDashboard.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// Breakpoints map to the three sizes we have layouts for. The boundaries
// match the responsive CSS media queries used elsewhere (600px, 720px,
// 800px) so the hook's three saved layouts line up with the visual
// contexts the user might customise on.
const BREAKPOINTS = { kiosk: 720, tablet: 600, phone: 0 } as const;
const COLS = { kiosk: 12, tablet: 8, phone: 4 } as const;

// Single bottom-right corner handle — the conventional resize affordance.
const RESIZE_HANDLES: ('se')[] = ['se'];

interface EditableDashboardProps {
  view: DashboardKey;
  /**
   * Stable ids of every card the parent is currently rendering. Order
   * doesn't matter — the layout drives placement. The component uses
   * this list to (a) reconcile the saved layout against current code
   * and (b) gate which child elements actually get rendered.
   */
  cardIds: readonly string[];
  /**
   * Friendly label per card id. Used by the "Add Cards" drawer when
   * listing hidden cards. Falls back to the raw id if missing.
   */
  cardLabels?: Record<string, string>;
  /**
   * The cards themselves. Each child must have a `key` prop matching
   * one of `cardIds`. Children whose key isn't in cardIds are dropped.
   */
  children: ReactElement[] | ReactElement;
}

/**
 * Wraps a section of cards in a react-grid-layout grid. The layout is
 * the same in view and edit mode — only edit mode adds drag/resize,
 * the dashed outlines, the per-card hide button, the reset button, and
 * the "Add Cards" drawer. View mode renders the exact same RGL positions
 * read-only, so changes the user makes in edit mode are visible the
 * moment they exit.
 *
 * Layout persistence + reconciliation lives in `useDashboardLayouts`;
 * this component is purely the rendering boundary.
 */
export function EditableDashboard({
  view,
  cardIds,
  cardLabels,
  children,
}: EditableDashboardProps) {
  const { editMode } = useEditMode();
  const { layouts, setLayouts, reset, hidden, hide, show } =
    useDashboardLayouts(view, cardIds);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Drawer visibility derives from edit mode so leaving edit mode hides
  // the drawer without us having to write an effect that resets state
  // (the lint rule rightly flags such effects). The internal `drawerOpen`
  // state is preserved across edit-mode toggles, which is fine — the
  // drawer is a transient affordance, not load-bearing UI.
  const drawerVisible = editMode && drawerOpen;

  const handleReset = useCallback(() => {
    if (typeof window !== 'undefined' && window.confirm) {
      const confirmed = window.confirm('Reset this dashboard layout to defaults?');
      if (!confirmed) return;
    }
    reset();
  }, [reset]);

  // Hidden ids are dropped before children render; the parent always
  // emits the full set, but RGL never sees the hidden ones.
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const visibleIdSet = useMemo(
    () => new Set(cardIds.filter((id) => !hiddenSet.has(id))),
    [cardIds, hiddenSet],
  );

  const childArray = Array.isArray(children) ? children : [children];
  const renderableChildren = childArray.filter((child) => {
    const key = child.key;
    return key !== null && key !== undefined && visibleIdSet.has(String(key));
  });

  const onLayoutChange = useCallback(
    (_current: Layout[], all: Layouts) => {
      // RGL's onLayoutChange fires on every frame of a drag; the hook
      // debounces persistence internally so this is safe to call
      // unconditionally.
      const next: DashboardLayouts = {
        kiosk: all.kiosk ?? layouts.kiosk,
        tablet: all.tablet ?? layouts.tablet,
        phone: all.phone ?? layouts.phone,
      };
      setLayouts(next);
    },
    [layouts, setLayouts],
  );

  return (
    <div
      className={`editable-dashboard${editMode ? ' editable-dashboard--editing' : ''}`}
    >
      <ResponsiveGridLayout
        className="editable-dashboard__grid"
        layouts={layouts as unknown as Layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={40}
        margin={[8, 8]}
        containerPadding={[0, 0]}
        isDraggable={editMode}
        isResizable={editMode}
        resizeHandles={RESIZE_HANDLES}
        compactType="vertical"
        preventCollision={false}
        onLayoutChange={onLayoutChange}
        draggableCancel="input,textarea,button,a"
      >
        {renderableChildren.map((child) => {
          const id = String(child.key);
          return (
            <div key={id} className="editable-dashboard__widget">
              {/*
               * Inner wrapper exists so the metric / stat card can fill
               * the RGL grid cell without us also stretching the resize
               * handle (RGL renders the handle as a sibling of this div).
               */}
              <div className="editable-dashboard__widget-content">{child}</div>
              {editMode && (
                <button
                  type="button"
                  className="editable-dashboard__hide-btn"
                  aria-label={`Hide ${cardLabels?.[id] ?? id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    hide(id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </ResponsiveGridLayout>
      {editMode && (
        <div className="editable-dashboard__toolbar">
          <button
            type="button"
            className="editable-dashboard__reset"
            onClick={handleReset}
            aria-label="Reset dashboard layout to defaults"
          >
            Reset Layout
          </button>
          <button
            type="button"
            className="editable-dashboard__add-btn"
            onClick={() => setDrawerOpen(true)}
            disabled={hidden.length === 0}
            aria-label="Add hidden cards back to the dashboard"
          >
            Add Cards ({hidden.length})
          </button>
        </div>
      )}
      {drawerVisible && (
        <>
          <div
            className="editable-dashboard__drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="editable-dashboard__drawer"
            role="dialog"
            aria-label="Hidden cards"
          >
            <header className="editable-dashboard__drawer-header">
              <h3>Hidden cards</h3>
              <button
                type="button"
                className="editable-dashboard__drawer-close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close hidden cards drawer"
              >
                ×
              </button>
            </header>
            {hidden.length === 0 ? (
              <p className="editable-dashboard__drawer-empty">
                Every card is currently visible.
              </p>
            ) : (
              <ul className="editable-dashboard__drawer-list">
                {hidden.map((id) => (
                  <li key={id} className="editable-dashboard__drawer-item">
                    <span className="editable-dashboard__drawer-label">
                      {cardLabels?.[id] ?? id}
                    </span>
                    <button
                      type="button"
                      className="editable-dashboard__drawer-add"
                      onClick={() => show(id)}
                      aria-label={`Add ${cardLabels?.[id] ?? id} back to the dashboard`}
                    >
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
