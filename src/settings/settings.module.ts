import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Module({
  imports: [CompanyModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
