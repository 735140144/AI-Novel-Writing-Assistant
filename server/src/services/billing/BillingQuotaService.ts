import { Prisma } from "@prisma/client";
import { DECIMAL_ZERO, toDecimal, type BillingAllocationResult } from "./billingTypes";

export function allocateBillingCharge(input: {
  packageRemainingAmount: Prisma.Decimal | number | string | null | undefined;
  walletBalanceAmount: Prisma.Decimal | number | string | null | undefined;
  chargeAmount: Prisma.Decimal | number | string;
}): BillingAllocationResult {
  const packageRemainingAmount = toDecimal(input.packageRemainingAmount);
  const walletBalanceAmount = toDecimal(input.walletBalanceAmount);
  const chargeAmount = toDecimal(input.chargeAmount);
  const packageChargedAmount = Prisma.Decimal.min(packageRemainingAmount, chargeAmount);
  const walletChargedAmount = Prisma.Decimal.max(DECIMAL_ZERO, chargeAmount.minus(packageChargedAmount));

  return {
    packageChargedAmount,
    walletChargedAmount,
    packageRemainingAmount: packageRemainingAmount.minus(packageChargedAmount),
    walletBalanceAmount: walletBalanceAmount.minus(walletChargedAmount),
  };
}
