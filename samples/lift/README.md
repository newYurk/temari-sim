# samples/lift — lift of the thread at crossings (#5)

Model: [model/lift-spec.md](../../model/lift-spec.md) (lift-spec v1.1). Code: `sim/src/mechanics.js` (pure functions and the
mechanics layer), `sim/src/display.js` (the tube follows the mechanics profile in liftMode ideal / measured).

| File | What |
|---|---|
| `display-vs-physics.svg` | Three panels at the v1 defaults (vertical ×8): a single 90° crossing (former display bump 0.6·w over ±w vs the chord tent Δ₁ over ±√(2RΔ₁) ≈ ±4.5 mm, with the lower thread's dent), a stack m = 2, and two crossings 6 mm apart (display: two bumps; physics: one bridge). |
| `numbers.md` | Tables of lift-spec §1.3, §1.5, §1.6, §1.7 and §2 at the current defaults plus whole-pattern statistics in liftMode ideal; regenerate with `node sim/tools/lift-numbers.mjs > samples/lift/numbers.md`. |

**Calibration from an ordinary photo (lift-spec §5).** No ruler or macro is needed: the ball itself gives the scale (C is known, so R in pixels), or the thread width (7 threads = 5 mm). On a phone photo (20–40 px/mm) a single rise of ≈ 0.27 mm is 5–10 px and is visible only on the limb, so take one photo with side light and the ball turned so that the petal crossings (set A over set B) or the kiku centre lie on the edge of the silhouette. Read three things: (1) Δ₁ — the height of a single-crossing bump above the limb arc (parameter `lift1_w` = Δ₁/w, liftMode measured; expected 5–10 px, ±30 %); (2) κ — the height of a stack at the centre or in uwagake relative to Δ₁ (only if m ≥ 3 occurs in the recipe); (3) a model check, not a parameter — the bridge, where the thread is lifted off the limb (a shadow under it), should be ≈ 2√(2RΔ₁) ≈ 9 mm long, not 1.4 mm, and at the petal tips the stacked legs thicken the limb by about one thread width (0.5–0.8 mm; K19 prints the place of the maximum). A measurement with a gauge is needed only on a visible mismatch (§5.3): a bump outside 0.13–0.4 mm, a bridge shorter than 4 mm or longer than 14 mm, a stack outside Δ₁·(1 + 0.5…1.2·(m − 1)), or the thread touching the ball between crossings closer than 9 mm.
