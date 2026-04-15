import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ReportQueryDto } from './report-query.dto';

export const PERFORMANCE_CATEGORIES = ['DRIVERS', 'CONDUCTORS', 'BUSES'] as const;
export type PerformanceCategory = (typeof PERFORMANCE_CATEGORIES)[number];

export const PERFORMANCE_METRICS = ['income', 'salary', 'expenses'] as const;
export type PerformanceMetric = (typeof PERFORMANCE_METRICS)[number];

function normalizeMetric(value: unknown, fallback?: unknown): string | undefined {
  const source = value ?? fallback;
  if (source == null || source === '') return undefined;

  const first = Array.isArray(source) ? source[0] : String(source).split(',')[0];
  const normalized = String(first).trim().toLowerCase();
  return normalized || undefined;
}

function normalizeEntityIds(value: unknown, fallback?: unknown): string[] | undefined {
  const source = value ?? fallback;
  if (source == null || source === '') return undefined;

  const values = Array.isArray(source) ? source : String(source).split(',');
  const normalized = values
    .flatMap((item) => String(item).split(','))
    .map((item) => item.trim())
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}

export class PerformanceReportQueryDto extends ReportQueryDto {
  @IsEnum(PERFORMANCE_CATEGORIES)
  category!: PerformanceCategory;

  @IsOptional()
  @Transform(({ value }) => normalizeMetric(value))
  @IsEnum(PERFORMANCE_METRICS)
  metrics?: PerformanceMetric;

  @IsOptional()
  @Transform(({ value, obj }) => normalizeMetric(value, obj.metrics))
  @IsEnum(PERFORMANCE_METRICS)
  metric?: PerformanceMetric;

  @IsOptional()
  @Transform(({ value }) => normalizeEntityIds(value))
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  entityId?: string[];

  @IsOptional()
  @Transform(({ value, obj }) => normalizeEntityIds(value, obj.entityId))
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  entityIds?: string[];
}