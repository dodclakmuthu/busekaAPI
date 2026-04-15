import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtPayload, SafeUser } from './auth.types';
import { DASHBOARD_AUTH_COOKIE } from './auth-cookie';

function cookieTokenExtractor(req: Request | undefined): string | null {
  const rawCookie = req?.headers?.cookie;
  if (!rawCookie) return null;

  for (const chunk of rawCookie.split(';')) {
    const [name, ...valueParts] = chunk.trim().split('=');
    if (name === DASHBOARD_AUTH_COOKIE) {
      const value = valueParts.join('=');
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    config: ConfigService,
  ) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieTokenExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<SafeUser> {
    if (!payload?.sub) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }
    return this.authService.getUserByIdOrThrow(payload.sub);
  }
}
