import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StopInputDto } from './stop-input.dto';

export class UpdateCompanyRouteDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  routeNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  routeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  startLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  endLocation?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInputDto)
  upStops?: StopInputDto[];

  @IsOptional()
  @IsBoolean()
  downIsReverseOfUp?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInputDto)
  downStops?: StopInputDto[];
}
