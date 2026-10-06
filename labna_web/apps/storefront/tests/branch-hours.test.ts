import { describe, expect, it } from 'vitest';
import { branchStatus, coordinatesLabel, directionsURL, formatClock, formatIntervals, formatNextOpening, groupSchedule, hasCoordinates, hasSchedule, telHref, weekdayLabel } from '../src/branch-hours';
import type { PublicBranch } from '../src/types';

const branch = (overrides: Partial<PublicBranch> = {}): PublicBranch => ({
  id: 'main',
  name: { ar: 'الفرع', en: 'Branch' },
  address: { ar: 'العنوان', en: 'Address' },
  coordinate: { latitude: 30.0444, longitude: 31.2357 },
  phoneNumber: '+201012345678',
  timeZoneIdentifier: 'Africa/Cairo',
  openingHours: [],
  pickupEnabled: true,
  acceptsOrders: true,
  isDemo: false,
  isOpen: false,
  nextOpensAt: null,
  ...overrides,
});

describe('weekly schedule grouping', () => {
  it('merges consecutive weekdays that share the same intervals', () => {
    const rows = groupSchedule([
      { weekday: 1, opensAt: '09:00', closesAt: '22:00' },
      { weekday: 2, opensAt: '09:00', closesAt: '22:00' },
      { weekday: 3, opensAt: '09:00', closesAt: '22:00' },
      { weekday: 4, opensAt: '09:00', closesAt: '22:00' },
      { weekday: 5, opensAt: '13:00', closesAt: '22:00' },
      { weekday: 6, opensAt: '09:00', closesAt: '22:00' },
      { weekday: 7, opensAt: '09:00', closesAt: '22:00' },
    ]);
    expect(rows.map((row) => [row.weekdays, row.intervals])).toEqual([
      [[1, 2, 3, 4], [{ opensAt: '09:00', closesAt: '22:00' }]],
      [[5], [{ opensAt: '13:00', closesAt: '22:00' }]],
      [[6, 7], [{ opensAt: '09:00', closesAt: '22:00' }]],
    ]);
  });

  it('keeps a closed day as an explicit row instead of dropping it', () => {
    const rows = groupSchedule([{ weekday: 1, opensAt: '09:00', closesAt: '17:00' }]);
    expect(rows).toEqual([
      { weekdays: [1], intervals: [{ opensAt: '09:00', closesAt: '17:00' }] },
      { weekdays: [2, 3, 4, 5, 6, 7], intervals: [] },
    ]);
  });

  it('handles split shifts within one day', () => {
    const rows = groupSchedule([
      { weekday: 1, opensAt: '15:00', closesAt: '21:00' },
      { weekday: 1, opensAt: '09:00', closesAt: '12:00' },
    ]);
    expect(rows[0]?.intervals).toEqual([
      { opensAt: '09:00', closesAt: '12:00' },
      { opensAt: '15:00', closesAt: '21:00' },
    ]);
    expect(formatIntervals(rows[0]!.intervals, 'en')).toBe('09:00 – 12:00, 15:00 – 21:00');
  });

  it('survives missing and out-of-range input', () => {
    // With nothing published every weekday collapses into one closed row; the UI
    // never renders a schedule in that case, so the merged row is harmless.
    expect(groupSchedule()).toEqual([{ weekdays: [1, 2, 3, 4, 5, 6, 7], intervals: [] }]);
    expect(groupSchedule([])).toEqual(groupSchedule());
    expect(groupSchedule([{ weekday: 9, opensAt: '09:00', closesAt: '10:00' }] as never)).toEqual(groupSchedule());
  });
});

