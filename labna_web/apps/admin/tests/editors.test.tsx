import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VariantEditor } from '../src/components/VariantEditor';
import { OpeningHoursEditor } from '../src/components/OpeningHoursEditor';
import { weekdays, type DateOverride, type Schedule } from '../src/lib/forms';

const variant = (id: string, isNew: boolean) => ({
  id,
  sku: id.toUpperCase(),
  label: { ar: '', en: '' },
  quantity: 1000,
  unit: 'ml' as const,
  priceMinor: 3500,
  currencyCode: 'EGP',
  isActive: true,
  isNew,
});

describe('VariantEditor', () => {
  it('locks the id of an existing variant and blocks its deletion', async () => {
    const onChange = vi.fn();
    render(<VariantEditor productId="milk" drafts={[variant('milk-1', false)]} currencyCode="EGP" onChange={onChange} />);

    expect(screen.getByDisplayValue('milk-1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'حذف' })).not.toBeInTheDocument();
    expect(screen.getByText('موجود مسبقًا: لا يُحذف، بل يُعطّل')).toBeInTheDocument();
  });

  it('allows a new variant to be removed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<VariantEditor productId="milk" drafts={[variant('milk-1', true)]} currencyCode="EGP" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'حذف' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('appends a suggested unique id when adding a variant', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<VariantEditor productId="milk" drafts={[variant('milk-1', true)]} currencyCode="EGP" onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'إضافة خيار' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const [next] = onChange.mock.calls[0];
    expect(next).toHaveLength(2);
    expect(next[1]).toMatchObject({ id: 'milk-2', isNew: true, currencyCode: 'EGP' });
  });

  it('surfaces duplicate SKUs before the request is sent', () => {
    render(
      <VariantEditor
        productId="milk"
        drafts={[variant('milk-1', true), { ...variant('milk-2', true), sku: 'MILK-1' }]}
        currencyCode="EGP"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('MILK-1');
  });

  it('does not submit the old price when the displayed price is invalid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <VariantEditor productId="milk" drafts={[variant('milk-1', false)]} currencyCode="EGP" onChange={vi.fn()} />
        <button type="submit">حفظ</button>
      </form>,
    );
    const price = screen.getByDisplayValue('35.00');
    await user.clear(price);
    await user.type(price, '35.555');
    expect(price).toBeInvalid();
    await user.click(screen.getByRole('button', { name: 'حفظ' }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('OpeningHoursEditor', () => {
  const empty: Schedule[] = weekdays.map(day => ({ weekday: day.value, intervals: [] }));

  it('marks unconfigured weekdays as closed and can add a window', async () => {
    const onChangeSchedule = vi.fn();
    const user = userEvent.setup();
    const noop = vi.fn();
    render(
      <OpeningHoursEditor
        schedule={empty}
        overrides={[]}
        onChangeSchedule={onChangeSchedule}
        onChangeOverrides={noop}
      />,
    );

    expect(screen.getAllByText('مغلق')).toHaveLength(7);
    await user.click(screen.getAllByRole('button', { name: 'إضافة فترة' })[0]);
    const [next] = onChangeSchedule.mock.calls[0];
    expect(next[0]).toEqual({ weekday: 1, intervals: [{ opensAt: '09:00', closesAt: '17:00' }] });
  });

  it('warns about overlapping windows without blocking editing', () => {
    const overlapping: Schedule[] = [
      { weekday: 1, intervals: [{ opensAt: '09:00', closesAt: '17:00' }, { opensAt: '16:00', closesAt: '20:00' }] },
      ...empty.slice(1),
    ];
    render(
      <OpeningHoursEditor schedule={overlapping} overrides={[]} onChangeSchedule={vi.fn()} onChangeOverrides={vi.fn()} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('متداخلة');
  });

  it('treats a date override with no intervals as a full closure', () => {
    const overrides: DateOverride[] = [{ date: '2026-12-25', intervals: [] }];
    render(
      <OpeningHoursEditor schedule={empty} overrides={overrides} onChangeSchedule={vi.fn()} onChangeOverrides={vi.fn()} />,
    );
    expect(screen.getByText('مغلق في هذا التاريخ')).toBeInTheDocument();
  });
});
