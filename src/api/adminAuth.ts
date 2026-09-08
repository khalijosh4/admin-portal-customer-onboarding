// Re-exports the onboarding session helpers used for route guarding.
import { getOnboardingToken, getOnboardingUser, clearOnboardingSession } from './onboarding';

export function isAuthed(): boolean {
  return !!getOnboardingToken();
}

export function getStoredUser() {
  return getOnboardingUser();
}

export function clearSession() {
  clearOnboardingSession();
}