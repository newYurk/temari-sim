# Temari — stage 1: исследование и декомпозиция одного образца

**Образец:** кику S8 — 八重菊 (yaegiku, 8 лепестков = 2 набора × 4) в технике 上掛け千鳥かがり (uwagake chidori kagari),
параметры TemariKai GT14 (мари 23–25 см, Perle #5, 2 цвета). Японское подтверждение правил стежка — Olympus TM-7 古典菊
(видео с субтитрами; та же техника на 16 делениях). Эталон совпадает с эталоном существующего проекта
[newYurk/temari](https://github.com/newYurk/temari) — см. `prior-project/state.md` (issues и доки прочитаны, код — нет).

Практической проверки (вышивки образца) не было: все утверждения помечены как (a) источник / (b) вывод; (c) — нет.

## Структура

| Путь | Что |
|---|---|
| `sources/sources.md`, `sources/sources.json` | 52 записи (40 открыты мной, 3 — аннотации, 1 каталог, 1 сниппет, 7 не открыты), статусы и что подтверждают |
| `sources/excerpts/` | короткие дословные выдержки; `sources/img/` — фото для внутреннего изучения (Olympus, TemariKai) |
| `sources/build_sources.py`, `sources/make_excerpts.py` | генерация списков |
| `glossary.md` | RU / JA (кандзи, кана, ромадзи) / EN |
| `craft/overview.md` | обзор ремесла, выбор образца, варианты |
| `prior-project/state.md` | карта попыток newYurk/temari: установлено / опровергнуто / открыто; GT14 vs Olympus |
| `samples/kiku-s8/recipe.md` | рецепт по шагам |
| `samples/kiku-s8/thread-path.md` | путь нити (17 шагов, метки a/b, сверка с prior) |
| `samples/kiku-s8/ambiguities.md` | 16 неоднозначностей и выбор |
| `samples/kiku-s8/geometry.md` | геометрия + физические пределы (геодезичность, давление) |
| `samples/kiku-s8/calc.py` → `calc_output.md/json` | расчёт (`python3 calc.py --json`), включая явный путь нитей `thread_path_north` |
| `samples/kiku-s8/criteria.md` | 15 проверяемых критериев |
| `samples/kiku-s8/diagrams/` | 4 схемы SVG+PNG (`make_diagrams.py`, `render.sh`) |
| `model/spec.md` | спецификация: геометрический слой, **физический слой** (Ф0–Ф5), **текстильная механика** (Т1–Т6), баланс материала |
| `uncertainties.md` | неопределённости и измерения, которые их снимают |
| `decisions-log.md` | решения с датами и коммитами |
| `next-stage.md` | план stage 2 (рецепт → путь одной нити → механика → рендер) |
| `sim/` | **stage 2a/2b**: браузерный симулятор пути одной нити (three.js), валидаторы, тесты, скриншоты — см. `sim/README.md` |

## Ключевые числа (C = 240 мм)

R = 38,2 мм; верх 5 мм от NP, низ 40 мм (1/3 от экватора); угол кончика 13°; по правилу «уложи → коли в пересечении»
4 ряда на набор до экватора (при фиксированном шаге 2 мм — 11, но с нахлёстом по модели); ряд 1 = 313,1 мм нити
(захваты выведены из ширин нитей, D16; stage 1 — 316 мм); ≈ 3,7 м на цвет (нижняя оценка). Физика: q = T/R; e^{μθ} = 2,7…26 в захвате; допустимый боковой прогиб плеча 1,5–2,4 мм
при μ хлопка 0,32–0,52 (не Perle #5). Численное натяжение не определено — нужны измерения (uncertainties.md).

## Воспроизведение

```
cd samples/kiku-s8 && python3 calc.py --json && python3 make_diagrams.py && ./render.sh
cd sources && python3 build_sources.py && python3 make_excerpts.py
```
Нужны python3 + numpy; для PNG — google-chrome (headless).
