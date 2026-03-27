import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class EndTripDto {
  /** Main trip income amount (cash collected). */
  @IsNumber()
  income!: number;

  @IsOptional()
  @IsUUID()
  endStopId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  note?: string;

  /** Optional override for endedAt (ISO timestamp). Defaults to now. */
  @IsOptional()
  @IsDateString()
  endedAt?: string;
}
