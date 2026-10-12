/** Format authentication failure logging without dumping request bodies, headers, or Error objects. */
export function formatSafeAuthErrorLog(context: string, value: unknown): string {
  const error = value instanceof Error ? value : new Error('Unknown authentication error');
  const sanitizedMessage = error.message
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(password|passphrase|secret|token|access[_-]?token|refresh[_-]?token|handover[_-]?code|answer|verification[_-]?(?:answer|detail))(["']?\s*[:=]\s*["']?)([^"'&\s,;}]+)/gi, '$1$2[REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[REDACTED_TOKEN]');
  const rawCode = (value as { code?: unknown } | null)?.code;
  const code = (typeof rawCode === 'string' || typeof rawCode === 'number') ? String(rawCode) : '';
  const safeCode = /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : '';
  return `${context}: ${sanitizedMessage}${safeCode ? ` (code: ${safeCode})` : ''}`;
}
