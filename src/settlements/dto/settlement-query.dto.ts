import { IsDateString, IsOptional } from 'class-validator';

export class SettlementQueryDto {
  /** Business date in YYYY-MM-DD format. Defaults to today (Sri Lanka time) when omitted. */
  @IsOptional()
  @IsDateString()
  date?: string;
}
