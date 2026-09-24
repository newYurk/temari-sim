// Загрузка рецепта (JSON) в браузере и в node — один источник данных.
export async function loadRecipe(url = new URL('../data/recipe.kiku-s8.json', import.meta.url)) {
  if (typeof window === 'undefined') {
    const fs = await import('node:fs');
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  }
  const r = await fetch(url);
  return r.json();
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
