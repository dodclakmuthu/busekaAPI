import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type AttemptRecord = {
  count: number;
  firstAttemptAt: number;
  blockedUntil?: number;
};

type LimitOptions = {
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
};

const DEFAULTS: LimitOptions = {
  maxAttempts: 5,
  windowMs: 10 * 60 * 1000,
  blockMs: 15 * 60 * 1000,
};

@Injectable()
export class LoginAttemptService {
  private readonly attempts = new Map<string, AttemptRecord>();

  assertAllowed(key: string, options: Partial<LimitOptions> = {}) {
    const config = { ...DEFAULTS, ...options };
    const now = Date.now();
    const existing = this.attempts.get(key);

    if (!existing) return;

    if (existing.blockedUntil && existing.blockedUntil > now) {
      const waitMinutes = Math.ceil((existing.blockedUntil - now) / 60000);
      throw new HttpException(
        `Too many failed attempts. Try again in ${waitMinutes} minute${waitMinutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (now - existing.firstAttemptAt > config.windowMs) {
      this.attempts.delete(key);
    }
  }

  recordFailure(key: string, options: Partial<LimitOptions> = {}) {
    const config = { ...DEFAULTS, ...options };
    const now = Date.now();
    const existing = this.attempts.get(key);

    if (!existing || now - existing.firstAttemptAt > config.windowMs) {
      this.attempts.set(key, {
        count: 1,
        firstAttemptAt: now,
      });
      return;
    }

    existing.count += 1;
    if (existing.count >= config.maxAttempts) {
      existing.blockedUntil = now + config.blockMs;
    }
    this.attempts.set(key, existing);
  }

  reset(key: string) {
    this.attempts.delete(key);
  }
}
