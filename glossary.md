# Глоссарий

> Сгенерировано из `glossary.json` скриптом `sim/tools/glossary_build.mjs`. Ручные правки не сохраняются.

Формат таблиц: **RU** — JA (кандзи / кана / ромадзи) — EN — определение — код — источники — статус.
Транслитерация: RU canon = literature (sources.json book/translation) when present; else Polivanov in ru.canon (field basis: literature | polivanov | loanword | translation | owner). JA canon from sources; basis inferred when kanji are reconstructed from romaji only. Club/slang/translit variants stay in variants[]. EN canon = one label without parentheses (detail in def)..

## Карта понятий (Mermaid)

```mermaid
graph TD
  subgraph base ["основа"]
    mari["мари"]
    jimaki["обмотка основы"]
    temari["темари"]
    circumference["окружность мари"]
    mariShin["сердцевина"]
  end
  subgraph marking ["разметка"]
    marking["разметка"]
    tanjunTobun["простое деление"]
    kumiawaseTobun["комбинированное деление"]
    NP["северный полюс"]
    equator["экватор"]
    machibari["булавки-метки"]
    kamiTape["бумажная лента"]
    S_N["простое деление на N (S_N)"]
    C8["C8"]
    C10["C10 (комбинированное деление 10)"]
    C6["C6 (разметка «6 Combination»)"]
    halfLine["полулиния"]
    region["область"]
    address["адрес разметки"]
    valence["валентность"]
    markingGraph["граф разметки"]
    SP["южный полюс"]
  end
  subgraph rows-from-centre ["ряды от центра"]
    kagari["кагари"]
    chidori["тидори"]
    uwagake["увагакэ тидори"]
    shitagake["ситагакэ"]
    sakasa["сакаса увагакэ"]
    sujidate["судзидатэ"]
    masu["масу"]
    polygon["ряды вокруг грани"]
  end
  subgraph belts ["пояса"]
    obi["оби"]
    makiKagari["макикагари"]
    wrap["намотка"]
    belt["пояс"]
    obiKagari["оби-кагари"]
  end
  subgraph lattices ["сетки"]
    kousa["коуса"]
    asanoha["асаноха"]
    kagome["кагомэ"]
    amime["амимэ"]
    weave["переплетение"]
    lattice["решётка"]
  end
  subgraph motifs ["мотивы"]
    kiku["кику"]
    yaegiku["яэгику"]
    kotengiku["котэн-гику"]
    hanabira["лепесток"]
    matsuba["мацуба"]
    tsumu["цуму"]
    kashin["касин"]
  end
  subgraph threads ["нити"]
    perle5["перле №5"]
    skein["моток"]
    metallic["ламе"]
  end
  subgraph tools ["инструменты"]
    temariNeedle["игла для темари"]
    tekobari["тэкобари"]
    itoDome["ито-домэ"]
  end
  subgraph stitch-detail ["детали стежка"]
    groom["пригладить"]
    row["ряд"]
    round["обход"]
    wedge["клин"]
    rib["ребро"]
    stretchPoints["растяжка нижней точки"]
    tamadome["без узла"]
    tip["кончик"]
    topPoint["верхняя точка"]
  end
  subgraph model ["модель симулятора"]
    fan["веер"]
    leg["плечо"]
    rail["рельс"]
    tail["хвост"]
    set["набор"]
    pickup["захват"]
    park["парковка"]
    anchor["закрепление"]
    holdSet["удержание"]
    start-run["скрытый старт"]
    lay["уложить плечо"]
    stitch["стежок"]
    resume["продолжить"]
    free["свободный участок"]
    climb["слив"]
    crossover["перехлёст"]
    contradiction["противоречие"]
    crossing["перекрёст"]
    tipCross["крест у кончика"]
    squeeze["тесное место"]
    rail-parallel["параллель рельса"]
    contact["контакт"]
    geodesic["геодезическая"]
    bow["дуга малого круга"]
    alternate["чередование"]
    blocks["блоками"]
    sequence["явная последовательность"]
    hole-entry["вход"]
    hole-exit["выход"]
    splice["стык"]
    corner["угловая дуга"]
    free-graze["касание без рельса"]
    root["корень упаковки"]
    tangent["касательный вход"]
    drain["слив к отверстию"]
    separate["раздвинута"]
    eLine["E-линия"]
    channel["канал иглы"]
    cluster["кластер иглы"]
    occupancy["занятость"]
    stitchSpan["пролёт стежка"]
    closingStitch["замыкающий стежок"]
    collision["столкновение наборов"]
    edge["вплотную"]
    around["обхват"]
    toleranceClass["класс допуска"]
    bite["укус"]
    program["программа"]
    hidden["скрытый проход"]
    petalSpan["лепесток через доли"]
  end
  subgraph lift ["подъём нити"]
    lift["подъём (нити)"]
    tent["шатёр"]
    bridge["мост"]
    apex["вершина (перекрёста)"]
    plateau["площадка"]
    stack["стопка"]
    dent["вмятина"]
    support["опора"]
    sag["прогиб"]
    kink["излом полёта"]
    flight["полёт"]
    landing["посадка"]
    hull["оболочка"]
    cap["потолок"]
    patch["пятно контакта"]
    staircase["лесенка"]
  end
```

