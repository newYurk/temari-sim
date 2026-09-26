// Загрузка рецепта (JSON) в браузере и в node — один источник данных.
export async function loadRecipe(url = new URL('../data/recipe.kiku-s8.json', import.meta.url)) {
  if (typeof window === 'undefined') {
    const fs = await import('node:fs');
    return normalizeRecipe(JSON.parse(fs.readFileSync(url, 'utf8')));
  }
  const r = await fetch(url);
  return normalizeRecipe(await r.json());
}

/** Current recipe schema (#52 commit 3): the kiku is addressed on the marking — kiku.center (a point), kiku.halfLines
 *  («L(<center>, azimuth=k)»), kiku.stop (region(...)), sets[].start = L(<center>, azimuth=j). */
export const RECIPE_SCHEMA = 2;
export const RECIPE_V1_DEPRECATED = 'recipe schema v1 (startLine indices; centre P.N and stop at the equator implied) is deprecated — use schema 2 (marking addresses: kiku.center, kiku.halfLines, kiku.stop, sets[].start)';

/**
 * Normalize a recipe to the internal form of schema 2 (idempotent; returns a copy). v2: the addresses are checked and each
 * set gets its start azimuth index (startLine, used by the path builder). v1 (no `schema` or schema 1): converted with the
 * implied centre P.N, half-lines L(P.N, azimuth=k), stop region(P.N, until=C.eq), start = L(P.N, azimuth=startLine), and
 * marked deprecated (schemaIn: 1, deprecated: message). Anything else throws.
 * @param {any} raw @returns {any}
 */
export function normalizeRecipe(raw) {
  const r = JSON.parse(JSON.stringify(raw));
  const schema = r.schema ?? 1;
  if (schema === 1) {
    r.schema = 2; r.schemaIn = 1; r.deprecated = RECIPE_V1_DEPRECATED;
    r.kiku = { center: 'P.N', halfLines: 'L(P.N, azimuth=k)', stop: 'region(P.N, until=C.eq)' };
    for (const s of r.work.sets) {
      if (!Number.isInteger(s.startLine)) throw new Error(`recipe v1: set ${s.set}: startLine must be an integer`);
      s.start = `L(P.N, azimuth=${s.startLine})`;
    }
    return r;
  }
  if (schema !== 2) throw new Error(`recipe: unknown schema ${schema} (supported: 1 deprecated, 2)`);
  const k = r.kiku;
  if (!k || typeof k.center !== 'string' || typeof k.stop !== 'string') throw new Error('recipe v2: kiku.center and kiku.stop are required');
  const hl = /^L\(\s*([^,()]+?)\s*,\s*azimuth\s*=\s*k\s*\)$/.exec(k.halfLines || '');
  if (!hl || hl[1] !== k.center) throw new Error(`recipe v2: kiku.halfLines must be «L(${k.center}, azimuth=k)» (step 1: kiku half-lines by azimuth about the centre)`);
  // #53: kiku program — kiku(<center>, v) with v the valence of the centre; growth g and layer order (defaults +1, over)
  if (k.program !== undefined) {
    const pm = /^kiku\(\s*([^,()]+?)\s*,\s*v\s*\)$/.exec(k.program);
    if (!pm || pm[1] !== k.center) throw new Error(`recipe v2: kiku.program must be «kiku(${k.center}, v)»`);
  }
  if (k.grow !== undefined && k.grow !== 1 && k.grow !== -1) throw new Error(`recipe v2: kiku.grow ${k.grow} (1 or −1)`);
  if (k.layer !== undefined && k.layer !== 'over' && k.layer !== 'under') throw new Error(`recipe v2: kiku.layer «${k.layer}» (over | under)`);
  for (const s of r.work.sets) {
    const m = /^L\(\s*([^,()]+?)\s*,\s*azimuth\s*=\s*(\d+)\s*\)$/.exec(s.start || '');
    if (!m || m[1] !== k.center) throw new Error(`recipe v2: set ${s.set}: start must be «L(${k.center}, azimuth=j)»`);
    if (s.startLine !== undefined && s.startLine !== Number(m[2])) throw new Error(`recipe v2: set ${s.set}: startLine ${s.startLine} contradicts start ${s.start}`);
    s.startLine = Number(m[2]);
  }
  return r;
}
export async function loadJSON(rel) {
  const url = new URL(rel, import.meta.url);
  if (typeof window === 'undefined') {
    const fs = await import('node:fs');
    if (!fs.existsSync(url)) return null;
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  }
  const r = await fetch(url);
  return r.ok ? r.json() : null;
}
