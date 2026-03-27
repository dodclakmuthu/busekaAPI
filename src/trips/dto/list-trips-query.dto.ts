import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class ListTripsQueryDto {
  @IsOptional()
  @IsUUID()
  busId?: string;

  /** ISO date (YYYY-MM-DD is ok). When supplied, trips are filtered to that day (UTC). */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** Convenience flag for today (UTC). */
  @IsOptional()
  @IsBoolean()
  today?: boolean;
}
