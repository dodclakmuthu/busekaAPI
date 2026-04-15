import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CompanyUserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SafeUser } from '../auth/auth.types';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { CompanyRoles } from '../company/decorators/company-roles.decorator';
import { CompanyGuard } from '../company/guards/company.guard';
import { CompanyRolesGuard } from '../company/guards/company-roles.guard';
import { CompanyRoutesService } from './company-routes.service';
import { CreateCompanyRouteDto } from './dto/create-company-route.dto';
import { UpdateCompanyRouteDto } from './dto/update-company-route.dto';
import { ListCompanyRoutesQueryDto } from './dto/list-company-routes-query.dto';

type AuthedRequest = Request & { user: SafeUser };

@UseGuards(JwtAuthGuard, CompanyGuard, CompanyRolesGuard)
@CompanyRoles(CompanyUserRole.OWNER, CompanyUserRole.MANAGER)
@Controller('company-routes')
export class CompanyRoutesController {
  constructor(private readonly companyRoutesService: CompanyRoutesService) {}

  /** GET /company-routes/global */
  @Get('global')
  listGlobal() {
    return this.companyRoutesService.listGlobal();
  }

  /** GET /company-routes */
  @Get()
  list(
    @GetCompany() company: { id: string },
    @Query() query: ListCompanyRoutesQueryDto,
  ) {
    return this.companyRoutesService.list(company.id, query);
  }

  /** GET /company-routes/:id/history */
  @Get(':id/history')
  getHistory(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companyRoutesService.getHistory(company.id, id);
  }

  /** GET /company-routes/:id/approval-status */
  @Get(':id/approval-status')
  getApprovalStatus(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companyRoutesService.getApprovalStatus(company.id, id);
  }

  /** GET /company-routes/:id */
  @Get(':id')
  getById(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companyRoutesService.getById(company.id, id);
  }

  /** POST /company-routes */
  @Post()
  create(
    @GetCompany() company: { id: string },
    @Req() req: AuthedRequest,
    @Body() dto: CreateCompanyRouteDto,
  ) {
    return this.companyRoutesService.create(company.id, req.user.id, dto);
  }

  /** PATCH /company-routes/:id */
  @Patch(':id')
  update(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
    @Body() dto: UpdateCompanyRouteDto,
  ) {
    return this.companyRoutesService.update(company.id, id, req.user.id, dto);
  }

  /** POST /company-routes/:id/submit-for-approval */
  @Post(':id/submit-for-approval')
  submitForApproval(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.companyRoutesService.submitForApproval(company.id, id, req.user.id);
  }
}
