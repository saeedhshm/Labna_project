import { useState } from 'react';
import type { VariantInput } from '@labna/contracts';
import { fromMinor, toMinor } from '../lib/format';
import type { VariantDraft } from '../lib/forms';
import { suggestVariantId, validateVariants } from '../lib/forms';

/**
 * Variants are identified by a stable id and SKU, and the API refuses to remove
 * one once it exists because carts, stock rows and historical orders reference
 * it. New rows can be deleted; existing ones are deactivated instead.
 */
export function VariantEditor({
  productId,
  drafts,
  currencyCode,
  onChange,
}: {
  productId: string;
  drafts: VariantDraft[];
  currencyCode: string;
  onChange: (next: VariantDraft[]) => void;
}) {
  const [newPrice, setNewPrice] = useState<Record<string, string>>({});
  const [newQuantity, setNewQuantity] = useState<Record<string, string>>({});
  const problems = validateVariants(drafts);

  const update = (id: string, patch: Partial<VariantDraft>) =>
    onChange(drafts.map(draft => (draft.id === id ? { ...draft, ...patch } : draft)));

  const add = () => {
    const id = suggestVariantId(productId, drafts.map(draft => draft.id));
    const draft: VariantDraft = {
      id,
      sku: id.toUpperCase(),
      label: { ar: '', en: '' },
      quantity: 1000,
      unit: 'ml',
      priceMinor: 0,
      currencyCode,
      isActive: true,
      isNew: true,
    };
    onChange([...drafts, draft]);
    setNewPrice(current => ({ ...current, [id]: '0.00' }));
    setNewQuantity(current => ({ ...current, [id]: '1000' }));
  };

  return (
    <fieldset className="variants">
      <legend>خيارات البيع (العبوة والسعر)</legend>
      {drafts.length === 0 ? <p className="hint">أضف خيارًا واحدًا على الأقل؛ المنتج بدون خيارات لا يمكن عرضه.</p> : null}
      {drafts.map(draft => (
        <div className="variant" key={draft.id}>
          <div className="variant__row">
            <label>
              معرّف الخيار
              <input dir="ltr" value={draft.id} disabled={!draft.isNew} onChange={event => update(draft.id, { id: event.target.value })} />
            </label>
            <label>
              رمز الصنف
              <input dir="ltr" value={draft.sku} onChange={event => update(draft.id, { sku: event.target.value })} />
            </label>
            <label>
              الحجم
              <input
                type="number"
                min={1}
                step={1}
                required
                value={newQuantity[draft.id] ?? String(draft.quantity)}
                onChange={event => {
                  setNewQuantity(current => ({ ...current, [draft.id]: event.target.value }));
                  const value = Number(event.target.value);
                  if (Number.isInteger(value) && value > 0) update(draft.id, { quantity: value });
                }}
              />
            </label>
            <label>
              الوحدة
              <select value={draft.unit} onChange={event => update(draft.id, { unit: event.target.value as VariantInput['unit'] })}>
                <option value="ml">مل</option>
                <option value="g">جرام</option>
              </select>
            </label>
            <label>
              السعر ({currencyCode})
              <input
                dir="ltr"
                inputMode="decimal"
                required
                value={newPrice[draft.id] ?? fromMinor(draft.priceMinor)}
                onChange={event => {
                  setNewPrice(current => ({ ...current, [draft.id]: event.target.value }));
                  const minor = toMinor(event.target.value);
                  event.currentTarget.setCustomValidity(minor === undefined || minor > 1_000_000_000 ? 'أدخل سعرًا صالحًا بدقتين عشريتين.' : '');
                  if (minor !== undefined) update(draft.id, { priceMinor: minor });
                }}
              />
            </label>
            <label className="variant__toggle">
              <input type="checkbox" checked={draft.isActive} onChange={event => update(draft.id, { isActive: event.target.checked })} />
              مفعّل
            </label>
            {draft.isNew ? (
              <button type="button" className="danger-ghost" onClick={() => onChange(drafts.filter(item => item.id !== draft.id))}>
                حذف
              </button>
            ) : (
              <span className="hint">موجود مسبقًا: لا يُحذف، بل يُعطّل</span>
            )}
          </div>
          <div className="variant__row variant__row--labels">
            <label>
              اسم العبوة (عربي)
              <input dir="rtl" value={draft.label.ar} onChange={event => update(draft.id, { label: { ...draft.label, ar: event.target.value } })} />
            </label>
            <label>
              اسم العبوة (English)
              <input dir="ltr" value={draft.label.en} onChange={event => update(draft.id, { label: { ...draft.label, en: event.target.value } })} />
            </label>
          </div>
        </div>
      ))}
      <button type="button" className="ghost" onClick={add}>
        إضافة خيار
      </button>
      {problems.length > 0 ? (
        <ul className="notice notice--error" role="alert">
          {problems.map(problem => <li key={problem}>{problem}</li>)}
        </ul>
      ) : null}
    </fieldset>
  );
}
