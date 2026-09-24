// Входные параметры симулятора. Все — пользовательские органы управления (требование владелицы:
// полностью параметрическая модель). У каждого: группа, значение по умолчанию, основание и статус.
// Статусы: 'source' — из источника ремесла; 'default' — значение по умолчанию, НЕ измерено;
// 'stored' — хранится, но геометрией этого этапа не используется; 'intent' — замысел дизайна.
// Ширины захвата (pickup width) здесь НЕТ намеренно (решение D16): E/X выводятся из того, что уже на шаре.

export const GROUPS = {
  base: 'а) Шар / основа',
  marking: 'б) Разметка',
  thread: 'в) Нить / материал',
  process: 'г) Процесс',
  intent: 'д) Замысел (слой «кику, набор A»)',
};

export const PARAM_SCHEMA = [
  { key: 'C_mm', group: 'base', label: 'Окружность мари C, мм', type: 'number', def: 240, min: 120, max: 450, step: 1,
    basis: 'TK-GT14 «23–25 cm circum mari» → середина 240 мм', status: 'source', used: 'геометрия' },
  { key: 'baseWrap', group: 'base', label: 'Обмотка основы', type: 'text', def: 'белая, жёсткость не измерена',
    basis: 'TK-GT14 «wrapped in white»; податливость — uncertainties P6', status: 'stored', used: 'не используется' },

  { key: 'N', group: 'marking', label: 'Число делений (Simple N)', type: 'select', def: 8, options: [4, 6, 8, 10, 12, 16],
    basis: 'TK-GT14 «Simple 8 division»; кику из 2 наборов требует чётного N', status: 'source', used: 'геометрия' },
  { key: 'm_mm', group: 'marking', label: 'Ширина нити разметки m, мм', type: 'number', def: 1.0, min: 0.1, max: 2, step: 0.05,
    basis: 'TK-GAUGE «Rainbow Gallery Nordic Gold – 1 strand = 1mm» (единственный калибр золотого металлика в источниках; для разметки часто тоньше → верхняя оценка)',
    status: 'default', used: 'геометрия: положение E/X' },

  { key: 'w_mm', group: 'thread', label: 'Ширина уложенной нити w, мм', type: 'number', def: 0.714, min: 0.2, max: 2, step: 0.001,
    basis: 'TK-GAUGE «DMC Perle 5 – 7 threads = 0.5cm» (та же страница: 10 рядов ≈ 7,5 мм → 0,75)',
    status: 'default', used: 'геометрия: E/X, план рядов; рендер (диаметр трубки)' },
  { key: 'hw', group: 'thread', label: 'Сечение h/w', type: 'number', def: 0.65, min: 0.2, max: 1, step: 0.01,
    basis: 'prior-аналог 0,71×0,46 мм (не Perle #5, docs_thread-over-thread)', status: 'stored',
    used: 'только диагностика «длина по оси нити»' },
  { key: 'tex', group: 'thread', label: 'Линейная плотность, текс', type: 'number', def: 200, min: 20, max: 1000, step: 1,
    basis: 'PRIOR-THREAD: 25 м / 5 г (DMC/Olympus/Cosmo #5)', status: 'default', used: 'масса нити (диагностика)' },
  { key: 'mu', group: 'thread', label: 'μ нить–нить', type: 'number', def: 0.32, min: 0, max: 1.5, step: 0.01,
    basis: 'PHYS-COTTON-MU 0,32–0,52 — хлопковая пряжа, НЕ #5 (только порядок)', status: 'stored', used: 'не используется (нет механики)' },
  { key: 'compress', group: 'thread', label: 'Сжимаемость сечения', type: 'text', def: 'неизвестна',
    basis: 'model/spec.md Т3/Т4 — только законы-аналоги, чисел для #5 нет', status: 'stored', used: 'не используется' },

  { key: 'tension_N', group: 'process', label: 'Натяжение T, Н', type: 'number', def: '', min: 0, max: 20, step: 0.1, optional: true,
    basis: 'не измерено (uncertainties P3); Olympus: «糸を少し緩ませて»', status: 'stored', used: 'геометрией пока не используется' },
  { key: 'startRule', group: 'process', label: 'Закрепление начала', type: 'select', def: 'TK-ANCHOR', options: ['TK-ANCHOR', 'OLY-BASIC'],
    optionLabels: { 'TK-ANCHOR': 'TK-ANCHOR: 2 прохода в то же отверстие', 'OLY-BASIC': 'OLY-BASIC: 1 проход, без узла' },
    basis: 'TK-ANCHOR (вход в то же отверстие, повтор прохода); OLY-BASIC «２～３㎝ほど離れた所から…玉とめなどはしません»', status: 'source', used: 'скрытый старт' },
  { key: 'startRun_mm', group: 'process', label: 'Длина скрытого прохода, мм', type: 'number', def: 35, min: 5, max: 70, step: 1,
    basis: 'TK-ANCHOR «For a 23cm mari … 1–1 1/2" (3–4cm)»; OLY-BASIC 2–3 см', status: 'source', used: 'скрытый старт, баланс' },

  { key: 'topMode', group: 'intent', label: 'Верхние точки ряда 1 заданы как', type: 'select', def: 'mm', options: ['mm', 'fracQ'],
    optionLabels: { mm: 'мм от полюса (GT14)', fracQ: 'доля дуги полюс–экватор' },
    basis: 'TK-GT14 «5 mm down from the NP» — задано в мм', status: 'intent', used: 'геометрия' },
  { key: 'sTop_mm', group: 'intent', label: 'Верх: мм от СП', type: 'number', def: 5, min: 1, max: 30, step: 0.1,
    basis: 'TK-GT14', status: 'source', used: 'если «мм»' },
  { key: 'sTopFrac', group: 'intent', label: 'Верх: доля Q', type: 'number', def: 0.0833, min: 0.01, max: 0.5, step: 0.001,
    basis: '5/60 — пересчёт GT14 для C = 240 (вариант замысла)', status: 'intent', used: 'если «доля»' },
  { key: 'bottomFromEq', group: 'intent', label: 'Низ: доля Q от экватора', type: 'number', def: 1 / 3, min: 0.05, max: 0.9, step: 0.0001,
    basis: 'TK-GT14 «1/3 of this distance up from the equator»', status: 'source', used: 'геометрия (булавки)' },
  { key: 'rowsMode', group: 'intent', label: 'Сколько рядов', type: 'select', def: 'untilEquator', options: ['untilEquator', 'untilOly7', 'count'],
    optionLabels: { untilEquator: 'до экватора (GT14)', untilOly7: 'до 7 мм над экватором (Olympus TM-7, другая техника)', count: 'ровно N рядов' },
    basis: 'TK-GT14 «Work to the equator»; OLY-TM7-L 水色ピン', status: 'intent', used: 'план рядов (путь — только ряд 1)' },
  { key: 'rowsCount', group: 'intent', label: 'N рядов (если «ровно N»)', type: 'number', def: 4, min: 1, max: 30, step: 1,
    basis: 'замысел пользователя', status: 'intent', used: 'план рядов' },
  { key: 'spacingMode', group: 'intent', label: 'Шаг низа между рядами', type: 'select', def: 'laidClose', options: ['laidClose', 'fixedPitch'],
    optionLabels: { laidClose: 'уложить вплотную → колоть в пересечении', fixedPitch: 'фиксированный шаг' },
    basis: 'TK-STRETCH, OLY-TM7-V «自然に交わる所» / TK-UWA «about 2mm»', status: 'intent', used: 'план рядов' },
  { key: 'pitch_mm', group: 'intent', label: 'Фикс. шаг низа, мм', type: 'number', def: 2, min: 0.5, max: 10, step: 0.1,
    basis: 'TK-UWA «about 2mm … not a constant»', status: 'source', used: 'если «фиксированный»' },
];

