#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Генерация схем (SVG) для samples/kiku-s8 из геометрии calc.py. PNG рендерится Chrome headless (render.sh)."""
import math, os
import numpy as np
import calc as C

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'diagrams')
SC = 5.0            # px на мм в проекции
GOLD = '#b8860b'; SETA = '#2f3b52'; SETB = '#c8102e'

def proj(p, cx, cy, sc=SC, rot=0.0):
    s, phi = C.to_s_phi(p)
    a = phi + rot
    return cx + sc * s * math.cos(a), cy - sc * s * math.sin(a)

def poly(pts, cx, cy, sc=SC, rot=0.0):
    return ' '.join(f"{x:.2f},{y:.2f}" for x, y in (proj(p, cx, cy, sc, rot) for p in pts))

def header(w, h, title, sub):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="DejaVu Sans, Arial, sans-serif">',
            f'<rect width="{w}" height="{h}" fill="white"/>',
            f'<text x="20" y="30" font-size="19" font-weight="bold">{title}</text>',
            f'<text x="20" y="52" font-size="12.5" fill="#444">{sub}</text>']

def meridians(cx, cy, smax, sc=SC, labels=True, rot=0.0):
    L = []
    for k, ph in enumerate(C.PHI):
        a = ph + rot
        x2, y2 = cx + sc * smax * math.cos(a), cy - sc * smax * math.sin(a)
        L.append(f'<line x1="{cx}" y1="{cy}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{GOLD}" stroke-width="1.6"/>')
        if labels:
            xl, yl = cx + sc * (smax + 5) * math.cos(a), cy - sc * (smax + 5) * math.sin(a)
            L.append(f'<text x="{xl:.1f}" y="{yl+4:.1f}" font-size="13" text-anchor="middle" fill="{GOLD}">L{k} ({int(round(math.degrees(ph)))}°)</text>')
    return L

def colormap(t):
    # простая сине-зелёно-жёлтая шкала (диагностическая, по длине нити)
    stops = [(0, (68, 1, 84)), (0.25, (59, 82, 139)), (0.5, (33, 145, 140)), (0.75, (94, 201, 98)), (1, (253, 231, 37))]
    for (t0, c0), (t1, c1) in zip(stops[:-1], stops[1:]):
        if t <= t1:
            f = (t - t0) / (t1 - t0)
            return '#%02x%02x%02x' % tuple(int(c0[i] + f * (c1[i] - c0[i])) for i in range(3))
    return '#fde725'

