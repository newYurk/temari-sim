#!/usr/bin/env python3
"""Эталон для кросс-проверки JS-симулятора НЕЗАВИСИМОЙ реализацией (samples/kiku-s8/calc.py, numpy).
Для сетки параметров (C, w, m, N, s_top) считает ряд 1 набора A: E/X каждого стежка, длины плеч и захватов,
выход X0, скрытый старт. Пишет sim/data/calc_reference.json. Запуск: python3 sim/tools/calc_reference.py"""
import json, math, os, sys, itertools
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'samples', 'kiku-s8'))
import calc  # noqa: E402

def key(C, w, m, N, s_top, bfe, rule, run):
    return f"C={C:g}|w={w:g}|m={m:g}|N={N}|sTop={s_top:.6f}|bfe={bfe:.6f}|start={rule}:{run:g}"

def one(C, w, m, N, s_top=5.0, bfe=1/3, rule='TK-ANCHOR', run=35.0):
    calc.configure(C_mm=C, w_mm=w, marking_width_mm=m, N_DIV=N, s_top1_mm=s_top, bottom_from_eq=bfe,
                   start_run_mm=run, start_backtrack=(rule == 'TK-ANCHOR'))
    rows = calc.rows_geometry('geom', calc.P['bottom_fixed_mm'], calc.Q)
    r1 = rows[0]
    seq, arms, bites, last = calc.round_lengths(r1, None, 0)
    X0 = calc.perp_pt(r1['s_top'], calc.PHI[0], calc.start_exit_offset())
    st = [dict(i=s['i'], line=s['line'], kind=s['kind'], s=s['s'], E=[float(v) for v in s['E']], X=[float(v) for v in s['X']])
          for s in seq]
    u = 0.0; uE = []
    for a, b in zip(arms, bites):
        u += a; uE.append(u); u += b
    return dict(key=key(C, w, m, N, s_top, bfe, rule, run), C=C, w=w, m=m, N=N, s_top=s_top, bottom_from_eq=bfe,
                start_rule=rule, start_run=run, R=calc.R, X0=[float(v) for v in X0], stitches=st,
                arms=arms, bites=bites, row1_total=sum(arms) + sum(bites), u_E=uE,
                hidden_start=run * (2 if rule == 'TK-ANCHOR' else 1), n_rows_geom_equator=len(rows))

def main():
    out = []
    grid = itertools.product((200.0, 230.0, 240.0, 250.0, 300.0), (0.714, 0.75, 1.0), (0.5, 1.0), (8, 16))
    for C, w, m, N in grid:
        out.append(one(C, w, m, N))
    out.append(one(240.0, 0.714, 1.0, 8, rule='OLY-BASIC', run=25.0))
    # замысел «верх = доля Q» при C=300: s_top = (5/60)*75
    out.append(one(300.0, 0.714, 1.0, 8, s_top=0.0833 * 75.0))
    dst = os.path.join(HERE, '..', 'data', 'calc_reference.json')
    json.dump(dict(generator='sim/tools/calc_reference.py → samples/kiku-s8/calc.py', entries=out),
              open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(f'{len(out)} эталонов → {os.path.relpath(dst)}')

if __name__ == '__main__':
    main()