export const STATUS_LABEL = {
  source: 'источник', default: 'по умолчанию, не измерено', stored: 'хранится, не используется', intent: 'замысел',
};

export function defaults() {
  const o = {};
  for (const p of PARAM_SCHEMA) o[p.key] = p.def;
  return o;
}

/** Нормализация и проверка входов. Возвращает НОВЫЙ замороженный объект (никаких ссылок на старые наборы). */
export function normalizeParams(raw = {}) {
  const out = {};
  const errors = [];
  for (const p of PARAM_SCHEMA) {
    let v = raw[p.key] !== undefined ? raw[p.key] : p.def;
    if (p.type === 'number') {
      if (v === '' || v === null) { v = p.optional ? null : p.def; }
      else {
        v = Number(v);
        if (!Number.isFinite(v)) { errors.push(`${p.key}: не число`); v = p.def; }
        if (v < p.min || v > p.max) errors.push(`${p.key}=${v} вне [${p.min}, ${p.max}]`);
      }
    } else if (p.type === 'select') {
      const opt = p.options.find((o) => String(o) === String(v));
      if (opt === undefined) { errors.push(`${p.key}: недопустимое значение ${v}`); v = p.def; } else v = opt;
    } else v = String(v);
    out[p.key] = v;
  }
  if (out.N % 2 !== 0) errors.push('N должно быть чётным (два набора кику)');
  return Object.freeze({ ...out, _errors: Object.freeze(errors) });
}

/** Параметры из строки запроса (?C_mm=300&w_mm=1). */
export function paramsFromQuery(search) {
  const q = new URLSearchParams(search);
  const raw = {};
  for (const p of PARAM_SCHEMA) if (q.has(p.key)) raw[p.key] = q.get(p.key);
  return raw;
}

/** Стабильный хэш (FNV-1a 32) произвольного JSON-объекта — штамп происхождения слоёв. */
export function hashOf(obj) {
  const s = JSON.stringify(obj, Object.keys(obj).sort());
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
