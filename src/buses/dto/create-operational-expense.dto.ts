import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class CreateOperationalExpenseDto {
  /** Category can be provided as Prisma enum (DIESEL) or dashboard style (diesel). */
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  /** Optional business date (YYYY-MM-DD). Defaults to today (Sri Lanka). */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;
}
