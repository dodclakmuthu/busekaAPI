import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CrewDutyAuthController } from './crew-duty-auth.controller';
import { CrewDutyAuthService } from './crew-duty-auth.service';
import { CrewDutyJwtStrategy } from './crew-duty-jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Prefer a dedicated secret; fall back to the dashboard secret if not provided.
        const secret =
          config.get<string>('JWT_CREW_DUTY_SECRET') ??
          config.get<string>('JWT_ACCESS_SECRET');
        if (!secret) {
          throw new Error('JWT_CREW_DUTY_SECRET (or JWT_ACCESS_SECRET fallback) is not set');
        }

        const ttl = Number(config.get<string>('JWT_CREW_DUTY_TTL_SECONDS') ?? '86400');

        return {
          secret,
          signOptions: {
            expiresIn: ttl,
            audience: 'crew-duty',
          },
        };
      },
    }),
  ],
  controllers: [CrewDutyAuthController],
  providers: [CrewDutyAuthService, CrewDutyJwtStrategy],
})
export class CrewDutyAuthModule {}
