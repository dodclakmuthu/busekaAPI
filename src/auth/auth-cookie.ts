import type { CookieOptions } from 'express';

export const DASHBOARD_AUTH_COOKIE = 'busapp_session';

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  return value === 'true';
}

export function getAuthCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const sameSite = (process.env.AUTH_COOKIE_SAME_SITE as 'lax' | 'strict' | 'none' | undefined) ?? 'lax';
  const secure = toBool(process.env.AUTH_COOKIE_SECURE, isProduction || sameSite === 'none');
  const maxAgeSeconds = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? '900');
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: maxAgeSeconds * 1000,
    ...(domain ? { domain } : {}),
  };
}
