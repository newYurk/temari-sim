# Kiku S8 shoulder shape under tension with friction: specification for step (в) and sample measurement protocol

Author: Claude cloud session (temari-sim-0f), 2026-09-25. Basis: model/spec.md Φ0–Φ3, samples/kiku-s8/tip-drop-diagnosis.md, sim/src/path.js (packThenPierce, layLeg), own sphere calculation (`bow_theory.py`, pure Python, no numpy). File temari/docs/papers.md was unavailable from the cloud; Cantarella / Dubins / Singh links — see §1.5.

**Note:** Original was Russian from a Fable session (`tmp/fable-2026-09-25/leg-shape-spec.md`). This is a faithful English translation for the repo.


> **Fable revision 2 corrections applied; full v2 file applied.**
> Key v2 changes: V21 = transversality (one meridian meeting, angle ≥ α_geo, stick < max(0.7 mm, 0.025·R, w));
> rows n≥2 = rail along previous arm (not concentric small circles); bowFrac default 0.5 (λ=μ not default);
> V20 warn >0.9μ / fail >1.1μ; do not claim the model “reconciles both sources” — rows ≈ 20/Δ is arithmetic;
> GT14 photos also compatible with geodesic; bow is Olympus intent; sample decides.

## 0. One-line summary

Row-1 shoulder = arc of a **small circle** with constant geodesic curvature κ_g = λ/R, where 0 ≤ λ ≤ μ (friction cone Φ3), **convex away from the pole** (curvature center on the pole side). Row 1 = small-circle arc; rows n ≥ 2 = rail along the previous laid arm (packThenPierce spirit — offset from previous polyline, not concentric circles about P). No envelopes, clamps, or target Δ: tip drop, row count, and bow sagitta are consequences of a single number λ.

## 1. Physics

1.1. **What physics fixes.** A taut thread on a smooth sphere lies on a great circle (κ_g = 0). With friction, any pose is stable where the lateral tension component T·κ_g does not exceed friction μ·T·κ_n, i.e. λ = κ_g·R ≤ μ (Φ3, independent of T). Physics gives the **admissible set of shapes**, not a unique shape.

1.2. **Who chooses within the set.** The master while laying: a finger presses the thread; Olympus explicitly says to ease tension slightly for a rounded petal (OLY-TM7-L «糸を少し緩ませて、花びらの丸みを意識しながら»). After tightening, friction holds the thread where it was placed. So row-1 shape is a design parameter within λ ≤ μ, not a minimization result.

1.3. **Row 1 is held by friction; rows n ≥ 2 by contact.** Chord X_n→E_n at small Δ passes inside the tube of row n−1, so tension presses row n against row n−1 as a rail. Row n copies row n−1 offset by w outward, independent of μ. Hence the craft saying “the first row sets the petal.”

1.4. **Bend direction.** Tip drop Δ ≈ w / sin α′, where α′ is the arrival angle of the thread to the meridian at the lower point. For a geodesic shoulder α′ = α_geo ≈ 7.6–8.5°, hence ~5 mm. To get 2 mm, need α′ ≈ 20°, i.e. the thread must meet the line **steeper**, so the shoulder is convex **outward**: away from the pole, away from the upper part of the destination meridian, toward the equator. The petal is then round, as in Olympus. Bowing **toward** the marking reduces α′ and increases Δ; under honest packThenPierce Δ → ∞. bowToMarking gave 2.17 mm only because of the meridian clamp and the last-5% sample slice (confirmed by skeptic and reading path.js:252, :272).

1.5. **Extremal and Dubins link.** With fixed ends and |κ_g| ≤ μ/R, the largest arrival angle is given by the unique constant-curvature arc λ = μ. Check: a bang-bang path with one switch gives angle 0.414·κL; the arc gives 0.5·κL. That is the Dubins structure on the sphere: max-curvature small-circle arcs and geodesics; here one arc is enough. If papers.md (Cantarella or Singh) states the stability condition differently, reduce it to λ ≤ μ; there is no other Coulomb-friction surface condition of that form.

1.6. **What shoulder shape does not explain.** Δ = 1 mm is unreachable by free bow at any μ < 1 (needs α′ ≈ 45°). If a sample shows Δ ≈ 1 mm, another mechanism is at work: thread-on-thread climb at the tip, or flattening. V13 (top width) is not cured by bow — skeptic run confirmed; do not force it.

## 2. Formulas (sphere, no planar approximations)

Notation: R = C/2π. X and E are shoulder ends as in sim: X on −φ side of L_{2j} at level s_T, E on +φ side of L_{2j+1} at level s_B, lateral offset (m+w)/2. L = R·γ — geodesic shoulder length, γ — central angle XOE. α_geo — angle between great circle XE and the meridian at E. λ ∈ [0, μ].

