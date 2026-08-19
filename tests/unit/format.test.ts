import { describe, expect, it } from 'vitest';

import { formatDate, formatDateTime, formatEuro, formatTime } from '@/lib/format';

/**
 * The panel is read in Madrid.
 *
 * The case that matters is a timestamp just after midnight UTC: in Madrid that
 * is already the next day, and a formatter that took the machine's timezone
 * rendered a callback due tomorrow as due today. Two of the eight formatters
 * this replaces did exactly that.
 */
describe('date formatting', () => {
  it('renders a UTC midnight in the Madrid day, not the machine day', () => {
    // 2026-06-30T23:30Z is 01:30 on 1 July in Madrid (CEST, UTC+2).
    expect(formatDate('2026-06-30T23:30:00.000Z')).toBe('01.07.2026');
    expect(formatDateTime('2026-06-30T23:30:00.000Z')).toBe('01.07.2026, 01:30');
  });

  it('follows the summer/winter shift rather than a fixed offset', () => {
    // Winter is UTC+1, so the same wall-clock UTC lands an hour earlier.
    expect(formatTime('2026-01-15T12:00:00.000Z')).toBe('13:00');
    expect(formatTime('2026-07-15T12:00:00.000Z')).toBe('14:00');
  });

  it('accepts a Date, an ISO string and a timestamp alike', () => {
    const iso = '2026-03-08T10:00:00.000Z';
    expect(formatDate(new Date(iso))).toBe(formatDate(iso));
    expect(formatDate(new Date(iso).getTime())).toBe(formatDate(iso));
  });

  it('formats money the way the invoices do', () => {
    // The thousands separator Intl emits is a non-breaking space, not a plain
    // one — asserted loosely so the test does not depend on which of the two
    // the ICU data of the day happens to use.
    expect(formatEuro(1250)).toMatch(/^1\s250\s€$/u);
  });
});
