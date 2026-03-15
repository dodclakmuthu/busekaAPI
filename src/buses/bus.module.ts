import { Module } from '@nestjs/common';
import { BusController } from './bus.controller';
import { BusService } from './bus.service';
import { CompanyModule } from '../company/company.module';
import { BusPinService } from './bus-pin.service';

@Module({
  imports: [CompanyModule],
  controllers: [BusController],
  providers: [BusService, BusPinService],
})
export class BusModule {}
