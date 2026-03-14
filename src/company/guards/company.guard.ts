import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SafeUser } from '../../auth/auth.types';

type GuardRequest = Request & {
  user: SafeUser;
  company?: { id: string };
};

/**
 * CompanyGuard — apply AFTER JwtAuthGuard on any company-dependent endpoint.
 *
 * • Looks up the authenticated user's active company.
 * • Attaches it to req.company = { id } for use in controllers via @GetCompany().
 * • Rejects with 403 when no active company exists.
 *
 * Usage in a controller:
 *   @UseGuards(JwtAuthGuard, CompanyGuard)
 *
 * This covers buses, staff, routes, assignments, trips, and all other modules
 * that require a company context.
 */
@Injectable()
export class CompanyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<GuardRequest>();
    const userId = req.user?.id;

    if (!userId) {
      // Should never reach here when JwtAuthGuard runs first, but guard defensively.
      throw new ForbiddenException('Unauthorized');
    }

    const company = await this.prisma.company.findFirst({
      where: { ownerUserId: userId, isActive: true },
      select: { id: true },
    });

    if (!company) {
      throw new ForbiddenException(
        'No active company found for this user. Create a company first.',
      );
    }

    req.company = company;
    return true;
  }
}
