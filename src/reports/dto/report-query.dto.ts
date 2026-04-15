import { IsDateString, IsOptional } from 'class-validator';

export class ReportQueryDto {
  /**
   * Single business date (YYYY-MM-DD).
   * Defaults to today (Sri Lanka time) when both date and startDate/endDate are omitted.
   */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** Start of date range (YYYY-MM-DD). When supplied, endDate must also be supplied. */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** End of date range inclusive (YYYY-MM-DD). */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
