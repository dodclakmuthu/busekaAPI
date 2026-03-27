import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTripExpenseDto {
  /** Category can be provided as Prisma enum (DIESEL) or dashboard style (diesel). */
  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
