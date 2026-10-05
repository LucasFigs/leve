/**
 * Interpretador de linguagem natural (pt-BR) para capturas rápidas.
 *
 * Recebe algo como “quinta tenho reunião com o João às 15” e devolve
 * título limpo, tipo, data, horário, duração, recorrência e prioridade.
 * Tudo é heurístico e local — rápido o bastante para rodar a cada tecla.
 */
import type { Category, DayPart, Energy, Kind, Priority, Recurrence } from './types';
import {
  addDays, formatDay, formatDuration, fromISODate, MONTHS_LONG, pad, toISODate, todayISO, weekdayOf,
  WEEKDAYS_SHORT,
} from './dates';

export type ChipType = 'kind' | 'date' | 'time' | 'duration' | 'recurrence' | 'priority' | 'due';

export interface ParseChip {
  type: ChipType;
  label: string;
}

export interface Parsed {
  title: string;
  kind: Kind;
  date?: string;
  time?: string;
  due?: string;
  dayPart?: DayPart;
  period?: 'week' | 'weekend' | 'month';
  duration: number;
  durationExplicit: boolean;
  priority?: Priority;
  recurrence?: Recurrence;
  category: Category;
  energy: Energy;
  /** tarefa grande — candidata a ser dividida */
  big: boolean;
  chips: ParseChip[];
}

/* ------------------------------------------------------------------ */
/* Normalização                                                        */
/* ------------------------------------------------------------------ */

/** Remove acentos e baixa a caixa preservando o comprimento da string. */
export function normalize(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const n = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (n.length === 1) out += n;
    else {
      const l = c.toLowerCase();
      out += l.length === 1 ? l : ' ';
    }
  }
  return out;
}

const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0, dom: 0, segunda: 1, seg: 1, terca: 2, ter: 2, quarta: 3, qua: 3,
  quinta: 4, qui: 4, sexta: 5, sex: 5, sabado: 6, sab: 6,
};

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, quinze: 15, vinte: 20, trinta: 30, quarenta: 40,
};

const toNumber = (s: string): number => {
  if (s === 'meia') return 0.5;
  if (s in NUMBER_WORDS) return NUMBER_WORDS[s];
  return parseFloat(s.replace(',', '.'));
};

const WD_FULL = '(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)';
const WD_ANY = '(?:segunda|terca|quarta|quinta|sexta|sabado|domingo|seg|ter|qua|qui|sex|sab|dom)s?(?:-feiras?)?';
const NUM = '(\\d+(?:[.,]\\d+)?|uma|um|duas|dois|tres|quatro|cinco|seis|meia)';
const MONTHS_RE = MONTHS_LONG.map((m) => normalize(m)).join('|');

/* ------------------------------------------------------------------ */
/* Dicionários de contexto                                             */
/* ------------------------------------------------------------------ */

const ACTION_VERBS =
  /^(marcar|agendar|ligar|comprar|enviar|mandar|fazer|preparar|responder|pagar|reservar|terminar|finalizar|organizar|estudar|ler|escrever|revisar|limpar|lavar|buscar|levar|pesquisar|renovar|resolver|criar|montar|atualizar|cancelar|devolver|trocar|consertar|arrumar|planejar|separar|imprimir|entregar|confirmar|verificar|checar|falar|conversar|tirar|baixar|instalar|cozinhar|regar|definir|tomar|ver|assistir|configurar|corrigir|desenhar|editar|gravar|treinar)\b/;

const EVENT_WORDS =
  /\b(reuniao|consulta|call|meet|encontro|entrevista|almoco com|jantar com|cafe com|aula|voo|festa|aniversario|casamento|show|cinema|exame|palestra|evento|missa|culto|sessao|terapia|dentista|medic[oa]|happy hour|churrasco|daily|1:1|one on one|workshop)\b/;

const HABIT_WORDS =
  /\b(academia|treino|treinar|correr|corrida|meditar|meditacao|ler|leitura|yoga|ioga|caminhar|caminhada|beber agua|estudar|alongar|alongamento|remedio|vitamina|pilates|natacao|nadar|diario|journaling|revisar orcamento)\b/;

const BIG_WORDS =
  /\b(apresentacao|relatorio|projeto|planejar|viagem|mudanca|tcc|monografia|artigo|declaracao|imposto|curriculo|site|portfolio|proposta|planilha|organizar (a |o |os |as )?(casa|arquivos|viagem|festa|mudanca|armario|escritorio)|estudar para|preparar)\b/;

