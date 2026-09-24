#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Геометрия и баланс длины нити для базового образца «八重菊 / кику на S8»
(上掛け千鳥かがり, два набора по 4 лепестка). Stage 1 — только расчёт, не симулятор.

Все параметры помечены:  [M] задано мастером/источником, [A] аппроксимация/допущение,
                          [C] вычисляется здесь.
Источники — id из sources/sources.json.

Запуск:  python3 calc.py            -> печать таблиц + запись calc_output.md
         python3 calc.py --json     -> дополнительно calc_output.json (для диаграмм/симулятора)
"""
import json, math, sys
import numpy as np

# ----------------------------------------------------------------------------
# 1. ПАРАМЕТРЫ
# ----------------------------------------------------------------------------
P = dict(
    C_mm=240.0,          # [M] TK-GT14: «23-25 cm circum mari» -> берём середину 24 см
    N_DIV=8,             # [M] TK-GT14: Simple 8 division
    s_top1_mm=5.0,       # [M] TK-GT14: верхний стежок «5 mm down from the NP» (OLY-TM7: 3–4 мм от северной булавки)
    bottom_from_eq=1/3,  # [M] TK-GT14: нижние булавки на 1/3 расстояния полюс–экватор, считая от экватора (OLY-TM7: 2/3 от полюса — то же)
    w_mm=0.714,          # [A] ширина уложенной нити Perle #5 в плотном ряду: TK-GAUGE «7 threads = 0.5cm» (тот же сайт даёт пример 10 рядов ≈ 7.5 мм => 0.75)
    marking_width_mm=1.0,  # [A] ширина нити разметки (металлик). TK-GAUGE: «Rainbow Gallery Nordic Gold - 1 strand = 1mm» —
                         # единственный калибр золотого металлика в источниках; GT14 бренд не называет; для разметки часто
                         # берут более тонкий металлик (TK-GAUGE) => верхняя оценка, НЕ измерено.
                         # Ширина захвата стежка НЕ параметр (stage 2, решение D16): E/X выводятся из того, что уже лежит
                         # на шаре — рабочая нить входит/выходит вплотную к нити разметки: смещение оси = (m + w)/2.
                         # Проверка (не навязывание): выведенный захват m + w = 1.71 мм попадает в «about 1-2 mm» (TK-LITTLE),
                         # «about 2mm» (TK-KAGARI).
    top_step='w',        # [M] TK-GT14/TK-UWA: каждый следующий верхний стежок «about 1 thread width wider and lower»
    bottom_rule='geom',  # 'geom' — вывод из правила «положи нить параллельно, стежок там, где она пересекает линию» (TK-STRETCH),
                         # 'fixed' — постоянный шаг bottom_fixed_mm (TK-UWA/TK-STRETCH «usually about 2mm»)
    bottom_fixed_mm=2.0, # [M] TK-UWA, TK-STRETCH (#5: ~2 мм); RU-JARILO 1.5–2; RU-MYJULIA 2–3; RU-EAGLE 5 мм
    tip_limit='equator', # [M] TK-GT14 «Work to the equator»; альтернатива 'olympus7' — кончики на 7 мм выше экватора (OLY-TM7)
    start_run_mm=35.0,   # [M] TK-ANCHOR: «For a 23cm mari ... 1- 1 1/2" (3-4cm)», затем обратный проход тем же путём
    start_backtrack=True,# [M] TK-ANCHOR / TK-LITTLE (backtrack). OLY-BASIC: вход в 2–3 см, узла нет, обратного прохода не описано
    end_run_mm=30.0,     # [A] TK-ANCHOR: «run the needle under a short section» — число не дано; 30 мм — допущение
    end_backtrack=True,  # [M] TK-ANCHOR: вывести рядом, войти в то же отверстие, пройти под обмоткой
    handling_reserve_mm=120.0,  # [A] БЕЗ ИСТОЧНИКА: хвост в игле/для манипуляции, который не ложится на шар
    hemispheres=2,       # [M] TK-GT14: «Repeat the design on the opposite (south) pole»
    skein_m=25.0,        # [M] Olympus/DMC/Cosmo #5: 1 моток = 25 м (из PRIOR-THREAD)
)

# ----------------------------------------------------------------------------
# 2. СФЕРИЧЕСКАЯ ГЕОМЕТРИЯ
# ----------------------------------------------------------------------------
R = P['C_mm'] / (2 * math.pi)          # [C] R = C / (2π)
Q = P['C_mm'] / 4                      # [C] длина дуги полюс–экватор
PHI = [2 * math.pi * k / P['N_DIV'] for k in range(P['N_DIV'])]   # долготы меридианов (линий 地割り)
Z = np.array([0.0, 0.0, 1.0])

def point(s, phi):
    """Точка на сфере: s — длина дуги от северного полюса вдоль меридиана phi (мм)."""
    th = s / R
    return R * np.array([math.sin(th) * math.cos(phi), math.sin(th) * math.sin(phi), math.cos(th)])

def to_s_phi(p):
    u = p / np.linalg.norm(p)
    return R * math.acos(max(-1, min(1, u[2]))), math.atan2(u[1], u[0])

def slerp(a, b, n=64):
    ua, ub = a / np.linalg.norm(a), b / np.linalg.norm(b)
    om = math.acos(max(-1, min(1, float(np.dot(ua, ub)))))
    if om < 1e-12:
        return np.array([a] * n)
    t = np.linspace(0, 1, n)
    return np.array([R * (math.sin((1 - x) * om) * ua + math.sin(x * om) * ub) / math.sin(om) for x in t])

def geod_len(a, b):
    ua, ub = a / np.linalg.norm(a), b / np.linalg.norm(b)
    return R * math.acos(max(-1, min(1, float(np.dot(ua, ub)))))

def chord(a, b):
    return float(np.linalg.norm(a - b))

def tangent_to(a, b):
    ua, ub = a / np.linalg.norm(a), b / np.linalg.norm(b)
    t = ub - np.dot(ua, ub) * ua
    return t / np.linalg.norm(t)

def e_pole(p):   # единичный касательный вектор вдоль меридиана к северному полюсу
    u = p / np.linalg.norm(p)
    t = Z - np.dot(u, Z) * u
    return t / np.linalg.norm(t)

def e_east(p):   # единичный касательный вектор вдоль параллели в сторону роста phi (= направление обхода)
    u = p / np.linalg.norm(p)
    e = np.cross(Z, u)
    return e / np.linalg.norm(e)

def angle_with_meridian(at, towards):
    """Угол (град) между дугой at->towards и меридианом в точке at (0 = вдоль меридиана)."""
    t = tangent_to(at, towards)
    c = abs(float(np.dot(t, e_pole(at))))
    return math.degrees(math.acos(max(-1, min(1, c))))

def dist_point_to_gc(p, a, b):
    """Расстояние по поверхности от точки p до большого круга через a,b (мм)."""
    n = np.cross(a, b); n /= np.linalg.norm(n)
    u = p / np.linalg.norm(p)
    return R * abs(math.asin(max(-1, min(1, float(np.dot(u, n))))))

def offset_pt(s, phi, d_east):
    """Точка, смещённая от точки меридиана на d_east мм вдоль параллели (+ = по ходу обхода)."""
    th = s / R
    return point(s, phi + d_east / (R * math.sin(th)))

def gc_intersection(a1, a2, b1, b2):
    """Точка пересечения двух дуг больших кругов (если есть внутри обеих дуг)."""
    n1 = np.cross(a1, a2); n2 = np.cross(b1, b2)
    L = np.cross(n1, n2)
    if np.linalg.norm(L) < 1e-12:
        return None
    L = R * L / np.linalg.norm(L)
    for c in (L, -L):
        ok = True
        for (p, q) in ((a1, a2), (b1, b2)):
            if abs(geod_len(p, c) + geod_len(c, q) - geod_len(p, q)) > 1e-6:
                ok = False
        if ok:
            return c
    return None

# ----------------------------------------------------------------------------
# 3. ПРАВИЛА РЯДОВ
# ----------------------------------------------------------------------------
w = P['w_mm']
s_b1 = Q * (1 - P['bottom_from_eq'])
tip_lim = Q if P['tip_limit'] == 'equator' else Q - 7.0

def configure(**kw):
    """Пересчитать производные глобальные величины после изменения параметров (для sim/tools/calc_reference.py:
    кросс-проверка JS-симулятора независимой реализацией при других C, w, m, N)."""
    global R, Q, PHI, w, s_b1, tip_lim
    P.update(kw)
    R = P['C_mm'] / (2 * math.pi)
    Q = P['C_mm'] / 4
    PHI = [2 * math.pi * k / P['N_DIV'] for k in range(P['N_DIV'])]
    w = P['w_mm']
    s_b1 = Q * (1 - P['bottom_from_eq'])
    tip_lim = Q if P['tip_limit'] == 'equator' else Q - 7.0

def clear0():
    """Смещение оси рабочей нити от оси нити разметки в точке входа/выхода иглы: вплотную, без наложения
    (TK-LITTLE: «the jiwari should not be split, or moved out of place by the stitching thread»):
    c0 = m/2 + w/2 — следует из ширин, свободного числа нет. (b) вывод; ширины m, w — параметры [A]."""
    return (P['marking_width_mm'] + w) / 2

def start_exit_offset():
    """Выход нити после скрытого старта: «just to the left of one marking line» (TK-GT14) => −c0."""
    return -clear0()

def rows_geometry(bottom_rule=P['bottom_rule'], fixed=P['bottom_fixed_mm'], limit=tip_lim, max_rows=60):
    """Возвращает список рядов: s_top, bite_top, s_bot, углы, шаг. Геометрия одинакова для всех 4 лепестков
    набора A (и набора B, повернутого на 45°)."""
    rows = []
    s_t, s_b = P['s_top1_mm'], s_b1
    for n in range(1, max_rows + 1):
        # Боковые смещения E (+, по ходу) и X (−) от линии. Ряд 1: вокруг только нити разметки => ±c0;
        # замыкающий верхний стежок на стартовой линии: слева уже выходит стартовая нить => X = −(c0 + w).
        # Ряд n≥2 (оценка stage 1, будет заменена занятостью по фактическому пути в stage 2c): E/X — вплотную
        # снаружи прежнего захвата: ±w с каждой стороны (+2w за ряд). Правило источника «about 1 thread width wider»
        # (GT14/TK-UWA) — проверяется как следствие, а не задаётся (model/spec.md G5').
        c0 = clear0()
        e_t = c0 + (n - 1) * w
        x_t = -c0 - (n - 1) * w
        x_tc = -c0 - w - (n - 1) * w
        bite_t = e_t - x_t
        T = point(s_t, PHI[0]); B = point(s_b, PHI[1])
        aB = angle_with_meridian(B, T)            # полуугол кончика лепестка
        aT = angle_with_meridian(T, B)
        rows.append(dict(n=n, s_top=s_t, bite_top=bite_t, e_top=e_t, x_top=x_t, x_top_close=x_tc,
                         bite_close=e_t - x_tc, e_bot=c0, x_bot=-c0, bite_bot=2 * c0,
                         s_bot=s_b, alpha_B=aB, gamma_T=aT, tip_angle=2 * aB))
        # следующий ряд
        if bottom_rule == 'geom':
            d_b = w / math.sin(math.radians(aB))   # параллельный сдвиг на w -> вдоль меридиана w/sin(alpha)
        else:
            d_b = fixed
        d_t = w if P['top_step'] == 'w' else w / math.sin(math.radians(aT))
        rows[-1]['next_d_bot'] = d_b
        rows[-1]['next_d_top'] = d_t
        if s_b + d_b > limit + 1e-9:
            break
        s_t, s_b = s_t + d_t, s_b + d_b
    return rows

def round_path(row, set_offset=0):
    """Одна «окружность» (周, round) набора: 8 стежков в порядке обхода.
    set_offset=0 -> набор A (верх на чётных линиях, низ на нечётных), 1 -> набор B.
    Порядок для A: B1,T2,B3,T4,B5,T6,B7,T0 (старт — выход нити слева от линии 0 на уровне верха).
    Каждый стежок: вход E справа (по ходу, +phi) от линии на bite/2, выход X слева (−phi) — игла идёт
    против хода обхода (OLY-BASIC, TK-GT14 фото, RU-MYJULIA). Смещения E/X выводятся (rows_geometry), не задаются."""
    seq = []
    for i in range(1, P['N_DIV'] + 1):
        k = (i + set_offset) % P['N_DIV']
        is_bottom = (i % 2 == 1)
        s = row['s_bot'] if is_bottom else row['s_top']
        closing = (i == P['N_DIV'])
        e_off = row['e_bot'] if is_bottom else row['e_top']
        x_off = row['x_bot'] if is_bottom else (row['x_top_close'] if closing else row['x_top'])
        b = e_off - x_off
        E = offset_pt(s, PHI[k], e_off)
        X = offset_pt(s, PHI[k], x_off)
        C = point(s, PHI[k])
        seq.append(dict(i=i, line=k, kind='bottom' if is_bottom else 'top', s=s, bite=b, E=E, X=X, C=C))
    return seq

def round_lengths(row, prev_exit=None, set_offset=0):
    seq = round_path(row, set_offset)
    k0 = set_offset % P['N_DIV']
    if prev_exit is None:   # начало ряда 1: нить выходит слева от стартовой линии на уровне верха (TK-GT14)
        prev_exit = offset_pt(row['s_top'], PHI[k0], start_exit_offset())
    arms, bites = [], []
    cur = prev_exit
    for st in seq:
        arms.append(geod_len(cur, st['E']))
        bites.append(chord(st['E'], st['X']))   # скрытый участок: игла проходит под линией разметки внутри обмотки
        cur = st['X']
    return seq, arms, bites, cur

# ----------------------------------------------------------------------------
# 4. ПРОВЕРКИ (числовые тесты для критериев)
# ----------------------------------------------------------------------------
def spacing_checks(rows):
    """Перпендикулярное расстояние между плечом ряда n и ряда n+1 (T0->B1) в долях 0.15/0.5/0.85 длины."""
    out = []
    for a, b in zip(rows[:-1], rows[1:]):
        Ta, Ba = point(a['s_top'], PHI[0]), point(a['s_bot'], PHI[1])
        Tb, Bb = point(b['s_top'], PHI[0]), point(b['s_bot'], PHI[1])
        pts = slerp(Tb, Bb, 101)
        d = [dist_point_to_gc(pts[j], Ta, Ba) for j in (15, 50, 85)]
        out.append(dict(n=a['n'], d_top=d[0], d_mid=d[1], d_bot=d[2]))
    return out

def arm_stays_in_sector(row):
    T, B = point(row['s_top'], PHI[0]), point(row['s_bot'], PHI[1])
    phis = [to_s_phi(p)[1] for p in slerp(T, B, 200)]
    return min(phis) >= -1e-9 and max(phis) <= PHI[1] + 1e-9

def ab_crossing(rowA, rowB):
    """Пересечение плеча A (T0->B1) с плечом B (T1->B0) в секторе между линиями 0 и 1."""
    A1, A2 = point(rowA['s_top'], PHI[0]), point(rowA['s_bot'], PHI[1])
    B1_, B2_ = point(rowB['s_top'], PHI[1]), point(rowB['s_bot'], PHI[0])
    c = gc_intersection(A1, A2, B1_, B2_)
    return None if c is None else to_s_phi(c)


# ----------------------------------------------------------------------------
# 6. ФИЗИЧЕСКИЙ СЛОЙ (соотношения точные, численные значения — только в долях T
#    или с μ из литературы для ДРУГОЙ пряжи; см. model/spec.md §«Физический слой»)
# ----------------------------------------------------------------------------
MU_LIT = {'cotton spun yarn–yarn, compact finished (PHYS-COTTON-MU)': 0.32,
          'cotton spun yarn–yarn, OE dyed (PHYS-COTTON-MU)': 0.52}   # НЕ Perle #5, НЕ нить–обмотка

def stitch_resultant(row):
    """Равнодействующая натяжений двух плеч в точке стежка (в долях T, при равных T по обе стороны)
    и её направление относительно меридиана. Нижняя точка: плечи к T0 и T2; верхняя: к B(k-1), B(k+1)."""
    out = {}
    B = point(row['s_bot'], PHI[1]); T0 = point(row['s_top'], PHI[0]); T2 = point(row['s_top'], PHI[2])
    f = tangent_to(B, T0) + tangent_to(B, T2)
    out['bottom_mag'] = float(np.linalg.norm(f))
    out['bottom_dir_deg'] = math.degrees(math.acos(max(-1, min(1, float(np.dot(f / np.linalg.norm(f), e_pole(B)))))))
    T = point(row['s_top'], PHI[2]); B1 = point(row['s_bot'], PHI[1]); B3 = point(row['s_bot'], PHI[3])
    g = tangent_to(T, B1) + tangent_to(T, B3)
    out['top_mag'] = float(np.linalg.norm(g))
    out['top_dir_deg'] = math.degrees(math.acos(max(-1, min(1, float(np.dot(g / np.linalg.norm(g), -e_pole(T)))))))
    # боковая (поперёк линии) составляющая при рассогласовании натяжений T_out = T_in*(1+eps): на eps
    out['bottom_lateral_per_eps'] = abs(float(np.dot(tangent_to(B, T2), e_east(B))))
    out['top_lateral_per_eps'] = abs(float(np.dot(tangent_to(T, B3), e_east(T))))
    return out

def physics_section(main_rows, fixed_rows):
    L = []
    L.append("## 8. Физический слой (соотношения; численно — только в долях T)\n")
    L.append("### 8.1 Нормальное давление натянутой нити на сферу: p = T·κ_n, κ_n = 1/R для любого направления на сфере\n")
    L.append(f"- p/T = 1/R = {1/R:.4f} мм⁻¹. Для плеча длиной ℓ полная нормальная сила N = T·ℓ/R "
             f"(угол поворота нити = ℓ/R). Плечо ряда 1 (≈37.5 мм): N ≈ {37.5/R:.2f}·T.")
    L.append("- Численное значение T (Н) НЕ известно: требуется измерение динамометром (см. uncertainties.md).\n")
    L.append("### 8.2 Равнодействующая натяжений в точке стежка (равные T по обе стороны)\n")
    L.append("| ряд | низ: F/T | низ: угол F к меридиану (к полюсу), ° | верх: F/T | верх: угол F к меридиану (от полюса), ° | боковая сила низ, на ε | боковая сила верх, на ε |")
    L.append("|---|---|---|---|---|---|---|")
    for r in main_rows:
        s = stitch_resultant(r)
        L.append(f"| {r['n']} | {s['bottom_mag']:.3f} | {s['bottom_dir_deg']:.1f} | {s['top_mag']:.3f} | {s['top_dir_deg']:.1f} | "
                 f"{s['bottom_lateral_per_eps']:.3f}·T·ε | {s['top_lateral_per_eps']:.3f}·T·ε |")
    L.append("")
    L.append("Вывод: при симметричном лепестке равнодействующая направлена ВДОЛЬ линии разметки (низ — к полюсу, "
             "верх — от полюса) и не сдвигает линию вбок; сдвиг вбок пропорционален рассогласованию натяжений ε "
             "(например, из-за трения в стежке, 8.3). Это согласуется с предупреждением TK-KAGARI не перетягивать нить, "
             "чтобы не сдвигать 地割り.\n")
    L.append("### 8.3 Трение в стежке (капстан, Euler–Eytelwein): T_2/T_1 ≤ e^{μθ}\n")
    L.append("θ — суммарный угол охвата нити в захвате (вниз в обмотку, под линией, вверх, поворот в плоскости). "
             "Геометрия захвата внутри обмотки не измерена; θ ∈ [π, 2π] — диапазон-допущение [A].\n")
    L.append("| μ (источник) | θ = π | θ = 1.5π | θ = 2π |\n|---|---|---|---|")
    for name, mu in MU_LIT.items():
        L.append(f"| {mu} ({name}) | {math.exp(mu*math.pi):.1f} | {math.exp(mu*1.5*math.pi):.1f} | {math.exp(mu*2*math.pi):.1f} |")
    L.append("")
    L.append("Смысл: каждый стежок может удерживать перепад натяжения в несколько раз, поэтому натяжение уже уложенных "
             "плеч НЕ равно силе, с которой мастер тянет иглу, и определяется историей затяжки (гистерезис). "
             "Этим же объясняется OLY-BASIC: игла против хода увеличивает охват -> «糸が抜けにくくなります». "
             "μ для Perle #5 (мерсеризованная опалённая 2-сложная) по нити и по обмотке НЕ найдены.\n")
    L.append("### 8.4 Геодезичность и трение: негеодезический путь устойчив, если |κ_g| ≤ μ·κ_n (κ_n = 1/R)\n")
    L.append("Допустимый боковой прогиб (стрелка) плеча длиной ℓ при предельной κ_g: δ_max ≈ κ_g,max·ℓ²/8.\n")
    L.append("| μ (источник) | κ_g,max, мм⁻¹ | мин. радиус геод. кривизны, мм | δ_max для ℓ = 37.5 мм, мм | δ_max / w |")
    L.append("|---|---|---|---|---|")
    for name, mu in MU_LIT.items():
        kg = mu / R
        d = kg * 37.5**2 / 8
        L.append(f"| {mu} ({name}) | {kg:.4f} | {1/kg:.0f} | {d:.2f} | {d/w:.1f} |")
    L.append("")
    # требуемая негеодезичность для правила fixed
    sc = spacing_checks(fixed_rows)
    L.append("Требуемая негеодезичность, чтобы при шаге низа 2 мм (правило 'fixed') соседние ряды у кончика лежали на "
             "расстоянии w (оценка параболой через концы: κ_g ≈ 2δ/(t(1−t)ℓ²), t = 0.85, δ = w − d_bot):\n")
    L.append("| ряд n→n+1 | δ, мм | κ_g, мм⁻¹ | λ = κ_g/κ_n (нужно μ ≥ λ) |\n|---|---|---|---|")
    lam_max = 0
    for c, r in zip(sc, fixed_rows):
        dlt = max(0.0, w - c['d_bot'])
        ell = geod_len(point(r['s_top'], PHI[0]), point(r['s_bot'], PHI[1]))
        kg = 2 * dlt / (0.85 * 0.15 * ell**2)
        lam = kg * R
        lam_max = max(lam_max, lam)
        L.append(f"| {c['n']}→{c['n']+1} | {dlt:.2f} | {kg:.4f} | {lam:.2f} |")
    L.append("")
    L.append(f"Вывод: нужная λ ≤ {lam_max:.2f}. Если μ (нить по обмотке/по соседней нити) того же порядка, что опубликованные "
             "0.32–0.52 для хлопковой пряжи, трение способно удержать такие отклонения => геодезическая модель не "
             "единственное устойчивое положение: реальный путь в пределах «конуса трения» выбирает мастер (укладка, "
             "прижим пальцем). Прямые плечи на фото TK-GT14 совместимы с геодезическими, но не доказывают их.\n")
    return "\n".join(L) + "\n"

# ----------------------------------------------------------------------------
# 5. РАСЧЁТ И ВЫВОД
# ----------------------------------------------------------------------------
def export_thread_path(rows):
    """Явный путь двух рабочих нитей (A, B) на северном полюсе в порядке шитья A1,B1,A2,B2,... (TK-GT14).
    Для каждой операции: нить, ряд, стежок, линия, тип, координаты E/X (мм, центр шара в 0, NP = +z),
    накопленная длина u вдоль СВОЕЙ нити (u=0 — выход после скрытого старта). Вход для stage 2: рецепт -> путь."""
    r3 = lambda p: [round(float(v), 4) for v in p]
    ops, u, cur = [], {'A': 0.0, 'B': 0.0}, {'A': None, 'B': None}
    for n, row in enumerate(rows, 1):
        for th, off in (('A', 0), ('B', 1)):
            if n == 1:
                X0 = offset_pt(row['s_top'], PHI[off % P['N_DIV']], start_exit_offset())
                ops.append(dict(op='start', thread=th, at=r3(X0), hidden_run_mm=P['start_run_mm'],
                                backtrack=P['start_backtrack'], basis='TK-ANCHOR / TK-GT14'))
                cur[th] = X0
            else:
                ops.append(dict(op='resume', thread=th, at=r3(cur[th]), basis='TK-GT14 park/resume; TK-UWA'))
            seq, arms, bites, last = round_lengths(row, cur[th], off)
            for st, a, b in zip(seq, arms, bites):
                u[th] += a
                uE = u[th]
                u[th] += b
                ops.append(dict(op='stitch', thread=th, row=n, i=st['i'], line=st['line'], kind=st['kind'],
                                s_mm=round(st['s'], 4), bite_mm=round(st['bite'], 4), E=r3(st['E']), X=r3(st['X']),
                                u_E=round(uE, 3), u_X=round(u[th], 3), lay_before='geodesic arc from previous X [A]',
                                over_previous_rows=(st['kind'] == 'top' and n > 1),
                                closing=(st['i'] == P['N_DIV'])))
            cur[th] = last
            ops.append(dict(op='park', thread=th, at=r3(last)))
    for th in ('A', 'B'):
        ops.append(dict(op='finish', thread=th, at=r3(cur[th]), hidden_run_mm=P['end_run_mm'], basis='TK-ANCHOR / OLY-BASIC'))
    return ops

def fmt(x, d=2):
    return f"{x:.{d}f}"

def main():
    want_json = '--json' in sys.argv
    L = []
    L.append("# calc_output — результаты calc.py (кику S8, 八重菊 / 上掛け千鳥)\n")
    L.append("Сгенерировано скриптом `samples/kiku-s8/calc.py`. Не редактировать вручную.\n")
    L.append("Обозначения: [M] параметр мастера/источника, [A] аппроксимация, [C] вычислено.\n")
    L.append("## 1. Параметры\n")
    L.append("| параметр | значение | тип |\n|---|---|---|")
    tags = dict(C_mm='M', N_DIV='M', s_top1_mm='M', bottom_from_eq='M', w_mm='A', marking_width_mm='A', top_step='M',
                bottom_rule='вариант', bottom_fixed_mm='M', tip_limit='M', start_run_mm='M',
                start_backtrack='M', end_run_mm='A', end_backtrack='M', handling_reserve_mm='A (без источника)',
                hemispheres='M', skein_m='M')
    for k, v in P.items():
        L.append(f"| {k} | {v} | {tags.get(k,'')} |")
    L.append("")
    L.append("## 2. Производные размеры [C]\n")
    L.append(f"- R = C/(2π) = {fmt(R,3)} мм; диаметр D = {fmt(2*R,2)} мм")
    L.append(f"- дуга полюс–экватор Q = C/4 = {fmt(Q,2)} мм")
    L.append(f"- расстояние между соседними линиями по экватору = C/8 = {fmt(P['C_mm']/8,2)} мм; "
             f"на уровне s: (C/8)·sin(s/R); при s=5 мм: {fmt(P['C_mm']/8*math.sin(5/R),2)} мм; при s=40 мм: {fmt(P['C_mm']/8*math.sin(40/R),2)} мм")
    L.append(f"- первый нижний стежок s_b1 = Q·(1−1/3) = {fmt(s_b1,2)} мм от полюса (= {fmt(Q-s_b1,2)} мм выше экватора)")
    L.append(f"- предел кончиков: {P['tip_limit']} -> s ≤ {fmt(tip_lim,2)} мм\n")

    results = {}
    for rule in ('geom', 'fixed'):
        for lim_name, lim in (('equator', Q), ('olympus7', Q - 7.0)):
            rows = rows_geometry(rule, P['bottom_fixed_mm'], lim)
            results[(rule, lim_name)] = rows
    main_rows = results[(P['bottom_rule'], P['tip_limit'])]

    L.append("## 3. Ряды (один набор, одно полушарие) — основной вариант: "
             f"bottom_rule='{P['bottom_rule']}', tip_limit='{P['tip_limit']}'\n")
    L.append(f"Захваты E→X **выводятся** из ширин (не параметр): c0 = (m + w)/2 = {fmt(clear0(),3)} мм от оси линии "
             f"(m = {P['marking_width_mm']} мм разметка [A], w = {w} мм нить [A]); низ: ±c0; верх ряда 1: ±c0; "
             "замыкающий верх на стартовой линии: X = −(c0 + w) (слева уже выходит стартовая нить); "
             "верх ряда n≥2: ±w с каждой стороны за ряд — оценка до stage 2c.\n")
    L.append("| ряд n | s_top, мм | захват верха, мм | захват замыкающего верха, мм | захват низа, мм | s_bot, мм | α_B (полуугол кончика), ° | угол кончика, ° | γ_T, ° | шаг низа к n+1, мм |")
    L.append("|---|---|---|---|---|---|---|---|---|---|")
    for r in main_rows:
        L.append(f"| {r['n']} | {fmt(r['s_top'])} | {fmt(r['bite_top'])} | {fmt(r['bite_close'])} | {fmt(r['bite_bot'])} | {fmt(r['s_bot'])} | {fmt(r['alpha_B'],1)} | "
                 f"{fmt(r['tip_angle'],1)} | {fmt(r['gamma_T'],1)} | {fmt(r['next_d_bot'])} |")
    L.append("")
    L.append("### 3.1 Сравнение правил шага нижней точки и пределов (число рядов на набор)\n")
    L.append("| правило низа | предел кончиков | рядов N | последний s_bot, мм | последний s_top, мм |")
    L.append("|---|---|---|---|---|")
    for (rule, lim_name), rows in results.items():
        L.append(f"| {rule} | {lim_name} | {len(rows)} | {fmt(rows[-1]['s_bot'])} | {fmt(rows[-1]['s_top'])} |")
    L.append("")

    # проверки
    L.append("## 4. Числовые проверки\n")
    L.append("### 4.1 Плечо остаётся внутри своего сектора (между линиями k и k+1)\n")
    ok_all = all(arm_stays_in_sector(r) for r in main_rows)
    L.append(f"- все ряды основного варианта: {'OK' if ok_all else 'НАРУШЕНИЕ'} "
             "(геометрический факт: дуга большого круга короче π пересекает другой большой круг не более одного раза)\n")
    for rule in ('geom', 'fixed'):
        rows = results[(rule, 'equator')]
        sc = spacing_checks(rows)
        L.append(f"### 4.2 Расстояние между соседними рядами (перпендикулярно плечу), правило '{rule}' — цель ≈ w = {w} мм\n")
        L.append("| ряд n→n+1 | у верха (15%) | середина (50%) | у кончика (85%) | вывод |")
        L.append("|---|---|---|---|---|")
        for c in sc:
            flag = []
            for key in ('d_top', 'd_mid', 'd_bot'):
                if c[key] < 0.8 * w: flag.append('нахлёст')
                elif c[key] > 1.5 * w: flag.append('зазор')
            L.append(f"| {c['n']}→{c['n']+1} | {fmt(c['d_top'])} | {fmt(c['d_mid'])} | {fmt(c['d_bot'])} | "
                     f"{', '.join(sorted(set(flag))) if flag else 'в допуске 0.8w…1.5w'} |")
        L.append("")
    L.append("Интерпретация: при постоянном шаге 2 мм все ряды у кончика ложатся ближе w (нахлёст), т.к. 2 мм < w/sin α ≈ 5–6 мм; "
             " правило 'geom' по построению даёт w у кончика. Реальная нить сдвигается трением "
             "и прижимом (OLY-TM7-V: «糸を左手の親指で押さえながら»), поэтому это проверка модели, а не практики.\n")

    # пересечения A/B
    L.append("### 4.3 Точка пересечения плеча A(n) с плечом B(n) в секторе 0–1 (s от полюса, долгота)\n")
    L.append("| ряд | s, мм | φ, ° |\n|---|---|---|")
    for r in main_rows:
        c = ab_crossing(r, r)
        if c: L.append(f"| {r['n']} | {fmt(c[0])} | {fmt(math.degrees(c[1]),1)} |")
    L.append("")

    # длины
    L.append("## 5. Длина нити\n")
    L.append("Модель: видимое плечо = геодезическая (дуга большого круга) от точки выхода X предыдущего стежка до точки "
             "входа E следующего; скрытый захват = хорда E→X (игла под линией разметки внутри обмотки). "
             "Видимые участки на полюсе в зоне uwagake (перехлёст через предыдущие ряды) учитываются только через "
             "ширину захвата — [A].\n")
    L.append("| ряд | видимые плечи, мм | скрытые захваты, мм | ряд всего, мм | нарастающим итогом, мм |")
    L.append("|---|---|---|---|---|")
    cum = 0.0
    prev = None
    per_round = []
    arc_param = []   # параметризация по длине дуги для 1-го ряда (для диаграмм/симулятора)
    for r in main_rows:
        seq, arms, bites, prev = round_lengths(r, prev, 0)
        tot = sum(arms) + sum(bites)
        per_round.append(dict(n=r['n'], arms=sum(arms), bites=sum(bites), total=tot))
        if r['n'] == 1:
            u = 0.0
            for st, a, b in zip(seq, arms, bites):
                arc_param.append(dict(stitch=st['i'], line=st['line'], kind=st['kind'],
                                      u_arm_start=u, u_E=u + a, u_X=u + a + b))
                u += a + b
        cum += tot
        L.append(f"| {r['n']} | {fmt(sum(arms),1)} | {fmt(sum(bites),1)} | {fmt(tot,1)} | {fmt(cum,1)} |")
    L.append("")
    start_hidden = P['start_run_mm'] * (2 if P['start_backtrack'] else 1)
    end_hidden = P['end_run_mm'] * (2 if P['end_backtrack'] else 1)
    one_set_hemi = cum
    per_colour = P['hemispheres'] * (one_set_hemi + start_hidden + end_hidden + P['handling_reserve_mm'])
    L.append("### 5.1 Баланс на один цвет (в TK-GT14 цвет A = набор A, цвет B = набор B; оба полушария)\n")
    L.append("| статья | мм | тип |\n|---|---|---|")
    L.append(f"| уложено на шар (видимое) за N={len(main_rows)} рядов, 1 полушарие | {fmt(sum(p['arms'] for p in per_round),0)} | [C] |")
    L.append(f"| скрытые захваты стежков, 1 полушарие | {fmt(sum(p['bites'] for p in per_round),0)} | [C]/[A] |")
    L.append(f"| скрытый старт (закрепление) | {fmt(start_hidden,0)} | [M] TK-ANCHOR |")
    L.append(f"| скрытое окончание | {fmt(end_hidden,0)} | [A] |")
    L.append(f"| запас на иглу/манипуляции (не ложится на шар) | {fmt(P['handling_reserve_mm'],0)} | [A] без источника |")
    L.append(f"| **итого на цвет, 2 полушария (при одной нити на полушарие)** | **{fmt(per_colour,0)}** | [C] |")
    L.append("")
    L.append(f"- Итого на цвет ≈ **{fmt(per_colour/1000,2)} м**; оба цвета ≈ **{fmt(2*per_colour/1000,2)} м**.")
    L.append(f"- Доля мотка 25 м на цвет: {fmt(per_colour/1000/P['skein_m']*100,0)} % (поставка ≠ расход: "
             "в наборе OLY-TM7 «各ひとかせ» = по 25 м на цвет).")
    L.append("- Сверка порядка величины: TemariKai 99DA04 (другой узор, 25 см) — измерено ~10 yd ≈ 9.1 м на цвет "
             "(PRIOR-THREAD). Наше значение того же порядка/меньше — ожидаемо для простого кику на 8 лепестков; "
             "это НЕ калибровка.\n")
    # чувствительность
    L.append("### 5.2 Чувствительность итога на цвет (2 полушария) к варианту правила и пределу\n")
    L.append("| правило низа | предел | рядов | итого на цвет, м |\n|---|---|---|---|")
    sens = {}
    for (rule, lim_name), rows in results.items():
        prev = None; tot = 0.0
        for r in rows:
            _, arms, bites, prev = round_lengths(r, prev, 0)
            tot += sum(arms) + sum(bites)
        val = P['hemispheres'] * (tot + start_hidden + end_hidden + P['handling_reserve_mm'])
        sens[f"{rule}/{lim_name}"] = val
        L.append(f"| {rule} | {lim_name} | {len(rows)} | {fmt(val/1000,2)} |")
    L.append("")
    L.append("### 5.3 Чувствительность к размеру шара (правило 'geom', до экватора; остальные параметры те же)\n")
    L.append("(пересчёт повторным запуском модели с другим C — функция size_sweep)\n")
    L.append("| C, мм | R, мм | рядов | длина 1-го ряда, мм | итого на цвет, м |\n|---|---|---|---|---|")
    for Cx in (200.0, 230.0, 240.0, 250.0):
        L.append(size_sweep(Cx))
    L.append("")
    L.append("## 6. Параметризация 1-го ряда (набор A) по длине нити u, мм\n")
    L.append("u=0 — точка выхода нити у стартовой линии (после скрытого старта). Для каждого стежка: u начала плеча, "
             "u входа иглы E, u выхода X.\n")
    L.append("| стежок | линия | тип | u начала плеча | u(E) | u(X) |\n|---|---|---|---|---|---|")
    for a in arc_param:
        L.append(f"| {a['stitch']} | {a['line']} | {a['kind']} | {fmt(a['u_arm_start'],1)} | {fmt(a['u_E'],1)} | {fmt(a['u_X'],1)} |")
    L.append("")
    L.append("## 7. Ограничения модели\n")
    L.append("- Плечо = геодезическая: допустимо для натянутой нити на гладкой выпуклой поверхности без трения "
             "(TK-KAGARI: «moderate tension», «straight»). НЕ годится для OLY-TM7, где нить намеренно ослабляют "
             "ради округлости лепестка («糸を少し緩ませて»).")
    L.append("- Толщина нити и слоёв не входит в радиус (нить лежит на сфере радиуса R; реальные слои ~0.4–0.7 мм).")
    L.append("- Верхняя зона uwagake (перехлёст, «клин») моделируется только ростом ширины захвата.")
    L.append("- Подъём/смещение нити при затяжке, трение, упругость — не моделируются.")
    out = "\n".join(L) + "\n" + physics_section(main_rows, results[('fixed', 'equator')])
    open(__file__.replace('calc.py', 'calc_output.md'), 'w', encoding='utf-8').write(out)
    print(out)
    if want_json:
        js = dict(params=P, R=R, Q=Q, rows=main_rows, per_round=per_round, arc_param_row1=arc_param,
                  totals=dict(per_colour_mm=per_colour, start_hidden=start_hidden, end_hidden=end_hidden),
                  sensitivity_mm=sens, thread_path_north=export_thread_path(main_rows))
        open(__file__.replace('calc.py', 'calc_output.json'), 'w', encoding='utf-8').write(
            json.dumps(js, ensure_ascii=False, indent=1, default=float))

def size_sweep(Cx):
    """Пересчёт при другом обхвате: временно подменяем глобальные R,Q,s_b1."""
    global R, Q, s_b1
    R0, Q0, s0 = R, Q, s_b1
    R, Q = Cx / (2 * math.pi), Cx / 4
    s_b1 = Q * (1 - P['bottom_from_eq'])
    rows = rows_geometry('geom', P['bottom_fixed_mm'], Q)
    prev = None; tot = 0.0; first = None
    for r in rows:
        _, arms, bites, prev = round_lengths(r, prev, 0)
        t = sum(arms) + sum(bites); tot += t
        if first is None: first = t
    sh = P['start_run_mm'] * 2; eh = P['end_run_mm'] * 2
    val = P['hemispheres'] * (tot + sh + eh + P['handling_reserve_mm'])
    line = f"| {Cx:.0f} | {R:.2f} | {len(rows)} | {first:.1f} | {val/1000:.2f} |"
    R, Q, s_b1 = R0, Q0, s0
    return line

if __name__ == '__main__':
    main()
