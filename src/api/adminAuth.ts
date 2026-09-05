// ------------------------------------------------------------------
// Lightweight admin session for the standalone review portal.
// The CBS core API has no authentication, so we provide a login gate
// here (credentials via VITE_ADMIN_USERNAME / VITE_ADMIN_PASSWORD).
// Sessions persist in localStorage and can be cleared from the header.
// ------------------------------------------------------------------

const TOKEN_KEY = 'fortune_admin_portal_session';
const USER_KEY = 'fortune_admin_portal_user';

export interface AdminUser {
  username: string;
  displayName: string;
}

const CONFIG_USERNAME = (import.meta.env.VITE_ADMIN_USERNAME as string | undefined) || 'admin';
const CONFIG_PASSWORD = (import.meta.env.VITE_ADMIN_PASSWORD as string | undefined) || 'admin123';

export function validateCredentials(username: string, password: string): AdminUser | null {
  if (username.trim().toLowerCase() === CONFIG_USERNAME.toLowerCase() && password === CONFIG_PASSWORD) {
    return { username: username.trim(), displayName: username.trim() };
  }
  return null;
}

export function isAuthed(): boolean {
  return localStorage.getItem(TOKEN_KEY) === '1';
}

export function getStoredUser(): AdminUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AdminUser) : null;
  } catch {
    return null;
  }
}

export function persistSession(user: AdminUser) {
  localStorage.setItem(TOKEN_KEY, '1');
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}