# ---------------------------------------------------------------- Схема 1
def diagram1():
    W, H = 1060, 920; cx, cy = 480, 470
    rows = C.rows_geometry()
    r1 = rows[0]
    L = header(W, H, 'Схема 1. Разметка S8 (8等分) — вид с северного полюса, булавки и опорные точки кику',
               f'Схема. Азимутальная равнопромежуточная проекция: радиус = дуга s от полюса. C = {C.P["C_mm"]:.0f} мм, R = {C.R:.2f} мм, Q = {C.Q:.0f} мм.')
    L.append(f'<circle cx="{cx}" cy="{cy}" r="{SC*C.Q}" fill="#fafafa" stroke="{GOLD}" stroke-width="2.2"/>')
    L.append(f'<text x="{cx+SC*C.Q*0.80:.0f}" y="{cy+SC*C.Q*0.60+40:.0f}" font-size="12.5" fill="{GOLD}">экватор 赤道 (s = {C.Q:.0f} мм)</text>')
    L.append(f'<circle cx="{cx}" cy="{cy}" r="{SC*r1["s_bot"]}" fill="none" stroke="#999" stroke-dasharray="5,4"/>')
    L.append(f'<circle cx="{cx}" cy="{cy}" r="{SC*r1["s_top"]}" fill="none" stroke="#999" stroke-dasharray="2,2"/>')
    L += meridians(cx, cy, C.Q)
    # булавки нижних точек
    for k, ph in enumerate(C.PHI):
        col = SETA if k % 2 == 1 else SETB
        x, y = cx + SC * r1['s_bot'] * math.cos(ph), cy - SC * r1['s_bot'] * math.sin(ph)
        L.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="{col}" stroke="black"/>')
        xt, yt = cx + SC * r1['s_top'] * math.cos(ph), cy - SC * r1['s_top'] * math.sin(ph)
        colt = SETA if k % 2 == 0 else SETB
        L.append(f'<circle cx="{xt:.1f}" cy="{yt:.1f}" r="3.2" fill="{colt}"/>')
    L.append(f'<circle cx="{cx}" cy="{cy}" r="6" fill="white" stroke="black" stroke-width="2"/>')
    L.append(f'<text x="{cx-120}" y="{cy-14}" font-size="12.5">北極 NP (булавка)</text>')
    # старт A
    X0 = C.offset_pt(r1['s_top'], C.PHI[0], -r1['bite_top'] / 2)
    x0, y0 = proj(X0, cx, cy)
    L.append(f'<path d="M {x0:.1f} {y0:.1f} L {x0+150:.1f} {y0-150:.1f}" stroke="black" stroke-width="1" fill="none"/>')
    L.append(f'<text x="{x0+152:.0f}" y="{y0-154:.0f}" font-size="12">старт нити A: выход на стороне −φ от L0 (ниже L0 на рисунке),</text>')
    L.append(f'<text x="{x0+152:.0f}" y="{y0-139:.0f}" font-size="12">= «just to the left» по ходу; s = 5 мм от NP (TK-GT14)</text>')
    # стрелка хода
    L.append('<defs><marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 z" fill="black"/></marker></defs>')
    rr = SC * 20
    a0, a1 = math.radians(-60), math.radians(-20)
    L.append(f'<path d="M {cx+rr*math.cos(a0):.1f} {cy-rr*math.sin(a0):.1f} A {rr} {rr} 0 0 0 {cx+rr*math.cos(a1):.1f} {cy-rr*math.sin(a1):.1f}" stroke="black" stroke-width="2" fill="none" marker-end="url(#ar)"/>')
    L.append(f'<text x="{cx+rr*math.cos(a0)+6:.0f}" y="{cy-rr*math.sin(a0)+22:.0f}" font-size="12">ход обхода: против часовой</text>')
    L.append(f'<text x="{cx+rr*math.cos(a0)+6:.0f}" y="{cy-rr*math.sin(a0)+37:.0f}" font-size="12">(вид снаружи на полюс; правша)</text>')
    # легенда
    y = 835
    L.append(f'<circle cx="40" cy="{y}" r="7" fill="{SETA}" stroke="black"/><text x="55" y="{y+4}" font-size="12.5">нижняя булавка набора A (цвет A) — линии L1,L3,L5,L7; s = {r1["s_bot"]:.0f} мм = 1/3 Q над экватором</text>')
    L.append(f'<circle cx="40" cy="{y+22}" r="7" fill="{SETB}" stroke="black"/><text x="55" y="{y+26}" font-size="12.5">нижняя булавка набора B (цвет B) — линии L0,L2,L4,L6</text>')
    L.append(f'<circle cx="40" cy="{y+44}" r="3.2" fill="{SETA}"/><circle cx="50" cy="{y+44}" r="3.2" fill="{SETB}"/><text x="60" y="{y+48}" font-size="12.5">верхние точки (5 мм от NP): A — чётные линии, B — нечётные (TK-GT14). Пунктир: s = 5 и s = 40 мм</text>')
    # масштаб
    L.append(f'<line x1="860" y1="120" x2="{860+SC*10}" y2="120" stroke="black" stroke-width="3"/><text x="860" y="112" font-size="12">10 мм (по радиусу)</text>')
    L.append('</svg>')
    open(os.path.join(OUT, '01_s8_division_north_pole.svg'), 'w', encoding='utf-8').write('\n'.join(L))

