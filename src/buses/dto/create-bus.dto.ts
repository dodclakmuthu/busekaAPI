import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { BusStatus } from '@prisma/client';

export class CreateBusDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  registrationNumber!: string;

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
}
