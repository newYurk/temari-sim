# Contributing

## Language

- **Owner ↔ assistant chat:** Russian is fine.
- **Everything in this repository** is English: docs, issues, milestones, labels, code, and comments.
- Japanese craft terms stay with romaji (and kanji where useful); surrounding prose is English.
- **Vocabulary:** one glossary (`glossary.json` → `glossary.md`, `sim/src/terms.js`). Rules for agents: [AGENTS.md](AGENTS.md). New terms need a `sources.json` id or `status: derived`.

## Local working copy

The owner clones this repo with GitHub CLI (`gh repo clone newYurk/temari-sim`) to a local folder of their choice. That path is recorded later with the assistant when ready. Do not invent a path.

Third-party lesson video and raw media dumps stay **out of git** (local / ignored). The repo keeps links, short excerpts, and project-owned diagrams only.

## Model rules

Every model law must rest on **technique (with source), physics, or math**. Owner statements and photos are observations to check, not axioms. Record basis, scope, and confidence. Do not silently merge contradicting sources.

## Issue workflow labels

| Label | Meaning |
| --- | --- |
| `waiting` | Needs owner decision, not more agent work |
| `look` | Agent thinks it is done; owner closes after a craft / frame check |
| `enjoy` | Human craft feel / visual acceptance (owner closes) |
| `blocked` | Blocked on a dependency or missing measurement |
| `stage-*` | Which stage the work belongs to |
| `area/*` | docs / sim / model / sources / craft / meta |
| `basis/*` | technique / physics / math |
