import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { CrewDutyJwtPayload, CrewDutySession } from './crew-duty-auth.types';

@Injectable()
export class CrewDutyJwtStrategy extends PassportStrategy(Strategy, 'crew-duty-jwt') {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    const secret =
      config.get<string>('JWT_CREW_DUTY_SECRET') ?? config.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new Error('JWT_CREW_DUTY_SECRET (or JWT_ACCESS_SECRET fallback) is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      audience: 'crew-duty',
    });
  }

  async validate(payload: CrewDutyJwtPayload): Promise<CrewDutySession> {
    if (!payload || payload.typ !== 'crew-duty') {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }
    if (!payload.sub?.startsWith('bus:') || !payload.busId) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }

    // Ensure bus is still operational for crew-duty sessions.
    const bus = await this.prisma.bus.findFirst({
      where: {
        id: payload.busId,
        companyId: payload.companyId,
        isActive: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!bus) {
      throw new UnauthorizedException({ message: 'Unauthorized' });
    }

    return {
      busId: payload.busId,
      companyId: payload.companyId,
      registrationNumber: payload.registrationNumber,
    };
  }
}
