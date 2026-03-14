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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from '../company/guards/company.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { BusService } from './bus.service';
import { CreateBusDto } from './dto/create-bus.dto';
import { UpdateBusDto } from './dto/update-bus.dto';

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('buses')
export class BusController {
  constructor(private readonly busService: BusService) {}

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
}
