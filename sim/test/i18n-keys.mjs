// Group 'i18n': every key used as t('…') / t("…") in sim/src/*.js exists in both locales of i18n.js. A literal followed
// by `+` is a prefix (at least one key with it must exist in each locale); template literals with ${…} and non-literal
// arguments are dynamic — listed, not checked (their families are covered by the params / validators tests).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES } from '../src/i18n.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
// render.js imports three (browser only): read ROUND_COLOR_KEYS from its source
const ROUND_COLOR_KEYS = [...(readFileSync(join(SRC, 'render.js'), 'utf8').match(/ROUND_COLOR_KEYS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);

export function runI18nKeys(check) {
  console.log('\n## i18n: t() keys exist in ru and en');
  const missing = [], prefixMissing = [], dynamic = [];
  let nLit = 0, nPre = 0;
  for (const f of readdirSync(SRC).filter((x) => x.endsWith('.js')).sort()) {
    const src = readFileSync(join(SRC, f), 'utf8');
    for (const m of src.matchAll(/(?<![\w.$])t\(\s*(['"`])((?:(?!\1)[^\\\n])*)\1(\s*\+)?/g)) {
      const [, q, key, plus] = m;
      if (q === '`' && key.includes('${')) { dynamic.push(`${f}: \`${key}\``); continue; }
      if (plus) { nPre++; for (const L of ['ru', 'en']) if (!Object.keys(LOCALES[L]).some((k) => k.startsWith(key))) prefixMissing.push(`${f}: ${key}… (${L})`); continue; }
      nLit++;
      for (const L of ['ru', 'en']) if (!(key in LOCALES[L])) missing.push(`${f}: ${key} (${L})`);
    }
    for (const m of src.matchAll(/(?<![\w.$])t\(\s*(?![\s'"`)])([^,)\n]+)/g)) dynamic.push(`${f}: t(${m[1].trim()}…)`);
  }
  const uniq = (a) => [...new Set(a)];
  check(missing.length === 0 && prefixMissing.length === 0 && nLit > 100,
    `${nLit} literal t() keys and ${nPre} prefixes in sim/src/*.js all in ru and en${missing.length || prefixMissing.length ? `; MISSING: ${uniq([...missing, ...prefixMissing]).join(', ')}` : ''}; dynamic (not checked) ${uniq(dynamic).length}: ${uniq(dynamic).join('; ')}`);
  const colours = ROUND_COLOR_KEYS.flatMap((k) => ['ru', 'en'].filter((L) => !(`colour.${k}` in LOCALES[L])).map((L) => `colour.${k} (${L})`));
  check(colours.length === 0 && ROUND_COLOR_KEYS.length >= 18, `round colour names colour.* (${ROUND_COLOR_KEYS.length}) and unit.mm in ru and en${colours.length ? `; MISSING: ${colours.join(', ')}` : ''}`
    + ('unit.mm' in LOCALES.ru && 'unit.mm' in LOCALES.en ? '' : '; MISSING unit.mm'));
}
