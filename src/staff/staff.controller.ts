import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CompanyUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { CompanyRoles } from '../company/decorators/company-roles.decorator';
import { CompanyGuard } from '../company/guards/company.guard';
import { CompanyRolesGuard } from '../company/guards/company-roles.guard';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffService } from './staff.service';

@UseGuards(JwtAuthGuard, CompanyGuard, CompanyRolesGuard)
@CompanyRoles(CompanyUserRole.OWNER, CompanyUserRole.MANAGER)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  /** POST /staff */
  @Post()
  create(@GetCompany() company: { id: string }, @Body() dto: CreateStaffDto) {
    return this.staffService.create(company.id, dto);
  }

  /** GET /staff */
  @Get()
  findAll(@GetCompany() company: { id: string }) {
    return this.staffService.findAll(company.id);
  }

  /** GET /staff/:id */
  @Get(':id')
  findOne(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.staffService.findOne(company.id, id);
  }

  /** PATCH /staff/:id */
  @Patch(':id')
  update(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(company.id, id, dto);
  }
}
