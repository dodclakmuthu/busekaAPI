import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SettlementsController } from './settlements.controller';
import { SettlementsService } from './settlements.service';

@Module({
  imports: [CompanyModule, NotificationsModule],
  controllers: [SettlementsController],
  providers: [SettlementsService],
})
export class SettlementsModule {}
