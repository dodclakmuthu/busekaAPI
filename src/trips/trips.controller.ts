import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CompanyGuard } from '../company/guards/company.guard';
import { GetCompany } from '../company/decorators/get-company.decorator';
import { TripsService } from './trips.service';
import { ListTripsQueryDto } from './dto/list-trips-query.dto';
import { TripSummaryQueryDto } from './dto/trip-summary-query.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { CreateTripExpenseDto } from './dto/create-trip-expense.dto';
import { EndTripDto } from './dto/end-trip.dto';
import { CreateExtraIncomeDto } from './dto/create-extra-income.dto';

@UseGuards(JwtAuthGuard, CompanyGuard)
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  /** GET /trips?busId=&date=&today=true */
  @Get()
  listTrips(@GetCompany() company: { id: string }, @Query() query: ListTripsQueryDto) {
    return this.tripsService.listTrips(company.id, query);
  }

  /** GET /trips/summary?busId=...&date=...&today=true */
  @Get('summary')
  summary(@GetCompany() company: { id: string }, @Query() query: TripSummaryQueryDto) {
    return this.tripsService.getBusTripSummary(company.id, query);
  }

  /** GET /trips/expenses?busId=...&date=...&today=true */
  @Get('expenses')
  listExpenses(
    @GetCompany() company: { id: string },
    @Query() query: TripSummaryQueryDto,
  ) {
    return this.tripsService.listTodayExpenses(company.id, query.busId, query);
  }

  /** GET /trips/extra-incomes?busId=...&date=...&today=true */
  @Get('extra-incomes')
  listExtraIncomes(
    @GetCompany() company: { id: string },
    @Query() query: TripSummaryQueryDto,
  ) {
    return this.tripsService.listTodayExtraIncomes(company.id, query.busId, query);
  }

  /** POST /trips/start */
  @Post('start')
  startTrip(@GetCompany() company: { id: string }, @Body() dto: StartTripDto) {
    return this.tripsService.startTrip(company.id, dto);
  }

  /** POST /trips/:tripId/expenses */
  @Post(':tripId/expenses')
  addExpense(
    @GetCompany() company: { id: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: CreateTripExpenseDto,
  ) {
    return this.tripsService.addExpense(company.id, tripId, dto);
  }

  /** POST /trips/:tripId/extra-incomes */
  @Post(':tripId/extra-incomes')
  addExtraIncome(
    @GetCompany() company: { id: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: CreateExtraIncomeDto,
  ) {
    return this.tripsService.addExtraIncome(company.id, tripId, dto);
  }

  /** POST /trips/:tripId/end */
  @Post(':tripId/end')
  endTrip(
    @GetCompany() company: { id: string },
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Body() dto: EndTripDto,
  ) {
    return this.tripsService.endTrip(company.id, tripId, dto);
  }
}
