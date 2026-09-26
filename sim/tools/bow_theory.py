#!/usr/bin/env python3
"""Tip-drop theory for kiku S8 arms on a sphere: geodesic vs friction-held small-circle bow.

Ported from Fable session tmp/fable-2026-09-25/bow_theory.py (repo: sim/tools/).

Pure python (no numpy). Geometry follows the sim conventions:
  R = C/(2*pi); marking meridians L_k at phi_k = k*2pi/N; s = arc from NP along a meridian.
  Row-1 arm of set A: from X1 (top stitch exit on L0, lateral -(m+w)/2, i.e. -phi side)
                       to   E1 (bottom stitch entry on L1, lateral +(m+w)/2, i.e. +phi side).
  packThenPierce: row-2 arm axis = curve parallel to row-1 axis at distance w on the outside
  (away from the pole); E2 = where that axis reaches the E-line of L1 (lateral +(m+w)/2).
Bow model: row-1 arm = arc of a small circle through X1 and E1 with geodesic curvature
  kappa_g = lambda/R, 0 <= lambda <= mu (friction cone, spec Phi3), bulging AWAY from the pole.
"""
import json, math, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def sim_defaults():
    """Default parameters from sim/src/params.js (single source of truth, e.g. the default marking width m)."""
    import subprocess
    js = "import {defaults} from './sim/src/params.js'; console.log(JSON.stringify(defaults()))"
    out = subprocess.run(['node', '--input-type=module', '-e', js], cwd=os.path.join(HERE, '..', '..'),
                         check=True, capture_output=True, text=True)
    return json.loads(out.stdout)

# Module-level geometry, set by configure() (helpers below read R).
C, w, m, N = 240.0, 0.714, 0.5, 8
sTop, sBot = 5.0, 40.0
R = C / (2 * math.pi)

def configure(C_mm, w_mm, m_mm, N_div=8, s_top=5.0, s_bot=40.0):
    global C, w, m, N, sTop, sBot, R
    C, w, m, N, sTop, sBot = C_mm, w_mm, m_mm, N_div, s_top, s_bot
    R = C / (2 * math.pi)

def norm(v):
    n = math.sqrt(sum(x * x for x in v)); return [x / n for x in v]
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def add(a, b): return [x + y for x, y in zip(a, b)]
def mul(a, k): return [x * k for x in a]
def ang(a, b): return math.acos(max(-1.0, min(1.0, dot(norm(a), norm(b)))))

def P(s, phi):  # unit vector of point at arc s from NP on meridian phi
    th = s / R
    return [math.sin(th) * math.cos(phi), math.sin(th) * math.sin(phi), math.cos(th)]
def east(phi): return [-math.sin(phi), math.cos(phi), 0.0]
def offset(p, e, d):  # move along great circle from p in direction e by arc d (mm)
    a = d / R
    return norm(add(mul(p, math.cos(a)), mul(norm(e), math.sin(a))))
def s_of(p): return R * math.acos(max(-1.0, min(1.0, p[2])))


def meridian_down(p, phi):  # unit tangent at p along meridian phi, toward equator
    z = [0, 0, 1.0]
    up = norm(add(z, mul(p, -dot(z, p))))
    return mul(up, -1)

def arrival_angle(t_arr, p, phi):
    """angle between arriving direction of travel and meridian-down direction at p."""
    return ang(t_arr, meridian_down(p, phi))

def small_circle_center(a, b, rho, toward_pole=True):
    """unit vector P with angle(P,a)=angle(P,b)=rho; pick the solution nearer the pole."""
    mid = norm(add(a, b)); n = norm(cross(a, b))            # bisector plane spanned by mid, n
    half = ang(a, b) / 2
    # P = mid*cos(t) + n*sin(t); need dot(P,a)=cos(rho): dot(mid,a)=cos(half)
    c = math.cos(rho) / math.cos(half)
    if abs(c) > 1: return None
    t = math.acos(c)
    cands = [norm(add(mul(mid, math.cos(t)), mul(n, math.sin(t)))),
             norm(add(mul(mid, math.cos(t)), mul(n, -math.sin(t))))]
    cands.sort(key=lambda p: -p[2])
    return cands[0] if toward_pole else cands[1]