# ---------------------------------------------------------------- Схема 2
def diagram2():
    W, H = 1100, 680
    L = header(W, H, 'Схема 2. Один стежок кику (かがり): вход/выход иглы, ход, наложение нитей',
               'Схема, не масштаб. Сплошное — нить на поверхности; пунктир — внутри обмотки (под линией разметки). Вверх на рисунке = к северному полюсу.')
    L.append('<defs><marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 z" fill="black"/></marker>'
             '<marker id="arr" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 z" fill="#c00"/></marker></defs>')
    def panel(ox, title, top):
        P = []
        P.append(f'<text x="{ox}" y="95" font-size="15" font-weight="bold">{title}</text>')
        # линия разметки
        P.append(f'<line x1="{ox+220}" y1="120" x2="{ox+220}" y2="560" stroke="{GOLD}" stroke-width="5"/>')
        P.append(f'<text x="{ox+228}" y="572" font-size="12" fill="{GOLD}">линия 地割り k</text>')
        yS = 380
        E = (ox + 250, yS); X = (ox + 190, yS)
        if not top:
            # нижняя точка: плечи почти вдоль линии (острый кончик)
            A0 = (ox + 150, 130); A1 = (ox + 290, 130)
            P.append(f'<path d="M {A0[0]} {A0[1]} L {E[0]} {E[1]}" stroke="{SETA}" stroke-width="7" fill="none" stroke-linecap="round"/>')
            P.append(f'<path d="M {X[0]} {X[1]} L {A1[0]} {A1[1]}" stroke="#6b7fa8" stroke-width="7" fill="none" stroke-linecap="round"/>')
            P.append(f'<text x="{ox}" y="118" font-size="12">① приходит от верхней точки (линия k−1)</text>')
            P.append(f'<text x="{A1[0]+8}" y="{A1[1]+30}" font-size="12">③ уходит к верхней</text>')
            P.append(f'<text x="{A1[0]+8}" y="{A1[1]+45}" font-size="12">точке (k+1)</text>')
            P.append(f'<text x="{ox+250}" y="300" font-size="12">перекрест ③ над ① (вывод)</text>')
            P.append(f'<text x="{ox+20}" y="470" font-size="12">Шаг следующего ряда: ниже на Δ ≈ w/sin α</text>')
            P.append(f'<text x="{ox+20}" y="486" font-size="12">(TK-STRETCH: «stretch the points»)</text>')
        else:
            # верхняя точка ряда n: предыдущие ряды (серые) и широкий захват
            for j, dy in enumerate((-60, -40, -20)):
                P.append(f'<path d="M {ox+60} {yS+dy+120} L {ox+215} {yS+dy} L {ox+380} {yS+dy+120}" stroke="#aaa" stroke-width="6" fill="none"/>')
            E = (ox + 290, yS + 10); X = (ox + 150, yS + 10)
            A0 = (ox + 40, yS + 170); A1 = (ox + 400, yS + 170)
            P.append(f'<path d="M {A0[0]} {A0[1]} L {E[0]} {E[1]}" stroke="{SETA}" stroke-width="7" fill="none"/>')
            P.append(f'<path d="M {X[0]} {X[1]} L {A1[0]} {A1[1]}" stroke="#6b7fa8" stroke-width="7" fill="none"/>')
            P.append(f'<text x="{ox+10}" y="{yS-110}" font-size="12">серые — нити предыдущих рядов у верхней точки</text>')
            P.append(f'<text x="{ox-10}" y="{A0[1]+30}" font-size="12">① приходит снизу (от кончика k−1)</text>')
            P.append(f'<text x="{ox+250}" y="{A1[1]+30}" font-size="12">③ уходит к кончику k+1</text>')
            P.append(f'<text x="{ox+10}" y="{yS-128}" font-size="12">① проходит ПОВЕРХ предыдущих рядов (上掛け, TK-UWA)</text>')
            P.append(f'<text x="{ox+10}" y="160" font-size="12">захват шире на ~1 толщину нити за ряд и ниже;</text>')
            P.append(f'<text x="{ox+10}" y="176" font-size="12">игла проходит под всеми предыдущими нитями (TK-GT14, TK-UWA)</text>')
        P.append(f'<line x1="{E[0]}" y1="{E[1]}" x2="{X[0]}" y2="{X[1]}" stroke="black" stroke-width="3" stroke-dasharray="7,5"/>')
        P.append(f'<line x1="{E[0]+40}" y1="{E[1]+30}" x2="{X[0]-10}" y2="{X[1]+30}" stroke="#c00" stroke-width="2" marker-end="url(#arr)"/>')
        P.append(f'<text x="{X[0]-10}" y="{X[1]+(50 if not top else 75)}" font-size="12" fill="#c00">② игла: справа → налево, ⟂ линии</text>')
        P.append(f'<circle cx="{E[0]}" cy="{E[1]}" r="5" fill="white" stroke="black" stroke-width="2"/><text x="{E[0]+8}" y="{E[1]-8}" font-size="13" font-weight="bold">E</text>')
        P.append(f'<circle cx="{X[0]}" cy="{X[1]}" r="5" fill="black"/><text x="{X[0]-22}" y="{X[1]-8}" font-size="13" font-weight="bold">X</text>')
        return P
    L += panel(20, 'а) нижняя точка (кончик лепестка)', False)
    L += panel(580, 'б) верхняя точка, ряд n ≥ 2 (上掛け)', True)
    L.append('<line x1="700" y1="72" x2="900" y2="72" stroke="black" stroke-width="2.5" marker-end="url(#ar)"/>')
    L.append('<text x="440" y="77" font-size="13">ход обхода (к линии справа, +φ):</text>')
    L.append('<text x="20" y="640" font-size="12" fill="#333">Документировано: игла ⟂ линии, против хода (OLY-BASIC, фото TK-GT14, RU-MYJULIA); захват ~1–2 мм под линией вместе с поверхностью обмотки (TK-KAGARI).</text>')
    L.append('<text x="20" y="658" font-size="12" fill="#333">Вывод (не подтверждено практикой): ③ ложится поверх ① в точке перекреста, т.к. уложена позже.</text>')
    L.append('</svg>')
    open(os.path.join(OUT, '02_one_kiku_stitch.svg'), 'w', encoding='utf-8').write('\n'.join(L))

