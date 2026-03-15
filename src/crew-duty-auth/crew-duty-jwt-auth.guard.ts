import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CrewDutyJwtAuthGuard extends AuthGuard('crew-duty-jwt') {}
