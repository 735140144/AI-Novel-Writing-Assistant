const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function getUtc8DayKey(value: Date): string {
  const shifted = new Date(value.getTime() + UTC8_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}

export function getUtc8StartOfDay(value: Date): Date {
  const dayKey = getUtc8DayKey(value);
  return new Date(`${dayKey}T00:00:00.000+08:00`);
}

export function getNextUtc8Midnight(value: Date): Date {
  return new Date(getUtc8StartOfDay(value).getTime() + DAY_MS);
}

export function getUtc8Now(now = new Date()): Date {
  return new Date(now.getTime());
}
