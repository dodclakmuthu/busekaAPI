import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import { CrewDutyJwtAuthGuard } from '../crew-duty-auth/crew-duty-jwt-auth.guard';
import type { CrewDutySession } from '../crew-duty-auth/crew-duty-auth.types';
import { CrewDutyService } from './crew-duty.service';
import { TripsService } from '../trips/trips.service';
import { TripSummaryQueryDto } from '../trips/dto/trip-summary-query.dto';
import { StartTripDto } from './dto/start-trip.dto';
import { StaffOptionsQueryDto } from './dto/staff-options-query.dto';
import { CreateExtraIncomeDto } from './dto/create-extra-income.dto';
import { CreateCrewTripExpenseDto } from './dto/create-crew-trip-expense.dto';
import { EndCrewTripDto } from './dto/end-crew-trip.dto';

@Controller('crew-duty')
@UseGuards(CrewDutyJwtAuthGuard)
export class CrewDutyController {
  constructor(
    private readonly crewDutyService: CrewDutyService,
    private readonly tripsService: TripsService,
  ) {}

  /** GET /crew-duty/duty-context
   *  Returns full duty context: bus, today's assignment, default crew, resolved crew + source. */
  @Get('duty-context')
  getDutyContext(@Req() req: { user: CrewDutySession }) {
    return this.crewDutyService.getDutyContext(req.user.busId, req.user.companyId);
  }

  /** GET /crew-duty/staff/options?role=DRIVER|CONDUCTOR|ALL
   *  Returns active staff for the company, optionally filtered by role. */
  @Get('staff/options')
  getStaffOptions(
    @Req() req: { user: CrewDutySession },
    @Query() query: StaffOptionsQueryDto,
  ) {
    return this.crewDutyService.getStaffOptions(req.user.companyId, query.role);
  }

  /** POST /crew-duty/trips/start
   *  Resolves crew, creates a Trip record, and marks assignment as STARTED. */
  @Post('trips/start')
  startTrip(
    @Req() req: { user: CrewDutySession },
    @Body() dto: StartTripDto,
  ) {
    return this.crewDutyService.startTrip(req.user.busId, req.user.companyId, dto);
  }

  /** GET /crew-duty/summary?today=true
   *  Returns a bus-level trip summary similar to `/trips/summary` but authenticated
   *  using crew-duty session (so mobile app can poll for active trip + summary).
   */
  @Get('summary')
  summary(@Req() req: { user: CrewDutySession }, @Query() query: TripSummaryQueryDto) {
    // Ensure busId is always the crew's bus
    const q = { ...(query as any), busId: req.user.busId } as TripSummaryQueryDto;
    return this.tripsService.getBusTripSummary(req.user.companyId, q);
  }

  /** POST /crew-duty/trips/:tripId/extra-incomes
   *  Add an extra income record for the given trip. */
  @Post('trips/:tripId/extra-incomes')
  addExtraIncome(
    @Req() req: { user: CrewDutySession },
    @Param('tripId') tripId: string,
    @Body() dto: CreateExtraIncomeDto,
  ) {
    return this.crewDutyService.addExtraIncome(tripId, req.user.companyId, dto);
  }

  /** POST /crew-duty/trips/:tripId/expenses
   *  Add a trip expense record for the given trip (crew-duty auth, bus-scoped). */
  @Post('trips/:tripId/expenses')
  addTripExpense(
    @Req() req: { user: CrewDutySession },
    @Param('tripId') tripId: string,
    @Body() dto: CreateCrewTripExpenseDto,
  ) {
    return this.crewDutyService.addTripExpense(req.user.busId, req.user.companyId, tripId, dto);
  }

  /** POST /crew-duty/trips/:tripId/end
   *  End the given trip and record main income (crew-duty auth, bus-scoped). */
  @Post('trips/:tripId/end')
  endTrip(
    @Req() req: { user: CrewDutySession },
    @Param('tripId') tripId: string,
    @Body() dto: EndCrewTripDto,
  ) {
    return this.crewDutyService.endTrip(req.user.busId, req.user.companyId, tripId, dto);
  }

  /** GET /crew-duty/trips/:tripId/incomes
   *  Returns trip incomes and extra incomes. */
  @Get('trips/:tripId/incomes')
  getTripIncomes(
    @Req() req: { user: CrewDutySession },
    @Param('tripId') tripId: string,
  ) {
    return this.crewDutyService.listTripIncomes(tripId, req.user.companyId);
  }
}
