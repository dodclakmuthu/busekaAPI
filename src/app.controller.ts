import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/test-db')
  async testDb() {
    try {
      const userCount = await this.prisma.user.count();
      return { ok: true, model: 'User', count: userCount };
    } catch (err) {
      throw new InternalServerErrorException({
        ok: false,
        message: 'DB read failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}