# temari-sim

Parametric **temari** knowledge base and browser simulator. First vertical slice: **kiku S8** (*yaegiku* / eight-petal chrysanthemum) in *uwagake chidori kagari*, recipe intent aligned with TemariKai GT14 (mari ~23–25 cm, Perle #5, two colours), checked against live needle sources (Karo, Suess) without silently merging contradicting recipes.

Live site (when Pages is green): [newyurk.github.io/temari-sim](https://newyurk.github.io/temari-sim/)

## Language

| Where | Language |
| --- | --- |
| Owner ↔ assistant chat | Russian OK |
| This repository (docs, issues, labels, code, comments) | **English** |
| Simulator UI | Bilingual **RU \| EN** toggle (default RU), so craft terms can be learned in context |

Japanese craft terms stay with romaji (and kanji where useful). See `CONTRIBUTING.md` and issue [#1](https://github.com/newYurk/temari-sim/issues/1). Remaining Russian prose in older markdown is tracked in [#11](https://github.com/newYurk/temari-sim/issues/11).

## Principles

- Every model law rests on **technique (with source), physics, or math**. Owner statements and photos are observations to check, not axioms.
- Do not silently merge contradicting sources (GT14 alternate vs Suess blocks vs Karo “2 rounds per colour”).
- Simulator is fully **parametric**: tension, thread size/material, mari size, row intent, and similar controls recompute downstream layers. Needle entry/exit come from occupancy — no stored pickup width.
- Third-party lesson video and raw dumps stay **out of git** (`sources/video/`, `sources/raw/`, `sources/photos/`). Links and short excerpts are fine.

Related prior project: [newYurk/temari](https://github.com/newYurk/temari) — issues and markdown only; its code is not used here.

## Layout

| Path | Role |
| --- | --- |
| `sources/` | Catalog, excerpts, build scripts; `img/` for study stills |
| `glossary.md` | RU / JA / EN terms |
| `craft/`, `prior-project/` | Craft overview; map of prior attempts |
| `samples/kiku-s8/` | Recipe, thread path, geometry, criteria, diagrams |
| `model/` | Spec: geometry, physics (Ф*), textile mechanics (Т*) |
| `sim/` | Browser simulator (stages 2a–2c: rounds A1 → B1 → A2) |
| `decisions-log.md`, `uncertainties.md`, `next-stage.md` | Decisions, open measurements, plan |

## Run the simulator

```bash
cd sim && python3 -m http.server 8765
# open http://localhost:8765/
node test/run.mjs          # from sim/, or: node sim/test/run.mjs from repo root
```

UI locale: **RU \| EN** (top right), also `?lang=ru|en`. Params live in the URL. Details: `sim/README.md` (still partly Russian until #11).

## Reproduce stage-1 numbers

```bash
cd samples/kiku-s8 && python3 calc.py --json && python3 make_diagrams.py && ./render.sh
cd sources && python3 build_sources.py && python3 make_excerpts.py
```

Needs `python3` + `numpy`; PNG diagrams need a headless Chrome.

## Clone

```bash
gh repo clone newYurk/temari-sim
```

Pick any local folder; record the path with the assistant when ready. Do not invent a path.
