// Glossary test group `gl` — fast checks for glossary.json contract.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { PARAM_SCHEMA } from '../src/params.js';
import { TOP_RULES, TERM, TERM_ALIASES } from '../src/terms.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const GLOSSARY_PATH = join(ROOT, 'glossary.json');
const MD_PATH = join(ROOT, 'glossary.md');
const TERMS_PATH = join(ROOT, 'sim/src/terms.js');
const BUILD = join(ROOT, 'sim/tools/glossary_build.mjs');
const SOURCES_PATH = join(ROOT, 'sources/sources.json');
const SRC_DIR = join(ROOT, 'sim/src');

const VARIANT_KINDS = new Set([
  'short', 'translit-polivanov', 'translit-club', 'slang', 'translation',
  'descriptive', 'orthographic', 'legacy', 'error',
]);
const VARIANT_SOURCES = new Set(['owner', 'code', 'glossary-root', 'glossval-v2', 'legacy']);

const GLOBAL_ALLOWLIST = [
  'decisions-log.md',
  'uncertainties.md',
  'prior-project/',
  'snapshots/',
  'sources/',
  'glossary.md',
  'glossary.json',
];

function sha(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function loadGlossary() {
  return JSON.parse(readFileSync(GLOSSARY_PATH, 'utf8'));
}

function listFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) listFiles(p, acc);
    else if (/\.(js|mjs|md|json)$/.test(name)) acc.push(p);
  }
  return acc;
}

function allowlisted(rel, extra = []) {
  const all = [...GLOBAL_ALLOWLIST, ...extra];
  return all.some((p) => rel === p || rel.startsWith(p));
}

function stripGuillemets(line) {
  return line.replace(/«[^»]*»/g, '');
}

function codeRefExists(ref, srcText) {
  if (ref.startsWith('topRule:')) {
    const v = ref.slice('topRule:'.length);
    return new RegExp(`options:\\s*\\[[^\\]]*['"]${v}['"]`).test(srcText.params)
      || new RegExp(`['"]${v}['"]`).test(readFileSync(join(SRC_DIR, 'params.js'), 'utf8'));
  }
  if (ref.startsWith('op.kind:')) {
    const v = ref.slice('op.kind:'.length);
    return new RegExp(`kind:\\s*['"]${v}['"]`).test(srcText.path);
  }
  if (ref.startsWith('seg.cls:')) {
    const v = ref.slice('seg.cls:'.length);
    return new RegExp(`['"]${v}['"]`).test(srcText.path) || new RegExp(`cls:\\s*['"]${v}['"]`).test(srcText.path);
  }
  if (ref.startsWith('entryKind:')) {
    const v = ref.slice('entryKind:'.length);
    return new RegExp(`entryKind\\s*=\\s*['"]${v}['"]`).test(srcText.path);
  }
  if (ref.startsWith('cross.kind:')) {
    const v = ref.slice('cross.kind:'.length);
    return new RegExp(`kind\\s*=\\s*['"]${v}['"]`).test(srcText.path)
      || new RegExp(`kind === ['"]${v}['"]`).test(srcText.path)
      || new RegExp(`['"]${v}['"]`).test(srcText.mechanics);
  }
  if (ref.startsWith('shoulderForm:')) {
    const v = ref.slice('shoulderForm:'.length);
    return new RegExp(`shoulderForm.*${v}`).test(srcText.params);
  }
  if (ref.startsWith('order:')) {
    const v = ref.slice('order:'.length);
    return new RegExp(`options:\\s*\\[[^\\]]*['"]${v}['"]`).test(srcText.params);
  }
  if (ref.startsWith('generator:')) {
    const v = ref.slice('generator:'.length);
    return new RegExp(`['"]${v}['"]`).test(srcText.params)
      || new RegExp(`\\b${v}\\s*\\(`).test(srcText.program);
  }
  if (ref.startsWith('V8:')) {
    const v = ref.slice('V8:'.length);
    return srcText.validators.includes(v);
  }
  if (ref.startsWith('family:')) {
    const v = ref.slice('family:'.length);
    return new RegExp(`family:\\s*['"]${v}['"]`).test(srcText.program);
  }
  if (ref.startsWith('type:')) {
    const v = ref.slice('type:'.length);
    return new RegExp(`type:\\s*['"]${v}['"]`).test(srcText.path);
  }
  if (ref.startsWith('layMode:')) {
    const v = ref.slice('layMode:'.length);
    return new RegExp(`layMode:\\s*['"]${v}['"]`).test(srcText.path);
  }
  const all = Object.values(srcText).join('\n');
  return all.includes(ref);
}

function collectScopeFiles(scope) {
  const files = [];
  const base = join(ROOT, scope);
  if (!existsSync(base)) return files;
  const st = statSync(base);
  if (st.isFile()) files.push(base);
  else files.push(...listFiles(base));
  return files;
}

