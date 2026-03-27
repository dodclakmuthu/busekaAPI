const SRI_LANKA_OFFSET_MINUTES = 330;

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

/**
 * Returns the YYYY-MM-DD for "now" in Sri Lanka local time.
 * We store business-day dates in the DB as UTC midnights of that local date.
 */
export function getSriLankaTodayYmd(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + SRI_LANKA_OFFSET_MINUTES * 60_000);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const d = shifted.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(ymd);
  if (!m) throw new Error('Invalid date format (expected YYYY-MM-DD)');
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new Error('Invalid date');
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error('Invalid date');
  }
  return { year, month, day };
}

export function getBusinessDayRangeUtc(input?: { date?: string; today?: boolean }) {
  let ymd: string | null = null;

  if (input?.today) {
    ymd = getSriLankaTodayYmd();
  } else if (input?.date) {
    ymd = input.date.length >= 10 ? input.date.slice(0, 10) : input.date;
  }

  if (!ymd) return null;

  const { year, month, day } = parseYmd(ymd);
  const start = new Date(Date.UTC(year, month - 1, day));
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end, ymd };
}

export function formatHHMMInSriLanka(d: Date): string {
  const shifted = new Date(d.getTime() + SRI_LANKA_OFFSET_MINUTES * 60_000);
  return `${pad2(shifted.getUTCHours())}:${pad2(shifted.getUTCMinutes())}`;
}
