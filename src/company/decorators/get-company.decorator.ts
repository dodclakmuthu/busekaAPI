import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @GetCompany() — param decorator that extracts req.company (set by CompanyGuard).
 *
 * Example:
 *   @Get()
 *   findAll(@GetCompany() company: { id: string }) {
 *     return this.busService.findAll(company.id);
 *   }
 */
export const GetCompany = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): { id: string } => {
    const req = ctx.switchToHttp().getRequest<{ company: { id: string } }>();
    return req.company;
  },
);
