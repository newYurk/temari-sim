# Thread lift at crossings and the "tent" (#5, stage 2.4) — lift specification v1.1.1

Against main a3b86b8 (display.js `DISPLAY_STACK_LIFT_W = 0.6`, `stackProfileFn`; layers.js `layerMechanics → null`; path.js `stackLevels` → `c.stack`; validators.js V14). Extends model/spec.md §3 Ф4, §4 T1–T6 and leg-shape-spec v3.3. Basis labels as in model/spec.md: **(a)** source, **(b)** analogue/transfer, **(c)** estimate, **(d)** accepted without data, **(=)** computed here; confidence: high / medium / low. Fable, 2026-09-26.

**Note.** The original is Russian (Fable session, `lift-spec v1`). This is an English translation for the repo with the v1.1 edits applied: Fable's reply on m / plateau / tolerances / B (lift-q §C–§D) and Fable's reply Q5 (support on bridges and flights, §5); v1.1.1 — the review of v1.1 (#5 cleanup: t_c in reduced form, V25 check groups, K18 identity, V26 convergence). The changes against v1 are listed in §9. Where v1 illustrated with B = 0.01 N·mm², the tables are kept as illustrations; the code regenerates them at the current defaults (`samples/lift/numbers.md`, `node sim/tools/lift-numbers.mjs`), and acceptance is by the formulas and limits, not by reprinted numbers.

**Principle.** Lift mechanics is a radial field over the construction: it moves no hole and changes no lateral rule (G3, K12, (8′)–(13)); it sets the height of the thread axis above the sphere along the already built path, and lengths and contact checks follow from it. The numbers are estimates with ranges; one parameter is calibrated from an ordinary photo (§5). A ruler measurement is not needed until the render visibly disagrees with a photo (criterion in §5.3).

The "display now vs physics" scheme is `samples/lift/display-vs-physics.svg` (three panels: a single crossing, a stack m = 2, two crossings closer than 2a); the §2 table is `samples/lift/numbers.md`.

---

## 0. Check of the assistant's estimate δ ≈ sin θ·√(T/k), ℓ ≈ π√(T/k)

The dimensions are right: k is the stiffness of the base per unit thread length, N/mm per mm = N/mm², √(T/k) is millimetres. Then three discrepancies, and the conclusion is that the formula describes a different quantity.

1. **θ is an output, not an input.** For the assistant θ is "half the thread deflection at the overlap, up to 45° in kiku", sin θ 0.3–0.7. But the kink angle of a taut thread at the tent apex is dictated by the sphere: tan θ = √(2Δ/R) + √(s₀/R) ≈ 0.12, θ ≈ 7° (§1.4). Angles of 17–44° on a ball of R = 38 mm are impossible: a thread with such a kink would leave the ball by tens of millimetres. The crossing angle ψ between the threads (which is 20–90°) does not enter the force; it only affects the plateau length on the crest (§1.5).
2. **The formula is for a two-sided base and force loading.** v_max = F/(2√(kT)) = tan θ·√(T/k) is the bump of a string on a Winkler base under a point force F when the base pulls the thread down on both sides. Our base is one-sided (the assistant notes this itself after Stephen & Ch'ng 2018), and the loading is by displacement: the apex height is set by the obstacle (the crest of the lower thread), the force F is a consequence. The apex height does not depend on k and T directly (§1.3); √(T/k) governs the landing of the thread after the tent and the dent of the lower thread.
3. **With the right θ the formula gives 0.04–0.11 mm — and that is the dent of the lower thread, not the rise of the upper one.** tan θ·√(T/k) = F/(2√(kT)) is exactly the deflection of a string on a Winkler base under force F, i.e. δ of the lower thread (§1.7: 0.03–0.10 mm at k = 1–10). The formula does not fit the rise of the upper thread; its agreement with 0.2–0.4 mm at sin θ 0.3–0.7 is a coincidence of the chosen θ. The length ℓ ≈ π√(T/k) = 1–3 mm is the length of the landing zone and of the dent, not of the tent (the tent is 2a ≈ 9 mm).

Result: the relief of 0.2–0.4 mm accepted in the project is confirmed, but not through √(T/k) — through the section thicknesses (T8): Δ₁ = 1.5·t_c − h/2 − δ.

---

## 1. Model (a)

### 1.1 Setting

The upper thread (tension T, bending stiffness B = EI) lies on a sphere R over a soft base (Winkler stiffness k, one-sided: pushes out, does not pull), pressure on the base T/R per unit length (Ф2), own settlement at rest s₀ = T/(kR). At a crossing at angle ψ it rises onto the crest of the lower thread, flattened to thickness t_c and pressed into the base by δ beyond s₀. Heights are measured from the **level of the thread axis at rest** (radius R + h/2 − s₀; s₀ ≈ 0.01 mm is not included in h/2 explicitly and is absorbed by calibration). The equation along the thread (x — arc length, u — axis height above this level; (=), standard mechanics of a beam with a string on a base, Hetényi):

> B·u'''' − T·u'' + T/R + k·[u + s₀]₋ = F·δ(x), where [·]₋ is the negative part (the base acts only when u + s₀ < 0, i.e. below the undeformed surface).

Three characteristic lengths (=): string λ_T = √(T/k), beam λ_B = (4B/k)^{1/4}, bending boundary layer ℓ_b = √(B/T); one dimensionless regime parameter **Π = T/(2√(Bk)) = λ_T²/λ_B²** (§1.2). Free span (u + s₀ > 0): B u'''' − T u'' + T/R = 0 → for ℓ_b ≪ tent length the thread in space is **straight** (a chord), in the spherical frame u'' = 1/R.

### 1.2 Regime: tension or bending (T10)

Dent under a point force in general (=, Fourier transform of equation 1.1 with a two-sided base):

> δ = F / (2·√k·√(T + 2√(Bk))).

The first term of the denominator is tension, the second bending; their ratio is Π. Π ≫ 1 — a string on a base (landing length λ_T, dent F/(2√(kT))); Π ≪ 1 — a Hetényi beam (landing length λ_B, dent F/(2√2·k^{3/4}B^{1/4}) — matches Stephen & Ch'ng 2018 at T = 0). Nothing separates pearl #5 from #8: both have Π ≈ 2–3 (range 0.3–30 over the whole spread of T, B, k; §2), the tension regime; bending changes the dent in them by 10–16 % and rounds the tent apex with radius ℓ_b/θ ≈ 1 mm. The beam regime (Π < 0.5) would set in at B > 0.25 N·mm² (wire, heavily waxed thread) or at k > 100 N/mm² (a rigid ball — then the landing takes ℓ_b ≈ 0.1 mm and is still shorter than any tent). **Conclusion: the tent geometry in any regime is a chord over the sphere; B and k only adjust the ends.**

### 1.3 Rise of a single crossing (T8)

The axis of the upper thread at the apex lies on the crest of the lower one plus half of its own compressed thickness; the axis at rest is h/2 above the base:

> **Δ₁ = 1.5·t_c(F) − h/2 − δ(F)**, F = 2T·tan θ ≈ 2T·(√(2Δ₁/R) + √(s₀/R)) — a fixed point (converges in 5–10 steps with damping ½; clip at zero as Δ₁ → 0).

t_c(F) is the compressed thickness at the overlap by the logarithmic law (b, Durur 2000 through the scale √(tex/ρ) = 2.03, prior adversarial check): t_c = 0.491 − 0.068·ln(0.244·F[gf]) mm; at T = 1 N, F = 0.234 N = 23.9 gf → t_c = 0.371 mm = 0.52 w. The upper thread is compressed by the same force — hence 1.5·t_c, not t_c + h/2. Neither k nor T enters Δ₁ explicitly: T through the logarithm in t_c and through δ ∝ √T, k only through δ. Table Δ₁(T, k) at B = 0.01 N·mm², h = 0.464 mm (=, v1 illustration; at B = 0.0155 the values shift by ≤ 0.003 mm, see `samples/lift/numbers.md`):

| T, N \ k, N/mm² | 0.3 | 1 | 3 (default) | 10 | ∞ (rigid ball) |
|---|---|---|---|---|---|
| 0.5 | 0.267 | 0.312 | 0.341 | 0.359 | 0.377 |
| 1 (default) | 0.197 | 0.235 | **0.266** | 0.289 | 0.315 |
| 2 | 0.162 | 0.169 | 0.196 | 0.221 | 0.255 |

Default **Δ₁ = 0.27 mm = 0.37 w** (range 0.16–0.38 mm = 0.23–0.53 w over the whole spread of T and k; central band 0.2–0.32 at T 0.5–2, k 1–10; at B 0.0155: 0.268 mm = 0.38 w). Agrees with the prior (0.28, 0.21–0.34) and with the project's relief of 0.2–0.4; confidence medium (all inputs are analogues). At T = 1 N the force at the crossing is F = 0.23 N, the mean pressure on the spot F/(π(w_c/2)²/sin ψ) ≈ 0.4·sin ψ MPa, the peak on the Hertzian elliptical spot ×1.5 (b, Månsson–Karlsson–Andersson 1994: the spot is an ellipse elongated along the bisector of the angle, q₀ = 3F/(2πab)) — the same order as the 0.3–0.5 MPa at which the t_c law was taken (b).

### 1.4 Tent shape (T7)

The free span is a chord; in the spherical frame with landing on the one-sided base (=, solution of 1.1 at B → 0):

> u(x) = Δ₁ − σ·|x| + x²/(2R) for |x| ≤ x₀;  u(x) = s₀·e^{−(|x| − x₀)/λ_T} for |x| > x₀,
> x₀ = √(R(2Δ₁ − s₀)) − √(R·s₀),  σ = tan θ = x₀/R + √(s₀/R).

Conditions: u(x₀) = s₀ (touching the undeformed surface) and continuity of slope (−σ + x₀/R = −s₀/λ_T; holds identically since R·s₀/λ_T = √(R s₀)). Rigid limit s₀ → 0: u = Δ₁(1 − |x|/a)², **a = √(2RΔ₁)**, σ = √(2Δ₁/R) — the prior's tent. Defaults (T = 1, k = 3): s₀ = 0.009 mm, λ_T = 0.58 mm, x₀ = 3.90 mm, σ = 0.117 (θ = 6.7°), a = √(2RΔ₁) = 4.51 mm = 6.3 w. The soft base shortens the free flight (3.9 vs 4.5) and adds a landing tail ~λ_T — the total x₀ + λ_T = 4.47 hardly depends on k (4.5–4.6 at k = 1…∞). **Rule: the tent half-length a ≈ √(2RΔ₁) within 5 %** — it is set by the sphere, not by the material. Gap under the thread: 0.15 mm at 1 mm from the apex, 0.09 at 2 mm, 0.03 at 3 mm — to the eye the thread "lies on the ball", but between rows at ±4.5 mm it cannot be pressed down (the same class of phenomena as the free tails of V23 at small λ).

Length: ΔL = ∫(u'²/2 + u/R) dx ≥ **(4/3)·Δ₁·σ** per crossing (=); the full analytic value — crest + two flights + tails 2(s₀²/(4λ_T) + s₀λ_T/R) — agrees with the numerical integral (step 0.01) to 0.3 %; (4/3)Δ₁σ is a lower bound, short by 1–1.5 % (tails ≈ 0.8 %, plateau ≈ 0.3 %). At the defaults 0.042 mm. The slope σ = a/R gives F = 2T·sin θ — the formula of the problem (a, Kawabata 1985 wire method; =).

Apex: not a kink but an arc along the crest of the lower thread with radius ρ_c = (w_c/2)²/(t_c/2) ≈ 1.07 mm (w_c = w·h/t_c = 0.89 mm — local widening by area conservation, b) — the plateau length ℓ_p of §1.5; bending adds a rounding ℓ_b/θ ≈ 1 mm (height difference < 0.005 mm — ignored). Basis (b): Singh 2022 — a thread wraps a convex obstacle only when the wrap angle exceeds 2ℓ_b/(ρ_c + w/2) = 9.6° at the defaults; the apex kink 2θ = 13.4° is at the boundary, so the apex is rounded with radius ≈ max(ρ_c, ℓ_b/θ) ≈ 1.0–1.1 mm, which this section already gives.

### 1.5 Crossing angle ψ

The height Δ₁ does not depend on ψ (crest on crest). What changes is the plateau on the crest: the thread wraps the crest until its slope along the thread equals σ, and it is never longer than half of the contact zone found by the construction (lift exists only where there is contact or a bridge):

> **ℓ_p(ψ) = min(σ·ρ_c/sin²ψ, w_c/(2 sin ψ), max(w_c/2, c.lenMm/2))**

(c.lenMm — the whole zone with axis distance < w along the actual polylines, class (ii); the plateau lies on both sides of the apex). Beyond it — a chord from the departure point (height Δ₁ − ℓ_p²·sin²ψ/(2ρ_c)). Tent half-length a(ψ) = ℓ_p + x₀(Δ_departure) (=):

| ψ | 90° | 60° | 45° | 30° | 20° | 15° |
|---|---|---|---|---|---|---|
| ℓ_p, mm | 0.13 | 0.17 | 0.25 | 0.50 | 1.08 | 1.72 |
| a, mm (without the λ_T tail) | 3.96 | 3.98 | 4.02 | 4.14 | 4.40 | 4.74 |
| former display w/sin ψ, mm | 0.71 | 0.82 | 1.01 | 1.43 | 2.09 | 2.76 |

Threshold **ψ\* = asin(2σρ_c/w_c) ≈ 16°** (range 12–22° over Δ₁ and t_c): below it the plateau takes the whole crest, the upper thread rides along the crest and is unstable to sliding into the groove beside it — these are the climb / rail-parallel classes of the construction (nesting prior: pitch 0.87 for round, 0.9–0.95 for flattened). The display threshold `angleDeg > 5` is replaced by ψ\* from the construction. For ψ < ψ\* the plateau spans the whole contact zone — an honest record of the uncertainty of the apex position along the thread (±w/tan ψ), printed by K19, not a fail. The wedge class at a hole has a one-sided profile: a plateau from the hole over the length of the wedge zone, then the flight; the height by §1.6 (legs of earlier rows at the top lie side by side, not on each other → m = 1, Δ₁ over the band).

### 1.6 Stack of m threads under the upper one (T9)

**m by the contact patch.** m(c) = 1 + m(c′), where c′ is an earlier crossing on the lower thread whose contact patch covers the point: |y_c − y_{c′}| ≤ w_c/(2 sin ψ′) (not less than w/2; 0.45 mm at 90°, wider at shallow angles). Crossings are visited in increasing m (a DAG: a thread is never under itself at one point). The chronological c.stack with the window w/sin ψ (half-width of the *display* bump, 1.6 times wider than the crest; it counted neighbouring crossings 1–2 mm apart as one stack and gave c.stack = 23, Δ ≈ 5 mm) is used only in the display mode.

Inside one patch each intermediate thread adds its compressed thickness, and the lower thread is pressed harder since it carries the sum of the kink forces of all upper threads (∝ Σ√Δ_i):

> **Δ(m) = Δ₁·[1 + κ(m − 1)]**, κ = 0.8 (0.7–1.0; b: Durur t₆/(3t₂) = 0.82–1.02 at 7–30 gf, Panneerselvam 2024 — linearity of stacks; prior adversarial: κ ≈ 0.8 at m = 2, 0.75 at m = 3). Equivalent to Δ₁·m^{0.85}.

| m | Δ(m), mm | Δ/w | a = √(2RΔ), mm | ΔL, mm | former display |
|---|---|---|---|---|---|
| 1 | 0.27 | 0.37 | 4.5 | 0.04 | 0.60 w = 0.43 mm over ±w |
| 2 | 0.48 | 0.67 | 6.1 | 0.10 | 1.2 w → cap 1.0 w = 0.71 |
| 3 | 0.69 | 0.97 | 7.3 | 0.18 | cap 1.0 w |
| 4 | 0.91 | 1.27 | 8.3 | 0.26 | cap 1.0 w |

**Apex height (v1.1, Fable Q5): Δ_c = z_sup + Δ₁(F_c).** z_sup is the support of the upper thread on the lower thread's loaded profile (§1.8, "Support on a bridge and a flight"): 0 on the sphere, the crest of an own apex of the lower thread, or a loaded bridge / flight with its sag. Δ₁(F) is the T8 rise with t_c(F) and δ(F) at F_c = 2T·σ_U (a fixed point together with σ_U = √(2Δ_c/R)). κ applies only inside the patch (m > 1 by the window above), not to displaced supports — their compression is already in the sag and in Δ₁(F). For a pure stack this is exactly Δ(m); over a bridge it is u_bridge − sag + Δ₁ (the lower thread of a bridge does not touch the ball, there is no extra dent).

**Pending (v1.1.1, review of v1.1 §4 (c)).** The review proposes Δ_c = z_sup + t_c(F_c) off the sphere (the upper thread's axis one compressed thickness over the support; no dent of a lower thread that does not touch the ball). It is implemented as `LIFT_CHOICES.apexOff: 'tc'` but not the default: at S8 it raises p95 0.40 → 0.71 mm and the maximum 0.47 → 0.98 mm (compounding over flights), and V27 fails where another crossing's ground dent lies under a flight point. The default `'d1'` is the rule above: Δ_c = z_sup + Δ₁(F_c)·(m > 1 ? κ : 1).

The upper bound is the one-level ceiling over the actual support (K18): **Δ_c − z_sup ≤ 1.5·t_c(F_c) − h/2** (0.325 mm at F = F₁). In the code K18 is the identity of the rule by support kind (ground: Δ₁(F_c); plateau with m > 1: κ·Δ₁(F_c); bridge / flight: Δ₁(F_c)), class (i) 1e-9·w, with the counts per kind printed; the ceiling holds because Δ₁(F) ≤ 1.5·t_c(F) − h/2 by T8. The rigid ceiling Δ_cap(m) = (m + ½)·t_c − h/2 of v1 remains an illustration for a pure stack. Stacks m ≥ 4 in kiku occur only at the centre and in the braid; the former "limit of 3 layers" becomes a print of m_max, not a rule. For almost parallel threads (ψ < ψ\*) in a stack a nesting factor 0.9 per layer (c), but such places the construction already describes as climb/wedge (§3.2).

### 1.7 Dent of the lower thread vs the rise of the upper one (T10)

Under the force F the lower thread (everywhere pressed by the pressure T/R, so for it the base is two-sided — Hetényi without reservations) sinks by δ of §1.2, its section is compressed from h to t_c. The axis of the lower thread drops by **d_low = δ + (h − t_c)/2**, the top of its crest by δ + (h − t_c). Dent profile: δ·e^{−|x|/λ}(cos + sin for Π < 1) over max(λ_T, λ_B) from the edge of the spot; dent half-length ≈ w_c/2 + λ ≈ 1.0–1.5 mm (matches the prior's "1–1.5 mm"). Numbers at T = 1 N (B 0.01):

| k, N/mm² | 0.3 | 1 | 3 | 10 |
|---|---|---|---|---|
| δ, mm | 0.155 | 0.098 | 0.058 | 0.030 |
| δ/Δ₁ | 0.79 | 0.42 | 0.22 | 0.10 |
| d_low, mm | 0.20 | 0.14 | 0.10 | 0.08 |

The dent eats from 10 % (dense base) to 80 % (very soft) of the rise; this is the main uncertainty (prior U "stiffness of the wrap under a narrow load"), and one parameter measures it — Δ₁ from a photo (§5): with known t_c and h, δ is recovered as 1.5 t_c − h/2 − Δ₁, k from formula 1.2. Under a stack m the lower thread sinks by δ·Σ_{i≤m}√(Δ(i)/Δ₁) ≈ δ·(1; 2.3; 3.9) — 0.06 / 0.13 / 0.23 mm at k = 3. The dent is not drawn in the display (inside the tube), but enters V27 (axis distance at a crossing = t_c, not h and not w).

### 1.8 Several crossings along one leg — a hull, not a maximum

A taut thread over several obstacles is the upper convex hull of the apices over the sphere: between apices a distance L apart it runs as a straight chord with height **u = Δ_i + (Δ_j − Δ_i)·x/L − x(L − x)/(2R)** (the minus sign — the ball is convex, prior adversarial item 1), if this chord nowhere dips below the surface; otherwise — two separate tents with tangent landings. Bridge condition for equal Δ: **L ≤ √(8RΔ) = 2a** (9.0 mm at Δ₁). At the defaults the crossings of one kiku leg with the legs of the other set come every 2–6 mm — a thread of set A rides **one bridge** over the band of set B legs without touching the ball between them (panel C of the scheme). The former display took the max over bumps — between bumps the thread lay on the ball, which never happens in photos. Algorithm: in the unrolled frame y = u − x²/(2R) the apices are points, the surface is the parabola y = −x²/(2R); the profile is the upper concave hull (monotone chain over sorted apices, O(n log n) per leg), the ends are tangents to the parabola (the x₀ formula), plus a tail e^{−x/λ_T} after each touch; the dent of the lower thread is a separate field with a minus sign.

**Support on a bridge and a flight (v1.1, Fable Q5).** A bridge is not a rigid support. For a crossing c (upper thread U, lower thread L, point y_c on L):

> z_sup = u_L(y_c) − sag − kink, where u_L is the profile of L from its own apices and bridges, and
> — **sag** = 2σ_U·ℓ_eff, ℓ_eff = a·b/(a + b): a is the distance along L back to the nearest rigid point (a plateau edge of an own apex of L, or a point where L lies on the ball), b forward to the nearest rigid point or to the landing of L (u_L → 0); inside a plateau a = b = 0 → sag 0; bridges between apices ≤ 1.2 w have ℓ_eff ≤ 0.3 w, sag ≤ 0.03 mm (effectively rigid); σ_U = √(2Δ_c/R) with Δ_c of the previous iteration (two iterations converge);
> — **kink** (loaded flight): each crossing over L at point y with force F = 2Tσ_U adds a slope 2σ_U to the flight of L downstream: u_L(x) → max(f, u_L(x) − 2σ_U·(x − y)) for x > y up to the landing; applied in lay order (a new thread reads the supports of earlier ones with their kinks already applied, and applies its own). v1.1.1 (implementation choice for review): a kink ending at the landing is floored at f = min(u_L(x), u_L,own(landing)) — s₀, or another apex's flight holding the envelope up there — and z_sup uses the same floor; a flight load whose window ends at a rigid point (another apex's plateau edge) is a triangle to it, as on a bridge. Either way the loaded profile rejoins the own one without a step (a step made the numerical ΔL grow as 1/step).

Rigid is only where L lies on the ball, on its own crest (plateau) or on a bridge shorter than ≈ 1.2 w between two of its apices. A flight and long bridges are a string: sag 2σ_U·ℓ_eff and kink 2σ_U, landing within 1–2 mm under a second load. On a high support σ_U is larger (at H 0.6 mm — 0.18, F 0.35 N) — that is the limiter. The stack "each thread on all earlier ones" physically exists at the tips (kousa), but grows to ≈ 0.5–0.7 mm and stops: the support sinks, the flight lies down on the ball under the second load, the section is compressed under the growing force.

Order of computation — by laying (a DAG in time): for thread k — (i) supports from the profiles of threads < k, (ii) its apices and hull §1.8, (iii) its kinks on the flights of threads < k. Cost O(number of crossings × iterations).

### 1.9 What the model does not describe (print, don't fix)

- The upper thread rolling sideways off the crest at ψ < ψ\* and in tall stacks at the centre (prior: "tall small-angle stacks can also slide sideways") — the construction answers with the climb/rail classes, mechanics only prints ψ and m.
- A spread of ±0.05–0.1 mm from the twist of a two-ply thread (the crest falls on a strand or on a groove) — a real spread, not an error; it enters the V27 tolerance as class (iii) 0.1 w.
- The dependence of B on T (Hearle 2001, fibre "locking") — in Π it changes only the ends; B is kept constant.
- Creep and settlement of the base over time — U, no data.

---

## 2. Default values (b)

| Quantity | Default | Range | Basis | Confidence | Where it enters |
|---|---|---|---|---|---|
| w (laid width) | 0.714 mm | — | (a) TK-GAUGE | high | everything |
| h (laid height) | 0.464 mm = 0.65 w | 0.42–0.50 | (b) Kawabata D₀ scale; prior adversarial item 4 | medium | Δ₁, lengths (+h/2R) |
| t_c(1 N) (thickness at the overlap) | 0.371 mm = 0.52 w; t_c(T) = 0.491 − 0.068·ln(0.244·F[gf]) | 0.33–0.41 | (b) Durur 2000 log law ×2.03; Kawabata 0.36–0.39 | medium | Δ₁, V27 |
| w_c (local widening) | 0.89 mm | 0.85–0.90 | (=) area conservation | medium | ℓ_p, ρ_c |
| e = b/a flattening | at rest 0.65; at the overlap t_c/w_c = 0.42 | 0.4–0.85 | (b) Ozgen & Gong 2011 (synchrotron, cotton 20–50 tex); Kemp/HGB 0.6–0.75 | medium | section render (#44), not the lift |
| T (tension) | 1 N | 0.5–3 | (d) seam/embroidery analogues (Peirce 1.1–1.5 N at 150–200 tex, machine seam 1 N static); Olympus «糸を少し緩ませて»; `tension_N` empty → 1 N | low | t_c, δ, s₀, λ_T |
| k (Winkler stiffness of the base) | 3 N/mm² | 0.3–10 | (c) wrap modulus 2–5 MPa (`wrapCompliance`), spot 0.7×2 mm → k ≈ F/(δ·ℓ) ≈ 2–5; Stephen & Ch'ng: PU foam 0.04 — 1–2 orders softer than a winding | low | δ, s₀, λ_T, Π |
| B = EI (bending stiffness) | **0.0155 N·mm²** | 0.01–0.03 | (b) Alshukur & Macintyre 2020: combed cotton 3-ply 126 tex, beam method, 1.55e−8 N·m², measured, CV 49 %; HGB 1969 0.55–1.5e−8 at 30–83 tex (v1: 0.01, (c)) | medium | Π, ℓ_b, δ (10–16 %) |
| κ (stack) | 0.8 | 0.7–1.0 | (b) Durur t₆/3t₂; Panneerselvam; prior adversarial item 7 | medium | Δ(m) inside a patch |
| **Δ₁** (single rise) | **0.268 mm = 0.38 w** | 0.16–0.38 (0.23–0.53 w) | (=) T8 from the rows above | medium | calibrated parameter 1 |
| a = √(2RΔ₁) | 4.5 mm = 6.3 w | 3.5–5.4 | (=) T7 | high for a given Δ₁ | tent, bridge |
| δ (dent of the lower thread) | 0.057 mm | 0.02–0.16 | (=) 1.2 | low | d_low, V27 |
| s₀, λ_T, λ_B, ℓ_b, Π | 0.009; 0.58; 0.38; 0.12 mm; 2.3 | — | (=) | — | landing, apex |
| F (force at the crossing) | 0.23 N | 0.15–0.35 | (=) 2T·sin θ | medium | t_c, δ |
| ΔL per crossing | 0.042 mm | 0.02–0.07 | (=) crest + flights + tails; ≥ (4/3)Δ₁σ | high for a given Δ₁ | lengths |
| ψ\* | 16° | 12–22° | (=) 1.5 | medium | display classes |
| **Pearl #8** (w 0.5, ~120 tex, T 0.7, B 0.005) | Δ₁ = 0.22 mm = 0.43 w; a = 4.1 mm = 8.1 w; Π = 2.9 | Δ₁/w 0.3–0.5 | (=) the same laws; tex, w — (c) DMC/TemariKai catalogue | low | preset `dmc-perle-8` |

All three "low" inputs (T, k, B) enter the lift weakly or only through the ends; Δ₁ (and κ) is calibrated from a photo, the rest is recovered or not needed.

---

## 3. Contract `layerMechanics` / `liftAt` (c)

### 3.1 Layer

```
layerMechanics(recipe, P, path, base) → null | {                      // layers.js → buildMechanics (mechanics.js)
  id: 'mechanics', inputs: pick(P, ['w_mm','hw','tension_N','wrapK_Nmm2','bendB_Nmm2','stackKappa','liftMode','lift1_w']),
  parents: [path.stamp], stamp,
  mode: 'display' | 'ideal' | 'measured', displayOnly,                // §5.4
  consts: { mode, R, w, h, T, k, B, kappa, tc, wc, rhoC, delta1, a1, x0, sigma, s0, lamT, lamB, lb, Pi, F1, dent1, psiStarDeg,
            localStackWindowW, stackM, plateauCap, apexOff, status: { T, k, B, kappa, delta1, h } },
  crossings: [{ id, kind, over, under, psiDeg, m, mPatch, mOrd, uUnder, support, zSup, sag, Fc, tcF, d1F, capRel, onGround,
                gap27, delta, cap, xApex, xUnder, plateau: ℓ_p, … }],             // path order; no-apex kinds carry cls
  legs: { [segId]: { apices, edges, bridges, dents, loads: [{ y, sag, s, a, b, dir, bridge, cid }] } },
  lengths: { perSeg: { [segId]: { sphere, axis, lifted, extra, liftMax } }, perThread, total },
  liftMax, mMax, mOrdMax, psiMinDeg, nApex, nLowPsi, bridges, notes: [...]  // print of §1.9
}
liftFnFor(mech, segId) → x_mm ↦ mm      // lift of the axis above the at-rest level (R + h/2), sign +; the LOADED profile
ownLiftFnFor(mech, segId) → x ↦ mm      // the own profile (apices + bridges, before the loads of later threads)
dentFnFor(mech, segId) → x ↦ mm         // ≤ 0: drop of the lower thread's axis under other threads' crossings (§1.7)
A.mechanics.liftAt(segId, i) → mm       // = the loaded profile at vertex i (compatibility with display.js)
```

Input: `path.crossings` (`kind`, `over/under`, `at`, `angleDeg`, `stack`, `dmin`, `lenMm`, `halfMm`, `climbMm`), `path.segs` (polylines on R), `base.R`, parameters. The output does not change `path` (the parent stamp is read only). **Two profiles per leg (v1.1):** the own profile (its apices + bridges) and the loaded one (after the kinks from later threads, §1.8); the display, the lengths and V25–V27 use the loaded profile. `mode: 'display'` → the layer returns an object with the former display profile and the flag `displayOnly: true`; then `A.mechanics.liftAt` is absent (display.js takes the former branch) — old tests are untouched.

### 3.2 Profile by crossing class (inputs from the construction, §1)

| `c.kind` | apex | shape |
|---|---|---|
| crossing, tipCross (ψ ≥ ψ\*) | Δ_c (§1.6) at `c.at` | plateau ℓ_p(ψ) (capped by half the contact zone), chord to x₀, tail λ_T; several apices on a leg — hull §1.8 |
| crossing at ψ < ψ\* | Δ_c | plateau over the whole contact zone, print "position ±w/tan ψ" (K19) |
| climb (Errata 6a.7) | Δ_c at the end of the climb ℓ_m | ramp: from 0 at the hole to Δ over ℓ_m = max(w, 3δ_e) — the same chord of §1.4 on one side (half a tent), not a cos² ramp |
| wedge (uwagake at the upper hole) | by the stack: Δ(m_local) | one-sided profile: plateau from the hole over the wedge zone, then the flight; with m_local = 1 (legs lie side by side, not on each other) the height is Δ₁, not m·Δ₁ |
| rail-parallel (d ≈ w) | 0 | 0 (dense laying; identical to the former) |
| contact (d < w without crossing) | — | not allowed by the rule (unchanged), no lift, V8 fail as now |
| squeeze | Δ₁ | as crossing; section compression is not modelled (U14, V19) |

Between apices further apart than 2a — 0 (the thread at rest). The bridge is computed over all apices of the leg together (not by pairs).

### 3.3 Lengths

Three numbers per segment: `sphere` — the former lower bound (geodesic/arc on R, V3 checks it against calc.py — **unchanged**); `axis` = sphere·(1 + h/(2R)) — the axis at rest (the former diagnostic row `len.diag`); `lifted` = axis + Σ ΔL over the leg's apices (ΔL = ∫(u'²/2 + u/R) dx numerically over the loaded profile, step 0.01 mm between its known kinks — plateau edges, landings, load points and window ends; v1.1.1: at 0.1 mm without the kinks the total was 0.6 % short and single legs up to 4 %) + climb/wedge ramps. The lengths table (main.js) shows all three columns and in the ideal/measured mode labels the total "by mechanics (estimate)", in display — the former "lower bound; lift not included". Scale: v1 expected 0.05–0.3 % of the total length for S8; with the support rule S8 gets +0.4–0.6 % (§6 step 8; measured +0.60 %), the axis correction +h/2R is 0.6 %. The #5 acceptance "lengths stop being a pure lower bound" is met, but no large value should be expected — this is an honest print, not a discovery.

### 3.4 What does not change

None of the K placement constraints (G3, K12/V5, (8′)–(13), K16, K17): the construction is on the sphere, mechanics is above it. Tip drop, number of rows, s_B — unchanged (samples/kiku-s8/tip-drop-diagnosis.md already showed that a radial lift does not change sin α). The needle channel E→X at R − w/2, the dive 6a.18 — unchanged (mechanics only sets the height from which the dive starts: Δ + h/2 instead of 0.6·w·m).

### 3.5 Checks

- **V14** (the thread does not float): display mode — as now; ideal/measured — the model on R (|r − R| ≤ 1e-9, unchanged) and the display: axis ≤ R + w/2 + max Δ_c + 1e-6, where max Δ_c comes from mechanics, not from `DISPLAY_STACK_LIFT_W`; criterion text: "lift — mechanics (mode …)".
- **V25 (new) "The tent is physical".** For each leg: 0 ≤ lift ≤ the leg's highest apex; at crossing/tipCross apices lift ≥ Δ_c − 1e-9·w (covered by a bridge: printed); for a bridge — minimum ≥ 0 (otherwise the hull construction failed → fail). Three groups of apices (v1.1.1, review of v1.1 §2), with reach = ℓ_p + x₀ + 3λ_T: **(a)(b) own-checked** — not in a hull edge, no other apex of the leg closer than reach_i + reach_j, the window [x ± reach] inside the leg: on the OWN profile the symmetry |u(x) − u(−x)| ≤ 1e-9·w and the half-length to 0.05·Δ₁ against its closed form ℓ_p + y\* (y\* on the flight, in the tail or on the crest) within 0.01 mm (search step 0.01); **(c) isolated (unloaded)** — additionally no load window of a later thread overlaps it: loaded = own over the window (1e-9·w); **loaded profile** on every leg with loads — u_loaded ≤ u_own, = u_own outside the load windows, u_own − u_loaded = sag at each load point (skipped: inside another window or at the floor, printed), ΔL_loaded/ΔL_own printed. The former "≤ the chord from the apex, landings monotone" is dropped (the loaded profile is not monotone by construction). Print: the three counters, apices, bridges, m_max, ψ_min, share of crossings with ψ < ψ\*.
- **V26 (new) "Lengths with the lift".** sphere ≤ axis ≤ lifted on every segment; the lengths table integrates the loaded profile at 0.01 mm between its kinks (§3.3; convergence vs 0.002 mm ≤ 0.5 % per leg, class (i), test 5i); on the own-checked apices the numerical ΔL against the analytic one (crest + flights + tails) within 0.5 % (class (i)); the display polyline within 3 % (class (ii), vertex step 0.4 mm); the total per thread is printed in three columns; in the display mode V26 = n/a with the text "display, lengths — lower bound".
- **V27 (new) "Axis distance at a crossing = t_c", against the loaded axis of the lower thread.** At each apex |z_U(c) − z_L,loaded(c)| = t_c(F_c) ± 0.1 w (class (iii): twist spread §1.9), where z_L,loaded = z_L,profile − d_low (on the ball: δ + (h − t_c)/2) or − sag − kink (on a bridge/flight). The version "at the apex's own height" is only an identity of the addition (class (i), 1e-9; kept as a self-check). On rail-parallel — axis distance along the surface w, radial 0 (as V23). This replaces the check "tube ≤ R + w + lift" as the only measure of contact.
- **V8/V16/V19/U14:** classes unchanged; ψ and m are added to the V8 print; U14 gets the status "modelled in ideal, not measured".
- **K18 (new constraint) — rise over the support by support kind:** Δ_c − z_sup equals the rule of §1.6 for its support kind (ground, plateau, bridge, flight; class (i), 1e-9·w; counts per kind and `apexOff` printed), which keeps it ≤ 1.5·t_c(F_c) − h/2 (the crown of one level over the actual support); a violation is a support or stack error, fail.
- **K19 (new, diagnostic) — absolute height:** max Δ over the ball and m_eff = Δ_max/Δ₁ are printed with the place of the maximum; expectation for S8 ≤ 0.8 mm; warn above 1.2 mm (an order, not a golden number: two generations of the staircase beyond the expectation); no fail. The share of crossings with ψ < ψ\* and of stacks m ≥ 4 is printed.

---

## 4. The display bump 0.6·w (d)

It does not match physics and cannot be saved by fitting constants: height 0.43 mm vs 0.27 (×1.6; for a stack m = 2 the cap 0.71 vs 0.48 — ×1.5), half-length w/sin ψ = 0.71 mm vs 4.5 (×1/6) — because the tent length depends on R and Δ, not on w; and summing by max instead of a bridge puts the thread on the ball between close crossings, which never happens on a ball. Replace, don't relabel: in the ideal/measured modes the display takes the mechanics `liftFn` (this is the acceptance item "the bump matches physics"); the display mode stays the regression reference with the former label "display only" (`legend.lift.display`) and the constants `DISPLAY_STACK_LIFT_W`, `DISPLAY_STACK_LIFT_MAX_W` — they are read nowhere else. The default is **ideal**: the bump is known to be wrong by a factor of 6 in length, and an estimate with basis labels is not an "invented height" (D28 forbade exactly invention; here every number has a status). If the owner prefers to keep display as the default until a photo — it is one flag, the spec does not change.

A display caveat, not mechanics: the tube is drawn round Ø w with the axis at R + w/2 (D22), the physical axis at rest is R + h/2 = R + 0.325 w; the difference 0.125 mm is a render convention (#44 section), not part of the lift: `liftFn` is measured from the at-rest level, display adds it to its base radius as now.

---

## 5. Calibration from an ordinary photo and modes (e)

### 5.1 What is visible in a photo without a ruler or macro

The scale is given by the ball itself (C is known → R in pixels) or by the thread width (7 threads = 5 mm, TK-GAUGE). On a phone photo (~1500–3000 px per 76 mm diameter → 20–40 px/mm) a single rise of 0.27 mm is 5–10 px, distinguishable only **on the limb** (the edge of the ball's silhouette). Hence one photo: the ball turned so that the zone of petal crossings (where set A goes over set B) or the kiku centre lies **on the edge of the silhouette**, side light. From it:

1. **Δ₁** — the height of a single-crossing bump above the limb arc (parameter 1; expected 5–10 px, accuracy ±30 %).
2. **κ** — the height of the stack at the centre/braid above the limb relative to Δ₁ (parameter 2; needed only if m ≥ 3 occurs in the recipe).
3. **A model check, not a parameter:** the bridge length — the part where the thread is lifted off the limb (a shadow under it in side light) — must be ≈ 2√(2RΔ₁) = 9 mm (180–360 px), not 1.4 mm. One number from the photo checks T7 independently of T8. At the petal tips on the limb the stacked legs thicken it by ≈ one thread width (0.5–0.8 mm; v1.1, Fable Q5) — visible on an ordinary photo; K19 prints the place of the maximum.

### 5.2 What counts as Δ₁ in the measured mode

`lift1_w` = Δ₁/w from the photo (0.38 by default in ideal). From it: δ = 1.5 t_c − h/2 − Δ₁ (if δ < 0.02 or > 0.2 — print "t_c or h out of range, check the section by #44"), k from 1.2 (print only), a, ΔL, Δ(m) by T7–T9. Nothing else is fitted.

### 5.3 A visible mismatch (when a measurement is needed after all)

- A bump on the limb higher than 1.5·Δ₁_ideal or lower than 0.5 (outside 0.13–0.4 mm) — the section (t_c, h) or the base is out of range; then measurement (a)/(b) of Ф4 (a thickness gauge on 1 and 2–4 threads).
- A bridge shorter than 4 mm or longer than 14 mm with the bump in range — T7 is violated (the thread is pressed by hand or the base sinks under the tent) → a side macro of one crossing.
- A stack at the centre higher than Δ₁·(1 + 1.2(m − 1)) or lower than Δ₁·(1 + 0.5(m − 1)) — κ out of range → measurement (b) on 2–4 threads.
- Between crossings closer than 9 mm the thread touches the ball in the photo — the bridge does not work (the thread is pressed by the maker's stitch — U record "the maker pressing the thread down", the same as for the V23 tails).

If none of these happens — the defaults stay, no measurement is needed; the status of Δ₁ changes from (c) to "consistent with a photo" without a number.

### 5.4 Modes

- **display** — the former bump, label "display only", lengths — lower bound, V25–V27 n/a.
- **ideal** (default) — T7–T10 at the §2 defaults, the statuses of the estimates are printed in the legend ("by the model, not measured"), V25–V27 active.
- **measured** — `lift1_w` (and `stackKappa`) from a photo by 5.1–5.2; the rest as ideal; legend "Δ₁ from a photo of <date>".

---

## 6. Implementation order and tests (f)

1. **`sim/src/mechanics.js`** (pure functions, no DOM): `tcAt(F_N)`, `regime(T,B,k)` → {λ_T, λ_B, ℓ_b, Π}, `rise1({T,k,B,h,R})` → {Δ₁, δ, F, σ, x₀, s₀} (fixed point, damping ½, ≤ 50 steps, Δ₁ ≥ 0), `stackRise(Δ₁, m, κ)`, `capRise(m, t_c, h)`, `plateau(ψ, σ, ρ_c, w_c)`, `psiStar`, `tentProfile({Δ, R, s₀, λ_T, ℓ_p})` → x ↦ u, `hullProfile(apices[], R, s₀, λ_T)` (hull §1.8), `extraLength(profileFn, L, R)` (numerical) and `extraLength1(Δ, σ)` (analytic), `dentProfile`. Tests (`sim/test/mechanics.test.mjs`): the §2 numbers at the defaults; limits: k → ∞ ⇒ δ → 0, Δ₁ → 0.315, x₀ → √(2RΔ₁); **B → 0 ⇒ δ × √(1 + 2√(Bk)/T) (1.16; identity 1e-9), Δ₁ −0.004…−0.010 mm (printed)**; T 0.5 → 2 ⇒ Δ₁ decreases monotonically 0.34 → 0.20; slope continuity at x₀ ≤ 1e-9; **numerical ΔL (step 0.01) vs the full analytic value (crest + flights + tails) ≤ 0.5 %; (4/3)Δ₁σ is a lower bound, short by 1–1.5 %**; hull: two Δ₁ apices 6 mm apart → a bridge, midpoint 0.149 mm; 12 mm apart → two tents, 0 between; ψ table §1.5 ±2 %; ψ\* = 16.4°.
2. **`params.js`:** `liftMode` (select display | ideal | measured, default ideal), `wrapK_Nmm2` (3; 0.3–10; status estimate, basis §2), `bendB_Nmm2` (0.0155; 0.01–0.03; measured analogue), `stackKappa` (0.8; 0.7–1.0; analogue), `lift1_w` (optional; when set — measured mode), `tension_N` empty → 1 N marked assumed. `dmc-perle-5.json`: `provisionalLift` → `lift` with a reference to this spec; add a draft `dmc-perle-8.json` (w 0.5, tex 120, statuses estimate).
3. **`layers.js` `layerMechanics(recipe, P, path, base)`** by §3.1: crossings in lay order (§1.8), apices on the leg by the projection of `c.at`, the hull per leg, tails, supports with sag and kinks, `dentFn` by `c.under`; lengths §3.3; stamp; `computeAll` passes `base`. Display mode → a wrapper object without `liftAt`.
4. **`display.js`:** with `A.mechanics.liftFn` — the profile from it on densified samples (as #31: do not interpolate between vertices); the threshold `angleDeg > 5` → `psiStar`; `DISPLAY_STACK_LIFT_W` stays only in the display branch; the legend — three texts by mode (i18n ru/en).
5. **`validators.js`:** V14 by mode; V25, V26, V27, K18, K19 (§3.5); V11 — the mechanics stamp in the chain (base → … → path → mechanics); print in V8. **`main.js`:** lengths table in three columns, mode label.
6. **`samples/lift/`:** `display-vs-physics.svg`, `numbers.md` (tables §1.3, §1.5, §1.6, §1.7, §2), `README.md` — §5 as photo instructions (one paragraph).
7. **Documents:** model/spec.md — G14 rewritten ("display = the mechanics profile in the ideal/measured modes; display — the former bump, display only"), §3 Ф4 — reference to T7–T10, §4 — rows T7 (chord tent, a = √(2RΔ)), T8 (Δ₁ = 1.5t_c − h/2 − δ), T9 (stack κ, support rule), T10 (regime Π, dent δ) with labels; decisions-log — a new D: "lift — mechanics by lift-spec v1.1; D28 (display bump) stays only for the display mode"; uncertainties — U14 status "modelled (ideal), not measured; calibration by photo §5", a new U row "the maker pressing the thread down between crossings (bridge) — photo"; next-stage.md item 3 — closed by this.
8. **Regression (`sim/test/run.mjs`, group '5i'):** display mode — all former tests pinned unchanged (the run.mjs wrapper pins `liftMode: 'display'`); ideal mode (v1.1, Fable Q5 §3 (d)): on S8 (braid, m 0.5, λ 0.32) Δ_c median ≈ 0.3, p95 ≈ 0.5, maximum 0.5–0.8 mm, lifted − axis +0.4–0.6 %; V14/V25/V26/V27 pass, K18 pass; fan/braid — both; stress m 1.0 λ 0.6 — two expectations (v1.1.1): at the petal tips ≤ 1 mm, at the centre the maximum is printed by K19 (plateau stacks), V25 pass, K18 pass. Regression "1 row per set": 4 isolated (unloaded) tents at λ 0.32 and 0.6 and at ×1.25, 0 at λ 0; negative tests — a landing tail of 12λ_T (no isolated tent) and the loaded profile without the sag (V25 fail). **Negative test:** support without sag/kink (a rigid bridge) → staircase > 1.5 mm (K19 prints it; K19 does not fail, the test asserts the height). Time: the hull O(n log n) per leg, budget ≤ 5 % of path.
9. **Closing #5 by the checklist:** the spec section with labels — this file; implementation behind `liftAt` — item 3; lengths not a lower bound — items 3/5 (V26); the bump matches physics (ideal) or is labelled (display) — item 4; schemes — item 6; validators and modes — item 5, §5.4. The task's prerequisites (a macro with a ruler, a thickness gauge) move to §5.3 "when a measurement is needed" — by the owner's decision.

---

## 7. Formula summary (for `numbers.md`)

- s₀ = T/(kR); λ_T = √(T/k); λ_B = (4B/k)^{1/4}; ℓ_b = √(B/T); Π = T/(2√(Bk)).
- t_c(F, h, w) = (h/h₅)·(0.491 − 0.068·ln(0.244·F[gf]·(w₅h₅)/(w·h))) mm, w₅ = 0.714, h₅ = 0.464 — the pearl #5 law in reduced form (the force enters through the pressure; ×k in w and h and ×k² in F gives t_c ×k; v1.1.1, test 5m); for #5 it is the v1.1 law.
- δ = F/(2√k·√(T + 2√(Bk))); d_low = δ + (h − t_c)/2.
- Δ₁ = 1.5 t_c − h/2 − δ; F = 2T·σ; σ = x₀/R + √(s₀/R); x₀ = √(R(2Δ₁ − s₀)) − √(R s₀); a ≈ √(2RΔ₁).
- u(x) = Δ₁ − σ|x| + x²/2R (|x| ≤ x₀), s₀e^{−(|x|−x₀)/λ_T} beyond; rigid limit Δ₁(1 − |x|/a)².
- Bridge: u = Δ_i + (Δ_j − Δ_i)x/L − x(L − x)/2R, if ≥ 0; condition L ≤ √(8RΔ).
- Support: z_sup = u_L(y_c) − sag − kink; sag = 2σ_U·ab/(a + b); kink u_L(x) → max(f, u_L(x) − 2σ_U(x − y)), f = min(u_L, u_L,own(landing)) (a window ending at a rigid point: triangle); Δ_c = z_sup + Δ₁(F_c)·(m > 1 ? κ : 1), F_c = 2Tσ_U (pending: z_sup + t_c(F_c) off the sphere, §1.6); d_low at F_c.
- ΔL₁ ≥ (4/3)·Δ₁·σ; Δ(m) = Δ₁(1 + κ(m − 1)); K18: Δ_c − z_sup ≤ 1.5·t_c(F_c) − h/2.
- ρ_c = (w_c/2)²/(t_c/2), w_c = w·h/t_c; ℓ_p = min(σρ_c/sin²ψ, w_c/(2 sin ψ), max(w_c/2, c.lenMm/2)); ψ\* = asin(2σρ_c/w_c).

---

## 8. Implementation status (2026-09-26)

Implemented in `sim/src/mechanics.js` (`LIFT_CHOICES = { stackM: 'support', plateauCap: 'contact' }`; the rigid-support rule `'patch'` is kept for tests and sweeps only), `sim/src/display.js`, `sim/src/validators.js` (V11, V14, V25–V27, K18, K19), `sim/src/main.js` (three-column lengths table, legend by mode). liftMode default `ideal`, B default 0.0155. Tests: groups '5m' (pure functions) and '5i' (whole patterns, negative rigid-support test).

Measured (ideal, support rule; `samples/lift/numbers.md`):

| Config | Δ_c median / p95 / max, mm | lifted − axis | Status |
|---|---|---|---|
| S8 braid m 0.5 λ 0.32 | 0.268 / 0.403 / 0.469 | +0.60 % | all pass (rigid support: max 2.73 mm, +2.13 %) |
| fan m 0.5 λ 0.32 | 0.268 / 0.445 / 0.606 | +0.61 % | all pass |
| stress braid m 1 λ 0.6 | 0.364 / 1.403 / 1.624 | +2.00 % | V25/V26/V27/K18 pass, K19 warn (plateau stacks up to m 13); V20 λ/μ fail (known, independent of the lift) |

v1.1.1 (#5 cleanup): the lengths now integrate the loaded profile at 0.01 mm between its kinks with the floor of §1.8 (S8 lifted − axis +0.596 → +0.603 %); the ×1.25 builds at λ 0.6 (m 0.5 and 1, fan and braid) pass V25/V26 (before: "isolated tents" with an asymmetry 0.09–0.12 mm — loaded tents taken for isolated ones). V20 prints per free-graze leg the measured rail gap against (Δs)²·λ_r/(8R) (closure 5, point 6).

Implementation choices beyond the text, recorded for review: the dent of the lower thread used for V27 and the loaded profile is d_low(1) where the lower thread lies on the ball (no stack under the point, even if the patch window counts m > 1); (h − t_c)/2 off the sphere; plus (1 − κ)·Δ₁(F) on a plateau with m > 1. V27 prints, and does not fail, positive gaps where the upper thread is bridged over the lower (no contact) and where the lower thread was pressed down later by another thread (the upper one is not re-seated). Open: S8 max 0.47 mm is below the expected 0.5–0.8; the stress maximum 1.6 mm is above the expected ≈ 1 mm (tall plateau stacks at λ ≥ 0.5); the apex rule off the sphere (§1.6 "Pending", `apexOff`).

---

## 9. Changes against v1

- §1.4 — the full analytic ΔL (crest + flights + tails) and the lower bound (4/3)Δ₁σ; Singh 2022 as basis (b) for the apex rounding.
- §1.5, §3.2 — ℓ_p capped by max(w_c/2, c.lenMm/2) (half of the construction's contact zone); wedge — one-sided profile; ψ < ψ\* — plateau over the whole zone, printed by K19.
- §1.6 — m by the contact patch (was: m = c.stack); Δ_c = z_sup + Δ₁(F_c) (was: Δ_c = u_under(y_c) + Δ₁·(m > 1 ? κ : 1)); κ only inside the patch; c.stack only in the display mode.
- §1.8 — added "Support on a bridge and a flight": sag, kink, rigid bridges ≤ 1.2 w; a bridge is not a rigid support; order of computation by laying.
- §2 — B 0.0155 (0.01–0.03) (b) (was 0.01 (c)); Π 2.3, ℓ_b 0.12; T range 0.5–3.
- §3.1 — two profiles per leg (own and loaded); display, lengths, V25–V27 by the loaded one.
- §3.5 — V26: analytic path 0.5 % (class (i)), display polyline 3 % (class (ii)) (was 3 % class (i)); V27 — explicit z_L,loaded formula, self-check identity class (i) (was "r_lower accounts for dentFn"); K18 — Δ_c − z_sup ≤ 1.5·t_c(F_c) − h/2 (was Δ(m) ≤ Δ_cap(m)); K19 — the absolute maximum, warn > 1.2 mm.
- §6 step 1 — B → 0 and ΔL tolerances as above (was "Δ₁ unchanged in the 4th digit", "≤ 1 %"); step 8 — the Q5 expectations and the negative test.

**v1.1.1 (review of v1.1, #5 cleanup):**

- §7 — t_c(F, h, w) in reduced form (the force through the pressure; t_c ×k for a build ×k); d_low at F_c.
- §1.6 — the apex rule off the sphere Δ_c = z_sup + t_c(F_c) recorded as pending (`apexOff: 'tc'`, not the default; numbers there); K18 as the identity by support kind.
- §1.8, §7 — the flight kink floored at min(u, u_own(landing)) (z_sup likewise), a triangle when the window ends at a rigid point: no step where the loaded profile rejoins the own one.
- §3.1 — the contract as in the code (fields, `liftFnFor` / `ownLiftFnFor` / `dentFnFor`).
- §3.2 — "5° < ψ < ψ\*" → "ψ < ψ\*".
- §3.3, §3.5 — V25: three groups (own-checked, isolated (unloaded), loaded profile) with reach ℓ_p + x₀ + 3λ_T and the closed-form half-length; "≤ chord / landings monotone" dropped. V26: lengths at 0.01 mm between the kinks, convergence ≤ 0.5 % per leg.
- §6 step 8 — two stress expectations (tips ≤ 1 mm, centre printed by K19), the 1-row regression and two negative tests.
