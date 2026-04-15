import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('/health')
  async health() {
    try {
      const userCount = await this.prisma.user.count();

      return {
        ok: true,
        status: 'healthy',
        service: 'busapp-api',
        timestamp: new Date().toISOString(),
        db: {
          ok: true,
          model: 'User',
          count: userCount,
        },
      };
    } catch (err) {
      throw new InternalServerErrorException({
        ok: false,
        status: 'unhealthy',
        message: 'DB health check failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  @Get('/test-db')
  async testDb() {
    return this.health();
  }
}