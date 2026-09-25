# Tip-drop diagnosis (issue #4)

**Date:** 2026-09-24 (America/New_York)  
**Scope:** Why bottom tip drop on kiku row 2 is ~5 mm in the current model vs TemariKai GT14 / ToolKit ~1–2 mm.  
**Related:** U15, A22, D26, V12/V13; upper-point width side-issue (U3, A8, U13).  
**Constraint:** GT14, Suess, and Karo numbers are kept separate (D31).

---

## 1. Definition of “tip drop” used here

**Tip drop Δ_tip (row n → n+1)** = difference of bottom-stitch arc coordinates along the marking line:

\[
\Delta_\mathrm{tip} = s_B(n{+}1) - s_B(n)
\]

where \(s\) is arc length from the north pole (NP) along the marking meridian (mm). Same quantity as `levelInfo.dS` on the first bottom stitch of round A2 (`packThenPierce` / G12).

**Not** tip drop (and not the #4 gap):

| Quantity | Default C=240, w=0.714 | Matches source? |
|---|---|---|
| Upper-point descent \(s_T(2)-s_T(1)\) | **0.714 mm = w** | Yes — GT14 / TK-UWA “one thread … below” (D25 / G11) |
| Upper width growth \(W_2-W_1\) | **0.152 mm = 0.21 w** | V13 **warn** vs ~1 w readings (separate U3) |

Issue #4’s “~5 mm vs 1–2 mm” is the **bottom** tip step (U15), not the upper descent.

---

## 2. Observed numbers (current model)

From `computeAll` + A2 validators, stage through A2 (geodesic arms, all legs on radius R, stack lift display-only per D28):

| Inputs (C mm, w mm) | \(s_B(A1)\) | \(s_B(A2)\) | **Δ_tip** | Δ_tip / w | \(s_T\) drop | ΔW upper (V13) |
|---|---|---|---|---|---|---|
| **240, 0.714** (default) | 40.000 | 44.968 | **4.968 mm** | 6.96 | 0.714 (= w) | **+0.152 mm (0.21 w) warn** |
| 300, 1.0 | 50.000 | 58.541 | 8.541 mm | 8.54 | 1.000 | +0.903 (0.90 w) pass |
| 240, 1.0 | 40.000 | 46.767 | 6.767 mm | 6.77 | 1.000 | +1.056 (1.06 w) pass |

**GT14 / ToolKit band (technique quotes, not merged into one law):**

- GT14: “stretch … an **extra 1–2 mm**” at the bottom stitch ([technique] TK-GT14 excerpt).
- TK-UWA: stretch for #5 “usually **about 2 mm**, … not a constant” ([technique] TK-UWA excerpt).
- TK-STRETCH: (i) lay thread along its path and pierce **where it crosses the line** ([technique]); (ii) paraphrase “~2 mm for #5; farther at sharp angles” ([technique] — same page carries both).

**Gap at default:** model **4.97 mm** vs quoted **1–2 mm** ≈ **3–4 mm** (factor ~2.5–5×).

Auxiliary geometry at default (same run):

- Angle between previous-arm great circle and marking meridian at the tip region: **α ≈ 8.47°**.
- Plan check \(w/\sin\alpha\) ≈ **4.85 mm** ≈ packThenPierce **4.97 mm** ([math] — consistent, not a coding slip).
- Row-plan formula in docs used tip half-angle ~6.5° → \(w/\sin\alpha_B\) ≈ 6.3 mm (V12 info); that is a coarser plan estimate, also ≫ 1–2 mm.

---

## 3. Candidate causes (ranked)

### #1 — Recipe / rule choice: packThenPierce on geodesic arms  **[technique + math]** — **primary**

**What the model does (D26 / G12):** lay a new arm as a small circle distance **w** outside the previous arm’s great circle, then pierce where that laid thread meets the marking (OLY-TM7-V 「自然に交わる所」, TK-STRETCH “where it crosses”). No free “2 mm” input.

**Math consequence:** for shallow tip angle α,

\[
\Delta_\mathrm{tip} \approx \frac{w}{\sin\alpha} \sim 5\,\mathrm{mm}
\]

at default — exactly what we measure. Fixed “1–2 mm” (GT14 / TK-UWA number) was an **explicitly rejected** primary rule (D26 alternatives; A22 “not merged”).

**Source tension (do not merge):** TK-STRETCH states the geometric pierce rule *and* a ~2 mm #5 guide. Under geodesic arms those two disagree by ~3 mm. The simulator implemented the geometric rule; the millimetre guide remains a separate recipe intent.

**Confidence:** **high** that this is why the number is ~5 mm, and that it is not an accidental layout bug relative to D26.

### #2 — Real arms are not geodesic near the tip (same physics that can also fix V13 width)  **[physics]** — **likely physical reconciliation**

**Φ3 (friction cone):** non-geodesic lateral deflection is stable if \(\lambda=|\kappa_g/\kappa_n|\le\mu\). For cotton-order μ ≈ 0.32–0.52, a ~37 mm shoulder can bow sideways by ~1.5–2.4 mm and stay ([physics] spec Φ3; geometry.md §7). To get Δ_tip ≈ 2 mm with packing distance w, the effective tip half-angle must be ~\(\arcsin(w/2)\approx 21°\) — i.e. the master must **lay the thread closer to the marking** than the geodesic through E/X (TK-STRETCH “lay … where you want it to go”; OLY slack/round petal).

That is **not** implemented: G4 / D5 keep geodesic idealization. U5 / U13 already flag tip-region arm shape as high uncertainty. The same bow would move where row-1 arms cross the upper perpendicular → larger V13 width growth (U3), so tip drop and V13 warn likely share one geometric cause.

**Confidence:** **medium–high** as explanation of *photographs / GT14 millimetre guides*; **not** a claim that the current code mis-implements D26.

### #3 — Different definitions of “tip drop”  **[technique]** — **secondary, does not close the gap**

- GT14 “**extra** 1–2 mm” can be read as an add-on beyond some baseline (A22); that reading makes total Δ **larger**, not smaller — cannot explain 5→2.
- Visual petal tip vs stitch \(s_B\): row-1 arms cross the axis ~0.9 mm below their top stitch (A23). Measuring “visual tips” shifts both rows similarly; it does not turn 5 mm into 2 mm.
- Confusing bottom tip drop with **upper** descent (0.714 mm) would invent a false match to “one thread lower” — wrong quantity for #4.

**Confidence:** **high** that definition mismatch is not the main gap.

### #4 — Missing stack lift in path length  **[physics]** — **ruled out as primary for Δ_tip**

D28: stack rise is **display-only** (0.6·w per stack level); model legs stay on R; `mechanics.liftAt (layerMechanics hook)` is null. Radial lift ~0.3 mm at a crossing changes path *length* slightly and local contact, but the **surface packing step** that sets \(s_B\) is lateral (distance w at angle α). Order-of-magnitude: radial lift does not change \(\sin\alpha\) enough to cut Δ_tip from 5 mm to 2 mm.

**Confidence:** **high** that missing stack lift is **not** the #4 tip-drop cause. (It remains relevant later for length balance / U14, not for this Δ.)

### #5 — Layout / math bug in packThenPierce  **[math]** — **ruled out**

Implementation matches G12; Δ_tip ≈ \(w/\sin\alpha\); scales sanely with C and w; V12 documents plan vs derived. Channel binding is off (`channelBinding: false`); floor `prev bottom + w` is not forcing the 5 mm.

**Confidence:** **high**.

---

## 4. Ranking summary

| Rank | Cause | Tag | Verdict |
|---|---|---|---|
| 1 | packThenPierce + geodesic ⇒ Δ≈w/sinα≈5 mm; GT14 1–2 mm is a different, unmerged recipe number | technique + math | **Primary (model is consistent with D26)** |
| 2 | Non-geodesic tip lay (friction-held bow) would reconcile ~2 mm + V13 width | physics | **Best physical next hypothesis** |
| 3 | Definition mismatch | technique | Secondary only |
| 4 | Missing stack lift | physics | Not primary for tip drop |
| 5 | Coding bug | math | No |

---

## 5. Recommended next step (specific)

**Do not** silently replace packThenPierce with fixed Δ=2 mm (would violate D26 / no-merge).

**Preferred experiment (code, still parametric):**

1. Add a recipe-level arm-shape control near the tip, e.g. `armTip: geodesic | bowToMarking` (name TBD), default `geodesic` (current idealization).
2. For `bowToMarking`, allow a single length parameter (max lateral offset or target tip half-angle) **bounded by Φ3** (λ≤μ band as warn, not as invented μ).
3. Re-run default C=240, w=0.714: report Δ_tip and V13 ΔW; seek whether one bow setting can put Δ_tip in ~1.5–2.5 mm **and** V13 nearer ~0.5–1.5 w without changing bottom rule.
4. Keep GT14 “fixed 2 mm” available as an **alternate bottom rule** for comparison only (already the spirit of A1 `fixed`), labeled GT14-intent — not as the OLY/TK-STRETCH geometric law.

**Documentation-only fallback (if no code this cycle):** mark in `model/spec.md` G4/G12 and U15 that **geodesic + packThenPierce is an explicit idealization that over-predicts bottom tip step vs GT14/TK-UWA millimetre guides (~5 mm vs ~1–2 mm)**; photos with a ruler (U15) remain the acceptance measurement.

**Owner evidence still needed (issue #4):** marked frames / side macro with ruler for row-1→2 tips (and tip-region arm curve vs great circle).

---




## 6. Confidence tags (overall)

| Claim | Confidence |
|---|---|
| Model Δ_tip(A1→A2)=4.968 mm at 240/0.714 under stated definition | **high** (recomputed) |
| Primary cause = D26 rule + geodesic math, not a bug | **high** |
| Stack lift absence not the tip-drop driver | **high** |
| Non-geodesic tip bow will close GT14 gap + help V13 | **medium** (physics allows; not measured on #5) |
| GT14 “1–2 mm” equals our Δ_tip definition | **medium** (technique quote; no ruler photo yet) |

---

## 7. Pointers

- Spec: G4, G11–G12, Φ3; decisions D5, D25–D26, D28, D31  
- Ambiguities A1, A8, A22, A23; uncertainties U1, U3, U5, U13, U15  
- Sim: `sim/src/path.js` `packThenPierce` / `bottomLevel`; validators V12, V13  
- Issue: https://github.com/newYurk/temari-sim/issues/4

---

## 8. Experiment result: `shoulderForm` (2026-09-24)

**Implemented (parametric):** param / recipe `shoulderForm` = `geodesic` | `bowToMarking`. Input is **shoulder form**; tip-drop **Δ is only a derived result** of packThenPierce on the laid arm. Do **not** merge GT14 fixed 2 mm as the geometric law (D26).

### Mechanics

1. **`geodesic`** — unchanged: legs = slerp; packing plane = from×to great circle.
2. **`bowToMarking`** — tip-weighted envelope pulls interior samples toward the destination marking meridian; lateral arc capped by Φ3 sagitta \(L^2\mu/(8R)\) (spec Φ3). Endpoints fixed; points stay on radius R.
3. **packThenPierce** uses the **tip-region** great circle of the laid prev arm (last ~5% of samples → endpoint). For geodesic arms this equals from×to (Δ unchanged). For bowed arms it sees the steeper local approach angle → smaller derived Δ. (Chord distance to the polyline falsely roots near Δ≈w and must not be used.)

### Measured at C=240, w=0.714

| Mode | μ | Φ3 cap mm | bow lateral mm | **Δ_tip mm** | Notes |
|---|---|---|---|---|---|
| geodesic | 0.32 | 1.46 | 0 | **4.968** | matches §2 |
| bowToMarking | 0.32 | 1.46 | 1.42 | **2.170** | in ~1.5–2.5 craft band; Φ3 not exceeded |
| bowToMarking | 0.40 | 1.82 | 1.67 | **1.926** | in band |
| bowToMarking | 0.52 | 2.37 | 1.96 | **1.759** | in band; V8 may fail (tighter contacts) |

At default μ=0.32, **~2 mm is reachable within Φ3** — no need to force Δ=2 past μ. UI shows derived Δ in caption / lengths; schema has no `tipDrop_mm` input.

### Convention reminder

- Recipe `conventions.shoulderForm` documents the control; `conventions.lay` remains the geodesic idealization note.
- Changing w / C / μ / shoulderForm recomputes downstream (including Δ).

