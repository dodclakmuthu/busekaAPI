import { Body, Controller, Post } from '@nestjs/common';
import { CrewDutyLoginDto } from './dto/crew-duty-login.dto';
import { CrewDutyAuthService } from './crew-duty-auth.service';

@Controller('crew-duty-auth')
export class CrewDutyAuthController {
  constructor(private readonly crewDutyAuth: CrewDutyAuthService) {}

  @Post('login')
  login(@Body() dto: CrewDutyLoginDto) {
    return this.crewDutyAuth.login(dto);
  }
}
