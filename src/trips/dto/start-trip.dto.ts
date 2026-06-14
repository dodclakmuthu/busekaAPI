import { IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';

export enum TripDirectionDto {
  UP = 'UP',
  DOWN = 'DOWN',
}

export class StartTripDto {
  /** Bus to start the trip for. */
  @IsUUID()
  busId!: string;

  /** Direction of the trip. Defaults to UP if omitted. */
  @IsOptional()
  @IsEnum(TripDirectionDto)
  direction?: TripDirectionDto;

  /** Required only when no assignment or default crew exists. */
  @IsOptional()
  @IsUUID()
  driverStaffId?: string;

  /** Required only when no assignment or default crew exists. */
  @IsOptional()
  @IsUUID()
  conductorStaffId?: string;

  /** Override the bus default route for this trip. */
  @IsOptional()
  @IsUUID()
  routeId?: string;

  /** Starting stop for the trip. */
  @IsOptional()
  @IsUUID()
  startStopId?: string;

  /** Optional destination stop (can also be set when ending the trip). */
  @IsOptional()
  @IsUUID()
  endStopId?: string;

  /** User-entered trip time. startedAt is set by the system when the record is created. */
  @IsOptional()
  @IsISO8601()
  startTime?: string;
}
