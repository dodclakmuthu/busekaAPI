import { Module } from '@nestjs/common';
import { CompanyRoutesController } from './company-routes.controller';
import { CompanyRoutesService } from './company-routes.service';

@Module({
  controllers: [CompanyRoutesController],
  providers: [CompanyRoutesService],
})
export class CompanyRoutesModule {}
