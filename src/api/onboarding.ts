import axios from 'axios';
import { ONBOARDING_BASE } from '../config';
import type { CbsApplication } from '../types';

// ------------------------------------------------------------------
// Onboarding backend API client (admin auth, user mgmt, profile,
// notifications, reject, membership form).
//
// Uses the onboarding backend's JWT auth — separate from the CBS API.
// Token is stored under 'onboarding_admin_token' in localStorage.
// ------------------------------------------------------------------

const TOKEN_KEY = 'onboarding_admin_token';
const USER_KEY = 'onboarding_admin_user';

export function getOnboardingToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getOnboardingUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function persistOnboardingSession(accessToken: string, admin: any) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(admin));
}

export function clearOnboardingSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/** Shared axios instance for the onboarding backend. */
const client = axios.create({
  baseURL: ONBOARDING_BASE,
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

client.interceptors.request.use((config) => {
  const token = getOnboardingToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error?.config?.url as string | undefined;
    if (error?.response?.status === 401 && url && url.startsWith('/admin') && !url.includes('/admin/login')) {
      clearOnboardingSession();
      if (!window.location.pathname.endsWith('/login')) window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

function jwtExpSeconds(token: string): number | null {
  try {
    const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload));
    return typeof decoded?.exp === 'number' ? decoded.exp : null;
  } catch {
    return null;
  }
}

export function isOnboardingTokenExpired(): boolean {
  const token = getOnboardingToken();
  if (!token) return true;
  const exp = jwtExpSeconds(token);
  return exp != null && exp * 1000 <= Date.now();
}

// ------------------------------------------------------------------
// Auth
// ------------------------------------------------------------------

export async function login(email: string, password: string) {
  const { data } = await client.post('/admin/login', { email, password });
  return data as { accessToken: string; admin: any };
}

// ------------------------------------------------------------------
// Profile
// ------------------------------------------------------------------

export async function getProfile() {
  const { data } = await client.get('/admin/profile');
  return data;
}

export async function updateProfile(fields: { email?: string; phone?: string; fullName?: string }) {
  const { data } = await client.patch('/admin/profile', fields);
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await client.post('/admin/profile/change-password', { currentPassword, newPassword });
  return data as { accessToken: string; admin: any };
}

export async function completePasswordChange(newPassword: string) {
  const { data } = await client.post('/admin/profile/complete-password-change', { newPassword });
  return data as { accessToken: string; admin: any };
}

// ------------------------------------------------------------------
// User management (super_admin only)
// ------------------------------------------------------------------

export async function listUsers() {
  const { data } = await client.get('/admin/users');
  return data as any[];
}

export async function createUser(payload: { email: string; phone?: string; fullName: string; password: string; role?: string }) {
  const { data } = await client.post('/admin/users', payload);
  return data;
}

export async function resetPassword(userId: string, newPassword: string) {
  const { data } = await client.post(`/admin/users/${userId}/reset-password`, { newPassword });
  return data;
}

export async function setUserActive(userId: string, active: boolean) {
  const { data } = await client.post(`/admin/users/${userId}/set-active`, { active: String(active) });
  return data;
}

// ------------------------------------------------------------------
// Applications (from onboarding backend — may differ from CBS)
// ------------------------------------------------------------------

export async function resolveOnboardingApplicationId(app: CbsApplication): Promise<string | null> {
  const cbsApplicationId = app?.applicationId;
  if (!cbsApplicationId) return null;
  try {
    const { data } = await client.get(
      `/admin/applications/by-cbs/${encodeURIComponent(cbsApplicationId)}`,
    );
    return (data as any)?.id ?? null;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export async function rejectApplication(id: string, reason: string) {
  const { data } = await client.post(`/admin/applications/${id}/reject`, { reason });
  return data;
}

// ------------------------------------------------------------------
// Membership form
// ------------------------------------------------------------------
export async function downloadMembershipForm(id: string): Promise<Blob> {
  const { data } = await client.get(`/admin/applications/${id}/membership-form`, {
    responseType: 'blob',
  });
  return data;
}


// ------------------------------------------------------------------
// Notifications
// ------------------------------------------------------------------

export async function listNotifications(limit?: number) {
  const url = limit ? `/admin/notifications?limit=${limit}` : '/admin/notifications';
  const { data } = await client.get(url);
  return data as any[];
}

export async function unreadNotificationCount() {
  const { data } = await client.get('/admin/notifications/unread-count');
  return typeof data === 'number' ? data : (data as any)?.count ?? 0;
}

export interface NotificationTemplate {
  id: string;
  name: string;
  description: string;
  channel: 'sms' | 'email' | 'both';
  subject?: string;
  body: string;
}

export async function listNotificationTemplates(): Promise<NotificationTemplate[]> {
  const { data } = await client.get('/admin/notifications/templates');
  return Array.isArray(data) ? data : [];
}

export async function markNotificationRead(id: string) {
  const { data } = await client.post(`/admin/notifications/${id}/read`);
  return data;
}

export async function markAllNotificationsRead() {
  const { data } = await client.post('/admin/notifications/read-all');
  return data;
}

// ------------------------------------------------------------------
// Send customer notification (SMS / email)
// POST /api/admin/notifications/send
// This is a NEW endpoint we'll need on the onboarding backend.
// For now, the client is ready — we'll add the backend endpoint.
// ------------------------------------------------------------------

export async function sendCustomerNotification(payload: {
  applicationId?: string;
  phoneNumber?: string;
  email?: string;
  channel: 'sms' | 'email' | 'both';
  subject?: string;
  body: string;
  templateId?: string;
}) {
  const { data } = await client.post('/admin/notifications/send', payload);
  return data;
}
