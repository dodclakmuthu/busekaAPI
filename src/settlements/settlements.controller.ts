import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from '../company/guards/company.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { SafeUser } from '../auth/auth.types';
import { SettlementsService } from './settlements.service';
import { SettlementQueryDto } from './dto/settlement-query.dto';
import { LockSettlementDto } from './dto/lock-settlement.dto';

type AuthedRequest = Request & { user: SafeUser };

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  /**
   * GET /settlements?date=YYYY-MM-DD
   * Returns company-level summary and bus settlement cards for the given date.
   */
  @Get()
  list(
    @GetCompany() company: { id: string },
    @Query() query: SettlementQueryDto,
  ) {
    return this.settlementsService.listSettlements(company.id, query);
  }

  /**
   * POST /settlements/lock-all?date=YYYY-MM-DD
   * Locks settlements for all active buses on the given date.
   * Must be defined BEFORE /:busId to avoid route conflict.
   */
  @Post('lock-all')
  lockAll(
    @GetCompany() company: { id: string },
    @Query() query: SettlementQueryDto,
    @Req() req: AuthedRequest,
  ) {
    return this.settlementsService.lockAllSettlements(company.id, query, req.user.id);
  }

  /**
   * GET /settlements/:busId?date=YYYY-MM-DD
   * Returns expanded settlement detail for a single bus.
   */
  @Get(':busId')
  getBusDetail(
    @GetCompany() company: { id: string },
    @Param('busId', ParseUUIDPipe) busId: string,
    @Query() query: SettlementQueryDto,
  ) {
    return this.settlementsService.getBusSettlementDetail(company.id, busId, query);
  }

  /**
   * POST /settlements/:busId/lock
   * Locks (finalises) the settlement for a single bus on the given date.
   */
  @Post(':busId/lock')
  lockBus(
    @GetCompany() company: { id: string },
    @Param('busId', ParseUUIDPipe) busId: string,
    @Body() dto: LockSettlementDto,
    @Req() req: AuthedRequest,
  ) {
    return this.settlementsService.lockBusSettlement(company.id, busId, dto, req.user.id);
  }
}
