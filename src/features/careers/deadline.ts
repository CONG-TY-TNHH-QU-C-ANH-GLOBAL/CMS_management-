// Deadline parser. Job deadlines are operator-entered free-text — usually
// DD/MM/YYYY in Vietnamese conventions but we accept ISO and dash separators
// too. Returns null when the string can't be parsed; callers treat null as
// "no deadline → always open".

export function parseDeadline(s: string | null | undefined): Date | null {
  if (!s) return null;
  const trimmed = s.trim();
  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO YYYY-MM-DD
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function isPastDeadline(s: string | null | undefined): boolean {
  const d = parseDeadline(s);
  if (!d) return false; // unparseable or absent → treat as open
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}
