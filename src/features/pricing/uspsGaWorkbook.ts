import * as XLSX from "xlsx";
import { USPS_GA_WEIGHTS, type UspsGaRow } from "./uspsGa.constants";

export type { UspsGaRow } from "./uspsGa.constants";

const headers = [
  "STT",
  "Cân nặng không quá (ounce)",
  "Gram",
  ...Array.from({ length: 9 }, (_, i) => `Zone ${i + 1}`),
];
const weights = USPS_GA_WEIGHTS;

/** Parse and validate the entire workbook before returning any tier data. */
export function parseUspsGaWorkbook(buffer: ArrayBuffer): UspsGaRow[][] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const names = Array.from({ length: 5 }, (_, i) => `Tier ${i + 1}`);
  if (workbook.SheetNames.length !== names.length || names.some((name) => !workbook.Sheets[name])) {
    throw new Error("Workbook must contain exactly Tier 1 through Tier 5");
  }
  return names.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      defval: null,
      blankrows: true,
    });
    const header = rows[3];
    if (
      !header ||
      headers.some((value, i) => header[i] !== value) ||
      header.slice(headers.length).some((value) => value != null && value !== "")
    ) {
      throw new Error(`${name}: invalid header`);
    }
    const data = rows.slice(4).filter((row) => row.some((value) => value != null && value !== ""));
    if (data.length !== 24) throw new Error(`${name}: expected 24 rows`);
    return data.map((row, index) => {
      if (
        row[0] !== index + 1 ||
        row[1] !== `${weights[index]} oz` ||
        typeof row[2] !== "number" ||
        !Number.isFinite(row[2]) ||
        row[2] < 0 ||
        row.slice(12).some((value) => value != null && value !== "")
      ) {
        throw new Error(`${name}: invalid weight row ${index + 1}`);
      }
      const prices = row.slice(3, 12);
      if (
        prices.length !== 9 ||
        prices.some((value) => typeof value !== "number" || !Number.isFinite(value) || value < 0)
      ) {
        throw new Error(`${name}: invalid price row ${index + 1}`);
      }
      const [z1, z2, z3, z4, z5, z6, z7, z8, z9] = prices as number[];
      return { oz: weights[index], g: row[2] as number, z1, z2, z3, z4, z5, z6, z7, z8, z9 };
    });
  });
}