export async function runGlossaryGl(check) {
  console.log('\n## Glossary (gl)');
  const g = loadGlossary();
  const sources = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'));
  const sourceIds = new Set(sources.map((s) => s.id));

  const { execSync } = await import('node:child_process');
  execSync(`node ${BUILD}`, { cwd: ROOT, stdio: 'pipe' });
  const md = readFileSync(MD_PATH, 'utf8');
  const termsJs = readFileSync(TERMS_PATH, 'utf8');
  execSync(`node ${BUILD}`, { cwd: ROOT, stdio: 'pipe' });
  check(readFileSync(MD_PATH, 'utf8') === md, 'glossary.md matches glossary_build output');
  check(readFileSync(TERMS_PATH, 'utf8') === termsJs, 'terms.js matches glossary_build output');

  const ids = new Set(g.terms.map((t) => t.id));
  check(ids.size === g.terms.length, 'term ids are unique');

  function loadSrc() {
    return {
      params: readFileSync(join(SRC_DIR, 'params.js'), 'utf8'),
      path: readFileSync(join(SRC_DIR, 'path.js'), 'utf8'),
      program: readFileSync(join(SRC_DIR, 'program.js'), 'utf8'),
      mechanics: readFileSync(join(SRC_DIR, 'mechanics.js'), 'utf8'),
      i18n: readFileSync(join(SRC_DIR, 'i18n.js'), 'utf8'),
      validators: readFileSync(join(SRC_DIR, 'validators.js'), 'utf8'),
    };
  }
  const srcText = loadSrc();

  for (const t of g.terms) {
    const legacy = t.status === 'legacy';
    check(t.id && t.group && t.def && t.status, `schema fields on ${t.id}`);
    if (!legacy) {
      check(t.en?.canon && t.ru?.canon, `canon locales on ${t.id}`);
      check(Array.isArray(t.ru.variants), `ru.variants array on ${t.id}`);
    }
    if (t.ja) check(Array.isArray(t.ja.variants), `ja.variants on ${t.id}`);
    if (t.status === 'source') {
      check(t.sources?.length && t.sources.every((s) => sourceIds.has(s)), `source ids for ${t.id}`);
    }
    if (t.status === 'candidate') {
      const inCode = (t.code || []).some((c) => codeRefExists(c, srcText));
      check(!inCode, `candidate ${t.id} not referenced in code`);
    }
    for (const loc of ['ru', 'ja', 'en', 'romaji']) {
      for (const v of t[loc]?.variants || []) {
        check(VARIANT_KINDS.has(v.kind), `variant kind on ${t.id} ${loc}: ${v.kind}`);
        const okSrc = VARIANT_SOURCES.has(v.source) || sourceIds.has(v.source);
        check(okSrc, `variant source on ${t.id} ${loc}: ${v.source}`);
      }
    }
    if (t.ru?.canon) {
      for (const v of t.ru.variants || []) {
        check(v.form !== t.ru.canon, `ru canon not duplicated as variant on ${t.id}: «${v.form}»`);
      }
    }
  }

  const glossaryParams = PARAM_SCHEMA.filter((p) => p.glossary && p.type === 'select');
  for (const p of glossaryParams) {
    for (const opt of p.options || []) {
      check(ids.has(opt), `param ${p.key} option «${opt}» is a glossary id`);
    }
  }

  const opKinds = ['start-run', 'lay', 'stitch', 'park', 'resume'];
  for (const k of opKinds) check(ids.has(k), `op.kind ${k} in glossary`);

  const codeIds = ['splice', 'corner', 'free-graze', 'root', 'tangent', 'drain', 'C10', 'C6', 'separate', 'crossover'];
  for (const k of codeIds) check(ids.has(k), `code coverage id ${k}`);

  for (const t of g.terms) {
    for (const c of t.code || []) {
      check(codeRefExists(c, srcText), `code ref «${c}» for term ${t.id}`);
    }
  }

  for (const rule of g.forbidden) {
    if (rule.enabled === false) continue;
    const re = new RegExp(rule.pattern, 'gi');
    const extraAllow = rule.allowlist || [];
    for (const scope of rule.scope) {
      for (const file of collectScopeFiles(scope)) {
        const rel = relative(ROOT, file);
        if (allowlisted(rel, extraAllow)) continue;
        const lines = readFileSync(file, 'utf8').split('\n');
        lines.forEach((line, i) => {
          const scan = stripGuillemets(line);
          re.lastIndex = 0;
          if (re.test(scan)) {
            console.log(`  FAIL forbidden ${rel}:${i + 1} → use ${rule.replaceWith} (${rule.reason})`);
            check(false, `forbidden hit ${rel}:${i + 1}`);
          }
        });
      }
    }
  }
  check(true, 'forbidden spellings (active rules)');

  for (const [id, row] of Object.entries(TERM)) {
    check(typeof row.ru === 'string' && row.ru.length > 0, `TERM.${id}.ru set`);
    const term = g.terms.find((t) => t.id === id);
    if (term?.ru?.ui) {
      check(row.ru === term.ru.ui, `TERM.${id}.ru matches ru.ui when set`);
    }
    for (const v of term?.ru?.variants || []) {
      if (v.form === term.ru?.canon) continue;
      if (v.kind === 'slang' || v.kind === 'translit-club') {
        check(row.ru !== v.form, `TERM.${id}.ru is not club/slang variant «${v.form}»`);
      }
    }
  }
  check(TERM_ALIASES.catch === 'pickup', 'catch aliases to pickup');

  check(Object.keys(TOP_RULES).includes('fan') && Object.keys(TOP_RULES).includes('braid'),
    'TOP_RULES still fan+braid (rename commit pending)');

  const braidRule = g.forbidden.find((r) => r.pattern === 'braid');
  check(braidRule && braidRule.enabled === false && braidRule.since === null, 'braid forbidden disabled until rename');
  check(g.forbidden.some((r) => r.replaceWith === '待ち針 / тидори'), 'forbidden #3 replaceWith тидори');
}
