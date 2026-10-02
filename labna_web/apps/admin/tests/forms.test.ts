import { describe, expect, it } from 'vitest';
import { fromMinor, money, toMinor } from '../src/lib/format';
import { suggestVariantId, toOpeningHours, validateSchedule, validateVariants, weekdays, type Schedule } from '../src/lib/forms';

describe('money formatting', () => {
  it('parses major units into minor units without floating point drift', () => {
    expect(toMinor('35')).toBe(3500);
    expect(toMinor('35.5')).toBe(3550);
    expect(toMinor('35.05')).toBe(3505);
    expect(toMinor(' ١٢٫٥ ')).toBe(1250);
  });

  it('rejects input that would lose precision', () => {
    expect(toMinor('35.555')).toBeUndefined();
    expect(toMinor('-5')).toBeUndefined();
    expect(toMinor('abc')).toBeUndefined();
    expect(toMinor('')).toBeUndefined();
  });

  it('round-trips through the editor representation', () => {
    expect(toMinor(fromMinor(3505))).toBe(3505);
  });

  it('formats minor units with the currency code', () => {
    expect(money(3500, 'EGP', 'en-US')).toContain('35.00');
    expect(money(3500, 'EGP', 'en-US')).toContain('EGP');
  });
});

describe('schedule validation', () => {
  it('accepts non-overlapping windows', () => {
    expect(validateSchedule([{ label: 'الاثنين', intervals: [{ opensAt: '09:00', closesAt: '13:00' }, { opensAt: '16:00', closesAt: '20:00' }] }])).toEqual([]);
  });

  it('rejects overlapping windows', () => {
    const problems = validateSchedule([{ label: 'الاثنين', intervals: [{ opensAt: '09:00', closesAt: '17:00' }, { opensAt: '16:00', closesAt: '20:00' }] }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('متداخلة');
  });

  it('rejects a window that crosses midnight', () => {
    expect(validateSchedule([{ label: 'الاثنين', intervals: [{ opensAt: '22:00', closesAt: '02:00' }] }])).toHaveLength(1);
  });

  it('flattens the weekly grid into API order', () => {
    const schedule: Schedule[] = weekdays.map(day => ({ weekday: day.value, intervals: day.value === 2 ? [{ opensAt: '10:00', closesAt: '12:00' }] : [] }));
    expect(toOpeningHours(schedule)).toEqual([{ weekday: 2, opensAt: '10:00', closesAt: '12:00' }]);
  });
});

describe('variant validation', () => {
  const base = {
    id: 'milk-full-1l',
    sku: 'MILK-1L',
    label: { ar: 'لتر', en: '1 litre' },
    quantity: 1000,
    unit: 'ml' as const,
    priceMinor: 3500,
    currencyCode: 'EGP',
    isActive: true,
    isNew: false,
  };

  it('accepts a well-formed variant', () => {
    expect(validateVariants([base])).toEqual([]);
  });

  it('rejects duplicate ids and duplicate SKUs', () => {
    const problems = validateVariants([base, { ...base, id: 'other', sku: 'MILK-1L' }]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('MILK-1L');
    const duplicateId = validateVariants([base, { ...base, sku: 'OTHER' }]);
    expect(duplicateId[0]).toContain('milk-full-1l');
  });

  it('rejects a non-positive pack size', () => {
    expect(validateVariants([{ ...base, quantity: 0 }])[0]).toContain('أكبر من صفر');
  });

  it('suggests a unique id and skips collisions', () => {
    expect(suggestVariantId('milk-full', [])).toBe('milk-full-1');
    expect(suggestVariantId('milk-full', ['milk-full-1'])).toBe('milk-full-2');
  });
});
