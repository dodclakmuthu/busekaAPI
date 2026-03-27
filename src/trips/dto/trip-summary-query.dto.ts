import { IsBoolean, IsDateString, IsOptional, IsUUID } from 'class-validator';

export class TripSummaryQueryDto {
  @IsUUID()
  busId!: string;

  /** ISO date (YYYY-MM-DD is ok). When supplied, summary is for that day (UTC). */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** Convenience flag for today (UTC). */
  @IsOptional()
  @IsBoolean()
  today?: boolean;
}
