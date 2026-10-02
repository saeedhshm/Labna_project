/**
 * Pure helpers behind the forms. Kept out of the components so the rules that
 * protect catalog integrity can be unit tested without rendering.
 */
import type { BranchInput, VariantInput } from '@labna/contracts';

export const weekdays = [
  { value: 1, ar: 'الاثنين', en: 'Monday' },
  { value: 2, ar: 'الثلاثاء', en: 'Tuesday' },
  { value: 3, ar: 'الأربعاء', en: 'Wednesday' },
  { value: 4, ar: 'الخميس', en: 'Thursday' },
  { value: 5, ar: 'الجمعة', en: 'Friday' },
  { value: 6, ar: 'السبت', en: 'Saturday' },
  { value: 7, ar: 'الأحد', en: 'Sunday' },
] as const;

export type Interval = { opensAt: string; closesAt: string };

/** One weekday row in the editor. Presentation labels live in `weekdays`. */
export type Schedule = { weekday: number; intervals: Interval[] };
export type DateOverride = { date: string; intervals: Interval[] };

/**
 * The API rejects overlapping windows and windows crossing midnight. Detecting
 * them here gives immediate feedback instead of a round trip.
 */
export function validateSchedule(groups: { label: string; intervals: Interval[] }[]): string[] {
  const problems: string[] = [];
  for (const group of groups) {
    const sorted = [...group.intervals].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
    sorted.forEach((interval, index) => {
      if (interval.opensAt >= interval.closesAt) problems.push(`${group.label}: وقت الفتح يجب أن يسبق وقت الإغلاق.`);
      if (index > 0 && sorted[index - 1].closesAt > interval.opensAt) problems.push(`${group.label}: الفترات متداخلة.`);
    });
  }
  return problems;
}

export const weekdayLabel = (weekday: number) => weekdays.find(day => day.value === weekday)?.ar ?? String(weekday);

/** A full Monday-first week with every day closed, the starting point for a new branch. */
export const emptySchedule = (): Schedule[] => weekdays.map(day => ({ weekday: day.value, intervals: [] }));

/** Monday-first, in the order the API validates. */
export const sortSchedule = (schedule: Schedule[]) => [...schedule].sort((a, b) => a.weekday - b.weekday);

export const fromOpeningHours = (openingHours: BranchInput['openingHours']): Schedule[] =>
  weekdays.map(day => ({
    weekday: day.value,
    intervals: openingHours.filter(item => item.weekday === day.value).map(({ opensAt, closesAt }) => ({ opensAt, closesAt })),
  }));

export const toOpeningHours = (schedule: Schedule[]): BranchInput['openingHours'] =>
  schedule.flatMap(day => day.intervals.map(interval => ({ weekday: day.weekday, ...interval })));

export type VariantDraft = VariantInput & { isNew: boolean };

/** IDs and SKUs are unique within a product, and a variant can never be deleted. */
export function validateVariants(drafts: VariantDraft[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const skus = new Set<string>();
  for (const draft of drafts) {
    const id = draft.id.trim();
    const sku = draft.sku.trim();
    if (!id) problems.push('معرّف الخيار مطلوب.');
    else if (ids.has(id)) problems.push(`معرّف الخيار مكرر: ${id}`);
    ids.add(id);
    if (!sku) problems.push(`رمز الصنف مطلوب للخيار ${id || '(بلا معرّف)'}.`);
    else if (skus.has(sku)) problems.push(`رمز الصنف مكرر: ${sku}`);
    skus.add(sku);
    if (draft.quantity <= 0) problems.push(`حجم العبوة يجب أن يكون أكبر من صفر للخيار ${id}.`);
    if (draft.priceMinor < 0) problems.push(`السعر لا يمكن أن يكون سالبًا للخيار ${id}.`);
  }
  return problems;
}

/** Suggests a readable variant ID from the product ID, without colliding with existing ones. */
export function suggestVariantId(productId: string, existing: string[]): string {
  let index = 1;
  let candidate = `${productId || 'product'}-${index}`;
  while (existing.includes(candidate)) {
    index += 1;
    candidate = `${productId || 'product'}-${index}`;
  }
  return candidate;
}
