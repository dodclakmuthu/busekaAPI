import { AssignmentStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateAssignmentDto {
  @IsOptional()
  @IsDateString()
  assignmentDate?: string;

  @IsOptional()
  @IsUUID()
  driverStaffId?: string;

  @IsOptional()
  @IsUUID()
  conductorStaffId?: string;

  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
