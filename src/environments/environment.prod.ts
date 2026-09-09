/**
 * Production — the frontend is deployed on a different domain than the API
 * (see ComplaintSystem.Api/DEPLOYMENT.md), so /api/* calls need an absolute
 * origin instead of a relative path. Cross-origin auth cookies and CORS are
 * already handled on the backend (SameSite=None; Secure in Production, plus
 * Cors:AllowedOrigins) — this is the only change needed on the frontend side.
 */
export const environment = {
  production: true,
  apiBaseUrl: 'https://easmob.easwdb.com',
};
