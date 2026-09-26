#!/usr/bin/env node
// Build glossary.md and sim/src/terms.js from glossary.json (no dependencies).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GLOSSARY_PATH = join(ROOT, 'glossary.json');
const MD_PATH = join(ROOT, 'glossary.md');
const TERMS_PATH = join(ROOT, 'sim/src/terms.js');

const GROUP_TITLES = {
  a: '(a) Основа и разметка',
  b: '(b) Стежки и техники',
  c: '(c) Элементы мотива',
  d: '(d) Нить и инструменты',
  e: '(e) Модель / физика',
};

function load() {
  return JSON.parse(readFileSync(GLOSSARY_PATH, 'utf8'));
}

function variantForms(locale) {
  return (locale?.variants || []).map((v) => v.form).filter(Boolean);
}

function buildMermaid(g) {
  const lines = ['graph TD'];
  for (const [famId, meta] of Object.entries(g.families || {})) {
    const label = `${meta.ru}`.replace(/"/g, "'");
    lines.push(`  subgraph ${famId} ["${label}"]`);
    for (const term of g.terms.filter((t) => t.family === famId && t.status !== 'legacy')) {
      const ru = term.ru?.canon || term.ru?.ui || term.id;
      lines.push(`    ${term.id}["${ru}"]`);
    }
    lines.push('  end');
  }
  return lines.join('\n');
}

function ruCell(t) {
  const ru = t.ru || {};
  const main = ru.canon || ru.ui || (t.status === 'legacy' ? `(${t.id})` : '—');
  const also = variantForms(ru).filter((f) => f !== main);
  const alsoStr = also.length ? ` (также: ${also.join(', ')})` : '';
  const ui = ru.ui && ru.ui !== main ? `; UI: ${ru.ui}` : '';
  return `${main}${alsoStr}${ui}`;
}

function jaCell(t) {
  const parts = [];
  if (t.ja?.canon) parts.push(t.ja.canon);
  if (t.ja?.kana) parts.push(t.ja.kana);
  const rom = t.romaji?.canon;
  if (rom) parts.push(rom);
  const jaAlso = variantForms(t.ja);
  if (jaAlso.length) parts.push(`вар.: ${jaAlso.join(', ')}`);
  const romAlso = variantForms(t.romaji);
  if (romAlso.length) parts.push(`ром.: ${romAlso.join(', ')}`);
  return parts.join(' / ') || '—';
}

function enCell(t) {
  const en = t.en || {};
  const label = en.short && en.short !== en.canon ? en.short : (en.canon || t.id);
  const also = variantForms(en).filter((f) => f !== label && f !== en.canon);
  return also.length ? `${label} (${also.join('; ')})` : label;
}

function sourcesCell(t) {
  if (t.sources?.length) return t.sources.join(', ');
  if (t.status === 'derived') return '[вывод]';
  if (t.status === 'candidate') return '[кандидат]';
  return '—';
}

function buildMarkdown(g) {
  const lines = [];
  lines.push('# Глоссарий');
  lines.push('');
  lines.push('> Сгенерировано из `glossary.json` скриптом `sim/tools/glossary_build.mjs`. Ручные правки не сохраняются.');
  lines.push('');
  lines.push('Формат таблиц: **RU** — JA (кандзи / кана / ромадзи) — EN — определение — код — источники — статус.');
  lines.push(`Транслитерация: ${g.transliteration || '—'}.`);
  lines.push('');
  lines.push('## Карта понятий (Mermaid)');
  lines.push('');
  lines.push('```mermaid');
  lines.push(buildMermaid(g));
  lines.push('```');
  lines.push('');

  const byGroup = new Map();
  for (const term of g.terms) {
    if (!byGroup.has(term.group)) byGroup.set(term.group, []);
    byGroup.get(term.group).push(term);
  }
  for (const group of ['a', 'b', 'c', 'd', 'e']) {
    const terms = byGroup.get(group) || [];
    if (!terms.length) continue;
    lines.push(`## ${GROUP_TITLES[group]}`);
    lines.push('');
    const families = new Map();
    for (const term of terms) {
      const f = term.family || '_';
      if (!families.has(f)) families.set(f, []);
      families.get(f).push(term);
    }
    for (const [fam, bucket] of families) {
      if (fam !== '_' && g.families?.[fam]) {
        const meta = g.families[fam];
        lines.push(`### ${meta.ru}${meta.en ? ` (${meta.en})` : ''}`);
        lines.push('');
      }
      lines.push('| RU | JA | EN | Определение | Код | Источник | Статус |');
      lines.push('|---|---|---|---|---|---|---|');
      for (const term of bucket.sort((a, b) => a.id.localeCompare(b.id))) {
        const code = (term.code || []).join(', ') || '—';
        lines.push(
          `| ${ruCell(term)} | ${jaCell(term)} | ${enCell(term)} | ${term.def.replace(/\|/g, '\\|')} | ${code} | ${sourcesCell(term)} | ${term.status} |`,
        );
      }
      lines.push('');
    }
  }
  if (g.symbols?.length) {
    lines.push('## (e) Символы модели');
    lines.push('');
    lines.push('| Символ | RU | EN | Пояснение |');
    lines.push('|---|---|---|---|');
    for (const s of g.symbols) {
      lines.push(`| ${s.id} | ${s.ru} | ${s.en} | ${s.note.replace(/\|/g, '\\|')} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function unionType(ids) {
  return ids.map((id) => `'${esc(id)}'`).join('|');
}

function collectTypedIds(g) {
  const topRules = [];
  const opKinds = [];
  const segCls = [];
  const crossKinds = [];
  for (const term of g.terms) {
    for (const c of term.code || []) {
      if (c.startsWith('topRule:')) topRules.push(c.slice('topRule:'.length));
      else if (c.startsWith('op.kind:')) opKinds.push(c.slice('op.kind:'.length));
      else if (c.startsWith('seg.cls:')) segCls.push(c.slice('seg.cls:'.length));
      else if (c.startsWith('cross.kind:')) crossKinds.push(c.slice('cross.kind:'.length));
    }
  }
  const uniq = (a) => [...new Set(a)].sort();
  return {
    topRules: uniq(topRules),
    opKinds: uniq(opKinds),
    segCls: uniq(segCls),
    crossKinds: uniq(crossKinds),
  };
}

function termRuLabel(t) {
  if (t.ru?.ui) return t.ru.ui;
  return t.ru?.canon || t.id;
}

function termEnLabel(t) {
  return t.en?.short || t.en?.canon || t.id;
}

function idKey(id) {
  return /^[a-zA-Z_$][\w$]*$/.test(id) ? id : `'${esc(id)}'`;
}

function buildTermsJs(g) {
  const typed = collectTypedIds(g);
  const termEntries = g.terms
    .filter((t) => t.ru?.canon)
    .sort((a, b) => a.id.localeCompare(b.id));

  const termObj = termEntries.map((t) => {
    const fields = [`ru: '${esc(termRuLabel(t))}'`, `en: '${esc(termEnLabel(t))}'`];
    if (t.ja?.canon) fields.push(`ja: '${esc(t.ja.canon)}'`);
    if (t.ru?.ui && t.ru.ui !== t.ru.canon) fields.push(`ruCanon: '${esc(t.ru.canon)}'`);
    return `  ${idKey(t.id)}: { ${fields.join(', ')} }`;
  }).join(',\n');

  const topObj = typed.topRules.map((k) => `  ${idKey(k)}: '${esc(k)}'`).join(',\n');

  return `// generated from glossary.json — do not edit
/** @typedef {${unionType(typed.topRules.length ? typed.topRules : ['fan', 'uwagake'])}} TopRule */
/** @typedef {${unionType(typed.opKinds.length ? typed.opKinds : ['start-run'])}} OpKind */
/** @typedef {${unionType(typed.segCls.length ? typed.segCls : ['free'])}} SegClass */
/** @typedef {${unionType(typed.crossKinds.length ? typed.crossKinds : ['crossing'])}} CrossKind */

export const TOP_RULES = Object.freeze({
${topObj}
});

export const TERM = Object.freeze({
${termObj}
});

/** @type {Readonly<Record<string, keyof typeof TERM>>} */
export const TERM_ALIASES = Object.freeze({
  catch: 'pickup',
});

export function termRu(id) {
  const key = TERM_ALIASES[id] || id;
  const t = TERM[key];
  return t ? t.ru : id;
}
`;
}

function main() {
  const g = load();
  writeFileSync(MD_PATH, buildMarkdown(g), 'utf8');
  writeFileSync(TERMS_PATH, buildTermsJs(g), 'utf8');
  console.log(`wrote ${MD_PATH} (${g.terms.length} terms)`);
  console.log(`wrote ${TERMS_PATH}`);
}

main();