(1) Small circle: angular radius ρ = arccot λ. Center P (unit vector): ∠(P,X) = ∠(P,E) = ρ, P on the pole side of plane OXE, i.e. sign(P·(X×E)) = sign(N·(X×E)), N = (0,0,1).

(2) Angle between arc and chord at each end: **sin θ = λ · tan(γ/2)**. Planar θ ≈ λL/(2R); at γ = 56° the planar formula underestimates θ by 9%.

(3) Arrival angle at meridian: **α′ = α_geo + θ**.

(4) Tip drop: packThenPierce on the arc (parallel curve w outward to the E-line), estimate **Δ ≈ w / sin α′**.

(5) Sagitta over the chord: **δ = R·(ρ − arccos(cos ρ / cos(γ/2)))**; planar L²λ/(8R). Inverse from sample: λ from δ numerically via (5), rough λ ≈ 8δR/L².

(6) Arc length: L_arc = R·sin ρ·Δψ, where Δψ is the rotation angle about P from X to E. Analytical check for V2 instead of haversine alone.

(7) Φ3 as validator: λ_max = max over all shoulders |κ_g|·R ≤ μ. For the arc λ_max = λ by construction. For an arbitrary polyline compute κ_g discretely: tangent-plane turn of the tangent divided by link length.

## 3. Expected numbers

Default sim params: C = 240, w = 0.714, m = 1.0, N = 8, s_T = 5, s_B = 40. R = 38.197, L = 37.33 mm, γ = 56.0°. Calibration: at λ = 0 an independent packThenPierce implementation gives Δ = 4.972 mm vs 4.968 in sim.

| λ = κ_g·R | ρ, ° | θ, ° | α′, ° | tip Δ, mm | sagitta δ, mm | rows to equator |
| --- | --- | --- | --- | --- | --- | --- |
| 0 (geodesic) | 90 | 0 | 7.63 | 4.97 | 0 | 4 |
| 0.10 | 84.3 | 3.05 | 10.7 | 3.56 | 0.51 | 6 |
| 0.20 | 78.7 | 6.10 | 13.7 | 2.80 | 1.02 | 8 |
| **0.32** (cotton μ, lower estimate) | 72.3 | 9.80 | 17.4 | **2.24** | 1.63 | **11** |
| 0.40 | 68.2 | 12.3 | 19.9 | 1.98 | 2.05 | 12 |
| 0.45 | 65.8 | 13.8 | 21.5 | 1.85 | 2.31 | 13 |
| 0.52 | 62.5 | 16.1 | 23.7 | 1.70 | 2.68 | 14 |
| **0.60** | 59.0 | 18.6 | 26.2 | **1.55** | 3.12 | 16 |

Reading the table:
- At μ = 0.32 the cone limit gives Δ ≈ 2.24 mm and ~11 rows (sim may show 12; ±1 tolerance). Compatible with TK-UWA “about 2 mm” under bow intent. Rows ≈ 20/Δ is arithmetic; GT14 photos are also compatible with geodesic. Bow is Olympus intent; the sample decides — do not claim the model reconciles both sources.
- At μ = 0.6 the limit gives 1.55 mm and 16 rows — more than on the photo. So on a real ball either μ ≈ 0.3, or the master does not use the full cone. Sample row count measures λ directly: 8 rows ⇒ λ ≈ 0.2; 11 ⇒ 0.32; 13 ⇒ 0.45.
- GT14 “extra 1–2 mm” is covered by λ ≈ 0.3–0.6 only in its upper half; the 1 mm lower bound is not reached by free bow (§1.6).

## 4. What Grok writes

1. Parameters: `shoulderForm: geodesic | bow`; `bowLambda` = λ (or δ via (5)); legacy bowFrac·μ ∈ [0, 1] as master intent (“how round the petal”), default 0.5 for bow (λ=μ is not the default; Fable v2); take μ as **μ thread–wrap** (P2), keep separate from μ thread–thread (P1) in schema and preset. No Δ_tip input.
2. `layLeg` for `bow`: small-circle arc per (1) with λ = bowFrac·μ, center on the pole side; samples uniform in angle about P; endpoints X,E fixed; all points on radius R. If λ < 1e-9 → geodesic.
3. `packThenPierce`: same idea, but packing normal is not “last 5% of samples” — it is the arc tangent plane at E; for a small circle that is known analytically (direction P×E). Row n ≥ 2 follows a rail offset from the previous laid polyline (not a new concentric small circle about P); packThenPierce sets the level.
4. Validators: **V20 “friction cone”** warn if λ_max > 0.9 μ (incl. full cone); fail only if λ_max > 1.1 μ (Fable v2); **V21 “transversality”** (Fable v2): exactly one intersection with the destination meridian; crossing angle ≥ α_geo; stick-to-axis run (lat < 0.05 mm) < max(0.7 mm, 0.025·R, w). (Literal min lat > w/2 is impossible — leg must meet the meridian.) Both need negative tests.
5. Delete: `tipEnv`, `TIP_ENV_NORM`, clamp `Math.min(tipEnv(t)·cap, lat)`, the `0.95` sample slice in `armPackNormal`, “craft band 1.5–2.5” and asserts on it.
6. Docs: mark D33 cancelled by a new decision; in tip-drop-diagnosis.md remove “Φ3 not exceeded”, add §9 with formulas (2)–(5) and table §3; list V19/V20/V21 in README.

