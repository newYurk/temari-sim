# Karo handicraft — uwagake chidori kagari (video)

- **ID:** KARO-KIKU-V  
- **URL:** https://www.youtube.com/watch?v=tiZkl_1Wv1Y (~13 min, Japanese)  
- **Checked:** 2026-09-25 (owner FYI + frame stills)  
- **Status:** opened (selected clips + owner screenshots; full video not transcribed)

## Why this source

Primary **live needle** lesson for **上掛け千鳥かがり** (*uwagake chidori kagari*), with colour diagrams of later rows. Pair with **TK-GT14** (S8 photo sequence) for model checks: GT14 fixes set order on Simple 8; this video shows hand/needle motion and nested-row geometry that still photos hide.

## Timestamps (owner-verified)

| Time | What it shows | Use for model |
|------|----------------|---------------|
| [2:37](https://www.youtube.com/watch?v=tiZkl_1Wv1Y&t=157s) | Close-up of needle vs gold marking thread; pass under the marking line together with wrapping (芯) threads | Catch / pickup relative to *jiwari*; needle attitude |
| [3:56](https://www.youtube.com/watch?v=tiZkl_1Wv1Y&t=236s) | Colour diagram of nested zigzags (rows 1–3) and downward shift of lower points | Row offset, tip drop / width growth, stacking |

## Owner frames (local only, gitignored)

Under `sources/photos/karo-handicraft/` (not published):

1. **pole-symmetry-overlay.png** — top view, green kiku on white wrap, gold S8 lines, yellow cross at pole. On-screen teaching point: stitch so distance from the pole stays equal → clean finish.  
2. **row-nesting-diagram-3dan.png** — schematic meridians + three nested zigzags (段1 / 段2 / 段3), vertical spacing marked **~2–3 mm** between successive row entries on a meridian. Subtitle gist: from the 2nd row onward, change colour and stitch the same way **two rounds each**.

## Observations (not yet model laws)

| Observation | Basis | Confidence | Notes |
|-------------|-------|------------|-------|
| Equal radial distance from pole for corresponding stitches | On-screen rule in video | high (as teaching intent) | Symmetry constraint for NP-region placements |
| Inter-row entry spacing ≈ 2–3 mm on diagram | Owner frame of colour diagram | medium | Diagram teaching aid; not a measured Perle #5 law; compare with GT14 “~1 thread wider and lower” at the top stitch |
| From row 2: new colour, **2 rounds** per colour step | Subtitle on diagram frame | medium | May mean 2 full circuits before colour change — **conflicts or complements** GT14 alternate A1/B1 vs Suess block recipes; do not merge without a decision log entry |
| Working thread sits over prior rows at upper turns (uwagake) | Technique name + needle clip | high (technique class) | Aligns with TK-UWA / TK-GT14 |

## Separation

- **(a) From source:** timestamps, Japanese technique name, diagram spacing label, “2 rounds” subtitle, pole-distance rule.  
- **(b) Inference:** that 2–3 mm maps directly onto our parametric `threadThickness` / tip-drop for Pearl #5.  
- **(c) Practice:** use Karo for motion + nesting visuals; use GT14 for S8 set sequence defaults.

## Open questions

- Does “2 rounds each” match GT14’s alternating sets, Suess blocks, or a third recipe?  
- Mari size and thread gauge in this lesson?  
- Exact relation between diagram 2–3 mm and stretch / top-stitch “one thread wider and lower”.
