# Mari outer wrap parameters (#41)

The outer wrap of the mari (地巻き / jimaki) as model parameters. Sources are collected in #5 (comments of 2026-09-25): TemariKai, Suess, Fujix, Sanuki 地巻き用木綿糸, and the papers in `tmp/papers/`. The top layer is thin sewing or overlock thread, not yarn: cotton, cotton blend or spun polyester, with spun polyester #60–90 as the Japanese norm (Fujix). The very top can be Fujix Cotton or King Spun Lock overlock thread. It is wound densely along great circles in varied directions. Matte, slightly hairy thread is preferred for grip; polished polyester, rayon and quilting thread are discouraged as too slippery.

| Key | Type | Default | Status | Used by |
|---|---|---|---|---|
| `wrapColor` | colour `#rrggbb` | `#fbf8f1` (the current ball colour) | intent | render: ball colour |
| `wrapThread` | select | `cotton-sewing` | source | sets the **default** of `muWrap` and the nominal wrap-thread width |
| `muWrap` | number | from `wrapThread` (0.32 for the default type) | default, not measured | V20 friction-cone reference mark (λ ≤ μ is a mark, not a law) |
| `wrapCompliance` | text, read-only | package density 0.35–0.45 g/cm³, modulus 2–5 MPa, dent δ ≈ 0.05 mm | stored (estimate, P6) | display only; stage 2.4 (#5) |

Thread types (`WRAP_THREADS` in `sim/src/params.js`):

| Type | Surface | μWrap default | Band | Nominal width | Source |
|---|---|---|---|---|---|
| `cotton-sewing` | smooth | 0.32 | 0.32 | 0.3 mm | TemariKai, Suess; μ = PHYS-COTTON-MU lower bound |
| `spun-poly-60-90` | hairy spun | 0.38 | 0.35–0.40 | 0.3 mm | Fujix (Japanese norm) |
| `overlock` | hairy spun | 0.38 | 0.35–0.40 | 0.3 mm | Fujix / King Spun Lock |
| `jimaki-cotton` | hairy spun | 0.38 | 0.35–0.40 | 0.3 mm | Sanuki 地巻き用木綿糸 / Fujix Cotton |
| `custom` | user | 0.32 | 0.2–0.6 | 0.3 mm | user-defined |

- Choosing a type in the panel resets `muWrap` to that type's default. The user may then override it. The UI range is 0.2–0.6 (`MU_WRAP_RANGE`); the schema keeps 0–1.5 so that stress tests can still drive V20.
- A URL or recipe that sets `wrapThread` without `muWrap` gets the type's default.
- The hairy-spun value 0.38 is the midpoint of the 0.35–0.40 band given in #41. It is an estimate, not a measurement.
- The nominal width is 0.3 mm for every type. Only "sewing ≈ 0.3 mm" is sourced; per-type widths are not measured.
- Geometry is unchanged. The default type keeps μWrap = 0.32, and μWrap never sets λ: λ comes from `bowLambda`, `bowSagMm` or the 0.32 default, and only the legacy `bowFrac` alias reads μWrap.

## Rendering: wound-thread texture (#42)

- Source, read-only, from the main Temari project: `measure.ts:10-76` (`wrapsToCover`, `sewCover`) → `sim/src/wrap.js`; `shader.ts:276-410` (`wrapAxis`, bake, `createWrapBaker`) → `sim/src/wrap-bake.js`. `craft.ts` and the `stitches.ts` tube helpers are not used.
- Every strand is a great circle of half-width w/(2R) on the unit sphere. The count comes from `sewCover(C, width)`: 448 strands at C = 240 mm and 0.3 mm. The source comment says 449, but the same formula gives 448.
- Axes: an even golden-angle spiral, each axis tilted by a seeded angle of 5–10° in a random direction (mulberry32, seed `0x7e3a1`), followed by a seeded shuffle of the draw order. Coverage over 20k samples: bare 16.3% → 17.1% and ≥4-strand clumps 9.6% → 10.1% against the even spiral. The suite gates both at ≤ 2 points.
- Bake: 4096×2048 on desktop (32 MB) and 2048×1024 on phones (≤ 820 px or a coarse pointer, 8 MB). It uses three's `SphereGeometry` UV layout and runs once per (colour, type, C, size), never per frame. The bake time is logged as `[wrap] bake …` and exposed as `window.__sim.wrapBake`.
- Thread type changes only the look: `hair` gives fibre noise and fuzzy edges, and `sheen` lowers roughness as 0.9 − 0.35·sheen. The width is 0.3 mm for every type.
- The texture is the albedo `map` of the lit `MeshStandardMaterial`. Geometry, validators and the snapshot are unchanged.
