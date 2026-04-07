import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { SafeUser } from './auth.types';

@Injectable()
export class AppAdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const request = ctx.switchToHttp().getRequest<{ user?: SafeUser }>();
    if (!request.user?.isAppAdmin) {
      throw new ForbiddenException('APP_ADMIN access required');
    }
    return true;
  }
}
