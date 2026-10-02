/**
 * Branch presentation helpers, kept free of React so the customer-facing rules are
 * unit testable and shared by the Home preview and the Branches page.
 *
 * Two domain rules shape this module:
 *
 *  - `dateOverrides` are intentionally not part of the public branch payload, so
 *    the storefront cannot recompute closures itself. Open/closed state therefore
 *    always comes from the API (`isOpen` / `nextOpensAt`), which already applies
 *    overrides in the branch time zone. The weekly schedule below is labelled as
 *    the regular recurring hours rather than a promise for a specific date.
 *  - ISO weekdays are 1 (Monday) to 7 (Sunday), which is the display order here.
 */
import type { BranchInput } from '@labna/contracts';
import type { Locale, PublicBranch } from './types';

/** Derived from the shared branch contract so the shape cannot drift. */
type ContractInterval = BranchInput['openingHours'][number];
/** A single open/close pair; `weekday` is implied by the row it belongs to. */
export type Interval = Omit<ContractInterval, 'weekday'>;

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 7] as const;

const weekdayNames: Record<Locale, Record<number, string>> = {
  en: { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' },
  ar: { 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' },
};

const weekdayShort: Record<Locale, Record<number, string>> = {
  en: { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' },
  ar: { 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' },
};

export type ScheduleRow = { weekdays: number[]; intervals: Interval[] };

function sameIntervals(a: Interval[], b: Interval[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, index) => item.opensAt === b[index]?.opensAt && item.closesAt === b[index]?.closesAt);
}

/**
 * Buckets the flat interval list per weekday, then merges consecutive weekdays
 * that share an identical set of intervals so the schedule stays readable.
 * Days without intervals are preserved as explicit "closed" rows.
 */
export function groupSchedule(hours: readonly ContractInterval[] = []): ScheduleRow[] {
  const byDay = new Map<number, Interval[]>();
  for (const item of hours) {
    if (!item || item.weekday < 1 || item.weekday > 7) continue;
    const { weekday, ...interval } = item;
    byDay.set(weekday, [...(byDay.get(weekday) ?? []), interval]);
  }
  for (const list of byDay.values()) list.sort((a, b) => a.opensAt.localeCompare(b.opensAt));

  const rows: ScheduleRow[] = [];
  for (const weekday of WEEKDAY_ORDER) {
    const intervals = byDay.get(weekday) ?? [];
    const previous = rows.at(-1);
    if (previous && sameIntervals(previous.intervals, intervals)) previous.weekdays.push(weekday);
    else rows.push({ weekdays: [weekday], intervals });
  }
  return rows;
}

/** "Mon – Thu", "Friday", "Sat, Sun". */
export function weekdayLabel(weekdays: number[], locale: Locale, short = true): string {
  const names = short ? weekdayShort[locale] : weekdayNames[locale];
  if (weekdays.length === 0) return '';
  const first = weekdays[0];
  const last = weekdays.at(-1);
  if (first === undefined || last === undefined) return '';
  if (weekdays.length === 1) return names[first] ?? '';
  const consecutive = weekdays.every((day, index) => index === 0 || day === weekdays[index - 1]! + 1);
  if (consecutive && last - first + 1 === weekdays.length) return `${names[first]} – ${names[last]}`;
  return weekdays.map((day) => names[day] ?? '').join(locale === 'ar' ? '، ' : ', ');
}

/**
 * Formats a 24-hour "HH:mm" contract string with locale digits while keeping the
 * unambiguous 24-hour form. Parsing happens per component so no Date object —
 * and therefore no implicit time zone — is ever involved.
 */
export function formatClock(value: string, locale: Locale): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const formatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    minimumIntegerDigits: 2,
    useGrouping: false,
  });
  return `${formatter.format(Number(match[1]))}:${formatter.format(Number(match[2]))}`;
}

export function formatIntervals(intervals: Interval[], locale: Locale): string {
  if (intervals.length === 0) return '';
  return intervals
    .map((item) => `${formatClock(item.opensAt, locale)} – ${formatClock(item.closesAt, locale)}`)
    .join(locale === 'ar' ? '، ' : ', ');
}

export function hasSchedule(branch: Pick<PublicBranch, 'openingHours'>): boolean {
  return Array.isArray(branch.openingHours) && branch.openingHours.length > 0;
}

/** True when the payload carries usable coordinates for a directions link. */
export function hasCoordinates(branch: Pick<PublicBranch, 'coordinate'>): boolean {
  const { latitude, longitude } = branch.coordinate ?? {};
  return Number.isFinite(latitude) && Number.isFinite(longitude);
}

/**
 * External directions deep link. Deliberately no map SDK: the demo needs a
 * useful action, not a rendered map.
 */
export function directionsURL(branch: Pick<PublicBranch, 'coordinate'>): string | null {
  if (!hasCoordinates(branch)) return null;
  const { latitude, longitude } = branch.coordinate;
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

export function coordinatesLabel(branch: Pick<PublicBranch, 'coordinate'>, locale: Locale): string | null {
  if (!hasCoordinates(branch)) return null;
  const formatter = new Intl.NumberFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
  return `${formatter.format(branch.coordinate.latitude)}, ${formatter.format(branch.coordinate.longitude)}`;
}

export function telHref(phoneNumber: string | null | undefined): string | null {
  if (typeof phoneNumber !== 'string') return null;
  const trimmed = phoneNumber.trim();
  return /^\+[1-9]\d{7,14}$/.test(trimmed) ? `tel:${trimmed}` : null;
}

export type BranchStatus = { tone: 'open' | 'closed'; label: string; detail?: string };

const copy = {
  open: { ar: 'مفتوح الآن', en: 'Open now' },
  closed: { ar: 'مغلق الآن', en: 'Closed now' },
  opensAt: { ar: 'يفتح', en: 'Opens' },
  noSchedule: { ar: 'دوام غير محدد', en: 'Hours not published' },
};

/**
 * Customer-facing open/closed label. Uses the API's authoritative state and only
 * adds a "next opening" line when the branch is shut and the API supplied one;
 * nothing is guessed when the schedule is absent.
 */
export function branchStatus(branch: Pick<PublicBranch, 'isOpen' | 'nextOpensAt' | 'openingHours' | 'timeZoneIdentifier'>, locale: Locale): BranchStatus {
  const scheduled = hasSchedule(branch);
  if (branch.isOpen) return { tone: 'open', label: copy.open[locale] };
  if (!scheduled) return { tone: 'closed', label: copy.closed[locale], detail: copy.noSchedule[locale] };
  if (!branch.nextOpensAt) return { tone: 'closed', label: copy.closed[locale] };

  const when = formatNextOpening(branch.nextOpensAt, branch.timeZoneIdentifier, locale);
  return { tone: 'closed', label: copy.closed[locale], detail: when ? `${copy.opensAt[locale]} ${when}` : undefined };
}

/**
 * Renders the next opening in the branch's own time zone, so the customer sees
 * the shop's local clock rather than the viewer's.
 */
export function formatNextOpening(iso: string, timeZone: string, locale: Locale): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-EG', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date);
  } catch {
    // An invalid stored time zone must not break the page.
    return null;
  }
}