export function localDate(instant: string | Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instant));
  const value = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Enumerate calendar nights, rather than rounding elapsed hours across DST. */
export function nightDates(from: string, checkout: string): string[] {
  const dates: string[] = [];
  for (let day = from; day < checkout;) {
    if (dates.length >= 366) throw new RangeError('Stay exceeds supported range');
    dates.push(day);
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return dates;
}

export function safeVnd(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new RangeError('VND overflow');
  return Number(value);
}

/** Policy specifies round-half-up to the nearest VND for taxes, credits and discounts. */
export function basisPoints(vnd: number, bps: number): number {
  return safeVnd((BigInt(vnd) * BigInt(bps) + 5_000n) / 10_000n);
}

export function sumVnd(values: number[]): number {
  return safeVnd(values.reduce((sum, value) => sum + BigInt(value), 0n));
}
