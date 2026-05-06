import { Prisma } from "@prisma/client";

export const DECIMAL_ZERO = new Prisma.Decimal(0);
export const ONE_MILLION = new Prisma.Decimal(1_000_000);

export interface BillingTokenUsage {
  promptTokens: number;
  completionTokens: number;
  cacheHitTokens: number;
  totalTokens: number;
}

export interface BillingChargeResult {
  inputCost: Prisma.Decimal;
  outputCost: Prisma.Decimal;
  cacheHitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
}

export interface BillingAllocationResult {
  packageChargedAmount: Prisma.Decimal;
  walletChargedAmount: Prisma.Decimal;
  packageRemainingAmount: Prisma.Decimal;
  walletBalanceAmount: Prisma.Decimal;
}

export function toDecimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) {
    return value;
  }
  if (value == null || value === "") {
    return DECIMAL_ZERO;
  }
  return new Prisma.Decimal(value);
}

export function toNumber(value: Prisma.Decimal | string | number | null | undefined): number {
  return Number(toDecimal(value).toString());
}

export function decimalLikeToNumber(value: { toString(): string } | null | undefined): number {
  return value == null ? 0 : Number(value.toString());
}

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(8, Prisma.Decimal.ROUND_HALF_UP);
}

export function isPositiveDecimal(value: Prisma.Decimal | string | number | null | undefined): boolean {
  return toDecimal(value).greaterThan(0);
}
