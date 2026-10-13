import { DateTime } from 'luxon';
export const MINUTE = 60_000;
export const minute = (ts) => Math.floor(ts / MINUTE) * MINUTE;
export function ranges(settings, now = Date.now()) {
  const local = DateTime.fromMillis(now, { zone: settings.timezone });
  const boundary = (date) => date.startOf('day').set({ hour: settings.resetHour });
  let day = boundary(local);
  if (day.toMillis() > now) day = boundary(local.minus({ days: 1 }));
  return {
    daily: day.toMillis(),
    weekly: boundary(day.minus({ days: 6 })).toMillis(),
    monthly: boundary(day.minus({ days: 29 })).toMillis(),
    rolling24: minute(now - 86400000),
    rolling7: minute(now - 7 * 86400000),
  };
}
export function* splitMinutes(start, end) {
  while (start < end) {
    const bucket = minute(start);
    const next = Math.min(end, bucket + MINUTE);
    yield { bucket, duration: next - start };
    start = next;
  }
}
export function duration(ms = 0) {
  const mins = Math.floor(ms / 60000);
  return `${Math.floor(mins / 60).toLocaleString('tr-TR')} sa ${mins % 60} dk`;
}
export const number = (n) => Number(n || 0).toLocaleString('tr-TR');
export const timestamp = (ts) => (ts ? `<t:${Math.floor(ts / 1000)}:R>` : 'Henüz yok');
