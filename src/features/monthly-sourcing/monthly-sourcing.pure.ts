export interface MonthlySourcingIdentity {
  year: number;
  month: number;
}

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;
const MONTHLY_SOURCING_SLUG = /^thang-([1-9]|1[0-2])-(\d{4})$/;

export function isMonthlySourcingIdentity(value: MonthlySourcingIdentity): boolean {
  return (
    Number.isInteger(value.year) &&
    value.year >= MIN_YEAR &&
    value.year <= MAX_YEAR &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

export function monthlySourcingSlug(year: number, month: number): string {
  if (!isMonthlySourcingIdentity({ year, month })) {
    throw new RangeError("Năm hoặc tháng nguồn hàng không hợp lệ.");
  }
  return `thang-${month}-${year}`;
}

/** Parses only the public LP route form: thang-{1..12}-{YYYY}. */
export function parseMonthlySourcingSlug(value: string): MonthlySourcingIdentity | null {
  const match = MONTHLY_SOURCING_SLUG.exec(value);
  if (!match) return null;
  const month = Number(match[1]);
  const year = Number(match[2]);
  return isMonthlySourcingIdentity({ year, month }) ? { year, month } : null;
}
