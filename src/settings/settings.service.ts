import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { decimalToNumber } from '../common/finance';
import { UpdateWageDefaultsDto } from './dto/update-wage-defaults.dto';

/** Serialised shape returned to the frontend. */
export type WageDefaultsResponse = {
  defaultDriverPercentage: number | null;
  defaultConductorPercentage: number | null;
  defaultFixedDriverWage: number | null;
  defaultFixedConductorWage: number | null;
  maxCombinedPercentageWarning: number | null;
  /** Convenience flag: true when driver% + conductor% would exceed the warning threshold */
  combinedPercentageExceedsWarning: boolean;
  /** Only present after PATCH — number of buses whose wage settings were updated */
  busesUpdated?: number;
};

function toNullable(val: unknown): number | null {
  const n = decimalToNumber(val);
  return n === 0 ? null : n;
}

function mapToResponse(row: {
  defaultDriverPercentage: Prisma.Decimal | null;
  defaultConductorPercentage: Prisma.Decimal | null;
  defaultFixedDriverWage: Prisma.Decimal | null;
  defaultFixedConductorWage: Prisma.Decimal | null;
  maxCombinedPercentageWarning: Prisma.Decimal | null;
}): WageDefaultsResponse {
  const driverPct = toNullable(row.defaultDriverPercentage);
  const conductorPct = toNullable(row.defaultConductorPercentage);
  const maxWarning = toNullable(row.maxCombinedPercentageWarning);

  const combined = (driverPct ?? 0) + (conductorPct ?? 0);
  const exceeds = maxWarning !== null && combined > maxWarning;

  return {
    defaultDriverPercentage: driverPct,
    defaultConductorPercentage: conductorPct,
    defaultFixedDriverWage: toNullable(row.defaultFixedDriverWage),
    defaultFixedConductorWage: toNullable(row.defaultFixedConductorWage),
    maxCombinedPercentageWarning: maxWarning,
    combinedPercentageExceedsWarning: exceeds,
  };
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /settings/wage-defaults
   * Returns the company's wage defaults. Creates a blank record lazily if none exists.
   */
  async getWageDefaults(companyId: string): Promise<WageDefaultsResponse> {
    const row = await this.prisma.companySettings.upsert({
      where: { companyId },
      create: { companyId },
      update: {},
    });
    return mapToResponse(row);
  }

  /**
   * PATCH /settings/wage-defaults
   * Updates only the fields supplied in the DTO (all optional).
   */
  async updateWageDefaults(
    companyId: string,
    dto: UpdateWageDefaultsDto,
  ): Promise<WageDefaultsResponse> {
    const fields: {
      defaultDriverPercentage?: Prisma.Decimal;
      defaultConductorPercentage?: Prisma.Decimal;
      defaultFixedDriverWage?: Prisma.Decimal;
      defaultFixedConductorWage?: Prisma.Decimal;
      maxCombinedPercentageWarning?: Prisma.Decimal;
    } = {};

    if (dto.defaultDriverPercentage !== undefined)
      fields.defaultDriverPercentage = new Prisma.Decimal(dto.defaultDriverPercentage);
    if (dto.defaultConductorPercentage !== undefined)
      fields.defaultConductorPercentage = new Prisma.Decimal(dto.defaultConductorPercentage);
    if (dto.defaultFixedDriverWage !== undefined)
      fields.defaultFixedDriverWage = new Prisma.Decimal(dto.defaultFixedDriverWage);
    if (dto.defaultFixedConductorWage !== undefined)
      fields.defaultFixedConductorWage = new Prisma.Decimal(dto.defaultFixedConductorWage);
    if (dto.maxCombinedPercentageWarning !== undefined)
      fields.maxCombinedPercentageWarning = new Prisma.Decimal(dto.maxCombinedPercentageWarning);

    const row = await this.prisma.companySettings.upsert({
      where: { companyId },
      create: { companyId, ...fields },
      update: fields,
    });

    let busesUpdated: number | undefined;

    if (dto.applyToBuses) {
      // Build bus update fields from the current saved settings row
      const busFields: {
        driverPercentage?: Prisma.Decimal;
        conductorPercentage?: Prisma.Decimal;
        fixedDriverWage?: Prisma.Decimal;
        fixedConductorWage?: Prisma.Decimal;
      } = {};

      if (row.defaultDriverPercentage !== null)
        busFields.driverPercentage = row.defaultDriverPercentage;
      if (row.defaultConductorPercentage !== null)
        busFields.conductorPercentage = row.defaultConductorPercentage;
      if (row.defaultFixedDriverWage !== null)
        busFields.fixedDriverWage = row.defaultFixedDriverWage;
      if (row.defaultFixedConductorWage !== null)
        busFields.fixedConductorWage = row.defaultFixedConductorWage;

      if (Object.keys(busFields).length > 0) {
        // overwriteAll=true  → all active buses
        // overwriteAll=false → only buses with no wage info configured
        const busWhere = dto.overwriteAll
          ? { companyId, isActive: true }
          : {
              companyId,
              isActive: true,
              driverPercentage: null,
              conductorPercentage: null,
              fixedDriverWage: null,
              fixedConductorWage: null,
            };

        const { count } = await this.prisma.bus.updateMany({
          where: busWhere,
          data: busFields,
        });
        busesUpdated = count;
      } else {
        busesUpdated = 0;
      }
    }

    return { ...mapToResponse(row), busesUpdated };
  }
}
