import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { BusStatus, WageModel } from '@prisma/client';

export class UpdateBusDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  busName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ntcPermitNumber?: string;

  @IsOptional()
  @IsUUID()
  routeId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seatCount?: number;

  @IsOptional()
  @IsEnum(BusStatus)
  status?: BusStatus;

  @IsOptional()
  @IsUUID()
  defaultDriverStaffId?: string;

  @IsOptional()
  @IsUUID()
  defaultConductorStaffId?: string;

  @IsOptional()
  @IsEnum(WageModel)
  wageModel?: WageModel;

  @IsOptional()
  @IsNumber()
  @Min(0)
  driverPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  conductorPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedDriverWage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fixedConductorWage?: number;

  @IsOptional()
  @IsString()
  confirmationPin?: string;
}
