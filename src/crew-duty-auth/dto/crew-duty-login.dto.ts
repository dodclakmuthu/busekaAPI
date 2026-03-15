import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CrewDutyLoginDto {
  @IsString()
  @Transform(({ value }) => String(value ?? '').trim())
  @MinLength(1)
  @MaxLength(32)
  registrationNumber!: string;

  @IsString()
  @Matches(/^\d{4}$/, {
    message: 'PIN must be exactly 4 digits',
  })
  pin!: string;
}
