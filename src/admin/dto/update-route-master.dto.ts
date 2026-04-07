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
import { StopInput } from './create-route-master.dto';

export class UpdateRouteMasterDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  routeNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  routeCode?: string;

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
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInput)
  upStops?: StopInput[];

  @IsOptional()
  @IsBoolean()
  downIsReverseOfUp?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInput)
  downStops?: StopInput[];
}

