import { SetMetadata } from '@nestjs/common';
import { CompanyUserRole } from '@prisma/client';

export const COMPANY_ROLES_KEY = 'company_roles';

export const CompanyRoles = (...roles: CompanyUserRole[]) =>
  SetMetadata(COMPANY_ROLES_KEY, roles);
