import { IsEnum, IsOptional } from 'class-validator';

export enum StaffRoleFilter {
  DRIVER = 'DRIVER',
  CONDUCTOR = 'CONDUCTOR',
  ALL = 'ALL',
}

export class StaffOptionsQueryDto {
  @IsOptional()
  @IsEnum(StaffRoleFilter)
  role?: StaffRoleFilter;
}
