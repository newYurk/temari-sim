# Recipe scaffold (Technique / Recipe / Result)

Short architecture note for the kiku S8 editable preset. English only.

## Three layers

| Layer | What it is | Where it lives |
|---|---|---|
| **Technique** | How stitches and crossings work (needle against travel, perpendicular catch, channel = straight chord, later-over, closing-under, …) | `sim/data/recipe.kiku-s8.json` → `conventions`, `kagari`, `levels` rules |
| **Recipe** | Marking, sizes, row order, materials, colors — the editable plan for one piece | `sim/data/recipes/kiku-s8.json` + PARAM_SCHEMA keys it lists; **Kiku S8 = one preset**, not the whole system |
| **Execution result** | Where threads actually lie (ops, segs, E/X, tip levels, over/under) | Computed: `params → layers → path.ops` |

## Editable in the kiku preset

- **C, N**, marking width `m_mm`, pins/arcs (`sTop_*`, `bottomFromEq`)
- **rowsMode / order** (and block/sequence companions)
- **Packing density intent** (`spacingMode` / `pitch_mm`) — intent only; fill forecast is **calculated** from occupancy
- **Colors** per set A/B (ribbon); optional per-row overrides later
- **Material ref** → `sim/data/materials/dmc-perle-5.json` (estimates; parametric)

Sizes and order stay in the existing params panel — the Recipe UI section does not duplicate them.

## Same ops for step vs full

Stage buttons and the step slider share one `path.ops` array. Each stage sets `k = path.stageEnd[stage]` via `stageLastOp` (recipe `stages.*.throughOp`). “Run all” / jump to end only uses a later index; it does **not** call a different builder. Asserted in `sim/test/run.mjs`.

## Core vs recipe

**Keep in core:** occupancy-derived E/X, tip packing rules, crossing later-over, validators, shoulder-form math.

**Keep in recipe / occupancy consequence:** chidori interleave, upper-row growth, set colors, material preset id, row-order intent (GT14 alternate vs Suess blocks — D31). Do not hard-code kiku-only craft lore as universal geometry laws.

## Out of this slice (follow-ups)

- Thread change events with start/finish in execution
- Density UI beyond existing `spacingMode`
- Per-row color overrides in the ribbon
- Smooth tent lift / stack bump (owner deferred)
