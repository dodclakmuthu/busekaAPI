import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateWageDefaultsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultDriverPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultConductorPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultFixedDriverWage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultFixedConductorWage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxCombinedPercentageWarning?: number;

  /** When true, also propagate the saved defaults to buses. */
  @IsOptional()
  @IsBoolean()
  applyToBuses?: boolean;

  /**
   * Only relevant when applyToBuses = true.
   * true  → overwrite every active bus (even those with existing settings)
   * false → update only buses where all wage fields are still null
   */
  @IsOptional()
  @IsBoolean()
  overwriteAll?: boolean;
}
