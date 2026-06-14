import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type BusDailySummary = {
    busId: string;
    date: string; // YYYY-MM-DD format
};

type BusDailySummaryResult = {
    busId: string;
    date: string;
    totalIncome: number;
    totalExpenses: number;
    tripsCount: number;
};

@Injectable()
export class getBusDailySummary{
    constructor(private prisma: PrismaService) {}

    async getBusDailySummary(input : BusDailySummary) : Promise<BusDailySummaryResult> {

        const { busId, date } = input;

        const startDate = new Date(`${date}T00:00:00Z`);
        const endDate = new Date(`${date}T23:59:59Z`);

        const trips = await this.prisma.trip.findMany({
            where: {
                busId,
                endedAt: {
                    gte: startDate,
                    lte: endDate
                }
            }
        });

        const [incomeAgg, ExtraIncomeAgg, expensesAgg] = await Promise.all([
            this.prisma.tripIncome.aggregate({
                where: {
                    trip: {
                        id: {
                            in: trips.map(trip => trip.id)
                        }
                    }
                },
                _sum: {
                    amount: true
                },
                _count: {
                    id: true
                }
            }),
            this.prisma.extraIncome.aggregate({
                where: {
                    trip: {
                        id: {
                            in: trips.map(trip => trip.id)
                        }
                    }
                },
                _sum: {
                    amount: true
                },
                _count: {
                    id: true
                }
            }),
            this.prisma.tripExpense.aggregate({
                where: {
                    trip: {
                        id: {
                            in: trips.map(trip => trip.id)
                        }
                    }
                },
                _sum: {
                    amount: true
                },
                _count: {
                    id: true
                }
            })
        ]);

        
        const totalIncome = Number(incomeAgg._sum.amount || 0) + Number(ExtraIncomeAgg._sum.amount || 0);
        const totalExpenses = Number(expensesAgg._sum.amount || 0);
        const tripsCount = trips.length;

        return {
            busId: input.busId,
            date: input.date,
            totalIncome,
            totalExpenses,
            tripsCount
        };
    }
}