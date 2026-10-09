/** Editor de repetição no estilo Google Agenda / Teams: atalhos + “Personalizado…”. */
import { useState } from 'react';
import type { Freq, Recurrence } from '../domain/types';
import { addDays, formatDay, fromISODate, MONTHS_LONG, todayISO, WEEKDAYS_LONG, WEEKDAYS_SHORT } from '../domain/dates';
import { freqOf, intervalOf, nextOccurrence, nthOfMonth, ordinalWeekday, recurrenceError, recurrenceLabel, UNIT_LABEL } from '../domain/recurrence';
import { NumberField } from './ui';

type Preset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'monthlyNth' | 'monthlyLast' | 'yearly' | 'custom';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Posição usada para “na Nª terça”: a 5ª vira “última”. */
function anchorNth(anchor: string) {
  const { nth } = nthOfMonth(anchor);
  return nth >= 5 ? -1 : nth;
}

function presetRule(p: Preset, anchor: string): Recurrence | undefined {
  const d = fromISODate(anchor);
  switch (p) {
    case 'daily':
      return { freq: 'daily', anchor };
    case 'weekdays':
      return { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], anchor };
    case 'weekly':
      return { freq: 'weekly', weekdays: [d.getDay()], anchor };
    case 'monthly':
      return { freq: 'monthly', monthDay: d.getDate(), anchor };
    case 'monthlyNth':
      return { freq: 'monthly', nth: anchorNth(anchor), weekday: d.getDay(), anchor };
    case 'monthlyLast':
      return { freq: 'monthly', nth: -1, weekday: d.getDay(), anchor };
    case 'yearly':
      return { freq: 'yearly', month: d.getMonth(), monthDay: d.getDate(), anchor };
    default:
      return undefined;
  }
}

/** Só a regra (sem início/fim), para comparar com os atalhos. */
function shape(r: Recurrence) {
  const a = fromISODate(r.anchor);
  const f = freqOf(r);
  return JSON.stringify({
    f,
    n: intervalOf(r),
    w: f === 'weekly' ? [...(r.weekdays?.length ? r.weekdays : [a.getDay()])].sort() : undefined,
    md: f === 'monthly' || f === 'yearly' ? (r.nth != null ? undefined : r.monthDay ?? a.getDate()) : undefined,
    nth: r.nth,
    wd: r.nth != null ? r.weekday : undefined,
    m: f === 'yearly' ? r.month ?? a.getMonth() : undefined,
  });
}

function detectPreset(r?: Recurrence): Preset {
  if (!r) return 'none';
  const s = shape(r);
  const presets: Preset[] = ['daily', 'weekdays', 'weekly', 'monthly', 'monthlyNth', 'monthlyLast', 'yearly'];
  return presets.find((p) => shape(presetRule(p, r.anchor)!) === s) ?? 'custom';
}

/** Regra base de uma frequência, a partir da data de início. */
function baseFor(freq: Freq, anchor: string, prev?: Recurrence): Recurrence {
  const d = fromISODate(anchor);
  const keep = { interval: prev?.interval, until: prev?.until, count: prev?.count, anchor };
  if (freq === 'weekly') return { ...keep, freq, weekdays: [d.getDay()] };
  if (freq === 'monthly') return { ...keep, freq, monthDay: d.getDate() };
  if (freq === 'yearly') return { ...keep, freq, month: d.getMonth(), monthDay: d.getDate() };
  return { ...keep, freq };
}

/** Ao mudar a data de início de uma regra personalizada, o dia do mês/ano acompanha. */
function reanchor(r: Recurrence, anchor: string): Recurrence {
  const d = fromISODate(anchor);
  const next: Recurrence = { ...r, anchor };
  const f = freqOf(r);
  if (f === 'monthly' || f === 'yearly') {
    if (r.nth != null) Object.assign(next, { nth: r.nth < 0 ? -1 : anchorNth(anchor), weekday: d.getDay() });
    else next.monthDay = d.getDate();
    if (f === 'yearly') next.month = d.getMonth();
  }
  if (f === 'weekly' && r.weekdays?.length === 1) next.weekdays = [d.getDay()];
  return next;
}

