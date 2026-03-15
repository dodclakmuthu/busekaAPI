import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateAssignmentDto {
  @IsUUID()
  busId!: string;

  /** Date-only or ISO datetime string. Stored as a DateTime in DB. */
  @IsDateString()
  assignmentDate!: string;

  @IsOptional()
  @IsUUID()
  driverStaffId?: string;

  @IsOptional()
  @IsUUID()
  conductorStaffId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
