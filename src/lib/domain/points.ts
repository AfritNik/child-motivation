export function calculateCappedEarning(
  currentBalance: number,
  balanceLimit: number,
  requestedAmount: number,
): number {
  if (requestedAmount <= 0 || currentBalance >= balanceLimit) {
    return 0;
  }

  return Math.min(requestedAmount, balanceLimit - currentBalance);
}

export function calculateCorrectedBalance(
  currentBalance: number,
  balanceLimit: number,
  correction: number,
): number | null {
  if (!Number.isInteger(correction) || correction === 0) return null;

  const nextBalance = currentBalance + correction;
  return nextBalance >= 0 && nextBalance <= balanceLimit ? nextBalance : null;
}
