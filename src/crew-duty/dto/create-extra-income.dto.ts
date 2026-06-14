import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExtraIncomeDto {
  @IsNotEmpty()
  @IsString()
  category!: string;

  /** Amount as string (decimal) to avoid float precision issues in transport */
  @IsNotEmpty()
  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
