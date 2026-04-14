import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { DashboardController } from './dashboard.controller';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [CompanyModule],
  controllers: [ReportsController, DashboardController],
  providers: [ReportsService],
})
export class ReportsModule {}
