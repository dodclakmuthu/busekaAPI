import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class StopInputDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  locationName!: string;
}
