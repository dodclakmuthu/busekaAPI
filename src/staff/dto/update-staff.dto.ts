import { EmploymentType, StaffRoleType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobileNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  nicNumber?: string;

  @IsOptional()
  @IsEnum(StaffRoleType)
  roleType?: StaffRoleType;

  @IsOptional()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