const CATEGORY_RULES: [Category, RegExp][] = [
  ['saude', /\b(dentista|medic[oa]|consulta|exame|academia|treino|treinar|remedio|vitamina|terapia|psicolog[oa]|correr|corrida|yoga|pilates|nutricionista|hospital|vacina|meditar|caminhada)\b/],
  ['financas', /\b(pagar|boleto|conta de|fatura|orcamento|banco|pix|transferir|imposto|declaracao|investir|investimento|cartao|cobrar|reembolso|salario)\b/],
  ['trabalho', /\b(reuniao|relatorio|apresentacao|cliente|projeto|e-?mail|documento|documentacao|planilha|proposta|call|daily|deploy|entrega|equipe|chefe|gestor|time|sprint|contrato|fornecedor|power apps|codigo)\b/],
  ['estudos', /\b(estudar|curso|aula|prova|faculdade|livro|leitura|ler|tcc|monografia|artigo|certificacao|idioma|ingles)\b/],
  ['casa', /\b(limpar|lavar|racao|mercado|supermercado|feira|casa|apartamento|aluguel|condominio|luz|agua|internet|louca|roupa|cozinhar|planta|regar|consertar|arrumar|lixo)\b/],
];

const DURATION_RULES: [RegExp, number][] = [
  [/\b(beber agua|remedio|vitamina|regar)\b/, 5],
  [/\b(ligar|responder|mandar mensagem|confirmar|pagar|marcar|agendar|transferir|pix|cancelar|imprimir)\b/, 10],
  [/\b(enviar|mandar|verificar|checar|renovar|meditar|alongar|baixar)\b/, 15],
  [/\b(call|daily|cafe com|ler|leitura|revisar|pesquisar)\b/, 30],
  [/\b(comprar|buscar|levar|organizar arquivos|limpar|lavar|cozinhar|caminhada|caminhar)\b/, 45],
  [/\b(reuniao|consulta|dentista|medic[oa]|academia|treino|treinar|estudar|aula|relatorio|planejar|almoco|correr|corrida|exame)\b/, 60],
  [/\b(apresentacao|proposta|curriculo|organizar|preparar|escrever|artigo)\b/, 90],
];

const ENERGY_HIGH = /\b(apresentacao|relatorio|estudar|escrever|projeto|planejar|programar|analisar|proposta|artigo|tcc|codigo|desenhar|curriculo|preparar)\b/;
const ENERGY_LOW = /\b(ligar|responder|pagar|comprar|enviar|mandar|marcar|agendar|confirmar|regar|imprimir|lavar|buscar|levar|renovar|cancelar)\b/;

/* ------------------------------------------------------------------ */
/* Datas                                                               */
/* ------------------------------------------------------------------ */

function nextWeekday(ref: string, wd: number, allowToday = false): string {
  const cur = weekdayOf(ref);
  let delta = (wd - cur + 7) % 7;
  if (delta === 0 && !allowToday) delta = 7;
  return addDays(ref, delta);
}

function dateFromDayMonth(ref: string, day: number, month: number, year?: number): string | undefined {
  if (day < 1 || day > 31 || month < 0 || month > 11) return undefined;
  const refDate = fromISODate(ref);
  let y = year ?? refDate.getFullYear();
  if (y < 100) y += 2000;
  const d = new Date(y, month, day);
  if (d.getMonth() !== month) return undefined;
  let iso = toISODate(d);
  if (year === undefined && iso < ref) iso = toISODate(new Date(y + 1, month, day));
  return iso;
}