interface Props {
  value?: Recurrence;
  onChange: (r: Recurrence | undefined) => void;
  /** data usada como início quando a repetição é ligada */
  defaultAnchor: string;
}

export function RecurrenceEditor({ value, onChange, defaultAnchor }: Props) {
  const detected = detectPreset(value);
  const [custom, setCustom] = useState(detected === 'custom');
  const preset: Preset = !value ? 'none' : custom ? 'custom' : detected;
  const anchor = value?.anchor ?? defaultAnchor;
  const d = fromISODate(anchor);
  const wd = d.getDay();
  const { last } = nthOfMonth(anchor);
  const nth = anchorNth(anchor);
  const ends = value ? { until: value.until, count: value.count } : {};

  const pick = (p: Preset) => {
    if (p === 'custom') {
      setCustom(true);
      onChange(value ?? { ...presetRule('weekly', anchor)!, ...ends });
      return;
    }
    setCustom(false);
    const r = presetRule(p, anchor);
    onChange(r && { ...r, ...ends });
  };

  const setAnchor = (iso: string) => {
    if (!value || !iso) return;
    const r = custom ? reanchor(value, iso) : { ...presetRule(detected, iso)!, until: value.until, count: value.count };
    onChange(r);
  };

  const options: { value: Preset; label: string }[] = [
    { value: 'none', label: 'Não repete' },
    { value: 'daily', label: 'Todo dia' },
    { value: 'weekdays', label: 'Dias úteis (seg a sex)' },
    { value: 'weekly', label: `Toda semana ${wd === 0 || wd === 6 ? 'no' : 'na'} ${WEEKDAYS_LONG[wd]}` },
    { value: 'monthly', label: `Todo mês no dia ${d.getDate()}` },
    { value: 'monthlyNth', label: `Todo mês ${wd === 0 || wd === 6 ? 'no' : 'na'} ${ordinalWeekday(nth, wd)}` },
    ...(last && nth !== -1 ? [{ value: 'monthlyLast' as Preset, label: `Todo mês ${wd === 0 || wd === 6 ? 'no' : 'na'} ${ordinalWeekday(-1, wd)}` }] : []),
    { value: 'yearly', label: `Todo ano em ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}` },
    { value: 'custom', label: 'Personalizado…' },
  ];

  const error = recurrenceError(value);
  const upcoming: string[] = [];
  if (value && !error) {
    let from = todayISO() > anchor ? todayISO() : anchor;
    for (let i = 0; i < 4; i++) {
      const n = nextOccurrence(value, from);
      if (!n) break;
      upcoming.push(n);
      from = addDays(n, 1);
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <select id="repeat" className="input" value={preset} onChange={(e) => pick(e.target.value as Preset)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {value && (
        <>
          <label className="row small muted" style={{ gap: 10 }}>
            <span style={{ minWidth: 72 }}>Começa em</span>
            <input type="date" className="input num grow" value={anchor} onChange={(e) => setAnchor(e.target.value)} aria-label="Começa em" />
          </label>

          {preset === 'custom' && <CustomRule value={value} onChange={onChange} />}

          <EndsField value={value} onChange={onChange} />

          {error ? (
            <p className="xs" role="alert" style={{ color: 'var(--red)' }}>{error}</p>
          ) : (
            <p className="xs faint" aria-live="polite">
              {recurrenceLabel(value)}
              {upcoming.length > 0 && <> · próximas: {upcoming.map((x) => formatDay(x).toLowerCase()).join(', ')}</>}
              {upcoming.length === 0 && ' · nenhuma data futura'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function CustomRule({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  const f = freqOf(value);
  const n = value.interval;
  const plural = n !== 1 && n !== undefined;
  const d = fromISODate(value.anchor);
  const wd = d.getDay();
  const nth = anchorNth(value.anchor);
  const { last } = nthOfMonth(value.anchor);
  const masc = wd === 0 || wd === 6;
  const byNth = value.nth != null;

  const dayChoices = [
    { key: 'day', label: f === 'yearly' ? `Em ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}` : `No dia ${d.getDate()}`, on: !byNth, patch: { monthDay: d.getDate(), nth: undefined, weekday: undefined } },
    { key: 'nth', label: cap(`${masc ? 'no' : 'na'} ${ordinalWeekday(nth, wd)}`), on: byNth && value.nth === nth, patch: { nth, weekday: wd, monthDay: undefined } },
    ...(last && nth !== -1
      ? [{ key: 'last', label: cap(`${masc ? 'no' : 'na'} ${ordinalWeekday(-1, wd)}`), on: byNth && value.nth === -1, patch: { nth: -1, weekday: wd, monthDay: undefined } }]
      : []),
  ];

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="row small muted" style={{ gap: 10 }}>
        <span style={{ minWidth: 72 }}>A cada</span>
        <NumberField
          label="Intervalo"
          value={value.interval ?? 1}
          onChange={(v) => onChange({ ...value, interval: v ?? NaN })}
        />
        <select
          className="input grow"
          value={f}
          aria-label="Unidade"
          onChange={(e) => onChange(baseFor(e.target.value as Freq, value.anchor, value))}
        >
          {(Object.keys(UNIT_LABEL) as Freq[]).map((k) => (
            <option key={k} value={k}>{UNIT_LABEL[k][plural ? 1 : 0]}</option>
          ))}
        </select>
      </div>

      {f === 'weekly' && (
        <div className="chips" role="group" aria-label="Dias da semana">
          {[1, 2, 3, 4, 5, 6, 0].map((day) => {
            const cur = value.weekdays ?? [wd];
            const on = cur.includes(day);
            return (
              <button
                key={day}
                type="button"
                className={`chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange({ ...value, weekdays: on ? cur.filter((x) => x !== day) : [...cur, day] })}
              >
                {WEEKDAYS_SHORT[day]}
              </button>
            );
          })}
        </div>
      )}

      {(f === 'monthly' || f === 'yearly') && (
        <div className="chips" role="group" aria-label="Em qual dia">
          {dayChoices.map((c) => (
            <button key={c.key} type="button" className={`chip${c.on ? ' on' : ''}`} aria-pressed={c.on} onClick={() => onChange({ ...value, ...c.patch })}>
              {c.label}
              {f === 'yearly' && c.key !== 'day' && ` de ${MONTHS_LONG[d.getMonth()]}`}
            </button>
          ))}
        </div>
      )}
      {(f === 'monthly' || f === 'yearly') && (
        <p className="xs faint" style={{ marginTop: -4 }}>O dia vem da data de início — mude “Começa em” para escolher outro.</p>
      )}
    </div>
  );
}

type EndMode = 'never' | 'until' | 'count';

function EndsField({ value, onChange }: { value: Recurrence; onChange: (r: Recurrence) => void }) {
  const mode: EndMode = value.count !== undefined ? 'count' : value.until !== undefined ? 'until' : 'never';
  const set = (m: EndMode) => {
    if (m === 'never') onChange({ ...value, until: undefined, count: undefined });
    if (m === 'until') onChange({ ...value, count: undefined, until: value.until ?? addDays(value.anchor, 90) });
    if (m === 'count') onChange({ ...value, until: undefined, count: value.count ?? 10 });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row small muted" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span style={{ minWidth: 72 }}>Termina</span>
        <div className="chips" role="group" aria-label="Termina">
          {([
            ['never', 'Nunca'],
            ['until', 'Em uma data'],
            ['count', 'Após N vezes'],
          ] as [EndMode, string][]).map(([m, label]) => (
            <button key={m} type="button" className={`chip${mode === m ? ' on' : ''}`} aria-pressed={mode === m} onClick={() => set(m)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === 'until' && (
        <label className="row small muted" style={{ gap: 10 }}>
          <span style={{ minWidth: 72 }}>Até</span>
          <input type="date" className="input num grow" min={value.anchor} value={value.until ?? ''} onChange={(e) => onChange({ ...value, until: e.target.value })} aria-label="Termina em" />
        </label>
      )}
      {mode === 'count' && (
        <div className="row small muted" style={{ gap: 10 }}>
          <span style={{ minWidth: 72 }}>Após</span>
          <NumberField label="Número de vezes" value={value.count} onChange={(v) => onChange({ ...value, count: v ?? NaN })} />
          <span>{value.count === 1 ? 'vez' : 'vezes'}</span>
        </div>
      )}
    </div>
  );
}
