import {
  Item,
  User,
  Claim,
  EnrichedClaim,
  EnrichedMatch,
  Notification,
  AuditLog,
} from '../types.js';
import { API_BASE_URL, getApiUrl, getImageUrl } from '../config.js';

export { API_BASE_URL, getApiUrl, getImageUrl };

const TOKEN_KEY = 'campusfind_token';
const REFRESH_TOKEN_KEY = 'campusfind_refresh_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setStoredRefreshToken(token: string | null): void {
  if (token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token: string) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

async function tryRefreshToken(): Promise<string | null> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return null;

  try {
    const refreshUrl = getApiUrl('/api/auth/refresh');
    const res = await fetch(refreshUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = await res.json();
    setStoredToken(data.token);
    setStoredRefreshToken(data.refreshToken);
    return data.token;
  } catch {
    clearTokens();
    return null;
  }
}

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const fullUrl = url.startsWith('http://') || url.startsWith('https://')
    ? url
    : getApiUrl(url);

  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response = await fetch(fullUrl, {
    ...options,
    headers,
  });

  // Handle 401 with Token Refresh
  if (response.status === 401 && !fullUrl.includes('/api/auth/login') && !fullUrl.includes('/api/auth/refresh')) {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefreshToken();
      isRefreshing = false;

      if (newToken) {
        onRefreshed(newToken);
        headers['Authorization'] = `Bearer ${newToken}`;
        response = await fetch(fullUrl, {
          ...options,
          headers,
        });
      }
    } else {
      // Wait for refresh to complete
      const retryPromise = new Promise<T>((resolve, reject) => {
        subscribeTokenRefresh(async (newToken) => {
          try {
            headers['Authorization'] = `Bearer ${newToken}`;
            const retryRes = await fetch(fullUrl, { ...options, headers });
            const data = await retryRes.json().catch(() => ({}));
            if (!retryRes.ok) {
              reject(new Error(data?.error?.message || 'Request failed'));
            } else {
              resolve(data as T);
            }
          } catch (err) {
            reject(err);
          }
        });
      });
      return retryPromise;
    }
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    let errorMsg = data?.error?.message || data?.message;
    if (!errorMsg) {
      if (response.status === 401) {
        errorMsg = 'Your session has expired or authentication is required. Please sign in.';
      } else if (response.status === 403) {
        errorMsg = 'Access forbidden. You do not have permission to perform this action.';
      } else if (response.status === 404) {
        errorMsg = 'The requested campus item or endpoint was not found.';
      } else if (response.status === 429) {
        errorMsg = 'Rate limit exceeded. Please wait a moment before trying again.';
      } else if (response.status >= 500) {
        errorMsg = 'A campus server error occurred. Please try again later.';
      } else {
        errorMsg = `Request failed with status ${response.status}`;
      }
    }
    const error = new Error(errorMsg);
    (error as unknown as { status: number }).status = response.status;
    (error as unknown as { code?: string }).code = data?.error?.code || 'API_ERROR';
    throw error;
  }

  return data as T;
}

