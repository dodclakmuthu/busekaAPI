import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from '../company/guards/company.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { ReportsService } from './reports.service';
import { DashboardOverviewQueryDto } from './dto/dashboard-overview-query.dto';

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /dashboard/overview?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   * GET /dashboard/overview?date=YYYY-MM-DD
   */
  @Get('overview')
  getOverview(
    @GetCompany() company: { id: string },
    @Query() query: DashboardOverviewQueryDto,
  ) {
    return this.reportsService.getDashboardReport(company.id, query);
  }
}