# ---------------------------------------------------------------- Схема 3
def diagram3():
    W, H = 1000, 900; cx, cy = 430, 480
    rows = C.rows_geometry(); r1 = rows[0]
    seq, arms, bites, _ = C.round_lengths(r1, None, 0)
    total = sum(arms) + sum(bites)
    L = header(W, H, 'Схема 3. Один полный обход (周) набора A, ряд 1: непрерывная нить, стежки 1…8',
               f'Проекция как на схеме 1 (геометрия из calc.py). Цвет — диагностический градиент по длине нити u (0 → {total:.0f} мм). Пунктир — скрытые участки.')
    L.append(f'<circle cx="{cx}" cy="{cy}" r="{SC*C.Q}" fill="#fafafa" stroke="{GOLD}" stroke-width="2"/>')
    L += meridians(cx, cy, C.Q)
    # скрытый старт (схематично, по параллели назад на start_run_mm)
    X0 = C.offset_pt(r1['s_top'], C.PHI[0], -r1['bite_top'] / 2)
    s0, ph0 = C.to_s_phi(X0)
    Sst = C.point(s0 + 20, ph0 - 0.55)
    L.append(f'<polyline points="{poly(C.slerp(Sst, X0, 30), cx, cy)}" stroke="#555" stroke-width="2.5" fill="none" stroke-dasharray="6,4"/>')
    xs, ys = proj(Sst, cx, cy)
    L.append(f'<line x1="{xs:.0f}" y1="{ys:.0f}" x2="{xs+40:.0f}" y2="{ys+150:.0f}" stroke="#555" stroke-width="0.8"/>')
    L.append(f'<text x="{xs+44:.0f}" y="{ys+160:.0f}" font-size="11.5">серый пунктир: скрытый старт 3–4 см туда-обратно</text>')
    L.append(f'<text x="{xs+44:.0f}" y="{ys+174:.0f}" font-size="11.5">в обмотке (TK-ANCHOR; направление — схема)</text>')
    u = 0.0; cur = X0
    for st, a, b in zip(seq, arms, bites):
        pts = C.slerp(cur, st['E'], 60)
        for j in range(len(pts) - 1):
            t = (u + a * (j + 0.5) / (len(pts) - 1)) / total
            L.append(f'<polyline points="{poly(pts[j:j+2], cx, cy)}" stroke="{colormap(t)}" stroke-width="4" fill="none" stroke-linecap="round"/>')
        u += a
        xe, ye = proj(st['E'], cx, cy); xx, yx = proj(st['X'], cx, cy)
        L.append(f'<line x1="{xe:.1f}" y1="{ye:.1f}" x2="{xx:.1f}" y2="{yx:.1f}" stroke="black" stroke-width="2" stroke-dasharray="3,2"/>')
        u += b
        xc, yc = proj(st['C'], cx, cy)
        s_, ph_ = C.to_s_phi(st['C'])
        rl = s_ + 6 if st['kind'] == 'bottom' else 14.0
        xl, yl = cx + SC * rl * math.cos(ph_), cy - SC * rl * math.sin(ph_)
        L.append(f'<circle cx="{xl:.1f}" cy="{yl:.1f}" r="10" fill="white" stroke="black"/><text x="{xl:.1f}" y="{yl+4:.1f}" font-size="12" text-anchor="middle" font-weight="bold">{st["i"]}</text>')
        cur = st['X']
    L.append(f'<circle cx="{proj(X0,cx,cy)[0]:.1f}" cy="{proj(X0,cx,cy)[1]:.1f}" r="4" fill="black"/>')
    # легенда градиента
    gx, gy = 790, 150
    for j in range(100):
        L.append(f'<rect x="{gx}" y="{gy+j*4}" width="24" height="4.2" fill="{colormap(j/99)}"/>')
    L.append(f'<text x="{gx+30}" y="{gy+8}" font-size="12">u = 0 мм (выход у L0)</text>')
    L.append(f'<text x="{gx+30}" y="{gy+400}" font-size="12">u = {total:.0f} мм</text>')
    L.append(f'<text x="{gx-10}" y="{gy-12}" font-size="12.5" font-weight="bold">длина нити u</text>')
    # таблица u
    ty = 600
    L.append(f'<text x="760" y="{ty}" font-size="12.5" font-weight="bold">стежок: линия, тип, u(E)</text>')
    uu = 0.0
    for st, a, b in zip(seq, arms, bites):
        uu += a
        L.append(f'<text x="760" y="{ty+18*st["i"]}" font-size="12">{st["i"]}: L{st["line"]}, {"низ" if st["kind"]=="bottom" else "верх"}, {uu:.0f} мм</text>')
        uu += b
    L.append(f'<text x="20" y="{H-40}" font-size="12">Порядок A: старт у L0 (верх) → 1 низ L1 → 2 верх L2 → 3 низ L3 → … → 7 низ L7 → 8 верх L0 (замыкает обход, охватывая начало нити — вывод).</text>')
    L.append(f'<text x="20" y="{H-22}" font-size="12">Видимые плечи — геодезические (допущение натянутой нити). Короткие чёрные штрихи — захваты E→X (~2 мм) под линией: их длина входит в u.</text>')
    L.append('</svg>')
    open(os.path.join(OUT, '03_one_round_thread_path.svg'), 'w', encoding='utf-8').write('\n'.join(L))

