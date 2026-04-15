import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { CompanyModule } from './company/company.module';
import { BusModule } from './buses/bus.module';
import { StaffModule } from './staff/staff.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { CrewDutyAuthModule } from './crew-duty-auth/crew-duty-auth.module';
import { CrewDutyModule } from './crew-duty/crew-duty.module';
import { TripsModule } from './trips/trips.module';
import { SettlementsModule } from './settlements/settlements.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { CompanyRoutesModule } from './company-routes/company-routes.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, CrewDutyAuthModule, CrewDutyModule, CompanyModule, CompanyRoutesModule, BusModule, StaffModule, AssignmentsModule, TripsModule, SettlementsModule, SettingsModule, ReportsModule, NotificationsModule, AdminModule],
  controllers: [AppController],
})
export class AppModule {}
