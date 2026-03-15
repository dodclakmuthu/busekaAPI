import { Module } from '@nestjs/common';
import { CompanyController } from './company.controller';
import { CompanyService } from './company.service';
import { CompanyGuard } from './guards/company.guard';
import { CompanyRolesGuard } from './guards/company-roles.guard';

@Module({
  controllers: [CompanyController],
  providers: [CompanyService, CompanyGuard, CompanyRolesGuard],
  /**
   * Export CompanyService so other modules (BusModule, StaffModule, etc.)
   * can inject it for resolveActiveCompany().
   *
   * Export CompanyGuard so other modules can apply it via @UseGuards()
   * without re-providing it.
   */
  exports: [CompanyService, CompanyGuard, CompanyRolesGuard],
})
export class CompanyModule {}
