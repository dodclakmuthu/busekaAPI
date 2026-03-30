import { IsDateString, IsNotEmpty } from 'class-validator';

export class LockSettlementDto {
  /** Business date to lock, in YYYY-MM-DD format. */
  @IsDateString()
  @IsNotEmpty()
  date!: string;
}
