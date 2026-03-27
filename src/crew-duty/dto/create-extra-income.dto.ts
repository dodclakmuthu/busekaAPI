import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum ExtraIncomeCategoryDto {
  PARCEL = 'PARCEL',
  BAGGAGE = 'BAGGAGE',
  OTHER = 'OTHER',
}

export class CreateExtraIncomeDto {
  @IsNotEmpty()
  @IsEnum(ExtraIncomeCategoryDto)
  category!: ExtraIncomeCategoryDto;

  /** Amount as string (decimal) to avoid float precision issues in transport */
  @IsNotEmpty()
  @IsString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
