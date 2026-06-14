import { IsBoolean, IsDateString, IsOptional } from 'class-validator';

export class CrewDutySummaryQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsBoolean()
  today?: boolean;
}
