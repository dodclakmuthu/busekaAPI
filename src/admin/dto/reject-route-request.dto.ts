import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectRouteRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  rejectionReason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adminNotes?: string;
}
