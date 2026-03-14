import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SafeUser } from '../auth/auth.types';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

type AuthRequest = Request & { user: SafeUser };

/**
 * CompanyController — all endpoints require a valid JWT but NOT a company,
 * so that users can log in and create their first company.
 */
@UseGuards(JwtAuthGuard)
@Controller('companies')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  /** POST /companies — create the user's company (MVP: one per user) */
  @Post()
  create(@Request() req: AuthRequest, @Body() dto: CreateCompanyDto) {
    return this.companyService.create(req.user.id, dto);
  }

  /** GET /companies/my */
  @Get('my')
  findMine(@Request() req: AuthRequest) {
    return this.companyService.findMine(req.user.id);
  }

  /** PATCH /companies/my */
  @Patch('my')
  updateMine(@Request() req: AuthRequest, @Body() dto: UpdateCompanyDto) {
    return this.companyService.updateMine(req.user.id, dto);
  }
}
