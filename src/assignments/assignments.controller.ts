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
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';

type AuthedRequest = Request & { user: SafeUser };

@UseGuards(JwtAuthGuard, CompanyGuard, CompanyRolesGuard)
@CompanyRoles(CompanyUserRole.OWNER, CompanyUserRole.MANAGER)
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  /** POST /assignments */
  @Post()
  create(
    @GetCompany() company: { id: string },
    @Body() dto: CreateAssignmentDto,
    @Req() req: AuthedRequest,
  ) {
    return this.assignmentsService.create(company.id, req.user.id, dto);
  }

  /** GET /assignments?date=YYYY-MM-DD&busId=<uuid> */
  @Get()
  findAll(
    @GetCompany() company: { id: string },
    @Query('date') date?: string,
    @Query('busId') busId?: string,
  ) {
    return this.assignmentsService.findAll(company.id, date, busId);
  }

  /** GET /assignments/:id */
  @Get(':id')
  findOne(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assignmentsService.findOne(company.id, id);
  }

  /** PATCH /assignments/:id */
  @Patch(':id')
  update(
    @GetCompany() company: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.assignmentsService.update(company.id, id, dto);
  }
}
