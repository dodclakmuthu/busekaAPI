import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export enum TripDirectionDto {
  UP = 'UP',
  DOWN = 'DOWN',
}

export class StartTripDto {
  /** Direction of the trip. Defaults to UP if omitted. */
  @IsOptional()
  @IsEnum(TripDirectionDto)
  direction?: TripDirectionDto;

  /** Required only when crew source is MANUAL_SELECTION_REQUIRED. */
  @IsOptional()
  @IsUUID()
  driverStaffId?: string;

  /** Required only when crew source is MANUAL_SELECTION_REQUIRED. */
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
}