## (a) Основа и разметка

### основа (base)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| окружность мари | 円周 / えんしゅう / enshū | circumference | Окружность мари (размер в см) | — | TK-SIZE, SUESS-GLOSS | source |
| обмотка основы | 地巻き / jimaki / вар.: 巻き | jimaki | Поверхностный слой тонкой нити на шарике-основе; в нём прячут концы | wrapThread | OLY-BASIC, TK-ANCHOR | source |
| мари (также: основа); UI: основа | 土台まり / どだいまり / dodai mari / вар.: まり | mari ball | Шар из наполнителя, обмотанный тонкой нитью; в него делают все захваты | — | OLY-BASIC, SAN-KIT001, TK-SIZE | source |
| сердцевина | 手まり芯 / てまりしん / temari-shin | core | Сердцевина шара (наполнитель) | — | OLY-BASIC | source |
| темари (также: тэмари) | 手まり / temari | temari | Японский шар из нитей (ремесло темари) | — | TK-GLOSS | source |

### разметка (marking)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| адрес разметки | — | address | Адрес разметки resolve(address) | resolve | [вывод] | derived |
| C10 (комбинированное деление 10) | — | C10 marking | Комбинированное деление C10 (икосаэдр) | generator:C10 | TK-SIMPLE | source |
| C6 (разметка «6 Combination») | — | C6 marking | Разметка «6 Combination» (S6) | generator:C6 | TK-SIMPLE | source |
| C8 | — | C8 marking | Комбинированная разметка C8 | generator:C8 | TK-SIMPLE | source |
| экватор | 赤道 / sekidō | equator | Большой круг посередине между полюсами | bottomFromEq | SUESS-GLOSS, OLY-TM7-L | source |
| полулиния | — | half-line | Полулиния L(P, azimuth=k) (stage3 §1.2) | half-line | [вывод] | derived |
| бумажная лента | 紙テープ / kami tēpu | paper strip | Мерная полоска для окружности и точек | — | TK-SIMPLE, SAN-KIT001 | source |
| комбинированное деление | 組み合わせ等分 / kumiawase tōbun | combination division (C-N) | Сложная разметка C8/C10 и др. | generator:C8, generator:C10, generator:C6 | TK-SIMPLE | source |
| булавки-метки (также: разметочные булавки) | 待ち針 / まちばり / machibari / вар.: まち針, ピン | marking pins | Цветные булавки в опорных точках разметки | — | OLY-TM7-L, TK-GT14 | source |
| разметка | 地割り / jiwari | marking lines | Нити по меридианам (и экватору), делящие шар; кагари цепляется за них | generator | OLY-BASIC, SUESS-GLOSS | source |
| граф разметки | — | marking graph | Точка, линия, окружность, ребро, грань; виды точек pole/division/intersection/constructed/onCircle | — | [вывод] | derived |
| северный полюс; UI: СП | 北極 / hokkyoku | north pole | Точка, из которой расходятся линии разметки (северный полюс) | — | SUESS-GLOSS, OLY-TM7-V | source |
| область | — | region | Область region(P, until=…) (stage3 §1.2) | region | [вывод] | derived |
| простое деление на N (S_N); UI: S_N | — | Simple N (S_N) | Генератор простой разметки S_N | generator:S_N | TK-SIMPLE | source |
| южный полюс | 南極 / なんきょく / nankyoku | SP | Южный полюс разметки | — | SUESS-GLOSS, OLY-TM7-V | source |
| простое деление | 単純等分 / tanjun tōbun / вар.: N等分 / ром.: toubun | simple equal division (S-N) | N меридианов через 360°/N (Simple 8 и т.п.) | — | TK-SIMPLE, FJX-TOBUN | source |
| валентность | — | valence | Валентность вершины графа разметки | valence | [вывод] | derived |

