export type AcademicQuarterPeriod = {
  id: string;
  startsOn: Date;
  endsOn: Date;
};

export function findCurrentQuarter<T extends AcademicQuarterPeriod>(
  quarters: readonly T[],
  date: Date,
): T | null {
  return (
    quarters.find(
      (quarter) => date >= quarter.startsOn && date <= quarter.endsOn,
    ) ?? null
  );
}
