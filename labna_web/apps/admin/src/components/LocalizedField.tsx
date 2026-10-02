import type { ChangeEvent } from 'react';
import type { LocalizedText } from '@labna/contracts';

export type LocalizedValue = { ar: string; en: string };

const toValue = (text?: LocalizedText): LocalizedValue => ({ ar: text?.ar ?? '', en: text?.en ?? '' });

/**
 * Every catalog field is bilingual, and the API rejects either missing language.
 * Both inputs are always visible so a manager never publishes half a translation.
 */
export function LocalizedField({
  id,
  label,
  value,
  onChange,
  error,
  multiline = false,
  rows = 3,
  required = true,
}: {
  id: string;
  label: string;
  value: LocalizedText | undefined;
  onChange: (next: LocalizedValue) => void;
  error?: string;
  multiline?: boolean;
  rows?: number;
  required?: boolean;
}) {
  const current = toValue(value);
  const update = (language: keyof LocalizedValue) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...current, [language]: event.target.value });
  const marker = required ? ' *' : '';

  return (
    <fieldset className="localized">
      <legend>{label}</legend>
      <div className="localized__grid">
        <div>
          <label htmlFor={`${id}-ar`}>العربية{marker}</label>
          {multiline ? (
            <textarea id={`${id}-ar`} rows={rows} dir="rtl" value={current.ar} onChange={update('ar')} />
          ) : (
            <input id={`${id}-ar`} dir="rtl" value={current.ar} onChange={update('ar')} />
          )}
        </div>
        <div>
          <label htmlFor={`${id}-en`}>English{marker}</label>
          {multiline ? (
            <textarea id={`${id}-en`} rows={rows} dir="ltr" value={current.en} onChange={update('en')} />
          ) : (
            <input id={`${id}-en`} dir="ltr" value={current.en} onChange={update('en')} />
          )}
        </div>
      </div>
      {error ? <p className="field__error" role="alert">{error}</p> : null}
    </fieldset>
  );
}
