import { Module } from '@nestjs/common';
import { CompanyRoutesController } from './company-routes.controller';
import { CompanyRoutesService } from './company-routes.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [CompanyRoutesController],
  providers: [CompanyRoutesService],
})
export class CompanyRoutesModule {}
