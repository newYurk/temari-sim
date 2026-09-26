// #43: the validator summary as a self-contained job — the same computeAll + runValidators the UI used to run
// synchronously, from plain inputs (recipe / ref JSON, raw params, stage, locale). Runs in validate-worker.js after the
// first frame; main.js falls back to runValidators on its own A when a worker is unavailable. No check is skipped or
// weakened: the result must equal runValidators(computeAll(recipe, raw), stage, ref) (test group 8m).
import { computeAll } from './layers.js';
import { runValidators } from './validators.js';
import { setLocale } from './i18n.js';

export function validateJob({ recipe, ref, raw, stage, locale }) {
  if (locale) setLocale(locale);   // value / crit texts are localized through t()
  const t0 = performance.now();
  const A = computeAll(recipe, raw);
  const t1 = performance.now();
  const V = runValidators(A, stage, ref);
  return { V, computeMs: t1 - t0, validateMs: performance.now() - t1 };
}