# ---------------------------------------------------------------- Схема 4
def diagram4():
    W, H = 1200, 870
    L = header(W, H, 'Схема 4. Наращивание рядов 1…N набора A (сектор L0–L2): смещение верхних и нижних точек',
               'Проекция как на схеме 1, увеличено (8 px/мм), повёрнуто. Слева — правило «geom» (Δниза = w/sin α), справа — постоянный шаг 2 мм (TK-UWA). Числа из calc.py.')
    sc = 8.0
    def panel(ox, oy, rule, title):
        P = []
        rows = C.rows_geometry(rule)
        rot = math.radians(90 - 45)   # линия L1 вертикально вверх
        P.append(f'<text x="{ox-240}" y="{oy-470}" font-size="15" font-weight="bold">{title}</text>')
        for k in (0, 1, 2):
            a = C.PHI[k] + rot
            P.append(f'<line x1="{ox}" y1="{oy}" x2="{ox+sc*62*math.cos(a):.1f}" y2="{oy-sc*62*math.sin(a):.1f}" stroke="{GOLD}" stroke-width="1.6"/>')
            P.append(f'<text x="{ox+sc*63.5*math.cos(a):.1f}" y="{oy-sc*63.5*math.sin(a):.1f}" font-size="12" fill="{GOLD}">L{k}</text>')
        # экватор (дуга)
        P.append(f'<path d="M {ox+sc*C.Q*math.cos(rot-0.1):.1f} {oy-sc*C.Q*math.sin(rot-0.1):.1f} A {sc*C.Q} {sc*C.Q} 0 0 0 {ox+sc*C.Q*math.cos(rot+math.pi/2+0.1):.1f} {oy-sc*C.Q*math.sin(rot+math.pi/2+0.1):.1f}" stroke="{GOLD}" stroke-width="2" fill="none"/>')
        n = len(rows)
        for r in rows:
            col = colormap((r['n'] - 1) / max(1, n - 1))
            T0 = C.point(r['s_top'], C.PHI[0]); B1 = C.point(r['s_bot'], C.PHI[1]); T2 = C.point(r['s_top'], C.PHI[2])
            pts = np.vstack([C.slerp(T0, B1, 60), C.slerp(B1, T2, 60)])
            P.append(f'<polyline points="{poly(pts, ox, oy, sc, rot)}" stroke="{col}" stroke-width="{max(1.5, sc*C.w*0.9):.1f}" fill="none" stroke-opacity="0.9"/>')
            xb, yb = proj(B1, ox, oy, sc, rot)
            P.append(f'<circle cx="{xb:.1f}" cy="{yb:.1f}" r="2.5" fill="black"/>')
            if rule == 'geom' or r['n'] in (1, 2, 3, n):
                P.append(f'<text x="{xb+8:.1f}" y="{yb+4:.1f}" font-size="11">n={r["n"]}: s={r["s_bot"]:.1f}</text>')
        P.append(f'<circle cx="{ox}" cy="{oy}" r="4" fill="white" stroke="black"/><text x="{ox+6}" y="{oy+16}" font-size="11">NP</text>')
        last = rows[-1]
        P.append(f'<text x="{ox-240}" y="{oy+40}" font-size="12">N = {n} рядов до экватора; верх: {rows[0]["s_top"]:.1f} → {last["s_top"]:.1f} мм;</text>')
        P.append(f'<text x="{ox-240}" y="{oy+56}" font-size="12">низ: {rows[0]["s_bot"]:.1f} → {last["s_bot"]:.1f} мм; угол кончика {rows[0]["tip_angle"]:.0f}° → {last["tip_angle"]:.0f}°.</text>')
        return P
    L += panel(300, 610, 'geom', 'а) «geom»: ряды параллельны на расстоянии w у кончика')
    L += panel(900, 610, 'fixed', 'б) шаг низа 2 мм: по модели у кончика расстояние &lt; w')
    L.append(f'<text x="20" y="{H-50}" font-size="12">Толщина линий ≈ w = {C.w} мм в масштабе. Цвет — номер ряда (фиолетовый = 1). Ряды набора B (повёрнуты на 45°) не показаны.</text>')
    L.append(f'<text x="20" y="{H-32}" font-size="12">Панель б) показывает противоречие модели «геодезическое плечо» с эмпирическим шагом 2 мм: реальная нить отклоняется от геодезической в пределах трения (geometry.md §7).</text>')
    L.append('</svg>')
    open(os.path.join(OUT, '04_rows_stacking.svg'), 'w', encoding='utf-8').write('\n'.join(L))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    diagram1(); diagram2(); diagram3(); diagram4()
    print('SVG written to', OUT)
