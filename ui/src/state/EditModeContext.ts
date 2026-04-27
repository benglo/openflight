import { createContext } from 'react';

export interface EditModeContextValue {
  editMode: boolean;
  toggle: () => void;
  setEditMode: (next: boolean) => void;
}

export const EditModeContext = createContext<EditModeContextValue | undefined>(undefined);