export function recurrenceLabel(r: Recurrence): string {
  switch (r.freq) {
    case 'daily':
      return 'Todo dia';
    case 'weekly': {
      const days = [...(r.weekdays ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      if (days.join() === '1,2,3,4,5') return 'Dias úteis';
      if (days.length === 7) return 'Todo dia';
      return 'Toda ' + days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
    }
    case 'monthly':
      return `Todo dia ${r.monthDay}`;
    case 'interval':
      return r.interval === 7 ? 'Toda semana' : `A cada ${r.interval} dias`;
  }
}

/* ------------------------------------------------------------------ */
/* Parser                                                              */
/* ------------------------------------------------------------------ */

export interface ParseOptions {
  ref?: string;
  defaultDuration?: number;
}

export function parse(input: string, opts: ParseOptions = {}): Parsed {
  const ref = opts.ref ?? todayISO();
  const original = input.replace(/\s+/g, ' ');
  const norm = normalize(original);
  const consumed: boolean[] = new Array(norm.length).fill(false);

  let date: string | undefined;
  let due: string | undefined;
  let time: string | undefined;
  let duration: number | undefined;
  let dayPart: DayPart | undefined;
  let period: Parsed['period'];
  let priority: Priority | undefined;
  let recurrence: Recurrence | undefined;

  /** Executa `re` sobre o texto normalizado; se `fn` aceitar, consome o trecho. */
  const take = (re: RegExp, fn: (m: RegExpExecArray) => boolean) => {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = g.exec(norm))) {
      if (m[0].length === 0) {
        g.lastIndex++;
        continue;
      }
      const start = m.index;
      const end = start + m[0].length;
      if (consumed.slice(start, end).some(Boolean)) continue;
      if (fn(m)) for (let i = start; i < end; i++) consumed[i] = true;
    }
  };

  /* ---------- Recorrência ---------- */
  take(/\b(?:(?:todos\s+os\s+)?dias\s+uteis|de\s+segunda\s+a\s+sexta(?:-feira)?|todo\s+dia\s+util)\b/, () => {
    if (recurrence) return false;
    recurrence = { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], anchor: ref };
    return true;
  });
  take(/\b(?:todo|toda)\s+(?:o\s+)?dia\s+(\d{1,2})(?:\s+de\s+cada\s+mes|\s+do\s+mes)?\b/, (m) => {
    const day = parseInt(m[1], 10);
    if (recurrence || day < 1 || day > 31) return false;
    recurrence = { freq: 'monthly', monthDay: day, anchor: ref };
    return true;
  });
  take(/\b(?:todos\s+os\s+dias|todo\s+(?:santo\s+)?dia|diariamente|toda\s+(manha|tarde|noite))\b/, (m) => {
    if (recurrence) return false;
    recurrence = { freq: 'daily', anchor: ref };
    if (m[1]) dayPart = m[1] === 'manha' ? 'morning' : m[1] === 'tarde' ? 'afternoon' : 'evening';
    return true;
  });
  const weeklyList = (m: RegExpExecArray) => {
    if (recurrence) return false;
    const names = m[0].match(/segunda|terca|quarta|quinta|sexta|sabado|domingo|seg|ter|qua|qui|sex|sab|dom/g) ?? [];
    const days = [...new Set(names.map((n) => WEEKDAY_INDEX[n]))];
    if (!days.length) return false;
    recurrence = { freq: 'weekly', weekdays: days, anchor: ref };
    return true;
  };
  take(new RegExp(`\\b(?:toda|todo|todas\\s+as|todos\\s+os)\\s+${WD_ANY}(?:\\s*(?:,|e|\\/)\\s*${WD_ANY})*\\b`), weeklyList);
  take(new RegExp(`\\b${WD_ANY}(?:\\s*\\/\\s*${WD_ANY})+\\b`), weeklyList);
  take(/\b(?:toda\s+semana|todas\s+as\s+semanas|semanalmente|uma\s+vez\s+por\s+semana)\b/, () => {
    if (recurrence) return false;
    recurrence = { freq: 'weekly', weekdays: [weekdayOf(ref)], anchor: ref };
    return true;
  });
  take(/\b(?:todo\s+mes|todos\s+os\s+meses|mensalmente)\b/, () => {
    if (recurrence) return false;
    recurrence = { freq: 'monthly', monthDay: fromISODate(ref).getDate(), anchor: ref };
    return true;
  });
  take(/\b(?:a\s+cada\s+(\d+|duas|dois|tres|quatro)\s+(dias|semanas)|de\s+(\d+)\s+em\s+\d+\s+dias|quinzenalmente)\b/, (m) => {
    if (recurrence) return false;
    let n = 14;
    if (m[1]) n = toNumber(m[1]) * (m[2].startsWith('semana') ? 7 : 1);
    else if (m[3]) n = parseInt(m[3], 10);
    if (!n || n < 1) return false;
    recurrence = { freq: 'interval', interval: n, anchor: ref };
    return true;
  });

  /* ---------- Datas ---------- */
  const PRE = '(?<pre>(?:(?:ate|para|pra|no|na|nesta|neste|nessa|nesse|essa|esta|este|esse|proxima|proximo|em)\\s+){0,3})';
  const setDate = (m: RegExpExecArray, iso: string | undefined, p?: Parsed['period']) => {
    if (!iso) return false;
    const isDue = /\bate\s/.test(m.groups?.pre ?? '');
    if (isDue) {
      if (due) return false;
      due = iso;
      return true;
    }
    if (date) return false;
    date = iso;
    period = p;
    return true;
  };

  take(new RegExp(`\\b${PRE}depois\\s+de\\s+amanha\\b`), (m) => setDate(m, addDays(ref, 2)));
  take(new RegExp(`\\b${PRE}(?:hoje|hj)\\b`), (m) => setDate(m, ref));
  take(new RegExp(`\\b${PRE}amanha\\b`), (m) => setDate(m, addDays(ref, 1)));
  take(new RegExp(`\\b${PRE}(?:a\\s+)?(?:semana\\s+que\\s+vem|proxima\\s+semana)\\b`), (m) =>
    setDate(m, nextWeekday(ref, 1), 'week'),
  );
  take(new RegExp(`\\b${PRE}(?:o\\s+)?(?:fim\\s+de\\s+semana|final\\s+de\\s+semana|fds)\\b`), (m) => {
    const wd = weekdayOf(ref);
    return setDate(m, wd === 6 || wd === 0 ? ref : nextWeekday(ref, 6), 'weekend');
  });
  take(new RegExp(`\\b${PRE}(?:o\\s+)?(?:mes\\s+que\\s+vem|proximo\\s+mes)\\b`), (m) => {
    const d = fromISODate(ref);
    return setDate(m, toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 1)), 'month');
  });
  take(new RegExp(`\\b${PRE}(?:daqui\\s+a\\s+|daqui\\s+|em\\s+)${NUM}\\s+(dias?|semanas?)\\b`), (m) => {
    const n = toNumber(m[2]);
    if (!n || n < 1) return false;
    return setDate(m, addDays(ref, Math.round(n * (m[3].startsWith('semana') ? 7 : 1))));
  });
  take(new RegExp(`\\b${PRE}(?:(?:dia|em)\\s+)?(\\d{1,2})\\/(\\d{1,2})(?:\\/(\\d{2,4}))?\\b`), (m) =>
    setDate(m, dateFromDayMonth(ref, +m[2], +m[3] - 1, m[4] ? +m[4] : undefined)),
  );
  take(new RegExp(`\\b${PRE}(?:dia\\s+)?(\\d{1,2})\\s+de\\s+(${MONTHS_RE})\\b`), (m) =>
    setDate(m, dateFromDayMonth(ref, +m[2], MONTHS_LONG.map(normalize).indexOf(m[3]))),
  );
  take(new RegExp(`\\b${PRE}(?:no\\s+)?dia\\s+(\\d{1,2})\\b`), (m) => {
    const day = +m[2];
    const d = fromISODate(ref);
    let iso = dateFromDayMonth(ref, day, d.getMonth(), d.getFullYear());
    if (!iso || iso < ref) iso = dateFromDayMonth(ref, day, (d.getMonth() + 1) % 12, d.getFullYear() + (d.getMonth() === 11 ? 1 : 0));
    return setDate(m, iso);
  });
  take(new RegExp(`\\b${PRE}(${WD_FULL})(?:-feira)?(?:\\s+que\\s+vem)?\\b`), (m) =>
    setDate(m, nextWeekday(ref, WEEKDAY_INDEX[m[2]])),
  );

  /* ---------- Duração (antes do horário, para “por 1h” não virar 01:00) ---------- */
  const DUR_PRE = '(?:por|durante|leva|levar|uns|umas|cerca\\s+de|tipo)';
  take(new RegExp(`\\b${DUR_PRE}\\s+(?:mais\\s+ou\\s+menos\\s+)?${NUM}\\s*(?:h|hs|hrs?|horas?)(?:\\s*e?\\s*(\\d{1,2})\\s*(?:min|minutos)?)?\\b`), (m) => {
    if (duration) return false;
    const h = toNumber(m[1]);
    if (!h || h > 16) return false;
    duration = Math.round(h * 60 + (m[2] ? +m[2] : 0));
    return true;
  });
  take(/\b(?:(?:por|durante|leva|levar|uns|umas|cerca\s+de)\s+)?meia\s+hora\b/, () => {
    if (duration) return false;
    duration = 30;
    return true;
  });
  take(new RegExp(`\\b(?:${DUR_PRE}\\s+)?(\\d{1,3})\\s*(?:min|mins|minutos?)\\b`), (m) => {
    if (duration) return false;
    duration = +m[1];
    return duration > 0;
  });
  take(/\b(\d{1,2})\s+horas\b/, (m) => {
    if (duration) return false;
    if (/\b(?:as|a|pelas|das)\s$/.test(norm.slice(Math.max(0, m.index - 6), m.index))) return false;
    duration = +m[1] * 60;
    return duration > 0;
  });

  /* ---------- Horário ---------- */
  const setTime = (h: number, min: number, qualifier?: string, guessPm = false) => {
    if (time) return false;
    if (qualifier === 'tarde' || qualifier === 'noite') {
      if (h < 12) h += 12;
    } else if (!qualifier && guessPm && h >= 1 && h <= 6) h += 12;
    if (qualifier === 'manha' && h === 12) h = 0;
    if (h > 23 || min > 59) return false;
    time = `${pad(h)}:${pad(min)}`;
    return true;
  };

  take(/\b(?:(?:as|ao|pelas|ate\s+o)\s+)?meio[\s-]dia(\s+e\s+meia)?\b/, (m) => setTime(12, m[1] ? 30 : 0));
  take(/\b(?:(?:a|as)\s+)?meia[\s-]noite\b/, () => setTime(0, 0));
  take(
    /\b(?:as|a|pelas|umas|depois\s+das|antes\s+das|la\s+pelas)\s+(\d{1,2})(?:(?::|h)(\d{2}))?\s*(?:h|hs|hrs|horas)?(\s+e\s+meia)?(?:\s+(?:da|de)\s+(manha|tarde|noite))?\b/,
    (m) => setTime(+m[1], m[2] ? +m[2] : m[3] ? 30 : 0, m[4], !m[2]),
  );
  take(/\b(\d{1,2})(?::|h)(\d{2})\b(?:\s+(?:da|de)\s+(manha|tarde|noite))?/, (m) => setTime(+m[1], +m[2], m[3]));
  take(/\b(\d{1,2})\s?(?:h|hs|hrs)\b(?:\s+(?:da|de)\s+(manha|tarde|noite))?/, (m) => setTime(+m[1], 0, m[2]));

  /* ---------- Período do dia ---------- */
  take(/\b(?:de|pela|a|na|logo\s+de|logo\s+a)\s+(manha|tarde|noite)\b/, (m) => {
    if (dayPart) return false;
    dayPart = m[1] === 'manha' ? 'morning' : m[1] === 'tarde' ? 'afternoon' : 'evening';
    return true;
  });
  take(/\b(?:hoje\s+)?(?:a\s+)?noite\b/, (m) => {
    if (dayPart || !/hoje/.test(m[0])) return false;
    dayPart = 'evening';
    return true;
  });

  /* ---------- Prioridade ---------- */
  take(/!{2,}/, () => {
    priority = 'essential';
    return true;
  });
  take(/\b(?:urgente|urgentissimo|com\s+urgencia|prioridade\s+(?:alta|maxima)|muito\s+importante|essencial|critico|sem\s+falta|asap)\b/, () => {
    if (priority) return false;
    priority = 'essential';
    return true;
  });
  take(/\b(?:importante|prioridade\s+media)\b/, () => {
    if (priority) return false;
    priority = 'important';
    return true;
  });
  take(/\b(?:se\s+der(?:\s+tempo)?|se\s+possivel|quando\s+(?:puder|der)|sem\s+pressa|algum\s+dia|prioridade\s+baixa)\b/, () => {
    if (priority) return false;
    priority = 'optional';
    return true;
  });

  /* ---------- Título ---------- */
  let rest = '';
  for (let i = 0; i < original.length; i++) rest += consumed[i] ? ' ' : original[i];
  const title = cleanTitle(rest) || cleanTitle(original) || original.trim();
  const nt = normalize(title);

  /* ---------- Tipo ---------- */
  const startsWithAction = ACTION_VERBS.test(nt);
  const saidTenho = /^\s*(?:eu\s+)?tenho\s+(?!que|de)/.test(norm.replace(/[^a-z0-9: ]/g, ' ').replace(/^(?:\s*(?:hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\s*)+/, ''));
  let kind: Kind = 'task';
  if (recurrence && HABIT_WORDS.test(nt) && !EVENT_WORDS.test(nt)) kind = 'habit';
  else if (!startsWithAction && time && (EVENT_WORDS.test(nt) || /\bcom\s+\S/.test(nt) || saidTenho)) kind = 'event';
  else if (!startsWithAction && EVENT_WORDS.test(nt) && (date || recurrence)) kind = 'event';

  /* ---------- Inferências ---------- */
  const category = CATEGORY_RULES.find(([, re]) => re.test(nt))?.[0] ?? 'pessoal';
  const energy: Energy = ENERGY_HIGH.test(nt) ? 'high' : ENERGY_LOW.test(nt) ? 'low' : 'medium';
  const durationExplicit = duration !== undefined;
  const finalDuration = duration ?? estimateDuration(nt, kind, opts.defaultDuration ?? 30);
  const big = kind === 'task' && (finalDuration >= 60 || BIG_WORDS.test(nt));

  if (recurrence && date) recurrence = { ...recurrence, anchor: date };

  /* ---------- Chips ---------- */
  const chips: ParseChip[] = [];
  if (kind === 'event') chips.push({ type: 'kind', label: 'Compromisso' });
  if (kind === 'habit') chips.push({ type: 'kind', label: 'Hábito' });
  if (date && !recurrence) {
    const label =
      period === 'week' ? 'Próxima semana' : period === 'month' ? 'Próximo mês' : period === 'weekend' ? 'Fim de semana' : formatDay(date, ref);
    chips.push({ type: 'date', label });
  }
  if (recurrence) chips.push({ type: 'recurrence', label: recurrenceLabel(recurrence) });
  if (time) chips.push({ type: 'time', label: time });
  else if (dayPart) chips.push({ type: 'time', label: dayPart === 'morning' ? 'Manhã' : dayPart === 'afternoon' ? 'Tarde' : 'Noite' });
  if (durationExplicit) chips.push({ type: 'duration', label: formatDuration(finalDuration) });
  if (priority) chips.push({ type: 'priority', label: priority === 'essential' ? 'Essencial' : priority === 'important' ? 'Importante' : 'Se der' });
  if (due) chips.push({ type: 'due', label: `Até ${formatDay(due, ref).toLowerCase()}` });

  return {
    title, kind, date, time, due, dayPart, period, duration: finalDuration, durationExplicit,
    priority, recurrence, category, energy, big, chips,
  };
}

