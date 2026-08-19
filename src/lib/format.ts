/**
 * Dates, as the studio reads them.
 *
 * Every formatter here pins `Europe/Madrid`. That is not tidiness: the eight
 * hand-rolled formatters this replaces mostly did pin it, and the two that did
 * not — the task due date in the lead card, the revision timestamp in the
 * editor — fell back to whatever timezone the machine was in. On a server in
 * UTC a callback due at 00:30 Madrid time renders as the previous day, and the
 * person reading it thinks they are already late.
 *
 * The site is a Spanish studio serving Russian-speaking clients: one timezone,
 * one locale for numbers, no per-user preference to thread through.
 */
const TIME_ZONE = 'Europe/Madrid';
const LOCALE = 'ru-RU';

const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
});

const dayMonthYear = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const shortDate = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

const dateTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const dayMonthTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const timeOnly = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
});

type DateInput = Date | string | number;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 05.11 */
export const formatDayMonth = (value: DateInput) => dayMonth.format(toDate(value));
/** 05.11.2026 */
export const formatDate = (value: DateInput) => dayMonthYear.format(toDate(value));
/** 05.11.26 */
export const formatShortDate = (value: DateInput) => shortDate.format(toDate(value));
/** 05.11.2026, 18:40 */
export const formatDateTime = (value: DateInput) => dateTime.format(toDate(value));
/** 05.11, 18:40 */
export const formatDayMonthTime = (value: DateInput) => dayMonthTime.format(toDate(value));
/** 18:40 */
export const formatTime = (value: DateInput) => timeOnly.format(toDate(value));

/** 1 250 € */
export function formatEuro(amount: number): string {
  return `${amount.toLocaleString(LOCALE)} €`;
}
