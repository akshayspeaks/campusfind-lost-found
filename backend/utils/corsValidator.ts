/**
 * CORS Origin Validator for CampusFind
 *
 * Implements strict, production-grade origin checking:
 * 1. In production (NODE_ENV === 'production'):
 *    - Permits ONLY exact origins explicitly configured via CORS_ORIGIN (comma-separated).
 *    - Rejects wildcards, arbitrary *.onrender.com, *.run.app, and *.google.com domains.
 * 2. In non-production (development / test / preview):
 *    - Permits localhost, 127.0.0.1, and 0.0.0.0 for local development.
 *    - Permits AI Studio / Cloud Run preview domains (*.run.app, *.google.com).
 *    - Permits any explicitly configured CORS_ORIGIN entries.
 *    - Rejects arbitrary unauthorized third-party origins.
 * 3. Graceful handling:
 *    - Returns boolean (true/false) to prevent uncaught exceptions.
 *    - When true, callers reflect the exact requesting origin, never wildcard "*".
 *    - When false, headers (including Access-Control-Allow-Credentials) are omitted.
 */

export function isOriginAllowed(
  origin: string | undefined | null,
  nodeEnv: string = process.env.NODE_ENV || 'development',
  configuredOrigins: string = process.env.CORS_ORIGIN || ''
): boolean {
  // Requests without an Origin header (same-origin, curl, server-to-server, native mobile)
  if (!origin) {
    return true;
  }

  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (!cleanOrigin) {
    return false;
  }

  // Parse comma-separated list of configured exact origins
  const allowedList = configuredOrigins
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);

  // Exact match against explicitly configured origins (case-insensitive for scheme & host)
  if (allowedList.some((allowed) => allowed.toLowerCase() === cleanOrigin.toLowerCase())) {
    return true;
  }

  // In production, ONLY explicitly configured exact origins are allowed
  if (nodeEnv === 'production') {
    return false;
  }

  // Non-production / development environment rules:
  try {
    const parsed = new URL(cleanOrigin);
    const host = parsed.hostname.toLowerCase();

    // Localhost / loopback development
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0') {
      return true;
    }

    // AI Studio / Cloud Run preview environments in non-production
    if (host.endsWith('.run.app') || host.endsWith('.google.com')) {
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