def arc_points(Pc, a, b, n=400, extend=2.0):
    """points of the small circle about Pc from a to b (shorter way), by rotating a about Pc."""
    # rotate a about axis Pc by angle t in [0, T] where rotation carries a to b
    def rot(v, axis, t):
        k = norm(axis); c, s = math.cos(t), math.sin(t)
        return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)))
    # find T: angle between projections of a,b onto plane perp to Pc
    pa = norm(add(a, mul(Pc, -dot(a, Pc)))); pb = norm(add(b, mul(Pc, -dot(b, Pc))))
    T = ang(pa, pb)
    if dot(cross(pa, pb), Pc) < 0: T = -T
    return [rot(a, Pc, T * extend * i / int(n * extend)) for i in range(int(n * extend) + 1)]

def eline_s(pts_axis, phi, lateral):
    """s where a curve (list of unit vectors), offset by +w outward, reaches the E-line of meridian phi.
    E-line: points at lateral +lateral from meridian phi. We solve on the offset curve by bisection
    on the signed lateral coordinate y(p) = R*asin(dot(p, east(phi))) - lateral."""
    e = east(phi)
    def y(p): return R * math.asin(max(-1, min(1, dot(p, e)))) - lateral
    prev = None
    for p in pts_axis:
        if prev is not None and y(prev) < 0 <= y(p):
            # linear interpolate
            f = -y(prev) / (y(p) - y(prev))
            q = norm(add(mul(prev, 1 - f), mul(p, f)))
            return s_of(q)
        prev = p
    return None

def outward_offset(pts, Pc, d):
    """offset small-circle points away from center Pc by arc d (mm). (legacy concentric helper)"""
    out = []
    for p in pts:
        tdir = norm(add(mul(Pc, -1), mul(p, dot(p, Pc))))  # tangent at p pointing away from Pc
        out.append(offset(p, tdir, d))
    return out

def parallel_offset_poly(pts, d):
    """Geodesic parallel of a spherical polyline by arc d (mm) equatorward (6a.11/6a.12)."""
    out = []
    for i, p in enumerate(pts):
        i0 = max(0, i - 1); i1 = min(len(pts) - 1, i + 1)
        T = norm(add(pts[i1], mul(pts[i0], -1)))
        T = norm(add(T, mul(p, -dot(T, p))))
        N = norm(cross(p, T))
        if N[2] > 0: N = mul(N, -1)  # equatorward
        out.append(offset(p, N, d))
    return out

def extend_gc_end(pts, ext_mm, n=40):
    """Extend polyline past its end along the great circle tangent to the last segment."""
    if len(pts) < 2: return pts
    T = norm(add(pts[-1], mul(pts[-2], -1)))
    T = norm(add(T, mul(pts[-1], -dot(T, pts[-1]))))
    out = list(pts)
    for i in range(1, n + 1):
        out.append(offset(pts[-1], T, ext_mm * i / n))
    return out

def geodesic_pts(a, b, n=400, extend=2.0):
    om = ang(a, b)
    return [norm(add(mul(a, math.sin((1 - t) * om) / math.sin(om)), mul(b, math.sin(t * om) / math.sin(om))))
            for t in [extend * i / int(n * extend) for i in range(int(n * extend) + 1)]]

def sagitta(pts, a, b):
    nrm = norm(cross(a, b))
    return max(abs(R * math.asin(dot(p, nrm))) for p in pts[:401])

LAMBDAS = [0.0, 0.1, 0.2, 0.32, 0.4, 0.45, 0.52, 0.6]

