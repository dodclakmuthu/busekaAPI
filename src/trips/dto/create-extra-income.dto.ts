import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateExtraIncomeDto {
  /** Category can be provided as Prisma enum (PARCEL) or dashboard style (parcel/other_extra_income). */
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
