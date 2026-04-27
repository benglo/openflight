import { useEditMode } from '../state/useEditMode';
import './EditModeToggle.css';

/**
 * Header button that toggles dashboard edit mode. Hidden on viewports
 * narrower than 600px (CSS-driven) since rearranging widgets on a phone
 * is awkward — the editable dashboard is for kiosk and tablet contexts.
 */
export function EditModeToggle() {
  const { editMode, toggle } = useEditMode();
  return (
    <button
      type="button"
      className={`edit-mode-toggle ${editMode ? 'edit-mode-toggle--active' : ''}`}
      onClick={toggle}
      aria-pressed={editMode}
      aria-label={editMode ? 'Done editing dashboard' : 'Edit dashboard layout'}
      title={editMode ? 'Done editing' : 'Edit dashboard'}
    >
      {/* Pencil icon */}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
      <span className="edit-mode-toggle__label">{editMode ? 'Done' : 'Edit'}</span>
    </button>
  );
}
