import { IsNotEmpty, IsString } from 'class-validator';

export class ResendSignupOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;
}