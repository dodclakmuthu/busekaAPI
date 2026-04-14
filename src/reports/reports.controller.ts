import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from '../company/guards/company.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { ReportsService } from './reports.service';
import { PerformanceReportQueryDto } from './dto/performance-report-query.dto';
import { ReportQueryDto } from './dto/report-query.dto';

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/dashboard?date=YYYY-MM-DD
   * GET /reports/dashboard?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *
   * Single payload for the dashboard page.
   */
  @Get('dashboard')
  getDashboard(
    @GetCompany() company: { id: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getDashboardReport(company.id, query);
  }

  /**
   * GET /reports/income?date=YYYY-MM-DD
   * GET /reports/income?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *
   * Income breakdown per bus: trip income, extra income, operational income.
   */
  @Get('income')
  getIncome(
    @GetCompany() company: { id: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getIncomeReport(company.id, query);
  }

  /**
   * GET /reports/expenses?date=YYYY-MM-DD
   * GET /reports/expenses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *
   * Expense breakdown by category and per bus.
   */
  @Get('expenses')
  getExpenses(
    @GetCompany() company: { id: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getExpensesReport(company.id, query);
  }

  /**
   * GET /reports/profitability?date=YYYY-MM-DD
   * GET /reports/profitability?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *
   * Bus-level profitability: income, expenses, DTI, salaries, profit.
   */
  @Get('profitability')
  getProfitability(
    @GetCompany() company: { id: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getProfitabilityReport(company.id, query);
  }

  /**
   * GET /reports/salaries?date=YYYY-MM-DD
   * GET /reports/salaries?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *
   * Salary payable per staff member with per-day breakdown.
   */
  @Get('salaries')
  getSalaries(
    @GetCompany() company: { id: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getSalariesReport(company.id, query);
  }

  /**
   * GET /reports/routes?date=YYYY-MM-DD
   * GET /reports/routes?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
   *
   * Performance grouped by route with per-bus breakdown.
   */
  @Get('routes')
  getRoutes(
    @GetCompany() company: { id: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reportsService.getRouteReport(company.id, query);
  }

  /**
    * GET /reports/performance?category=DRIVERS&metric=income&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&entityIds=<uuid>,<uuid>
    * GET /reports/performance?category=BUSES&metric=expenses&date=YYYY-MM-DD
   *
    * Performance analytics for drivers, conductors, and buses with one graph metric at a time.
   */
  @Get('performance')
  getPerformance(
    @GetCompany() company: { id: string },
    @Query() query: PerformanceReportQueryDto,
  ) {
    return this.reportsService.getPerformanceReport(company.id, query);
  }
}
