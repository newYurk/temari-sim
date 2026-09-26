# Журнал решений

Все решения — 2026-09-24 (America/New_York), исполнитель stage 1. Формат: решение → основание → альтернативы → коммит.

| # | Решение | Основание | Отклонённые альтернативы | Коммит |
|---|---|---|---|---|
| D1 | Базовый образец — кику S8 (八重菊, 2×4) в 上掛け千鳥かがり, параметры TemariKai GT14 | пошаговые фото и опоры GT14 + ToolKit; «基礎» у Sanuki; сопоставимость с prior newYurk/temari (#36, #86); японское подтверждение правил — Olympus TM-7 | Olympus TM-2 八重菊 (план по умолчанию): онлайн-страница TM-2 описывает только つむ型クロス; TM-7 古典菊: 16 делений, печатная инструкция не видна | d65bcc5 |
| D2 | Olympus TM-7 = та же техника (два чередующихся набора, 上掛け у верха, «自然に交わる所» у низа), но НЕ сливать: 16 делений, одна нить, старт внизу, слабина | OLY-TM7-V субтитры; OLY-TM7-L | считать TM-7 отдельной техникой; считать её идентичной GT14 | 3f0fed9 (prior-project/state.md §7) |
| D3 | Ход обхода против часовой снаружи полюса; игла против хода (E справа, X слева) | GT14, EAGLE, OLY-BASIC, MYJULIA | — | d65bcc5 |
| D4 | Нижний шаг по правилу `geom` (уложи вплотную → коли в пересечении), `fixed 2 мм` — вариант сравнения | TK-STRETCH, OLY-TM7-V; совпадает с prior «pack then pierce» | 2 мм как основа (даёт нахлёст по геодезической модели; prior признал capacity=10 арифметикой) | d65bcc5 |
| D5 | Плечи — геодезические как идеализация; дополнено конусом трения κ_g ≤ μκ_n | PHYS-GEODCURV, PHYS-SOFI2018; prior #101 | считать геодезическую форму предсказанием | d65bcc5 |
| D6 | Физический слой — только соотношения; численные T, μ, сжатие не выдумывать; μ хлопка 0,32–0,52 — только порядок с источником | указание пользователя; PHYS-COTTON-MU (аннотация) | подставлять «типичные» μ без источника | d65bcc5, 3f0fed9 |
| D7 | Две нити A/B с парковкой (GT14), вариант одной нити записан | GT14 | одна нить (OLY/EAGLE/MYJULIA) | 3f0fed9 |
| D8 | Старт скрытым проходом 3,5 см + обратный ход; окончание так же | TK-ANCHOR; OLY-BASIC как вариант | узел (RU) | d65bcc5 |
| D9 | Запас 120 мм на цвет — допущение без источника, помечено [A] | — | не учитывать | d65bcc5 |
| D10 | Схемы строятся из той же геометрии calc.py (азимутальная равнопромежуточная проекция), PNG — Chrome headless | воспроизводимость | ручные рисунки | 9c7d3d2 |
| D11 | Прочитаны issues/доки newYurk/temari, **код не читался**; правила prior сверены по пунктам (=/≠) | указание владелицы (через родителя) | игнорировать prior; читать код | 3f0fed9 |
| D12 | В спецификацию добавлен слой «текстильная механика» (Peirce, Kemp, van Wyk, Kawabata/Durur, рост паковки, капстан) — законы как формы, числа prior — только начальные значения с диапазоном | TEX-BEHERA2012, TEX-VANWYK1946, TEX-GRAMSCH2022 открыты; Kawabata — аннотация; Durur — не открыт | переносить 0,28 мм / m^0,85 как константы | 3f0fed9 |
| D13 | calc.py экспортирует явный путь нитей (`thread_path_north`: start/stitch/park/resume/finish, E/X, u) как вход stage 2 | prior #112: рецепт → путь одной нити → механика → рендер | строить stage 2 из рендера | 3f0fed9 |
| D14 | Stage 2 — инкрементальное шитьё, одна нить = один баланс материала, рендер не вход механики | prior #112 | оконная механика | 3f0fed9 (next-stage.md) |
| D15 | Правки схем 03/04 (подписи без наложений) и журнал решений | качество | — | 0d22fd4 |
| D16 | **Ширина захвата удалена как вход** (UI, рецепт, spec, calc). E/X выводятся из того, что уже на шаре: низ — вплотную к нити разметки, зазор (m + w)/2 из ширин [b]; верх ряда n — снаружи крайних прежних нитей, на нить ниже; «шире на нить» — валидатор V13, не правило; длина скрытого участка вычисляется. Добавлен параметр m = 1,0 мм [A, TK-GAUGE] | указание владелицы: хранить ширину = ошибка «ручного канала иглы» prior #112; источники дают захват как описание, не как число | ±1 мм (stage 1, отменено); свободный параметр «ширина захвата» | 6fe4cf5, 3777783 |
| D17 | E/X — на большом круге ⟂ линии (perp_pt), а не на параллели | у полюса параллель кривая: несимметричный замыкающий стежок отклонялся бы от ⟂ на ~4° (OLY-BASIC «垂直に») | смещение по φ | 3777783 |
| D18 | Замыкание: X₈ = −(c0 + w) (вплотную слева от стартовой нити), последнее плечо под стартовым участком (TK-LITTLE), стежок завершается (GT14) ⇒ охват старта | в stage 1 X₈ ≡ X₀ — вырождение (две нити в одной точке) | отложенный последний стежок (TK-UWA, вариант) | 6fe4cf5, 3777783 |
| D19 | Полностью параметрический конвейер: params → base → marking → layout → rowPlan → path; рецепт хранит замысел (слои), не числа-результаты; панель параметров и «Пересчитать»; пересчёт — чистая функция | указание владелицы; тест ≥3 наборов (C 240/300, w 0,714/1,0) | числа в рецепте | 3777783, ba73ead |
| D20 | Направление скрытого старта [E]: к биссектрисе предыдущего сектора, два прохода в линию | в источниках нет (A19) | обратный ход тем же путём («backtrack» calc.py) | 3777783 |
| D21 | three.js r169 вендорно (sim/vendor), без сборки; скриншоты — playwright-core + системный Chrome | воспроизводимость, офлайн | CDN, bundler | ba73ead |
| D22 | Круглая трубка диаметра w — только для рендера и V8 (оси видимых трубок на R + w/2); толщина h и слои — этап 2.4 | h не измерено; механика позже | racetrack сейчас | 3777783 |
| D23 | Отображение отделено от модели (display.js + tube.js — чистые функции). Скрытый старт по умолчанию рисуется схемой (дуга на w под поверхностью, подпись «схема»), модель остаётся прямой хордой иглы; флажок «старт хордой». Добавлен V14 «нить не парит» (модель и вершины меша). «Крючки» у полюса на 03 — проекция плеч, переходящих лимб, а не отрыв (за силуэт выходит только толщина трубки) | отзыв родителя по скриншоту 03 | рисовать хорды сквозь шар без пометки; менять модель старта | 5d0489e |
| D24 | **Последовательное шитьё всей работы** (buildWork): обходы в порядке `work.order` = A1 → B1 → A2 (GT14 «Enter … Color B …», «Return to Color A. Stitch a second row …»); каждый стежок получает занятость по ВСЕМ уже уложенным нитям (обе нити, все обходы); B1 — отдельная нить со своим скрытым стартом, A2 продолжает нить A из парковки X₈ (без скрытого прохода, одна нить — один баланс) | GT14 (a); prior #112 (одна нить на цвет); указание родителя | считать ряды независимо; формулы уровней из calc.py | 6d753b1 |
| D25 | **Верх ряда n ≥ 2 — «канал ниже прежнего канала на w»** (`levels.top.next = belowPrevChannel`): s_T(n) = max(s каналов прежних верхних стежков на линии) + w — канал иглы нового стежка вплотную к каналу прежнего (каналы — трубки ширины w, не пересекаются, #105). E/X — по G3 из занятости на этом уровне: вплотную снаружи крайних нитей, лежащих на перпендикуляре (нити разметки и плечи ряда 1, пересекающие его) | GT14/TK-UWA «about 1 thread width … below» (a) + адъюнктность трубок (b) | «+w» как число в рецепте (было G5, [E]) | 6d753b1 |
| D26 | **Низ ряда n ≥ 2 — «уложи → коли в пересечении»** (`packThenPierce`): уложенная нить нового плеча = малый круг на расстоянии w снаружи большого круга плеча прежнего ряда (вплотную, параллельно); s_B = точка, где эта нить (её правый край) приходит вплотную к нити разметки, E — на ней; X — по G3. Уровень = max(packThenPierce, прежний нижний канал + w). Итог: Δ = 4,968 мм (240/0,714), 8,541 мм (300/1,0); формула плана w/sin α давала 6,326 — приближение (V12 info) | OLY-TM7-V «自然に交わる所» (a), TK-STRETCH (a), prior #94 (b) | фиксированные 2 мм (TK-UWA) или «1–2 мм» (GT14) — вариант, не слит (A22) | 6d753b1 |
| D27 | **Правило над/под** (`conventions.crossing = laterOver`): в перекрёстке свободных плеч сверху лежит позже уложенное; исключения — только из рецепта: замыкающее плечо обхода проходит ПОД первым плечом своего обхода (`closingUnder`: TK-LITTLE для ряда 1 — a; перенос на ряд n — b); у верхних точек ряда n ≥ 2 игла под всеми плечами прежних рядов (uwagake, #102, #104, TK-UWA — a), значит новое плечо над ними. Классы сближений: перекрест / клин uwagake (новое плечо вплотную к плечу прежнего ряда того же набора у верха, сверху) / стык. Переплетение A1 < B1 < A2 на всех 8 плечах B1 — следствие (GT14 «interweave … kousa style» — совпадает) | G8, #102, GT14 «over», TK-UWA | порядок по номеру нити; ручные флаги над/под | 6d753b1, 2e841ce |
| D28 | **Условный подъём стопки только в изображении** *(since D46: liftMode display only)*: верхняя нить приподнята на 0,6·w на порядковый уровень стопки (c.stack) с плавным спадом, помечено в легенде; высоты стопки не выдумываются, в модели все плечи на R; крючок `layerMechanics()` → `A.mechanics.liftAt(segId, i)` для этапа механики | требование родителя (не выдумывать высоты, оставить крючок) | радиальные сдвиги в модели | 2e841ce |
| D29 | **V8 по классам сближений**: разрешены стык, перекрест по правилу, клин, захват охватывает нить у её выхода/уложенную нить, плечо поверх скрытого стежка, каналы вплотную, плечо поверх отверстия старта; предупреждение — канал рядом со скрытым стартом (оба в обмотке, радиальное сжатие не моделируется); fail — неожиданные | требование «нет взаимопроникновения сверх правила» | один порог d < w | 2e841ce |
| D30 | **Изображение 2c** *(revised 2026-09-26: the round palette with yellow and orange stays (D47, owner's decision); distinguishability from the marking thread will be solved by the marking-thread colour — next-stage backlog)*: окраска «по обходу» по умолчанию (12 контрастных цветов в порядке работы, без жёлтого/золотого и оранжевого, легенда); плечо входит в отверстие плавно на 1,5·w (раньше — радиальный скачок на w: трубка с поворотом 90° давала «крючки»); у трубок заглушки (штрихи без заглушек выглядели плоскими «коробочками» — «гребёнка» у захватов и «клин» у скрытого старта B1); канал иглы — бледная трубка на R − w/2 + штриховой «рентген»-контур поверх всего (условное обозначение скрытой линии); подписи линий у экватора | отзыв родителя по 12_A2_upper_point_zoom; просьба владелицы о цветах обходов | менять модель ради картинки | 78a91b4 |
| D31 | **Karo / GT14 / Suess row-order stay separate recipe intents** (simulator `order`: alternate vs blocks vs …). Karo diagram ~2–3 mm and “2 rounds per colour” are observations to check, not auto-constants; do not merge with GT14 A1,B1,A2… or Suess blocks without an explicit decision | owner FYI 2026-09-25; KARO-KIKU-V, TK-GT14, SUESS-KIKU-V; project no-silent-merge rule | treat Karo “2 rounds” as identical to GT14 alternate | pending commit |
| D32 | **Issue #4 tip-drop diagnosis recorded (no model change):** bottom tip drop Δ = s_B(A2)−s_B(A1) = **4.968 mm** at C=240, w=0.714 under packThenPierce+geodesic arms vs GT14/TK-UWA ~1–2 mm. Primary cause = recipe/math of D26 (Δ≈w/sin α), not a layout bug and not missing stack lift (D28). Physical reconciliation likely non-geodesic tip lay (Φ3 / U5 / U13). Next experiment: parametric tip bow vs documenting geodesic+packThenPierce as idealization that over-predicts tip step. Note: `samples/kiku-s8/tip-drop-diagnosis.md` | diagnosis task for issue #4; owner: prioritize physics/geometry/math; do not merge GT14 vs Suess vs Karo (D31) | — | *(this commit)* |
| D33 | ~~**Shoulder form experiment (`shoulderForm`):** `geodesic` \| `bowToMarking` (tipEnv + softmin + Laplacian bow toward marking; last-5% pack normal).~~ **SUPERSEDED / CANCELLED by D40.** Clamp-to-meridian + 0.95 sample slice were artifacts, not friction physics (Fable skeptic). | tip-drop-diagnosis §5/§8; later Fable leg-shape-spec | — | superseded |
| D34 | **Draft DMC Perle #5 material preset** (`sim/data/materials/dmc-perle-5.json`): working orientation until measured; fields carry value+basis+status (source\|estimate\|analogue\|unknown). Params already match; `materialPreset` stored for provenance. Numbers remain parametric — architecture must not depend on them being exact. | owner: brief preset documenting estimates/analogues; PHYS-COTTON-MU / TK-GAUGE / prior; do not invent measured #5 facts | treat defaults as measured #5; hard-code lift Δ as a law | *(working tree)* |
| D35 | **Recipe scaffold direction:** Technique / Recipe / Result split. Kiku S8 = one editable recipe preset (`sim/data/recipes/kiku-s8.json` + existing technique JSON), not the whole system. Editable surface: sizes/order via existing params, color ribbon A/B, material preset ref. Step and full run share the same `path.ops` (stageEnd prefixes only). Kiku-only lore stays out of core. | owner architecture agreement; scaffold slice | rewrite core around kiku; different op builders for step vs full | *(working tree)* |
| D36 | **Squeeze / mid-gap needle when neighbour gap < w** (`needleSides`): if the gap from the own-marking cluster edge to the nearest foreign occupancy (neighbour marking past the bisector, or other thread) is < w, the needle axis is placed at mid-gap (not at edge+w/2); recorded compensation comp = (w−gap)/2 per side (V19). Threads are not compressed in the model (U14). At N=16, C=240, w=0.714, m=1: closing A1 X shifts by comp≈0.203 mm vs the old closed-form X=−((m+w)/2+w); S16 tests expect that Δ, not calc.py equality on squeezed stitches. G3 updated to match. | prior #105; path.js `needleSides` side(); owner S16 contract | require calc.py match on squeezed closing (old S16) | *(this commit)* |
| D37 | **ELBOW_OK_DEG (3°) informational only; drop <3°/11-row acceptance; squeeze in calc_reference (V3=pass).** Discrete-turn band depends on sample step; geodesic κ_g already ~0.67–0.88°. Diagnostics: former warn band [3°, 10°) → **info** (fail still ≥10°). bowToMarking currently locally violates Φ3 (κ_g ≫ μ/R) and sticks to the marking axis (bottom ~9–12 mm; top pulls back after meridian cross); same S-bend in last ~5% (armPackNormal) drives tipDrop≈2.5 — elbows and tipDrop only fix together. LEG_SAMPLES=96 not grid-converged (48/96/192/384 → tipDrop 3.42/2.50/2.25/2.19, rows 6/8/9/10). Row-count acceptance dropped: rows from tipDrop / K12 only; do not fit rows (next-stage.md §5). Supersedes D36 S16 contract that expected Δ vs calc.py: neighbour-gap squeeze now lives in `sim/tools/calc_reference.py` (calc.py stage-1 closed form unchanged), so V3=pass again as JS↔Python cross-check. | owner form answer + independent Claude/Codex/Fable verify | keep <3° or 11-row goals; keep S16 tautology-only (xOff=old+comp) contract | *(this commit)* |
| D38 | **Diagnostics-only tools for κ_g / stick-to-axis / LEG_SAMPLES convergence; layLeg unchanged.** `sim/tools/diag_leg_kg.mjs` plots κ_g on worst A8/B8/upper-B3 legs vs Φ3 μ/R and measures lower-A2 stick length; `sim/tools/leg_samples_convergence.mjs` sweeps samples via `setLegSamples` (default 96). `sim/out/` gitignored — regenerate plots with the tools. Form fix deferred to Fable physics spec; no change to bowToMarking / tipDrop / path construction. | owner: diagnostics until Fable spec; D37 symptoms | edit layLeg before spec | *(this commit)* |
| D39 | **κ_g in diag tools is geodesic curvature** (tangent-plane turn / ds), not total curvature. D38 numbers included sphere normal curvature 1/R ≈ 0.02618 mm⁻¹ (C=240) — geodesic legs reported ~0.026180 ≈ 3.1× μ/R instead of ~0. Shared helper `sim/tools/geodesic_curvature.mjs`; both `diag_leg_kg.mjs` and `leg_samples_convergence.mjs` use it. Built-in control: geodesic form + synthetic great circle peak \|κ_g\| ≪ μ/R (FAIL if still ~1/R). Remeasured peaks vs μ/R (expect lower by ~1/R; Φ3 excess on S-bend remains). **layLeg untouched.** | Codex finding on D38; Φ3 needs κ_g; owner fix-before-(в) | keep total-curvature “κ_g”; edit layLeg | *(this commit)* |
| D40 | **Shoulder = small-circle arc (λ ≤ μ), bulge with curvature center on pole side** (convex away from pole / toward equator). `shoulderForm`: `geodesic` \| `bow` (alias `bowToMarking`→`bow`); ~~`bowFrac`=λ/μWrap ∈[0,1] default **0.5** (λ=μ no longer default; Fable v2);~~ *(superseded by Fable revision 2 below: λ is set by `bowLambda` (or `bowSagMm` via (5)), fallback λ = 0.32 when shoulderForm = bow and nothing is set; `bowFrac` is a deprecated alias with an empty default, used only when given — see D48)*; split `muWrap` (Φ3 thread–wrap) from `muThread` (P1). `layLeg` samples small circle about P; `armPackNormal` = P×E at E (no tipEnv / softmin / Laplacian / 0.95 slice). Tip-drop and row count are consequences of λ; craft-band 1.5–2.5 is diagnostic report only (no suite assert). V20 friction cone (warn >0.9μ, fail >1.1μ); V21 transversality (one meeting, angle ≥ α_geo, stick <0.7 mm). Row n≥2 = rail along previous arm (not concentric small circles). See `samples/kiku-s8/leg-shape-spec.md`. | Fable leg-shape-spec 2026-09-25; bow_theory.py; Φ3; cancel D33 | bow-to-marking clamp; free Δ_tip; invent craft μ | *(this commit series)* |

## Owner questions (open)

### Q-SUESS-2014 — catalog id vs code id (2026-09-25)

**Code / recipe** (`sim/src/params.js`, `sim/data/recipe.kiku-s8.json`) cite **`SUESS-2014`** as basis for:
- practice ball **5 rows** per set (`rowsCount` default),
- **blocks** order (k rows A then k rows B),
- YouTube `ceyC3uYHPxQ` (TemariChallenge «kiku herringbone» stitch along).

**Catalog** already has **`SUESS-KIKU-V`** for the same URL (`sources/excerpts/SUESS-KIKU-V.md`, `sources/sources.json`), and **`SUESS-GLOSS`** for the glossary PDF. There is **no** `SUESS-2014` entry in `sources/build_sources.py`.

**Question for owner (do not invent bibliography):**
1. Is `SUESS-2014` meant to be the same object as `SUESS-KIKU-V` (alias / rename code refs)?
2. Or a distinct catalog id (e.g. dated 2014 challenge page) that still needs verified metadata before adding via `sources/build_sources.py`?
3. Which verified fields (title, exact date, “5 rows” timestamp) should the catalog record if we add it?

Until answered: docs note the gap; **no fabricated** `SUESS-2014` row in `build_sources.py` / `sources.md`.

### Q-V21 — literal “min lat > w/2” vs meridian crossing (2026-09-25) — **CLOSED (Fable v2)**

Fable leg-shape-spec v1 §4 / acceptance §5 said V21: min lateral distance of interior shoulder points to the destination meridian > w/2.

**Observation:** every X→E leg (geodesic or small-circle bow) **must meet** the destination meridian before E, so literal min lat > w/2 is impossible.

**Resolved by Fable revision 2 (transversality):** V21 is now
1. exactly **one** intersection of the leg with the destination meridian plane;
2. crossing angle at that meeting ≥ α_geo (geodesic arrival angle);
3. stick-to-axis run length (lat < 0.05 mm) **< max(0.7 mm, 0.025·R, w)** (Fable 0.7 mm reference; scales with ball and thread so geodesic approaches still pass).

Negative: old `bowToMarking` clamp-style glued tip must **fail** V21. See D40 (v2 notes) and `samples/kiku-s8/leg-shape-spec.md`.



## Fable revision 2 (2026-09-25) — full v2 file applied

Canonical: `tmp/fable-2026-09-25/leg-shape-spec-v2.md` + `bow_theory.py`.

1. **Intent = λ directly** (`bowLambda`) or δ_mm via formula (5); μWrap is V20 reference only (not λ source). Legacy `bowFrac·μ` kept as alias.
2. **Packing formula (8)** for bowed arms: first root of ∠(P,E(s))=ρ+w/R. Fixes Δ tip gap: at λ=0.32, Δ 2.296→**2.236** (was +2.7% via P×E plane; now within 0.5% of table).
3. **V20**: warn λ_max>μ; fail λ_max≥1.2μ or |λ_row1−λ_cmd|>1e-4.
4. **V21**: one meridian crossing, angle ≥α_geo, stick ≤ max(0.7,w,0.025·R) mm (Fable 0.7 mm reference at default w; scales with thread so geodesic at w=1 still passes; old bowToMarking sticks tens of mm still fail).
5. Rows n≥2 = **rail** = concentric small circle about same P (parallel of previous laid arm). Misread “not concentric” in 659c0c6 caused the equator row-count bug; corrected in D41.
6. Direction negative: equator-side at λ≤0.2 → α′<α_geo.

Push gate: suite green + Δ within tolerance (met).

## D41 — n≥2 legs are rail/concentric; geodesic n≥2 was the post-659c0c6 bug (2026-09-25)

**Bug:** After 659c0c6, row-2 tip Δ matched Fable table, but full lay to equator collapsed: at λ=0.32/0.6 only **6** rows (expect 11–12 / 16–17). After row 2, Δ≈4 mm like geodesic — bend lost for n≥3.

**Root cause:** `railLeg` cleared `bowCenter`, so `packThenPierce` fell back to the geodesic packing plane for n≥3. Spec §4.3 / formula (8): n≥2 is a **rail** = parallel of the previous laid leg = **concentric small circle** ρ+(n−1)·w/R about the **same P**.

**Fix:** `railLeg` keeps P, sets ρ=∠(P,E_n), builds on-circle arc (short X-splice); packing uses formula (8) for every bowed/rail row. Search root **only below** s_prev (equator-side mutation no longer grabs a root above the previous stitch).

**Also (Codex §5.4–5.8):** V20 λ_max from discrete κ_g (7); V21 stick=0.7 mm and angle gates bottom tips; V2 checks arc length (6).

### Q-V13 — does bow heal V13? (analysis only, 2026-09-25)

Fable §5.9 / English §1.6: “V13 under bow does not improve — expected; record status, do not cure.”

| layout | V13 |
| --- | --- |
| geodesic / bow λ=0 (full to equator) | **warn** (row-2 top widen ≈0.21 w < 0.5 w floor) |
| bow λ=0.32 (3 rows or to equator) | **pass** (widen ≈0.59 w) |
| bow λ=0.6 (to equator) | **warn** again |

So bow **can** move V13 from warn→pass at mid λ, but not monotonically and not by design of the top-channel rule (still s_prev+w). The rise in lateral capture comes from steeper arms crossing the top needle line farther out — a geometric side effect, not a V13 “cure.” **Do not retune the model to force V13 warn under bow**; ask Fable whether §5.9 should say “may pass as a side effect at some λ” instead of “does not improve.”

## D42 — Codex fail-list form fixes (Fable v2 Errata §6a, 2026-09-25)

Order 1→2→3→5→4→6. Concentric rails kept (Δ₂ table 2.236/1.544). Chat with owner in Russian; repo English.

### 1. Rail splice (path.js `railLeg`)
Was: on-circle arc Q0→E with `pts[0]` pinned to X → long chord + κ_g·R ~ 50 corner.
Now: meridian geodesic samples X→Q0 (κ_g=0, same ψ about P), then concentric rail Q0→E. No off-circle pin.
Measured (λ=0.32, untilEquator, n=96): max splice 0.929 mm; 84/160 >0.3 mm; 17/160 > w.
Early rows ≤0.3 mm; late growth is geometric (top/bottom E sit on different ∠(P,E) cones while X inherits the other level’s ρ). Spec target ≲0.3 mm holds where geometry allows; residual documented, not papered over.
V20 excludes path-distance ≤ max(w, spliceMm)+0.25 mm from the hole so the meridian/rail join is not scored as friction-pose λ.

### 2. V20
- Exclusion by path-distance from hole, not fixed sample count.
- Commanded-λ check on **all** bowed legs (not only row1[0]).
- `bowSagMm`: sag-invert λ still verified against discrete κ_g (7).

### 3. V21 (Errata §6a)
- Crossing-once + continuous stick ≤0.7 mm: **all** legs.
- Angle ≥ α_geo: **lower legs only**; both angles local at the axis crossing (geodesic through same X,E). Upper-leg angle drop under outward bow is expected (same flatter tip lay that widens row-1 footprint / V13).
- Stick threshold inclusive `≤ 0.7`. Continuous measure (fractional segments); was undercounting (missed first segment of a run).
- Angle emitted in `numbers.angleRows` / `minAngleDeg`.

### 5. Short-arc (6)
`dΨ` uses signed **short** angle (same as `smallCircleArc`). Equator-side mutation length 37.4 mm (was long-arc ~200 mm).

### 4. §5.2 last-segment θ
`smallCircleArc` cosine end-clustering: last-chord error at 96 samples λ=0.32/0.6 → 0.002°/0.005° (was 0.094°/0.178°).

### 6. V6 + V13
**V6:** fails on full untilEquator for **geodesic and bow alike** (A2 passes). Not a rail bug.
Measurements (geodesic): A1–A2 symmetric; A3 dLeg=0.132 mm; A4 0.651; A5 1.379; closing `extra→0` from A3 (fails `extra>0`).
Bow λ=0.32: legs mostly 0 through A5; B6 dLeg=0.064; B8 0.116; many late rounds `extra=0`.
Cause = resume-from-parking transition step + late-row squeeze (V6 message already describes this; TK-UWA deferred last stitch not modelled). Document only.

**V13 (Errata 6a.1):** tip-width growth at A2 is physics from row-1 footprint — expected pass under bow at mid λ. Acceptance (do **not** retune thresholds): growth monotonic in λ and within ±0.1 w of geodesic +0.21 / λ0.2→+0.43 / 0.32→+0.59 / 0.45→+0.75 / 0.6→+0.92 w. On 4b872eb + this fix these match (measured 0.212 / 0.432 / 0.587 / 0.745 / 0.919 w); suite locks them. A V13 pass driven by rows ≥3 is suspicious — test warns.

**V13 metric vs Errata “pass from λ≥0.2” (boundary, no retune):**
- Metric compared: **same** — V13 row-1 footprint / A2 tip width `(W − Wp)/w` (row-n+1 top wider as consequence). Matches Errata 6a.1’s tip-width growth.
- Cut differs: V13’s own pass band still requires widen ≳ 0.5 w (geodesic +0.21 w → **warn**; λ=0.2 → +0.43 w → still **warn**; λ=0.32 → +0.59 w → **pass**). Errata 6a.1 speaks of pass from λ≥0.2 for the growth rates themselves.
- **Do not retune** V13 thresholds to force λ=0.2 pass. **Closed by Errata 6a.6:** warn at λ=0.2 stays honest; acceptance = growth magnitude (+0.43 w) and monotonicity in λ, **not** V13 status. Pass expected around λ≳0.25. The 0.5 w floor is marked **[A]**, calibrated only by sample (**U3**).

**V21 stick threshold (Errata 6a + English key):** continuous stick on all legs. Clean geodesic crossing has stick ≈ `2·0.05/sin(α_geo)` (~0.68 mm at C=240, ~0.85 mm at C=300). Bare absolute 0.7 fails geodesic at C=300. Restored documented scale `max(0.7, w, 0.025·R)` from Fable v2 English key / prior acceptance note — not a new invented cut. Errata’s “0.7 mm” remains the reference at default C/w.

### Row construction (Errata 6a.2)
**Kept concentric** (formula (8), Δ₂ ≈ 2.236 / 1.544). Tangential alternative (2.296 / 1.576) not adopted — same choice in code, reference, tests, docs.



## D43 — Errata 6a.4–6a.6 (2026-09-25)

Order: tangent splice → V20 ≤w → V21 per-leg stick → V13 log.

### 6a.4 Rail splice (path.js `railLeg`) — exterior only until Fable answers interior
Previous meridian→Q0 model was wrong for **exterior** X_n (forced ~90° kink at the rail). Physics when X is outside: geodesic from X **tangent** to the rail at T, then rail. Kink at hole allowed; kink at T never.
- **Exterior (γ≥ρ):** classical spherical tangent; turn at T ≈ 0° (≤1°). L_j = R·acos(cosγ/cosρ) ≈ √(2·|d|·R·tanρ). Measured λ=0.32: d≈0.088 → L_j≈4.72 mm; turn≈0.003°.
- **Interior (γ<ρ):** no great-circle tangent exists (always cuts twice). **Do not invent a join** (Codex/Fable steering). Claude asked Fable for the physical path. Until then: keep prior radial meridian foot X→Q0 as a **holding** path only, flag `interiorXn` on the leg, and aggregate `path.railDiagnostics` (count, by row, ids). Measured λ=0.32 untilEquator: **94/160** interior; λ=0.6: **127/240**. Late-row upper-tip gap wedge = **U14**.
- No splice-length threshold («0.3 mm» was lateral d, not L_j).
- Diagnostics: `spliceMm`, signed `lateralMm`, `turnAtTDeg`, `interiorXn`; `path.railDiagnostics`. Row-1 has no rail splice (`spliceMm < 1e-9`).

### V20
Exclude path-distance **≤ w** from the hole only (no `max(w,splice)+0.25` window that hid the old 90° kink outside w).

### 6a.5 V21 stick
Removed `max(0.7,w,0.025·R)`. Per-leg: `L_stick ≤ 1.2 · 2ε / sin(α_geo(own))`, ε=0.05 mm. Measured thr ≈0.815 mm at C=240, ≈1.028 mm at C=300. Stick length = path measure of segment∩{|lat|<ε} (signed lat) — both endpoints outside can still cross the band. Mutations: stick≈1.39 (Codex 0.917 case) and upper-leg ≈1.2–1.6 fail.

### 6a.6 V13
Threshold untouched. Acceptance = growth (+0.43 w at λ=0.2) + monotonicity; status may remain warn. Floor 0.5 w is **[A]** / **U3**. Prior “ask Fable about lowering floor” closed.

## D44 — Errata 6a.9 (2026-09-25): V20 free-class, V21 ref α_exp, δ bands

### 6a.9.1 V20 scope
V20 applies **only to free-class segments**:
- Row 1: whole arc except ≤w windows at holes
- Rows n≥2: **exterior tangent splice only** (path-distance ∈ (exclHole, spliceMm])
- **Rail body and climb excluded** — prior-thread contact holds them
- Kinks at hole and climb merge: **angles ≤20°** each (from ℓ_m≥3δ → atan(1/3)≈18.4°), **not** discrete κ_g

### 6a.9.2 V21 α_exp
α_exp = axis-crossing angle of the **reference curve at the crossing itself**:
- Row 1: analytic arc at own λ
- Rows n≥2: parallel of accepted row n−1 (path after splice)
- Threshold still L_stick ≤ 1.2·2ε/sin(α_exp); **1.2 = discretization margin only**
- Angle ≥ α_geo remains lower legs only (6a.3)

### 6a.9.3 δ after parallel-rail switch
Rail = parallel of actual row n−1 polyline +w out (concentric = small-circle special case).
- δ ≤ 0.15 mm → model consistent (climb)
- 0.15 < δ ≤ w/2 → diagnostics; closing stitches as a separate line
- δ > w/2 → **G3 occupancy bug** (G3 sees a different curve than the rail), not a model property
- If large δ is physically honest → flag «flat-model limit» (U14), no geometric tricks

### Measured (this commit, bow λ=0.32)
- Row 2: δ max ≈ 0.173 mm (6 ok ≤0.15, 2 diag ≤w/2, 0 fail); holeTurn max ≈12°, climbTurn max ≈1.7°
- Later rows still show δ > w/2 on some legs after parallel switch — **reported, not fitted** (G3 vs rail curve mismatch / flat-model limit). Coordinator may ask Fable.


## D45 — Packing regression fix (2026-09-25): restore §5.1 Δ₂/rows + exterior tangency

### What broke on 44c5a84
`packThenPierce` added a `polyParallel` branch: meridian ∩ {points at geodesic distance *w* from prev polyline}. That is a **tube of radius w**, not the parallel curve. First hit ≈ tip + *w* → Δ ≈ *w* every row after the special case fails (channelBinding lookalike). Climb/tangent geodesic prefixes also made `isSmallCircleArm` reject concentric rails for n≥3, so bow packing fell into the same tube. Exterior tangency search **minimized** |direction · railTangent| → nearly perpendicular meeting (splice ≈0.09 mm vs ~4.7 mm analytic; turn ≈11.8°).

### Fix
1. Packing: `bowCenter+ρ` → Fable (8) concentric; else GC-plane parallel. **Removed** the w-tube branch.
2. `isSmallCircleArm`: skip climb/splice prefix before circle test (rail construction stays concentric).
3. Exterior T: **maximize** |cos| (align), not minimize.
4. Full-path suite: λ=0 → Δ₂≈4.968 + 5 rows + last tip (K12) in 58–60 mm; λ=0.32 → 11±1; λ=0.6 → 16±1.

### Remeasured (C=240, w=0.714)
- λ=0 geo/bow: Δ₂=4.96776, **5 rows**, last tip ≈58.93 mm; stop = next tip >60 (equator), not packing miss.
- λ=0.32: **11 rows**, Δ₂=2.23575 kept; exterior splice ≈4.31 mm, turn ≈0.07–0.25°.
- λ=0.6: **16 rows**, Δ₂=1.54369 kept; some late-row δ > w/2 (r14–15) — report only, no invent.

Do **not** ask Fable about δ until packing was restored (now restored); remaining δ>w/2 near equator still per 6a.9.3 bands.



## D46 — Lift at crossings = mechanics by lift-spec v1.1 (#5, 2026-09-26)

**Decision.** The lift of the thread at crossings is a mechanics layer over the finished path (`layerMechanics` → sim/src/mechanics.js, model/lift-spec.md v1.1): single rise Δ₁ = 1.5·t_c(F) − h/2 − δ(F) (T8), chord tents a ≈ √(2RΔ₁) (T7), one bridge over crossings closer than 2a (§1.8), m by the contact patch, and the upper thread resting on the **loaded** lower thread — sag 2σ·ab/(a + b) between rigid points and a flight kink 2σ, computed in lay order (Fable Q5). liftMode `ideal` is the default; `measured` takes `lift1_w` from a photo; `display` keeps the former bump 0.6·w (D28) as the regression reference, display only. Placement is unchanged (the model stays on R). B default 0.0155 N·mm² (measured analogue). Validators V25 (tent physical), V26 (lengths with lift), V27 (axis distance t_c against the loaded lower axis), K18 (rise over the support ≤ 1.5·t_c − h/2), K19 (absolute height, warn > 1.2 mm).

**Basis.** Fable lift-spec v1 (2026-09-26), fable-reply-lift-q §C–§D (m by the contact patch, plateau cap, tolerances, B), fable-reply-q5 (support on bridges and flights). The owner's L7 S8 op325 kink photo: the display staircase at the tips.

**Measured (ideal).** S8 braid m 0.5 λ 0.32: Δ_c median 0.268, p95 0.403, max 0.469 mm, lifted − axis +0.60 %, all validators pass. fan λ 0.32: max 0.606 mm, +0.62 %. Stress braid m 1 λ 0.6: max 1.62 mm (plateau stacks up to m 13), K19 warn; its V20 fail is the known λ/μ ratio (1.875), independent of the lift.

**Rejected.** Rigid support on the lower thread's hull (`patch`): a staircase up to 2.7 mm at S8 (+2.1 % length) — kept only as a negative test. The chronological `c.stack` with the display window w/sin ψ (c.stack 23, Δ ≈ 5 mm) — display only. Tuning the 0.6·w display bump (wrong ×1.6 in height and ×1/6 in length).

**Commits.** c8abe77 (#5 steps 2–4), 13ffc13 (support rule, ideal default, V25–V27/K18/K19), 9e9e7ef (samples/lift), this commit (docs).


## D47 — Round palette: 18 named colours, golden-angle hues beyond (2026-09-26)

**Decision.** Colour "by round" uses 18 named colours in work order A1, B1, A2, B2, …: blue, crimson, green, orange, violet, teal, brown, pink, lime, graphite, light blue, red, mustard, dark teal, purple, blue-grey, olive, yellow (render.js `ROUND_COLORS`, `ROUND_COLOR_KEYS`). Beyond 18 rounds the hue is h = frac(0.618·i) (HSL 70 %, 45 %) — no cycling, so rounds never share a colour. The colour name (RU/EN, i18n `colour.*`) appears in the operation header («обход A7 (горчичный)» / "round A7 (mustard)"), the caption and the round legend. The length unit is the i18n key `unit.mm` (no hardcoded 'мм'/'mm' in main.js).

**Basis.** Coordinator's palette spec (2026-09-26): S8 has 18 rounds (A1…B9) and the former 12-colour cycle repeated colours for rounds 13–18. Orange and yellow return (D30 had excluded them next to the gold marking and the orange current-operation highlight); the name in the operation header disambiguates.

**Rejected.** Cycling the 12 colours (repeats on S8); unnamed colours.


## D48 — Bow calibration λ 0.32 already met; bowFrac stays an empty alias (2026-09-26)

**Finding.** stage3-arch v1.2 §7 and fable-reply-around-all §5 ask to raise the default `bowFrac` from 0.5 (λ 0.16) to 1.0 so that λ = μ = 0.32 — conditionally ("if the default bowFrac is still 0.5"). The condition does not hold: since Fable revision 2 (above D41) λ is set by `bowLambda` / `bowSagMm`, `bowFrac` is a deprecated alias with an empty default, and `resolveBowLambda` falls back to λ = 0.32 when shoulderForm = bow and nothing is set; the site view sets bowLambda 0.32 explicitly (#47). On the default recipe the path stamp with nothing set equals the stamps with bowLambda 0.32 and with bowFrac 1.0 (26d960de at 2029d27); bowFrac 0.5 gives λ 0.16 (e07a9170).

**Decision.** No code change. The calibration of §7 / around-all §5 (λ 0.32 ≈ Composer's Δ_n 3.4 w vs model 3.3 w; k_top 0.48 and λ 0.32 not touched) is met. `bowFrac` keeps its empty default: a default of 1.0 would not move any build at μWrap 0.32, but would make λ follow μWrap when bowLambda is empty, reversing revision 2 ("μWrap is the V20 reference only, not a λ source"). The D40 row is annotated as superseded. Test group '8b' pins the fallback (λ 0.32, source default, μWrap does not change it; stamp equality with bowLambda 0.32 and bowFrac 1.0).

**Rejected.** Default bowFrac 1.0 (no geometric effect at the default μ; semantic regression for μWrap ≠ 0.32).
