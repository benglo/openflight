import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { EditModeContext } from './EditModeContext';

/**
 * Global edit-mode state for the editable dashboard. Toggling this puts
 * every editable surface (Live metrics grid, Stats grid) into a state
 * where users can drag and resize widgets. Off by default so the UI
 * looks identical to today.
 *
 * Edit mode is intentionally not persisted — exiting and re-entering the
 * app should always start in view mode. The user's actual layout is
 * persisted by useDashboardLayouts; the *toggle* is session-scoped.
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [editMode, setEditMode] = useState(false);
  const toggle = useCallback(() => setEditMode((prev) => !prev), []);

  const value = useMemo(
    () => ({ editMode, toggle, setEditMode }),
    [editMode, toggle],
  );

  return <EditModeContext.Provider value={value}>{children}</EditModeContext.Provider>;
}
