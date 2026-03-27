import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches } from 'class-validator';

export class CreateOperationalIncomeDto {
  /** Category can be provided as Prisma enum (PARCEL) or dashboard style (parcel/other_extra_income). */
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
