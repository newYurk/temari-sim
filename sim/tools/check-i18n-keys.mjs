#!/usr/bin/env node
/** Diff Object.keys of LOCALES.ru vs LOCALES.en; exit 1 on mismatch. */
import { LOCALES } from '../src/i18n.js';
const ru = Object.keys(LOCALES.ru).sort();
const en = Object.keys(LOCALES.en).sort();
const onlyRu = ru.filter((k) => !LOCALES.en[k]);
const onlyEn = en.filter((k) => !LOCALES.ru[k]);
console.log(`ru=${ru.length} en=${en.length}`);
if (onlyRu.length || onlyEn.length) {
  console.error('onlyRu:', onlyRu);
  console.error('onlyEn:', onlyEn);
  process.exit(1);
}
console.log('OK: key sets match');
