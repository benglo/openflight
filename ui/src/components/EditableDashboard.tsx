import { useCallback, useMemo, type ReactElement } from 'react';
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
   * The cards themselves. Each child must have a `key` prop matching
   * one of `cardIds`. Children whose key isn't in cardIds are dropped.
   */
  children: ReactElement[] | ReactElement;
  /** Optional class on the outer container for view-mode styling parity. */
  className?: string;
}

/**
 * Wraps a section of cards so that, in edit mode, they become draggable
 * + resizable widgets via react-grid-layout. In view mode the wrapper
 * renders a plain container with the supplied `className`, so today's
 * CSS-grid styling continues to drive the layout exactly as before —
 * users see no difference until they hit the edit toggle.
 *
 * Layout persistence + reconciliation lives in `useDashboardLayouts`;
 * this component is purely the rendering boundary.
 */
export function EditableDashboard({
  view,
  cardIds,
  children,
  className,
}: EditableDashboardProps) {
  const { editMode } = useEditMode();
  const { layouts, setLayouts, reset } = useDashboardLayouts(view, cardIds);

  const handleReset = useCallback(() => {
    if (typeof window !== 'undefined' && window.confirm) {
      const confirmed = window.confirm('Reset this dashboard layout to defaults?');
      if (!confirmed) return;
    }
    reset();
  }, [reset]);

  // Filter children to only those whose key is in cardIds. Defensive —
  // protects against a child being rendered without a corresponding
  // entry in the layout (which would otherwise be unmounted by RGL on
  // first interaction).
  const childArray = Array.isArray(children) ? children : [children];
  const knownIds = useMemo(() => new Set(cardIds), [cardIds]);
  const renderableChildren = childArray.filter((child) => {
    const key = child.key;
    return key !== null && key !== undefined && knownIds.has(String(key));
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

  if (!editMode) {
    // View mode: keep today's exact layout. RGL is bypassed entirely so
    // the audited CSS grid styling continues to drive placement.
    return <div className={className}>{renderableChildren}</div>;
  }

  /*
   * Edit mode: deliberately do NOT pass the caller's className through.
   * The shot-display / stats-view CSS classes carry their own
   * `display: grid; grid-template-columns: ...` rules — those compete
   * with react-grid-layout's absolute-positioned children and result in
   * cards stacking in a single column instead of using the full grid.
   * The `.editable-dashboard--editing` class supplies the sizing
   * (width: 100%, flex: 1) we actually need.
   */
  return (
    <div className="editable-dashboard editable-dashboard--editing">
      <ResponsiveGridLayout
        className="editable-dashboard__grid"
        layouts={layouts as unknown as Layouts}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        rowHeight={40}
        margin={[8, 8]}
        containerPadding={[0, 0]}
        isDraggable
        isResizable
        compactType="vertical"
        preventCollision={false}
        onLayoutChange={onLayoutChange}
        draggableCancel="input,textarea,button,a"
      >
        {renderableChildren.map((child) => (
          <div key={child.key} className="editable-dashboard__widget">
            {child}
          </div>
        ))}
      </ResponsiveGridLayout>
      <button
        type="button"
        className="editable-dashboard__reset"
        onClick={handleReset}
        aria-label="Reset dashboard layout to defaults"
      >
        Reset Layout
      </button>
    </div>
  );
}
