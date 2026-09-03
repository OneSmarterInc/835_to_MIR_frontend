const SESSION_EXPIRY_KEY = "onesmarter_session_expires_at";
export const SESSION_LIFETIME_MS = 60 * 60 * 1000;

export function clearSessionExpiry() {
  localStorage.removeItem(SESSION_EXPIRY_KEY);
}

export function scheduleSessionExpiry(onExpire) {
  const stored = Number(localStorage.getItem(SESSION_EXPIRY_KEY) || 0);
  const expire = () => {
    clearSessionExpiry();
    onExpire();
  };
  if (stored > 0 && stored <= Date.now()) {
    expire();
    return undefined;
  }

  const expiresAt = stored || Date.now() + SESSION_LIFETIME_MS;
  localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt));
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) {
    expire();
    return undefined;
  }

  const timer = window.setTimeout(expire, remaining);
  return () => window.clearTimeout(timer);
}
