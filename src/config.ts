/**
 * CampusFind Centralized Frontend Configuration
 *
 * Centralizes the API base URL configuration for production and development.
 * In production, the backend is deployed separately (e.g. https://campusfind-api-qp80.onrender.com).
 * This file guarantees that API requests are never mistakenly dispatched to the static frontend domain.
 */

// Production API URL provided via Vite environment variable
const rawEnvApiUrl: string | undefined = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;

function resolveApiBaseUrl(): string {
  if (rawEnvApiUrl && rawEnvApiUrl.trim()) {
    return rawEnvApiUrl.trim().replace(/\/+$/, '');
  }

  // Safe fallback determination based on browser runtime location
  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    // Local development or AI Studio dev container
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.includes('run.app')) {
      return origin || 'http://localhost:3000';
    }
    // If deployed on static hosting without explicit VITE_API_URL:
    // Fall back to the known Render API service rather than querying the static site itself
    return 'https://campusfind-api-qp80.onrender.com';
  }

  return 'http://localhost:3000';
}

export const API_BASE_URL: string = resolveApiBaseUrl();

/**
 * Builds an absolute API URL for any given relative route.
 * Example: getApiUrl('/api/items') -> 'https://campusfind-api-qp80.onrender.com/api/items'
 */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Resolves an uploaded image URL against the API_BASE_URL.
 * Keeps data:, blob:, and full external URLs intact.
 */
export function getImageUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:')
  ) {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
