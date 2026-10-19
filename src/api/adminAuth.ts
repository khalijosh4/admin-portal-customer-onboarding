// Re-exports the onboarding session helpers used for route guarding.
import {
  getOnboardingToken,
  getOnboardingUser,
  clearOnboardingSession,
  isOnboardingTokenExpired,
} from './onboarding';

export function isAuthed(): boolean {
  if (!getOnboardingToken()) return false;
  if (isOnboardingTokenExpired()) {
    clearOnboardingSession();
    return false;
  }
  return true;
}

export function getStoredUser() {
  return getOnboardingUser();
}

export function clearSession() {
  clearOnboardingSession();
}