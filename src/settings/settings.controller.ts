import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from '../company/guards/company.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { SettingsService } from './settings.service';
import { UpdateWageDefaultsDto } from './dto/update-wage-defaults.dto';

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** GET /settings/wage-defaults */
  @Get('wage-defaults')
  getWageDefaults(@GetCompany() company: { id: string }) {
    return this.settingsService.getWageDefaults(company.id);
  }

  /** PATCH /settings/wage-defaults */
  @Patch('wage-defaults')
  updateWageDefaults(
    @GetCompany() company: { id: string },
    @Body() dto: UpdateWageDefaultsDto,
  ) {
    return this.settingsService.updateWageDefaults(company.id, dto);
  }
}
