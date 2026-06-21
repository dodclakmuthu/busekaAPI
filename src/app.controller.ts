import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { UserAccountStatus } from '@prisma/client';
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

  @Get('/landing/stats')
  async landingStats() {
    const [
      busesRegistered,
      companies,
      activeUsers,
      tripsRecorded,
      incomeSummary,
    ] = await Promise.all([
      this.prisma.bus.count({ where: { isActive: true } }),
      this.prisma.company.count({ where: { isActive: true } }),
      this.prisma.user.count({
        where: {
          isActive: true,
          status: UserAccountStatus.ACTIVE,
        },
      }),
      this.prisma.trip.count(),
      this.prisma.dailySummary.aggregate({
        _sum: {
          totalIncome: true,
        },
      }),
    ]);

    const totalIncome = incomeSummary._sum.totalIncome ? Number(incomeSummary._sum.totalIncome) : 0;

    return {
      busesRegistered,
      companies,
      activeUsers,
      tripsRecorded,
      totalIncome,
      totalRevenue: totalIncome,
    };
  }
}
