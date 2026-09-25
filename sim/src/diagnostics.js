// Pure diagnostics from assembled model A (computeAll result). No DOM.
// Departments report craft/geometry issues linked to parameters — compact summaries,
// expandable details rendered by main.js.

import { sub, unit, dot } from './geom.js';

/** Elbow / kink thresholds on discrete turn angles along a leg polyline (deg). */
export const ELBOW_OK_DEG = 3;
export const ELBOW_FAIL_DEG = 10; // info band: [ELBOW_OK_DEG, ELBOW_FAIL_DEG); fail ≥ FAIL

/** Tip-drop craft / geodesic guide bands (mm). Result only — never a free input. */
export const TIP_CRAFT_LO_MM = 1.5;
export const TIP_CRAFT_HI_MM = 2.5;
export const TIP_GEODESIC_LO_MM = 4.5;
export const TIP_GEODESIC_HI_MM = 5.5;

/** Turn angle at vertex b of polyline a→b→c, in degrees (same formula as elbow-check.mjs). */
export function turnDeg(a, b, c) {
  const u = unit(sub(b, a));
  const v = unit(sub(c, b));
  return Math.acos(Math.max(-1, Math.min(1, dot(u, v)))) * (180 / Math.PI);
}

/**
 * Scan all type==='leg' segments for the worst discrete kink.
 * @returns {{ maxTurnDeg, worstSegId, worstRound, worstFrac, nLegs, worstI }}
 */
export function measureElbows(path) {
  const legs = (path?.segs || []).filter((s) => s.type === 'leg' && Array.isArray(s.pts) && s.pts.length >= 3);
  let maxTurnDeg = 0;
  let worstSegId = null;
  let worstRound = null;
  let worstFrac = 0;
  let worstI = 0;
  for (const seg of legs) {
    const pts = seg.pts;
    const n = pts.length - 1;
    for (let i = 1; i < pts.length - 1; i++) {
      const t = turnDeg(pts[i - 1], pts[i], pts[i + 1]);
      if (t > maxTurnDeg) {
        maxTurnDeg = t;
        worstSegId = seg.id;
        worstRound = seg.round;
        worstFrac = n > 0 ? i / n : 0;
        worstI = i;
      }
    }
  }
  return {
    maxTurnDeg,
    worstSegId,
    worstRound,
    worstFrac,
    worstI,
    nLegs: legs.length,
  };
}

function elbowSeverity(maxTurnDeg) {
  if (maxTurnDeg >= ELBOW_FAIL_DEG) return 'fail';
  // ELBOW_OK_DEG is an informational reference (sample-step dependent), not acceptance.
  if (maxTurnDeg >= ELBOW_OK_DEG) return 'info';
  return 'ok';
}

function pathDepartment(A) {
  const m = measureElbows(A.path);
  const form = A.params?.shoulderForm || A.path?.tipDrop?.shoulderForm || 'geodesic';
  const severity = elbowSeverity(m.maxTurnDeg);
  const params = form === 'bowToMarking' ? ['shoulderForm', 'mu'] : ['shoulderForm'];
  const maxStr = m.maxTurnDeg.toFixed(2);
  const fracPct = (m.worstFrac * 100).toFixed(0);
  let summary;
  let detail;
  if (m.nLegs === 0) {
    return {
      id: 'path',
      severity: 'info',
      titleKey: 'diag.dept.path',
      summaryKey: 'diag.elbow.none',
      summary: 'no leg segments',
      detailKey: 'diag.elbow.detail.none',
      detail: 'No type=leg polylines to measure.',
      params,
      metrics: { ...m, okDeg: ELBOW_OK_DEG, failDeg: ELBOW_FAIL_DEG, shoulderForm: form },
    };
  }
  if (severity === 'ok') {
    summary = `max turn ${maxStr}° · ok (< ${ELBOW_OK_DEG}° info ref)`;
    detail = `Worst discrete turn on legs is ${maxStr}° at seg ${m.worstSegId} (${m.worstRound}), frac ${m.worstFrac.toFixed(3)} (~${fracPct}% along leg). ${ELBOW_OK_DEG}° is an informational reference (discrete turn vs sample step; not acceptance); fail ≥ ${ELBOW_FAIL_DEG}°. Current shoulderForm=${form}.`;
  } else if (severity === 'info') {
    summary = `max turn ${maxStr}° · discrete-turn info · ${m.worstSegId}`;
    detail = `Informational: max discrete turn ${maxStr}° (≥ ${ELBOW_OK_DEG}° reference, < ${ELBOW_FAIL_DEG}°) at seg ${m.worstSegId} (round ${m.worstRound}), frac ${m.worstFrac.toFixed(3)} along the leg. The ${ELBOW_OK_DEG}° band depends on sample step and is not an acceptance goal; geodesic κ_g is typically ~0.67–0.88°. Linked params: ${params.join(', ')}. layLeg uses tipEnv × Φ3 softmin vs available latitude, then spherical Laplacian smooth (pin endpoints).`;
  } else {
    summary = `max turn ${maxStr}° · kink fail · ${m.worstSegId}`;
    detail = `Severe elbow: max turn ${maxStr}° (≥ ${ELBOW_FAIL_DEG}°) at seg ${m.worstSegId} (round ${m.worstRound}), frac ${m.worstFrac.toFixed(3)}. Linked params: ${params.join(', ')}.`;
  }
  return {
    id: 'path',
    severity,
    titleKey: 'diag.dept.path',
    summaryKey: severity === 'ok' ? 'diag.elbow.summary.ok' : severity === 'info' ? 'diag.elbow.summary.info' : 'diag.elbow.summary.fail',
    summary,
    detailKey: 'diag.elbow.detail',
    detail,
    params,
    metrics: {
      maxTurnDeg: +m.maxTurnDeg.toFixed(3),
      worstSegId: m.worstSegId,
      worstRound: m.worstRound,
      worstFrac: +m.worstFrac.toFixed(3),
      worstI: m.worstI,
      nLegs: m.nLegs,
      okDeg: ELBOW_OK_DEG,
      failDeg: ELBOW_FAIL_DEG,
      shoulderForm: form,
    },
  };
}

