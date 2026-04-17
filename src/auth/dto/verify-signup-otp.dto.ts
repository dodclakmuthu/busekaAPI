import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class VerifySignupOtpDto {
  @IsString()
  @IsNotEmpty()
  challengeId!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit code' })
  otp!: string;
}