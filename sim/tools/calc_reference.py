#!/usr/bin/env python3
"""Эталон для кросс-проверки JS-симулятора НЕЗАВИСИМОЙ реализацией (samples/kiku-s8/calc.py, numpy).
Для сетки параметров (C, w, m, N, s_top) считает ряд 1 набора A: E/X каждого стежка, длины плеч и захватов,
выход X0, скрытый старт. Пишет sim/data/calc_reference.json. Запуск: python3 sim/tools/calc_reference.py

Spec (12′)–(12″) (#45): the closing stitch of round 1 is the L0 top of row 2 (placed by the own cluster in path.js), so it
and its leg are not part of the row-1 cross-check (V3 compares row 1 without them); the old closed-form closing of calc.py
and the G3/D36 closing squeeze are no longer used. The hidden start ends at E₀ (the start stitch's E hole, +c0 on the start
line at s_top) and the start stitch's channel E₀ → X₀ is part of row 1 (a pickup, stitch 0)."""
import json, math, os, sys, itertools
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'samples', 'kiku-s8'))
import calc  # noqa: E402

def sim_defaults():
    """Default parameters from sim/src/params.js (single source of truth, e.g. the default marking width m)."""
    import subprocess
    root = os.path.join(HERE, '..', '..')
    js = "import {defaults} from './sim/src/params.js'; console.log(JSON.stringify(defaults()))"
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=root, check=True, capture_output=True, text=True)
    return json.loads(out.stdout)

# #48: bow reference for row 1. A row-1 leg built at λ = κ_g·R is an arc of a small circle of angular radius ρ = atan(1/λ)
# through the same two holes as the geodesic leg (the holes do not depend on the leg shape). Its length in closed form:
# L = 2·R·sin ρ·asin(sin(γ/2)/sin ρ), γ = central angle between the holes (both small circles through the two points with
# this ρ are mirror images across their great circle, so the bulge side does not change the length). λ values: the sweep.
BOW_LAMBDAS = (0.1, 0.2, 0.32, 0.4, 0.45, 0.52, 0.6)

def bow_arm(geod_mm, R, lam):
    g = geod_mm / R
    sr = 1.0 / math.sqrt(1.0 + lam * lam)
    x = math.sin(g / 2) / sr
    return float(2 * R * sr * math.asin(x)) if x <= 1 else float('nan')

def key(C, w, m, N, s_top, bfe, rule, run):
    return f"C={C:g}|w={w:g}|m={m:g}|N={N}|sTop={s_top:.6f}|bfe={bfe:.6f}|start={rule}:{run:g}"

def one(C, w, m, N, s_top=5.0, bfe=1/3, rule='TK-ANCHOR', run=35.0):
    calc.configure(C_mm=C, w_mm=w, marking_width_mm=m, N_DIV=N, s_top1_mm=s_top, bottom_from_eq=bfe,
                   start_run_mm=run, start_backtrack=(rule == 'TK-ANCHOR'))
    rows = calc.rows_geometry('geom', calc.P['bottom_fixed_mm'], calc.Q)
    r1 = rows[0]
    seq, arms, bites, last = calc.round_lengths(r1, None, 0)
    X0 = calc.perp_pt(r1['s_top'], calc.PHI[0], calc.start_exit_offset())
    # (12″): the hidden start surfaces at E₀ (+c0), the start stitch's channel E₀ → X₀ is a row-1 pickup (stitch 0)
    E0 = calc.perp_pt(r1['s_top'], calc.PHI[0], calc.clear0())
    start_channel = float(calc.chord(E0, X0))
    assert seq[-1]['i'] == N and seq[-1]['kind'] == 'top'
    st = [dict(i=s['i'], line=s['line'], kind=s['kind'], s=s['s'], E=[float(v) for v in s['E']], X=[float(v) for v in s['X']])
          for s in seq]
    u = 0.0; uE = []
    for a, b in zip(arms, bites):
        u += a; uE.append(u); u += b
    return dict(key=key(C, w, m, N, s_top, bfe, rule, run), C=C, w=w, m=m, N=N, s_top=s_top, bottom_from_eq=bfe,
                start_rule=rule, start_run=run, R=calc.R, X0=[float(v) for v in X0], stitches=st,
                arms=[float(a) for a in arms], bites=[float(b) for b in bites],
                row1_total=float(sum(arms) + sum(bites)), u_E=[float(x) for x in uE],
                E0=[float(v) for v in E0], start_channel=start_channel,
                # (12′): row 1 without the round-1 closing stitch (the L0 top of row 2) and its leg, plus the start channel
                row1_open=float(sum(arms[:-1]) + sum(bites[:-1]) + start_channel),
                hidden_start=run * (2 if rule == 'TK-ANCHOR' else 1), n_rows_geom_equator=len(rows),
                # #48: new keys only (the geodesic keys above are unchanged); λ keys as in JS String(λ)
                arms_bow={f'{lam:g}': [bow_arm(float(a), calc.R, lam) for a in arms] for lam in BOW_LAMBDAS},
                row1_open_bow={f'{lam:g}': float(sum(bow_arm(float(a), calc.R, lam) for a in arms[:-1]) + sum(bites[:-1]) + start_channel)
                               for lam in BOW_LAMBDAS})

def main():
    out = []
    # Marking widths: the current default m from params.js (6a.22: 0.5 for GT14) plus m = 1.0 kept as the
    # stress value (S16). Changing the default m in params.js and re-running this script is all it takes.
    m_def = float(sim_defaults()['m_mm'])
    ms = tuple(sorted({0.5, 1.0, m_def}))
    grid = itertools.product((200.0, 230.0, 240.0, 250.0, 300.0), (0.714, 0.75, 1.0), ms, (8, 16))
    for C, w, m, N in grid:
        out.append(one(C, w, m, N))
    for m in sorted({m_def, 1.0}):
        out.append(one(240.0, 0.714, m, 8, rule='OLY-BASIC', run=25.0))
        # intent "top = fraction of Q" at C=300: s_top = (5/60)*75
        out.append(one(300.0, 0.714, m, 8, s_top=0.0833 * 75.0))
    # S16 at the default m with the 4 mm top (6a.22: with thin marking a 5 mm top no longer reaches the neighbour line)
    out.append(one(240.0, 0.714, m_def, 16, s_top=4.0))
    dst = os.path.join(HERE, '..', 'data', 'calc_reference.json')
    json.dump(dict(generator='sim/tools/calc_reference.py → samples/kiku-s8/calc.py; (12′)–(12″) #45: start channel E0→X0, row 1 without the closing',
                   entries=out),
              open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{len(out)} эталонов → {os.path.relpath(dst)}')

if __name__ == '__main__':
    main()
