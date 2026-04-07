import {
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StopInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  locationName!: string;
}

export class CreateRouteMasterDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  routeNumber?: string;

  @ValidateIf((o: CreateRouteMasterDto) => !o.routeNumber)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  routeCode?: string;

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
  @Type(() => StopInput)
  upStops!: StopInput[];

  @IsBoolean()
  @IsOptional()
  downIsReverseOfUp?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StopInput)
  downStops?: StopInput[];
}
