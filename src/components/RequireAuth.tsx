import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { isAuthed } from '../api/adminAuth';

export function RequireAuth({ children, element }: { children?: ReactNode; element?: ReactNode }) {
  if (!isAuthed()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children ?? element}</>;
}