## (b) Стежки и техники

### ряды от центра (rows from centre)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| тидори (также: чидори, чидори-кагари, зигзаг) | 千鳥かがり / ちどりかがり / chidori kagari / ром.: chidori | chidori (herringbone stitch) | Зигзаг между двумя рядами точек; не путать с herringbone | — | TK-CHIDORI, SUESS-GLOSS | source |
| кагари | かがり / kagari | kagari stitching | Стежок: игла под линией разметки и поверхностью обмотки на ~1–2 мм | — | TK-KAGARI, OLY-BASIC | source |
| масу (также: квадраты) | 枡かがり / shikaku masu kagari / вар.: 四角かがり | masu (shikaku (masu) kagari) | Ряды вокруг центра квадрата наружу (не сетка-решётка) | — | TK-MASU | source |
| сакаса увагакэ (также: сакаса увагаке); UI: sakasa | 逆さ上掛け / sakasa uwagake chidori kagari | sakasa uwagake | Кику, растущее к центру (grow = −1, stage3 §2.1 逆さ菊); в программе kiku заявлено, не реализовано | — | SUESS-GLOSS | source |
| ситагакэ (также: шитагаке, ситагаке чидори, шов чидори с поддевом снизу); UI: shitagake | 下掛け千鳥かがり / shitagake chidori kagari / вар.: 下がけ千鳥 | shitagake chidori | Вариант чидори: ряды рядом, без наложения сверху | — | SUESS-GLOSS, TK-SHITAGAKE | source |
| судзидатэ (также: ребристый стежок, суджидате, гребень, косичка); UI: sujidate | 筋立て上掛け千鳥かがり / sujidate uwagake chidori kagari / вар.: 筋立て / ром.: sujidate kagari | sujidate (single raised rib) | Вариант с одним выступающим ребром (single raised rib); план #56 | — | TK-SUJIDATE | source |
| увагакэ тидори (также: увагаке чидори, увагаке, увагаки, увагаке-чидори, косичка, увагакэ); UI: uwagake | 上掛け千鳥かがり / uwagake chidori kagari / вар.: 上掛け, うわがけちどりかがり / ром.: uwa-gake, uwagake chidori | uwagake (kiku herringbone; over-wrapping at top) | Зигзаг, где у полярных точек новая нить идёт поверх прежних рядов и стежок берёт их все под иглу | topRule:uwagake, V17 | TK-UWA, SUESS-GLOSS | source |

### пояса (belts)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| макикагари (также: оби маки) | 巻きかがり / maki kagari | maki kagari | Обматывающая техника пояса; не кику | — | SUESS-GLOSS, MUS-BUNKO | source |
| оби (также: пояс, поясок) | 帯 / obi | obi | Полоса по экватору | — | OLY-TM7-L, SUESS-GLOSS | source |
| оби-кагари | 帯かがり / obi kagari | obi kagari | Зигзаг поверх намотки оби | — | [кандидат] | candidate |

### сетки (lattices)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| амимэ | 網目かがり / amime kagari | amime kagari | Сеточный стежок | — | TK-GLOSS | source |
| асаноха | 麻の葉 / asanoha | asanoha | Узор «конопляный лист» | — | MUS-BUNKO | source |
| кагомэ | 籠目 / kagome | kagome | Плетение «корзинка» | — | TK-GLOSS | source |
| коуса (также: ко:са) | 交差かがり / kōsa kagari / ром.: kousa, kōsa | kousa (kousa style) | Два мотива кладутся поочерёдно рядами, слои чередуются | — | TK-KOUSA, TK-GT14 | source |

### модель симулятора (simulator model)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| (braid) (также: косичка) | — | braid (braid top rule) | Текущий id режима верхнего стежка в коде (= uwagake по смыслу); переименование в uwagake — отдельный коммит | kTop, lBraidMaxW | — | legacy |
| веер | — | fan | Режим верхнего стежка для регрессии S8 / стресс-тестов (G3, V24) | topRule:fan | [вывод] | derived |

