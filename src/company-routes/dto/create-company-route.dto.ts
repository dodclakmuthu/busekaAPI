import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StopInputDto } from './stop-input.dto';

export class CreateCompanyRouteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  routeNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  routeName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  startLocation!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  endLocation!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  distanceKm?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInputDto)
  upStops!: StopInputDto[];

  @IsOptional()
  @IsBoolean()
  downIsReverseOfUp?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInputDto)
  downStops?: StopInputDto[];
}