## 5. What Codex checks (acceptance)

1. Calibration: `bow` with λ = 0 reproduces current numbers (Δ = 4.968; row-1 lengths; V3 pass vs reference).
2. Formula (2): numerically measured arc-vs-chord angle at E matches arcsin(λ·tan γ/2) to 0.01°.
3. Convergence: Δ and δ at LEG_SAMPLES 48 / 96 / 192 / 384 differ by less than 0.5% (vs 3.42 / 2.50 / 2.25 / 2.19 under the clamp).
4. Φ3: λ_max/μ ≤ 1 at bowFrac ≤ 1, exactly 1 ± 1e-6 at bowFrac = 1; at bowFrac = 1.2 V20 fails.
5. Transversality (V21): one meridian meeting, cross angle ≥ α_geo, stick < max(0.7 mm, 0.025·R, w); glued tip negative must fail.
6. §3 numbers at μ = 0.32 and 0.6 within 2%; rows to equator 11 and 16.
7. Direction: under `bow`, α′ > α_geo and Δ < Δ_geo. Mutation “center P on the equator side” must give Δ > Δ_geo with V20 still pass — direction negative test.
8. Lengths: V2 agrees with analytical arc length (6), not only polyLen.
9. V13 under `bow` does not improve much — expected; the test records status, not a “cure.”

## 6. Sample measurement protocol

**What to stitch.** Mari 23–25 cm (record circumference to 1 mm), S8 metallic marking, Perle #5 in two colors, circuits **A1 → B1 → A2** per GT14: top 5 mm from pole, bottom at 1/3 of the arc from the equator. Lay as usual, tension as habit. If time allows: same on the other pole with Olympus-style lay (thread slightly eased, round petal). Better still — take set A on one pole to the equator to count rows.

**Tools.** Steel ruler 0.5 mm divisions, calipers, paper tape, fine sewing thread or wire, phone with macro, scale ruler or millimetre paper in frame, tripod, side light (desk lamp from the side).

**Measurements.**

| # | Quantity | How | Closes | Expectation per §3 |
| --- | --- | --- | --- | --- |
| 1 | Circumference C | tape around ball through poles, three times, average | R | 240 ± 5 |
| 2 | Marking width m | 10 wraps on ruler, divide by 10 | U10 | 0.5–1.0 |
| 3 | Thread width w | 10 close Perle wraps on a pencil, divide by 10 | U2 | ~0.7 |
| 4 | **Row-1 sagitta δ** | stretch a fine thread between X1 and E1 (that is the great circle), measure gap to the laid thread mid-shoulder | U5, U13 → λ via (5) | 1.0–1.6 at λ 0.2–0.32 |
| 5 | **Tip angle 2α′** | macro straight down on lower A1 point with ruler in frame; protractor on photo | λ via (2)–(3) | 27–35° at λ 0.2–0.32; 15° if geodesic |
| 6 | **Tip drop Δ** | tape along L1 from pole: s of lower A1 and A2 | U15 | 2.2–2.8 at λ 0.2–0.32 |
| 7 | Upper catch width A1 and A2 | macro from above on upper point with ruler | U3, V13 | +0.2–1.0 w |
| 8 | **Side tip profile** | macro with side light on lower A2: climb step of A2 onto A1 in last 3–5 mm? | U14, distinguishes hypotheses | 0 under bow; ~0.3 mm under stack |
| 9 | Rows to equator and band width | count A rows, measure band with ruler | U1, U2 | 8 ⇒ λ 0.2; 11 ⇒ 0.32 |
| 10 | Thread consumption | weigh skein before/after; 200 tex ⇒ 5 g = 25 m | M2 | — |
| 11 | Pull force (optional) | spring scale on needle at usual tension, 10 times | P3 | — |

**How to tell hypotheses apart on a sample.**

| Sign | Bow (this spec) | Tip stack | Flattening |
| --- | --- | --- | --- |
| row-1 δ | 1–3 mm | ≈ 0 | ≈ 0 |
| tip angle | 27–50° | ≈ 15° | ≈ 15° |
| side step | none | 0.2–0.4 mm in last mm | none |
| rows in petal body | parallel everywhere | parallel, climb at tip | w_eff < 0.6 |

**Record.** `samples/kiku-s8/measurements/2026-09-DD.md`: table quantity / value / error / photo file; photos with scale in frame; ball and thread params in the header. First project file where column (c) “practice” stops being empty.