describe('weekday and clock labels', () => {
  it('renders single, consecutive and non-consecutive weekday ranges', () => {
    expect(weekdayLabel([5], 'en')).toBe('Fri');
    expect(weekdayLabel([1, 2, 3, 4], 'en')).toBe('Mon – Thu');
    expect(weekdayLabel([6, 7], 'en')).toBe('Sat – Sun');
    expect(weekdayLabel([1, 3], 'en')).toBe('Mon, Wed');
    expect(weekdayLabel([5], 'ar')).toBe('الجمعة');
    expect(weekdayLabel([], 'en')).toBe('');
  });

  it('formats 24-hour clocks with locale digits and keeps the 24-hour form', () => {
    expect(formatClock('09:00', 'en')).toBe('09:00');
    expect(formatClock('21:05', 'en')).toBe('21:05');
    // Arabic locale renders Arabic-Indic digits without inventing a 12-hour clock.
    expect(formatClock('09:00', 'ar')).not.toBe('09:00');
    expect(formatClock('21:05', 'ar')).toMatch(/٢١:٠٥/);
    expect(formatClock('nonsense', 'en')).toBe('nonsense');
  });
});

describe('contact and location actions', () => {
  it('builds a tel link only for contract-valid numbers', () => {
    expect(telHref('+201012345678')).toBe('tel:+201012345678');
    expect(telHref(null)).toBeNull();
    expect(telHref('0123456')).toBeNull();
    expect(telHref('  ')).toBeNull();
  });

  it('builds an external directions link without a map dependency', () => {
    const url = directionsURL(branch());
    expect(url).toContain('30.0444');
    expect(url).toContain('31.2357');
    expect(url?.startsWith('https://')).toBe(true);
  });

  it('omits location data when coordinates are unusable', () => {
    const broken = branch({ coordinate: { latitude: Number.NaN, longitude: 10 } });
    expect(hasCoordinates(broken)).toBe(false);
    expect(directionsURL(broken)).toBeNull();
    expect(coordinatesLabel(broken, 'en')).toBeNull();
  });

  it('labels coordinates in the active locale', () => {
    expect(coordinatesLabel(branch(), 'en')).toBe('30.0444, 31.2357');
    expect(coordinatesLabel(branch(), 'ar')).not.toBe('30.0444, 31.2357');
  });
});

describe('customer facing status', () => {
  it('reports open without advertising a next opening', () => {
    expect(branchStatus(branch({ isOpen: true, nextOpensAt: null }), 'en')).toEqual({ tone: 'open', label: 'Open now' });
  });

  it('reports closed with the next opening rendered in the branch time zone', () => {
    const status = branchStatus(branch({ isOpen: false, nextOpensAt: '2026-10-05T06:00:00.000Z', openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '22:00' }] }), 'en');
    expect(status.tone).toBe('closed');
    expect(status.label).toBe('Closed now');
    // 06:00Z is 09:00 in Africa/Cairo, so the local opening time is shown.
    expect(status.detail).toContain('9:00');
    expect(status.detail?.startsWith('Opens')).toBe(true);
  });

  it('does not guess a schedule when the branch publishes none', () => {
    const status = branchStatus(branch({ isOpen: false, openingHours: [], nextOpensAt: null }), 'en');
    expect(status).toEqual({ tone: 'closed', label: 'Closed now', detail: 'Hours not published' });
    expect(hasSchedule(branch({ openingHours: [] }))).toBe(false);
  });

  it('omits the detail line when the API has no next opening', () => {
    const status = branchStatus(branch({ isOpen: false, openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '22:00' }], nextOpensAt: null }), 'en');
    expect(status).toEqual({ tone: 'closed', label: 'Closed now' });
  });

  it('localizes the status copy', () => {
    expect(branchStatus(branch({ isOpen: true }), 'ar').label).toBe('مفتوح الآن');
    expect(branchStatus(branch({ isOpen: false }), 'ar').label).toBe('مغلق الآن');
  });

  it('tolerates an invalid stored time zone instead of throwing', () => {
    expect(formatNextOpening('2026-10-05T06:00:00.000Z', 'Not/AZone', 'en')).toBeNull();
    // An unparseable timestamp must not become a bogus "opens at" claim.
    const status = branchStatus(branch({ isOpen: false, openingHours: [{ weekday: 1, opensAt: '09:00', closesAt: '22:00' }], nextOpensAt: 'nonsense' }), 'en');
    expect(status).toEqual({ tone: 'closed', label: 'Closed now' });
  });
});