const LEADING_FILLER =
  /^(?:(?:e|,|-|;|\.|para|pra|eu)\s+|(?:preciso(?:\s+de)?|tenho\s+(?:que|de)|tenho|tem\s+que|lembrar\s+de|lembrar|nao\s+(?:posso\s+)?esquecer\s+de|nao\s+esquecer|devo|quero|vou|precisa|lembrete:?)\s+)/;
const TRAILING_FILLER = /\s+(?:para|pra|no|na|nos|nas|em|de|do|da|ate|as|a|ao|aos|e|o|com|,|-|;|\.)$/;

function cleanTitle(s: string): string {
  let t = s.replace(/\s+/g, ' ').replace(/\s+([,.;!?])/g, '$1').trim();
  t = t.replace(/^[,.;:\-–\s]+|[,;:\-–\s]+$/g, '').trim();
  for (let i = 0; i < 6; i++) {
    const n = normalize(t);
    const lead = n.match(LEADING_FILLER);
    if (lead) {
      t = t.slice(lead[0].length).trim();
      continue;
    }
    const trail = n.match(TRAILING_FILLER);
    if (trail) {
      t = t.slice(0, n.length - trail[0].length).trim();
      continue;
    }
    break;
  }
  t = t.replace(/^[,.;:\-–\s]+|[,;:\-–\s]+$/g, '').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

export function estimateDuration(normTitle: string, kind: Kind, fallback = 30): number {
  if (kind === 'event') {
    if (/\b(call|daily|cafe com)\b/.test(normTitle)) return 30;
    return 60;
  }
  if (kind === 'habit') {
    if (/\b(meditar|meditacao|alongar|alongamento)\b/.test(normTitle)) return 15;
    if (/\b(beber agua|remedio|vitamina)\b/.test(normTitle)) return 5;
    if (/\b(ler|leitura)\b/.test(normTitle)) return 30;
  }
  for (const [re, min] of DURATION_RULES) if (re.test(normTitle)) return min;
  return fallback;
}

/** Reaproveita o parser só para extrair uma data de uma consulta. */
export function extractDate(text: string, ref = todayISO()): string | undefined {
  return parse(text, { ref }).date;
}
