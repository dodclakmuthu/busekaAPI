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

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, CrewDutyAuthModule, CompanyModule, BusModule, StaffModule, AssignmentsModule],
  controllers: [AppController],
})
export class AppModule {}