### детали стежка (stitch detail)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| пригладить (также: приглаживание) | — | groom | Операция: пригладить нити у полюса иглой (план T2′) | — | TK-UWA | source |
| растяжка нижней точки | — | stretch the points | Нижний стежок дальше предыдущего (~2 мм для #5, не константа) | — | TK-STRETCH, TK-UWA | source |
| без узла | 玉止め / вар.: 玉とめをしない | no knot | Узелок; в темари не завязывают — старт скрытым проходом | — | OLY-BASIC, OLY-TM7-V | source |

## (c) Элементы мотива

### мотивы (motifs)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| лепесток | 花びら / hanabira | petal | V между двумя плечами зигзага с кончиком в нижней точке | — | OLY-TM7-L | source |
| касин | 花芯 / kashin | flower centre | Сердцевина цветка | — | [кандидат] | candidate |
| кику | 菊 / きく / kiku | kiku | Лепестковый мотив из зигзага uwagake вокруг полюса; в коде — генератор программы | kiku | TK-KIKU, SAN-KIT001 | source |
| котэн-гику | 古典菊 / koten-giku | classic kiku | Классическая хризантема на 16 делениях (Olympus TM-7) | — | OLY-TM7-L | source |
| мацуба (также: сосновые иголки) | 松葉かがり / matsuba kagari | matsuba | Мотив «сосновые иголки» | — | TK-MATSUBA | source |
| цуму | つむかがり / tsumu kagari | tsumu | Мотив цуму | — | [кандидат] | candidate |
| яэгику | 八重菊 / yaegiku | yaegiku | Два набора лепестков, чередуются | — | SAN-KIT007, OLY-TM2 | source |

### детали стежка (stitch detail)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| ребро (также: гребень) | — | rib | Ребристый гребень sujidate (не путать с клином uwagake) | — | TK-SUJIDATE | source |
| обход | 周 / shū / вар.: 回 / ром.: kai | round | Обход одного набора линий кругом (Olympus 一周); 回 — alias по Suess | round | OLY-TM7-L, SUESS-GLOSS | source |
| ряд | 段 / dan | row | Ярус / ряд в наборе (段) | rowsCount, row | OLY-TM7-V, SUESS-GLOSS | source |
| кончик | — | tip | Кончик лепестка (v3.4 (14)–(15), K16) | — | [вывод] | derived |
| верхняя точка | — | top point | Верхняя точка стежка у полюса | — | [вывод] | derived |
| клин (также: плетёный клин) | — | wedge (woven wedge) | Утолщение у верхних точек из-за охвата пучка (uwagake); класс пересечения wedge | cross.kind:wedge | TK-UWA | source |

## (d) Нить и инструменты

### нити (threads)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| ламе (также: металлик, люрекс) | ラメ糸 | metallic thread | Металлизированная нить для разметки/финиша | — | OLY-TM7-L, TK-GT14 | source |
| перле №5 | 5番刺繍糸 / pāru kotton / вар.: パール糸, パールコットン | Perle cotton #5 | 2-сложная крученая мерсеризованная хлопковая нить ~200 tex | perle-5, w_mm | TK-THREADS, TK-GAUGE | source |
| моток | かせ / kase | skein | Моток нити (Olympus: «各ひとかせ») | — | OLY-TM7-L | source |

### инструменты (tools)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| ито-домэ (также: закрепка нити) | 糸止め / ito-dome | thread fastening | Закрепка / прятание хвостика (Olympus часто без узла) | — | OLY-BASIC | source |
| тэкобари | 手古針 / tekobari | tekobari | Стилет для укладки нитей | — | TK-GLOSS | source |
| игла для темари | 手まり針 / temari-bari / вар.: ふとん針 | temari needle | Длинная игла для темари | — | SAN-KIT001 | source |

## (e) Модель / физика

### модель симулятора (simulator model)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| чередование | — | alternate row order | Порядок рядов A1,B1,A2… (GT14) | order:alternate | [вывод] | derived |
| закрепление | — | anchor | Скрытый проход 2–5 см под обмоткой | — | TK-ANCHOR, TK-LITTLE | source |
| обхват | — | around | Обхват own-bundle (program around: 'own-bundle') | around: 'own-bundle' | [вывод] | derived |
| укус | — | bite | Примитив Bite программы (stage3 §3.1) | — | [вывод] | derived |
| блоками | — | block row order | Порядок: k рядов A, затем k рядов B | order:blocks | [вывод] | derived |
| дуга малого круга | — | bow shoulder | Форма плеча: дуга малого круга (bowLambda) | shoulderForm:bow | [вывод] | derived |
| канал иглы | — | needle channel | Канал иглы E→X на R − w/2 (v3.4 (12″)) | sChan | [вывод] | derived |
| слив | — | climb merge | Слив: участок от отверстия X_n внутри рельса до точки M на ℓ_m = max(w, 3δ_e), изломы ≤ 20° (v3.4 (11)); класс V8 и entryKind | cross.kind:climb | [вывод] | derived |
| замыкающий стежок | — | closing stitch | Замыкающий стежок (v3.4 (12′)) | lastClosing | [вывод] | derived |
| кластер иглы | — | cluster | Кластер иглы (stage3 Bite.cluster) | cluster | [вывод] | derived |
| столкновение наборов | — | set collision | Столкновение наборов U14 (inSpan) | inSpan | [вывод] | derived |
| контакт | — | contact | Контакт ближе w без разрешённого пересечения | cross.kind:contact | [вывод] | derived |
| противоречие | — | contradiction | Класс дуги при геометрическом противоречии | entryKind:contradiction | [вывод] | derived |
| угловая дуга | — | corner arc | Дуга радиуса w у выпуклых углов параллели (v3.4 §2, §6.6) | seg.cls:corner | [вывод] | derived |
| перекрёст (также: пересечение) | — | crossing | Разрешённое пересечение осей нитей у перекрёста (v3.4 (14), lift-spec) | cross.kind:crossing | [вывод] | derived |
| перехлёст | — | crossover | Зона перехода клина в рельс у верха: участок ноги ряда n с зазором < w до ноги ряда n−1, новая нить сверху (T3, этап A #50); список V8 crossoverList | V8:crossoverList | [вывод] | derived |
| слив к отверстию | — | drain | Слив к отверстию — зеркало climb (v3.4 (13г)) | drain | [вывод] | derived |
| вплотную | — | edge | Своя нить на w/2 (around-all V16) | — | [вывод] | derived |
| E-линия | — | E-line | offset(L, +(m+w)/2) (v3.4 (12)) | E-line | [вывод] | derived |
| свободный участок | — | free arc class | Класс дуги: свободная геодезическая / хвост | seg.cls:free | [вывод] | derived |
| касание без рельса | — | free-graze | Касание без рельса (exitKind free-graze, V8) | free-graze | [вывод] | derived |
| геодезическая | — | geodesic shoulder | Форма плеча: геодезическая (λ=0) | shoulderForm:geodesic | [вывод] | derived |
| скрытый проход | — | hidden run | Lay hidden (stage3 §3.2) | — | [вывод] | derived |
| удержание | — | hold set | Множество своих плеч, удерживаемых стежком (uwagake — все прежние, sujidate — K) | — | [вывод] | derived |
| вход | — | hole entry | Точка входа иглы (E) | hole-entry | [вывод] | derived |
| выход | — | hole exit | Точка выхода иглы (X) | hole-exit | [вывод] | derived |
| уложить плечо | — | lay leg | Операция: уложить сегмент плеча | op.kind:lay | [вывод] | derived |
| плечо (также: нога) | — | leg (shoulder segment) | Сегмент плеча между отверстиями на шаре | type:leg | [вывод] | derived |
| занятость | — | occupancy | Занятость G3 (v3.4 §5.3) | occupancy | [вывод] | derived |
| парковка | — | park | Оставить иглу с нитью, не обрезая | op.kind:park | TK-GT14 | source |
| лепесток через доли | — | petal span | Лепесток через несколько долей (stage3 span; не stitchSpan) | — | [вывод] | derived |
| захват (также: catch) | — | pickup | Захват под иглу (sukū) | type:pickup | TK-UWA | source |
| программа | — | program | Программа мотива (stage3 §3.2) | — | [вывод] | derived |
| рельс | — | rail | Смещённая кривая вдоль выложенного плеча предыдущего ряда | layMode:rail, seg.cls:rail | [вывод] | derived |
| параллель рельса | — | rail parallel | Параллель предыдущему рельсу на расстоянии w | cross.kind:rail-parallel | [вывод] | derived |
| продолжить | — | resume thread | Операция: продолжить нить после паузы | op.kind:resume | [вывод] | derived |
| корень упаковки | — | packing root | Корень упаковки E_n⁰ (exitKind root) | root | [вывод] | derived |
| раздвинута | — | separate | Раздвинута чужим каналом (V16 separate-own) | separate-own | [вывод] | derived |
| явная последовательность | — | explicit sequence | Явная последовательность рядов буквами | order:sequence | [вывод] | derived |
| набор | — | thread set | Набор линий A или B в кику S8 (S8 → 2 набора по 4) | set | TK-KIKU, TK-GT14 | source |
| стык | — | splice | Стык до M или касательная геодезика X_n→T₁ (v3.4 (10),(11б),(13д)) | seg.cls:splice | [вывод] | derived |
| тесное место | — | squeeze | Тесное место: зазор меньше w | cross.kind:squeeze | [вывод] | derived |
| скрытый старт | — | start hidden run | Операция: начальный скрытый проход нити | op.kind:start-run | [вывод] | derived |
| стежок | — | stitch | Операция: стежок захвата | op.kind:stitch | [вывод] | derived |
| пролёт стежка | — | stitch span | Пролёт стежка \|x\| ≤ h_n + w/2 (v3.4 §6.10) | outSpan | [вывод] | derived |
| хвост | — | tail | Свободный касательный хвост: большой круг от конца рельса до корня на E-линии (12) или к отверстию E_n (13); подкласс free | seg.cls:tail | [вывод] | derived |
| касательный вход | — | tangent join | Касательный вход/выход, точка T (v3.4 (10),(13)) | tangent | [вывод] | derived |
| крест у кончика | — | tip cross | Пересечение входящей ноги ряда n+k с выходящей ряда n у нижней точки (C_n, v3.4 (14)); класс V8 | cross.kind:tipCross | [вывод] | derived |
| класс допуска | — | tolerance class | Классы допуска (i)/(ii)/(iii) (v3.4 §2) | — | [вывод] | derived |

### подъём нити (thread lift)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| вершина (перекрёста) | — | apex | Вершина перекрёста (§3.1) | apexOf | [вывод] | derived |
| мост | — | bridge | Мост между вершинами (§1.8) | hullProfile | [вывод] | derived |
| потолок | — | cap | Потолок Δ_cap (§1.6) | capRise | [вывод] | derived |
| вмятина | — | dent | Вмятина δ (§1.7) | dentFn | [вывод] | derived |
| полёт | — | flight | Свободный полёт (q5 §1) | — | [вывод] | derived |
| оболочка | — | hull | Оболочка H (§1.8) | — | [вывод] | derived |
| излом полёта | — | kink | Излом полёта (q5 §2; не V20) | — | [вывод] | derived |
| посадка | — | landing | Посадка λ_T (§1.4) | — | [вывод] | derived |
| подъём (нити) | — | lift | Подъём нити (lift-spec §1.3) | liftFn | [вывод] | derived |
| пятно контакта | — | contact patch | Пятно контакта w_c (lift-q C.1) | — | [вывод] | derived |
| площадка | — | plateau | Площадка на гребне (§1.5) | plateau | [вывод] | derived |
| прогиб | — | sag | Прогиб струны (q5 §2) | — | [вывод] | derived |
| стопка | — | stack | Стопка нитей (§1.6) | stackRise | [вывод] | derived |
| лесенка | — | staircase | Стопка каждой нити на предыдущих у кончиков | — | [вывод] | derived |
| опора | — | support | Опора z_sup (q5 §2) | — | [вывод] | derived |
| шатёр | — | tent | Профиль шатра (§1.4) | tentProfile | [вывод] | derived |

### пояса (belts)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| пояс | — | belt | Генератор belt(C,W) (stage3 §3.2) | — | [вывод] | derived |
| намотка | — | wrap | Lay wrap оби (stage3 §3a.3); техника makiKagari отдельно | wrap-around | [вывод] | derived |

### сетки (lattices)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| решётка | — | lattice | Решётка (stage3 §3a.4–3a.5) | — | [вывод] | derived |
| переплетение | — | weave | Lay weave (stage3 §3a.5) | — | [вывод] | derived |

### ряды от центра (rows from centre)

| RU | JA | EN | Определение | Код | Источник | Статус |
|---|---|---|---|---|---|---|
| ряды вокруг грани | — | polygon | Ряды вокруг грани (masu, hoshi, …) | — | [вывод] | derived |

## (e) Символы модели

| Символ | RU | EN | Пояснение |
|---|---|---|---|
| E | вход | entry | Точка входа иглы |
| X | выход | exit | Точка выхода иглы |
| u | u | arc-length | Длина вдоль нити |
| s | s | polar arc | Дуга от полюса |
| phi | φ | azimuth | Азимут |
| w | w | laid width | Ширина уложенной нити |
| kappa | κ | curvature | Кривизна |
| mu | μ | friction | Коэффициент трения |