function tipDepartment(A) {
  const td = A.path?.tipDrop;
  const form = td?.shoulderForm || A.params?.shoulderForm || 'geodesic';
  const params = form === 'bowToMarking'
    ? ['shoulderForm', 'mu']
    : ['shoulderForm'];
  // Packing is read-only context (not a free tip-drop input).
  const packingNote = true;

  if (!td || !Number.isFinite(td.tipDrop_mm)) {
    return {
      id: 'tip',
      severity: 'info',
      titleKey: 'diag.dept.tip',
      summaryKey: 'diag.tip.none',
      summary: 'no tipDrop yet',
      detailKey: 'diag.tip.detail.none',
      detail: 'Derived tip drop A1→A2 is unavailable (need A1 and A2 bottoms).',
      params,
      metrics: { shoulderForm: form, packingNote },
    };
  }

  const d = td.tipDrop_mm;
  const dStr = d.toFixed(3);
  let severity;
  let summary;
  let detail;
  let summaryKey;

  if (form === 'geodesic') {
    const inBand = d >= TIP_GEODESIC_LO_MM && d <= TIP_GEODESIC_HI_MM;
    if (inBand) {
      severity = 'info';
      summaryKey = 'diag.tip.summary.geoOk';
      summary = `Δ ${dStr} mm · expected for geodesic (~${TIP_GEODESIC_LO_MM}–${TIP_GEODESIC_HI_MM})`;
      detail = `Derived tip drop A1→A2 is ${dStr} mm under shoulderForm=geodesic. Geodesic arms do not bow toward markings, so Δ ≈ ${TIP_GEODESIC_LO_MM}–${TIP_GEODESIC_HI_MM} mm is typical (packing / pierce geometry). Craft band ~${TIP_CRAFT_LO_MM}–${TIP_CRAFT_HI_MM} mm needs bowToMarking + μ (Φ3). Packing note: tip position also depends on flush lay / pierce — not a free Δ input.`;
    } else {
      severity = 'warn';
      summaryKey = 'diag.tip.summary.geoWarn';
      summary = `Δ ${dStr} mm · outside geodesic band`;
      detail = `Derived tip drop ${dStr} mm is outside the geodesic guide band ${TIP_GEODESIC_LO_MM}–${TIP_GEODESIC_HI_MM} mm. Linked: shoulderForm. Packing / pierce may also affect Δ.`;
    }
  } else {
    // bowToMarking — craft band ~1.5–2.5 mm; honor existing phi3Warn
    const inCraft = d >= TIP_CRAFT_LO_MM && d <= TIP_CRAFT_HI_MM;
    if (td.phi3Warn || !inCraft) {
      severity = 'warn';
      summaryKey = 'diag.tip.summary.bowWarn';
      summary = `Δ ${dStr} mm · craft band ${TIP_CRAFT_LO_MM}–${TIP_CRAFT_HI_MM}${td.phi3Warn ? ' · Φ3 warn' : ''}`;
      detail = (td.warn || `Derived tipDrop ${dStr} mm is outside craft band ~${TIP_CRAFT_LO_MM}–${TIP_CRAFT_HI_MM} mm for bowToMarking.`)
        + ` Φ3 cap ${Number(td.phi3CapMm).toFixed(3)} mm at μ=${td.mu}. bowLateral ${Number(td.bowLateralMm).toFixed(3)} mm. Do not force 2 mm past the friction cone. Packing note: flush lay / pierce also set the tip — Δ is a result, not an input.`;
    } else {
      severity = 'ok';
      summaryKey = 'diag.tip.summary.bowOk';
      summary = `Δ ${dStr} mm · within craft band`;
      detail = `Derived tip drop ${dStr} mm is inside craft band ~${TIP_CRAFT_LO_MM}–${TIP_CRAFT_HI_MM} mm (bowToMarking, μ=${td.mu}, Φ3 cap ${Number(td.phi3CapMm).toFixed(3)} mm). Packing is read-only context.`;
    }
  }

  return {
    id: 'tip',
    severity,
    titleKey: 'diag.dept.tip',
    summaryKey,
    summary,
    detailKey: 'diag.tip.detail',
    detail,
    params,
    metrics: {
      tipDrop_mm: +d.toFixed(3),
      sBottom1: td.sBottom1,
      sBottom2: td.sBottom2,
      shoulderForm: form,
      bowLateralMm: td.bowLateralMm,
      phi3CapMm: td.phi3CapMm,
      mu: td.mu,
      phi3Warn: !!td.phi3Warn,
      craftLo: TIP_CRAFT_LO_MM,
      craftHi: TIP_CRAFT_HI_MM,
      geoLo: TIP_GEODESIC_LO_MM,
      geoHi: TIP_GEODESIC_HI_MM,
      packingNote,
    },
  };
}

/**
 * Run all diagnostic departments on assembled model A.
 * Always returns path + tip so geodesic vs bow comparison stays visible.
 * @param {object} A result of computeAll
 * @returns {{ departments: Array<object> }}
 */
export function runDiagnostics(A) {
  if (!A?.path) {
    return { departments: [] };
  }
  return {
    departments: [pathDepartment(A), tipDepartment(A)],
  };
}
