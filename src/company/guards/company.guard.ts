import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { SafeUser } from '../../auth/auth.types';
import { CompanyUserRole } from '@prisma/client';

type GuardRequest = Request & {
  user: SafeUser;
  company?: { id: string; role: CompanyUserRole };
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

    // Owner access
    const ownedCompany = await this.prisma.company.findFirst({
      where: { ownerUserId: userId, isActive: true },
      select: { id: true },
    });

    if (ownedCompany) {
      req.company = { id: ownedCompany.id, role: CompanyUserRole.OWNER };
      return true;
    }

    // Manager (or explicitly assigned OWNER) access
    const membership = await this.prisma.companyUser.findFirst({
      where: {
        userId,
        isActive: true,
        role: { in: [CompanyUserRole.OWNER, CompanyUserRole.MANAGER] },
        company: { isActive: true },
      },
      select: { companyId: true, role: true },
    });

    if (!membership) {
      throw new ForbiddenException(
        'No active company found for this user. Create a company first.',
      );
    }

    req.company = { id: membership.companyId, role: membership.role };
    return true;
  }
}
