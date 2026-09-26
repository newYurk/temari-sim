#!/usr/bin/env python3
"""Эталон для кросс-проверки JS-симулятора НЕЗАВИСИМОЙ реализацией (samples/kiku-s8/calc.py, numpy).
Для сетки параметров (C, w, m, N, s_top) считает ряд 1 набора A: E/X каждого стежка, длины плеч и захватов,
выход X0, скрытый старт. Пишет sim/data/calc_reference.json. Запуск: python3 sim/tools/calc_reference.py

calc.py keeps the stage-1 closed form (closing X = −((m+w)/2+w)). This wrapper applies the G3/D36
neighbour-gap squeeze for dense N after round_lengths, so V3 is a JS ↔ Python (calc_reference)
cross-check of the same occupancy rule as path.js needleSides."""
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

def key(C, w, m, N, s_top, bfe, rule, run):
    return f"C={C:g}|w={w:g}|m={m:g}|N={N}|sTop={s_top:.6f}|bfe={bfe:.6f}|start={rule}:{run:g}"

def meet_meridian(s, phi, ph, R):
    """Intersection of meridian ph with the needle great circle at p(s, phi). Same math as path.js meet()."""
    C = calc.point(s, phi)
    uC = C / np.linalg.norm(C)
    eL = calc.e_east(C)
    n = calc.e_pole(C)
    nMer = np.array([-math.sin(ph), math.cos(ph), 0.0])
    d = np.cross(nMer, n)
    d = d / np.linalg.norm(d)
    if np.dot(d, uC) < 0:
        d = -d
    y = float(R * math.atan2(np.dot(d, eL), np.dot(d, uC)))
    nd = np.cross(n, d); nd = nd / np.linalg.norm(nd)
    nmd = np.cross(nMer, d); nmd = nmd / np.linalg.norm(nmd)
    sn = max(1e-6, math.sqrt(max(0.0, 1.0 - float(np.dot(nd, nmd)) ** 2)))
    return y, sn

def closing_x_from_neighbour_gap(s_top, phi, m, w, N, R):
    """Mirror path.js needleSides for closing row-1 top when start thread expands own cluster to
    lo_own = −(m/2+w). Neighbour marking at φ − 2π/N; if gap < w, mid-gap X, else calc.py x_top_close."""
    old = -((m + w) / 2 + w)
    y, sn = meet_meridian(s_top, phi, phi - 2 * math.pi / N, R)
    wid = m / sn
    lo_own = -(m / 2 + w)
    gap = lo_own - (y + wid / 2)
    if gap < w:
        x_off = lo_own - gap / 2
        return x_off, gap, x_off - old, True
    return old, gap, 0.0, False

def apply_g3_closing_squeeze(seq, arms, bites, m, w, N):
    """After calc.round_lengths: rebuild closing stitch X if neighbour gap < w; recompute that bite.
    Arm into closing (from prev X → E) is unchanged. Closing is last, so no following arm."""
    st = seq[-1]
    assert st['i'] == N and st['kind'] == 'top'
    phi = float(calc.PHI[st['line']])
    x_off, gap, comp, squeezed = closing_x_from_neighbour_gap(st['s'], phi, m, w, N, calc.R)
    if not squeezed:
        return None
    X = calc.perp_pt(st['s'], phi, x_off)
    st['X'] = X
    e_off = (m + w) / 2  # row-1 e_top = clear0()
    st['bite'] = e_off - x_off
    bites[-1] = float(calc.chord(st['E'], st['X']))
    # arms[-1] = geod_len(prev X → E) is independent of closing X; leave unchanged
    return dict(x_off=x_off, gap=gap, comp=comp, side='X')

def one(C, w, m, N, s_top=5.0, bfe=1/3, rule='TK-ANCHOR', run=35.0):
    calc.configure(C_mm=C, w_mm=w, marking_width_mm=m, N_DIV=N, s_top1_mm=s_top, bottom_from_eq=bfe,
                   start_run_mm=run, start_backtrack=(rule == 'TK-ANCHOR'))
    rows = calc.rows_geometry('geom', calc.P['bottom_fixed_mm'], calc.Q)
    r1 = rows[0]
    seq, arms, bites, last = calc.round_lengths(r1, None, 0)
    # G3/D36: calc.py stays closed-form; calc_reference applies neighbour-gap squeeze for dense N
    apply_g3_closing_squeeze(seq, arms, bites, m, w, N)
    X0 = calc.perp_pt(r1['s_top'], calc.PHI[0], calc.start_exit_offset())
    st = [dict(i=s['i'], line=s['line'], kind=s['kind'], s=s['s'], E=[float(v) for v in s['E']], X=[float(v) for v in s['X']])
          for s in seq]
    u = 0.0; uE = []
    for a, b in zip(arms, bites):
        u += a; uE.append(u); u += b
    return dict(key=key(C, w, m, N, s_top, bfe, rule, run), C=C, w=w, m=m, N=N, s_top=s_top, bottom_from_eq=bfe,
                start_rule=rule, start_run=run, R=calc.R, X0=[float(v) for v in X0], stitches=st,
                arms=[float(a) for a in arms], bites=[float(b) for b in bites],
                row1_total=float(sum(arms) + sum(bites)), u_E=[float(x) for x in uE],
                hidden_start=run * (2 if rule == 'TK-ANCHOR' else 1), n_rows_geom_equator=len(rows))

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
    json.dump(dict(generator='sim/tools/calc_reference.py → samples/kiku-s8/calc.py + G3/D36 closing squeeze',
                   entries=out),
              open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{len(out)} эталонов → {os.path.relpath(dst)}')

if __name__ == '__main__':
    main()
