import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TextlkSmsService {
  private readonly logger = new Logger(TextlkSmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendSignupOtp(mobileNumber: string, otp: string): Promise<void> {
    const apiToken = this.config.get<string>('TEXTLK_API_TOKEN')?.trim();
    const senderId = this.config.get<string>('TEXTLK_SENDER_ID')?.trim() || 'BusApp';
    const endpoint = this.config.get<string>('TEXTLK_SMS_ENDPOINT')?.trim() || 'https://app.text.lk/api/v3/sms/send';
    const message = `Your Bus App verification code is ${otp}. It expires in 5 minutes.`;
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    if (!apiToken) {
      if (isProduction) {
        throw new ServiceUnavailableException({ message: 'SMS provider is not configured' });
      }

      this.logger.warn(`TEXTLK_API_TOKEN is not configured. OTP for ${mobileNumber}: ${otp}`);
      return;
    }

    let response: Response;

    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          recipient: mobileNumber.replace('+', ''),
          sender_id: senderId,
          type: 'plain',
          message,
        }),
      });
    } catch (error) {
      this.logger.error(`Failed to reach Text.lk for ${mobileNumber}`, error instanceof Error ? error.stack : undefined);
      throw new ServiceUnavailableException({ message: 'Failed to send OTP. Please try again.' });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Text.lk returned ${response.status} for ${mobileNumber}: ${body}`);
      throw new ServiceUnavailableException({ message: 'Failed to send OTP. Please try again.' });
    }
  }
}