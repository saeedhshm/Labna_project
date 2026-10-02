import type { BranchInput } from '@labna/contracts';
import { Notice } from './Primitives';
import { fromOpeningHours, toOpeningHours, validateSchedule, weekdayLabel, weekdays, type DateOverride, type Interval, type Schedule } from '../lib/forms';

export const timezones = ['Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Africa/Khartoum', 'Europe/London', 'UTC'];

/**
 * Opening hours are edited per weekday because a branch usually has one or two
 * windows a day, and the API rejects overlaps or windows crossing midnight.
 * Date overrides cover holidays: a date with no intervals is fully closed.
 */
export function OpeningHoursEditor({
  schedule,
  overrides,
  onChangeSchedule,
  onChangeOverrides,
}: {
  schedule: Schedule[];
  overrides: DateOverride[];
  onChangeSchedule: (next: Schedule[]) => void;
  onChangeOverrides: (next: DateOverride[]) => void;
}) {
  const problems = validateSchedule([
    ...schedule.map(day => ({ label: weekdayLabel(day.weekday), intervals: day.intervals })),
    ...overrides.map(override => ({ label: override.date, intervals: override.intervals })),
  ]);

  const setIntervals = (weekday: number, intervals: Interval[]) =>
    onChangeSchedule(schedule.map(day => (day.weekday === weekday ? { ...day, intervals } : day)));

  return (
    <fieldset className="schedule">
      <legend>مواعيد العمل الأسبوعية</legend>
      <p className="hint">اليوم الذي لا تُدخل له فترة يُعد مغلقًا. الفترات التي تعبر منتصف الليل تُقسّم بين يومين.</p>
      {weekdays.map(day => {
        const intervals = schedule.find(item => item.weekday === day.value)?.intervals ?? [];
        return (
          <div className="schedule__day" key={day.value}>
            <strong>{day.ar}</strong>
            {intervals.length === 0 ? (
              <p className="hint">مغلق</p>
            ) : (
              <ul className="plain-list">
                {intervals.map((interval, index) => (
                  <li key={`${interval.opensAt}-${index}`}>
                    <input
                      type="time"
                      aria-label={`${day.ar} - وقت الفتح`}
                      value={interval.opensAt}
                      onChange={event =>
                        setIntervals(day.value, intervals.map((item, i) => (i === index ? { ...item, opensAt: event.target.value } : item)))
                      }
                    />
                    <span aria-hidden="true">←</span>
                    <input
                      type="time"
                      aria-label={`${day.ar} - وقت الإغلاق`}
                      value={interval.closesAt}
                      onChange={event =>
                        setIntervals(day.value, intervals.map((item, i) => (i === index ? { ...item, closesAt: event.target.value } : item)))
                      }
                    />
                    <button
                      type="button"
                      className="danger-ghost"
                      onClick={() => setIntervals(day.value, intervals.filter((_, i) => i !== index))}
                    >
                      حذف
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => setIntervals(day.value, [...intervals, { opensAt: '09:00', closesAt: '17:00' }])}
            >
              إضافة فترة
            </button>
          </div>
        );
      })}
      <p className="hint">إجمالي الفترات الأسبوعية: {toOpeningHours(schedule).length}</p>

      <h3>استثناءات بتواريخ محددة</h3>
      <p className="hint">استخدمها للإجازات أو التغييرات المؤقتة. تاريخ بلا فترات يعني إغلاقًا كاملًا في ذلك اليوم.</p>
      {overrides.map((override, index) => (
        <div className="schedule__override" key={`${override.date}-${index}`}>
          <label>
            التاريخ
            <input
              type="date"
              dir="ltr"
              value={override.date}
              required
              onChange={event =>
                onChangeOverrides(overrides.map((item, i) => (i === index ? { ...item, date: event.target.value } : item)))
              }
            />
          </label>
          {override.intervals.length === 0 ? <p className="hint">مغلق في هذا التاريخ</p> : null}
          {override.intervals.map((interval, intervalIndex) => (
            <p key={intervalIndex}>
              <input
                type="time"
                aria-label={`${override.date} - فتح`}
                value={interval.opensAt}
                onChange={event =>
                  onChangeOverrides(
                    overrides.map((item, i) =>
                      i === index
                        ? { ...item, intervals: item.intervals.map((entry, j) => (j === intervalIndex ? { ...entry, opensAt: event.target.value } : entry)) }
                        : item,
                    ),
                  )
                }
              />
              <span aria-hidden="true">←</span>
              <input
                type="time"
                aria-label={`${override.date} - إغلاق`}
                value={interval.closesAt}
                onChange={event =>
                  onChangeOverrides(
                    overrides.map((item, i) =>
                      i === index
                        ? { ...item, intervals: item.intervals.map((entry, j) => (j === intervalIndex ? { ...entry, closesAt: event.target.value } : entry)) }
                        : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="danger-ghost"
                onClick={() =>
                  onChangeOverrides(
                    overrides.map((item, i) => (i === index ? { ...item, intervals: item.intervals.filter((_, j) => j !== intervalIndex) } : item)),
                  )
                }
              >
                حذف الفترة
              </button>
            </p>
          ))}
          <button
            type="button"
            className="ghost"
            onClick={() => onChangeOverrides(overrides.map((item, i) => (i === index ? { ...item, intervals: [...item.intervals, { opensAt: '09:00', closesAt: '17:00' }] } : item)))}
          >
            فترة في هذا التاريخ
          </button>
          <button
            type="button"
            className="danger-ghost"
            onClick={() => onChangeOverrides(overrides.filter((_, i) => i !== index))}
          >
            حذف الاستثناء
          </button>
        </div>
      ))}
      <button
        type="button"
        className="ghost"
        onClick={() => onChangeOverrides([...overrides, { date: '', intervals: [] }])}
      >
        إضافة استثناء
      </button>
      {problems.length > 0 ? (
        <ul className="notice notice--error" role="alert">
          {problems.map(problem => <li key={problem}>{problem}</li>)}
        </ul>
      ) : (
        <Notice tone="info">المواعيد جاهزة للإرسال.</Notice>
      )}
    </fieldset>
  );
}

/** Converts the editor state into the API payload shape. */
export const branchPayload = (
  draft: Omit<BranchInput, 'openingHours' | 'dateOverrides'>,
  schedule: Schedule[],
  overrides: DateOverride[],
): BranchInput => ({
  ...draft,
  openingHours: toOpeningHours(schedule),
  dateOverrides: overrides.map(override => ({ date: override.date, intervals: override.intervals })),
});

export { fromOpeningHours };
