import { IsEnum } from 'class-validator';
import { BusStatus } from '@prisma/client';

export class UpdateBusStatusDto {
  @IsEnum(BusStatus)
  status!: BusStatus;
}
