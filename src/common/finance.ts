import { BadRequestException } from '@nestjs/common';
import { ExpenseCategory, ExtraIncomeCategory } from '@prisma/client';

export function decimalToNumber(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return Number(val);
  if (typeof (val as any).toNumber === 'function') return (val as any).toNumber();
  if (typeof (val as any).toString === 'function') return Number((val as any).toString());
  return Number(val);
}

export function normalizeExpenseCategory(input: string): ExpenseCategory {
  const raw = input.trim();
  const upper = raw.toUpperCase();

  switch (raw.toLowerCase()) {
    case 'diesel':
    case 'fuel':
      return 'DIESEL';
    case 'expressway':
      return 'EXPRESSWAY';
    case 'runner':
      return 'RUNNER';
    case 'parking':
      return 'PARKING';
    case 'meals':
    case 'meal_allowance':
    case 'meal-allowance':
      return 'MEAL_ALLOWANCE';
    case 'repairs':
    case 'repair':
      return 'REPAIR';
    case 'other':
      return 'OTHER';
  }

  if ((Object.values(ExpenseCategory) as string[]).includes(upper)) {
    return upper as ExpenseCategory;
  }

  throw new BadRequestException('Invalid expense category');
}

export function mapExpenseCategoryToDashboard(cat: ExpenseCategory): string {
  switch (cat) {
    case 'DIESEL':
      return 'diesel';
    case 'EXPRESSWAY':
      return 'expressway';
    case 'RUNNER':
      return 'runner';
    case 'PARKING':
      return 'parking';
    case 'MEAL_ALLOWANCE':
      return 'meals';
    case 'REPAIR':
      return 'repairs';
    case 'OTHER':
    default:
      return 'other';
  }
}

export function normalizeExtraIncomeCategory(input: string): ExtraIncomeCategory {
  const raw = input.trim();
  const upper = raw.toUpperCase();

  switch (raw.toLowerCase()) {
    case 'parcel':
      return 'PARCEL';
    case 'baggage':
      return 'BAGGAGE';
    case 'other_extra_income':
    case 'other-extra-income':
    case 'other':
      return 'OTHER';
  }

  if ((Object.values(ExtraIncomeCategory) as string[]).includes(upper)) {
    return upper as ExtraIncomeCategory;
  }

  throw new BadRequestException('Invalid extra income category');
}

export function mapExtraIncomeCategoryToDashboard(cat: ExtraIncomeCategory): string {
  switch (cat) {
    case 'PARCEL':
      return 'parcel';
    case 'BAGGAGE':
      return 'baggage';
    case 'OTHER':
    default:
      return 'other_extra_income';
  }
}
