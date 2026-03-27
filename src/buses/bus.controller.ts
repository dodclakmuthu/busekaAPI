import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SafeUser } from '../auth/auth.types';
import { CompanyGuard } from '../company/guards/company.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { CompanyRoles } from '../company/decorators/company-roles.decorator';
import { CompanyRolesGuard } from '../company/guards/company-roles.guard';
import { BusService } from './bus.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';
import { BusPinService } from './bus-pin.service';
import { SetBusPinDto } from './dto/set-bus-pin.dto';
import { UpdateBusStatusDto } from './dto/update-bus-status.dto';
import { CreateOperationalExpenseDto } from './dto/create-operational-expense.dto';
import { CreateOperationalIncomeDto } from './dto/create-operational-income.dto';
import { CompanyUserRole } from '@prisma/client';

type AuthedCompanyRequest = Request & {
  user: SafeUser;
  company?: { id: string; role: CompanyUserRole };
};

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('buses')
export class BusController {
  constructor(
    private readonly busService: BusService,
    private readonly busPinService: BusPinService,
  ) {}

  /** POST /buses */
  @Post()
  create(@GetCompany() company: { id: string }, @Body() dto: CreateBusDto) {
    return this.busService.create(company.id, dto);
  }

  /** GET /buses */
  @Get()
  findAll(@GetCompany() company: { id: string }) {
    return this.busService.findAll(company.id);
  }

  /** GET /buses/active */
  @Get('active')
  findActive(@GetCompany() company: { id: string }) {
    return this.busService.findActive(company.id);
  }

  /** POST /buses/:id/operational-expenses */
  @Post(':id/operational-expenses')
  addOperationalExpense(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOperationalExpenseDto,
  ) {
    return this.busService.addOperationalExpense(company.id, id, dto);
  }

  /** POST /buses/:id/operational-incomes */
  @Post(':id/operational-incomes')
  addOperationalIncome(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateOperationalIncomeDto,
  ) {
    return this.busService.addOperationalIncome(company.id, id, dto);
  }

  /** GET /buses/:id */
  @Get(':id')
  findOne(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.busService.findOne(company.id, id);
  }

  /** PATCH /buses/:id */
  @Patch(':id')
  update(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusDto,
  ) {
    return this.busService.update(company.id, id, dto);
  }

  /** POST /buses/:id/pin */
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyUserRole.OWNER, CompanyUserRole.MANAGER)
  @Post(':id/pin')
  setPin(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBusPinDto,
    @Req() req: AuthedCompanyRequest,
  ) {
    return this.busPinService.setPin(company.id, id, req.user.id, dto);
  }

  /** PATCH /buses/:id/pin/reset */
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyUserRole.OWNER, CompanyUserRole.MANAGER)
  @Patch(':id/pin/reset')
  resetPin(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBusPinDto,
    @Req() req: AuthedCompanyRequest,
  ) {
    return this.busPinService.resetPin(company.id, id, req.user.id, dto);
  }

  /** PATCH /buses/:id/status */
  @UseGuards(CompanyRolesGuard)
  @CompanyRoles(CompanyUserRole.OWNER, CompanyUserRole.MANAGER)
  @Patch(':id/status')
  updateStatus(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusStatusDto,
  ) {
    return this.busService.updateStatus(company.id, id, dto.status);
  }
}