def theory(verbose=True):
    """Tip-drop table for the configured (C, w, m, N, sTop, sBot). Returns a dict (see bow_reference.json)."""
    phi0, phi1 = 0.0, 2 * math.pi / N
    lat = (m + w) / 2
    X1 = offset(P(sTop, phi0), east(phi0), -lat)   # exit, -phi side of L0
    E1 = offset(P(sBot, phi1), east(phi1), +lat)   # entry, +phi side of L1
    L = R * ang(X1, E1)
    gamma = L / R
    out = dict(C=C, w=w, m=m, N=N, s_top=sTop, s_bot=sBot, R=R, leg_mm=L, lateral_mm=lat, rows=[])
    say = print if verbose else (lambda *a, **k: None)
    say(f"C = {C:g}, w = {w:g}, m = {m:g}: R = {R:.3f} mm, leg X1->E1 geodesic L = {L:.2f} mm (central angle {math.degrees(gamma):.1f} deg)")
    g = geodesic_pts(X1, E1)
    t_arr = norm(add(g[401], mul(g[399], -1)))
    alpha_geo = arrival_angle(t_arr, E1, phi1)
    nrm = norm(cross(X1, E1))
    if nrm[2] < 0: nrm = mul(nrm, -1)   # normal pointing to pole side
    def gc_offset(pts, d):
        return [offset(p, mul(nrm, -1), d) for p in pts]   # move away from pole side
    g2 = gc_offset(g, w)
    sB2 = eline_s(g2, phi1, lat)
    out['alpha_geo_deg'] = math.degrees(alpha_geo)
    say(f"geodesic: alpha_geo = {math.degrees(alpha_geo):.2f} deg; w/sin(alpha) = {w/math.sin(alpha_geo):.3f} mm; "
        f"packThenPierce Delta = {sB2 - sBot:.3f} mm")
    say("\nTangent packing (6a.11/6a.12): parallel of laid curve + GC extension; Δ_n ≈ Δ₂; rows ≈ 1+floor(20/Δ₂)")
    say("lambda = kappa_g*R | rho deg | theta deg (bow vs chord at E) | alpha' deg | Delta_tip mm | w/sin(alpha') | sagitta mm | rows to equator")
    for lam in LAMBDAS:
        if lam == 0.0:
            alpha = alpha_geo; delta = sB2 - sBot; sag = 0.0
            # Exact successive GC offsets (λ=0): count tips under the equator (s ≤ 60 mm at C=240 → Q)
            rows_exact = 1
            while True:
                pts_n = gc_offset(g, w * rows_exact); s_n = eline_s(pts_n, phi1, lat)
                if s_n is None or s_n > C / 4: break
                rows_exact += 1
            rows = rows_exact
            out['rows'].append(dict(lam=lam, tipDrop_mm=delta, sagitta_mm=sag, alpha_deg=math.degrees(alpha),
                                    rows=rows, rows_canon=1 + int(math.floor((C / 4 - sBot) / delta))))
            say(f"{lam:5.2f} | {90:6.1f} | {0:5.2f} | {math.degrees(alpha):6.2f} | {delta:6.3f} | {w/math.sin(alpha):6.3f} | {sag:5.2f} | {rows}")
            continue
        rho = math.atan(1 / lam)                      # cot(rho) = lambda
        Pc = small_circle_center(X1, E1, rho, toward_pole=True)
        pts = arc_points(Pc, X1, E1)
        t_arr = norm(add(pts[401], mul(pts[399], -1)))
        alpha = arrival_angle(t_arr, E1, phi1)
        th = alpha - alpha_geo
        sag = sagitta(pts, X1, E1)
        # Tangent Δ₂: parallel of row-1 by w, GC-extend past E, hit E-line
        rail = extend_gc_end(parallel_offset_poly(pts[:401], w), ext_mm=max(5 * w, 10.0), n=80)
        s_n = eline_s(rail, phi1, lat)
        delta = (s_n - sBot) if s_n else float('nan')
        rows = 1 + int(math.floor((C / 4 - sBot) / delta)) if delta and delta > 0 else float('nan')
        sinth_formula = lam * math.tan(gamma / 2)
        out['rows'].append(dict(lam=lam, tipDrop_mm=delta, sagitta_mm=sag, alpha_deg=math.degrees(alpha),
                                theta_deg=math.degrees(th), rows=rows, rows_canon=rows))
        say(f"{lam:5.2f} | {math.degrees(rho):6.1f} | {math.degrees(th):5.2f} (formula {math.degrees(math.asin(sinth_formula)):5.2f}) | "
            f"{math.degrees(alpha):6.2f} | {delta:6.3f} | {w/math.sin(alpha):6.3f} | {sag:5.2f} | {rows}")
    return out

def main(argv):
    """Usage: bow_theory.py [--m M] [--json]
    Without --json: print the table for the default (C, w, m) from params.js (or --m).
    --json: write sim/data/bow_reference.json for the default m and m = 1.0 (stress value, S16)."""
    d = sim_defaults()
    Cd, wd, md = float(d['C_mm']), float(d['w_mm']), float(d['m_mm'])
    if '--m' in argv:
        md = float(argv[argv.index('--m') + 1])
    if '--json' in argv:
        entries = []
        for mm in sorted({md, 1.0}):
            configure(Cd, wd, mm)
            entries.append(theory(verbose=False))
        dst = os.path.join(HERE, '..', 'data', 'bow_reference.json')
        json.dump(dict(generator='sim/tools/bow_theory.py --json (independent pure-python tip-drop theory)',
                       entries=entries), open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print(f'{len(entries)} entries → {os.path.relpath(dst)}')
        return
    configure(Cd, wd, md)
    theory(verbose=True)

if __name__ == '__main__':
    main(sys.argv[1:])