export const api = {
  // Auth
  register: (payload: { name: string; email: string; password: string; phone?: string; contact_info?: string; role?: string }) =>
    request<{ user: User; token: string; refreshToken: string }>(getApiUrl('/api/auth/register'), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  login: (payload: { email: string; password: string }) =>
    request<{ user: User; token: string; refreshToken: string }>(getApiUrl('/api/auth/login'), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logout: () => {
    const refreshToken = getStoredRefreshToken();
    return request<{ message: string }>(getApiUrl('/api/auth/logout'), {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    }).finally(() => {
      clearTokens();
    });
  },

  getMe: () => request<{ user: User }>(getApiUrl('/api/auth/me')),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    request<{ message: string }>(getApiUrl('/api/auth/change-password'), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Items
  getItems: (params?: {
    type?: string;
    category?: string;
    status?: string;
    q?: string;
    location?: string;
    owner_id?: string;
    limit?: number;
    offset?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, String(val));
        }
      });
    }
    const queryString = searchParams.toString();
    const endpoint = queryString ? `/api/items?${queryString}` : '/api/items';
    return request<{ items: Item[] }>(getApiUrl(endpoint));
  },

  getItem: (id: string) =>
    request<{
      item: Item;
      owner: { id: string; name: string; email?: string; phone?: string | null; contact_info?: string | null };
      is_owner: boolean;
      can_view_contact: boolean;
      has_verification_detail?: boolean;
      handover?: {
        claim_id: string;
        code?: string;
        claimant_confirmed_at?: string | null;
        finder_confirmed_at?: string | null;
        viewer_side: 'CLAIMANT' | 'FINDER';
      } | null;
    }>(getApiUrl(`/api/items/${id}`)),

  createItem: (formData: FormData) =>
    request<{ item: Item; suggested_matches: EnrichedMatch[] }>(getApiUrl('/api/items'), {
      method: 'POST',
      body: formData,
    }),

  updateVerificationDetail: (itemId: string, verificationDetail: string) =>
    request<{ item: Item; has_verification_detail: boolean }>(getApiUrl(`/api/items/${itemId}/verification-detail`), {
      method: 'PATCH',
      body: JSON.stringify({ verification_detail: verificationDetail }),
    }),

  updateItemStatus: (id: string, status: string) =>
    request<{ item: Item }>(getApiUrl(`/api/items/${id}`), {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),

  deleteItem: (id: string) =>
    request<{ message: string }>(getApiUrl(`/api/items/${id}`), {
      method: 'DELETE',
    }),

  getItemMatches: (id: string) =>
    request<{ matches: EnrichedMatch[] }>(getApiUrl(`/api/items/${id}/matches`)),

  // Claims
  createClaim: (itemId: string, payload: { message: string; verification_answer: string }) =>
    request<{ claim: Claim }>(getApiUrl(`/api/items/${itemId}/claims`), {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getUserClaims: () =>
    request<{ claims: EnrichedClaim[] }>(getApiUrl('/api/claims')),

  getModeratorClaims: (statusFilter?: string) => {
    const query = statusFilter ? `?all=true&status=${statusFilter}` : '?all=true';
    return request<{ claims: EnrichedClaim[] }>(getApiUrl(`/api/claims${query}`));
  },

  approveClaim: (claimId: string, note?: string) =>
    request<{ message: string; claim: Claim }>(getApiUrl(`/api/claims/${claimId}/approve`), {
      method: 'POST',
      body: JSON.stringify({ moderator_note: note }),
    }),

  rejectClaim: (claimId: string, note: string) =>
    request<{ message: string; claim: Claim }>(getApiUrl(`/api/claims/${claimId}/reject`), {
      method: 'POST',
      body: JSON.stringify({ moderator_note: note }),
    }),

  confirmHandover: (claimId: string, code?: string) =>
    request<{ message: string; claim: Claim }>(getApiUrl(`/api/claims/${claimId}/handover/confirm`), {
      method: 'POST',
      body: JSON.stringify(code ? { code } : {}),
    }),

  // Notifications
  getNotifications: () =>
    request<{ notifications: Notification[]; unread_count: number }>(getApiUrl('/api/notifications')),

  markNotificationRead: (id: string) =>
    request<{ message: string }>(getApiUrl(`/api/notifications/${id}/read`), { method: 'POST' }),

  markAllNotificationsRead: () =>
    request<{ message: string }>(getApiUrl('/api/notifications/read-all'), { method: 'POST' }),

  // Admin
  getAdminDashboard: () =>
    request<{
      stats: {
        open_items: number;
        matched_items: number;
        resolved_items: number;
        pending_claims: number;
      };
      pending_claims: EnrichedClaim[];
      high_confidence_matches: Array<{
        id: string;
        total_score: number;
        explanation: string;
        lost_item: Item;
        found_item: Item;
      }>;
      recent_audit_logs: AuditLog[];
    }>(getApiUrl('/api/admin/dashboard')),

  setAdminItemStatus: (id: string, status: string, note?: string) =>
    request<{ message: string; item: Item }>(getApiUrl(`/api/admin/items/${id}/status`), {
      method: 'POST',
      body: JSON.stringify({ status, note }),
    }),
};
