interface FailedAttemptRecord {
  attempts: number;
  lastAttemptTime: number;
  lockUntil: number | null;
}

const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

const attemptStore = new Map<string, FailedAttemptRecord>();

export function checkAccountLockout(identifier: string): { isLocked: boolean; remainingSeconds?: number } {
  const record = attemptStore.get(identifier);
  if (!record) {
    return { isLocked: false };
  }

  const now = Date.now();
  if (record.lockUntil && record.lockUntil > now) {
    const remainingSeconds = Math.ceil((record.lockUntil - now) / 1000);
    return { isLocked: true, remainingSeconds };
  }

  // If lockout expired or window passed, reset
  if (record.lockUntil && record.lockUntil <= now) {
    attemptStore.delete(identifier);
    return { isLocked: false };
  }

  if (now - record.lastAttemptTime > ATTEMPT_WINDOW_MS) {
    attemptStore.delete(identifier);
    return { isLocked: false };
  }

  return { isLocked: false };
}

export function recordFailedLoginAttempt(identifier: string): { isLocked: boolean; attemptsLeft: number } {
  const now = Date.now();
  let record = attemptStore.get(identifier);

  if (!record || now - record.lastAttemptTime > ATTEMPT_WINDOW_MS) {
    record = {
      attempts: 1,
      lastAttemptTime: now,
      lockUntil: null,
    };
  } else {
    record.attempts += 1;
    record.lastAttemptTime = now;
  }

  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    record.lockUntil = now + LOCKOUT_DURATION_MS;
    attemptStore.set(identifier, record);
    return { isLocked: true, attemptsLeft: 0 };
  }

  attemptStore.set(identifier, record);
  return { isLocked: false, attemptsLeft: MAX_FAILED_ATTEMPTS - record.attempts };
}

export function clearFailedLoginAttempts(identifier: string): void {
  attemptStore.delete(identifier);
}
