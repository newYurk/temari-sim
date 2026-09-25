# -*- coding: utf-8 -*-
"""Генерирует sources.json и sources.md. Статусы: opened (открыт и прочитан), abstract (только аннотация/заголовок),
snippet (только поисковый сниппет), catalog (только каталожная запись), not-opened (не удалось открыть)."""
import json, os
H = os.path.dirname(os.path.abspath(__file__))
TK = "https://www.temarikai.com/"
def S(id, url, author, date, lang, typ, confirms, material="", marking="", variant="", locator="", conf="high", open_q="", status="opened", excerpt=""):
    return dict(id=id, url=url, author=author, date=date, lang=lang, type=typ, confirms=confirms, material=material,
                marking=marking, technique_variant=variant, locator=locator, confidence=conf, open_questions=open_q,
                status=status, excerpt=excerpt)
L = [
# --- Japanese craft (Olympus) ---
S("OLY-BASIC","https://www.olympus-thread.com/lesson/24/","オリムパス製絲 (Olympus Thread)","n/d (страница live 2026)","ja","производитель: урок",
  "Старт без узла в 2–3 см; игла против хода; захват 地割り вместе с поверхностью 芯; игла ⟂ линии; прижим большим пальцем; скрытие конца с натяжением",
  "5番","ますかがり (базовый kagari)","базовая かがり","шаги 1–8 урока","high","",excerpt="excerpts/OLY-BASIC.md"),
S("OLY-TM7-L","https://www.olympus-thread.com/lesson/58/ ; https://www.olympus-thread.com/original/tedukuri_lesson/temari201103/tm7.html","オリムパス製絲; 監修 飯盛宏子 (по обложке)","©2006–2010 (старая стр.)","ja","производитель: инструкция набора TM-7 古典菊",
  "Разметка 16 делений, булавки (ピンク/赤/水色/黄/白), старт у ピンクピン, верх 3–4 мм от 赤ピン, «糸を少し緩ませて…花びらの丸み», финал у 水色ピン; наращивание нити; оби",
  "5番 各ひとかせ; ラメ L2; JW-8 8等分 芯","16等分 (8 + 8 доп. линий)","上掛け菊, два чередующихся набора (белые/жёлтые булавки) — та же структура, что у S8, но 16 лепестков",
  "шаги подготовки и かがり","high","Число рядов и цвета — в печатной инструкции набора (не видел)",excerpt="excerpts/OLY-TM7-L.md"),
S("OLY-TM7-V","https://www.youtube.com/watch?v=VF5ipH3Qj6w","olympusthread (YouTube)","2011-09-20","ja","видео производителя с субтитрами",
  "Последовательность ряда: один набор кругом → переход «左隣の黄ピンに糸を渡します» → второй набор = 1段; ряд 2: у 赤ピン захват вместе с нитью ряда 1 (上掛け), у 白ピン — там, где нить естественно пересекает линию; у верха плотно, у низа не тесно",
  "5番","16等分","上掛け菊 (古典菊)","0:42–4:24 (таймкоды ±3 с, прочитаны с кадров)","high","Поверхностный или скрытый переход к 黄ピン — по кадрам не определить",excerpt="excerpts/OLY-TM7-V.md"),
S("OLY-TM2","https://www.olympus-thread.com/lesson/63/","オリムパス製絲","n/d","ja","производитель: урок TM-2",
  "Страница показывает только つむ型クロス; 八重菊 (8等分) заявлен на обложке набора, но техника не описана — противоречие плану по умолчанию",
  "5番","4等分 / 8等分","つむ型 (намотка)","вся страница","high","Инструкция 八重菊 из набора TM-2 не найдена онлайн",excerpt="excerpts/OLY-TM2.md"),
# --- Japanese craft (other) ---
S("SAN-KIT007","https://shop.eiko-temari.jp/items/29621770","讃岐かがり手まり保存会 / eiko-temari","n/d","ja","набор (описание товара)",
  "八重菊: «8片の花びらを4枚ずつ交互にかがる», «ほとんどの菊文様の基礎»; 20 см, 8等分","草木染かがり糸","8等分","八重菊 = 2×4 чередуясь","описание","high",excerpt="excerpts/SAN-KITS.md"),
S("SAN-KIT001","https://shop.eiko-temari.jp/items/72759965","讃岐かがり手まり保存会 / eiko-temari","n/d","ja","набор (описание товара)",
  "やさしい菊かがり — стартовый набор: 周20 см / 8等分, おしべ, ふとん針, 待ち針","草木染かがり糸","8等分","菊かがり","описание","high",excerpt="excerpts/SAN-KITS.md"),
S("SAN-ABOUT","https://eiko-temari.jp/about-temari/","讃岐かがり手まり保存会","n/d","ja","описание ремесла",
  "«糸をいじめない» (не перетягивать нить); «糸が重ならないように…» — ровная поверхность","","","","","medium",excerpt="excerpts/SAN-KITS.md"),
S("SAN-BLOG-MIYABI","https://miyabihana.exblog.jp/18748736/","блог miyabihana","2012","ja","блог мастера",
  "«菊かがりを交差させた八重菊», шар 周囲20cm/直径約6cm","","8等分","八重菊","пост","medium","Открыт через WebFetch (сырой HTML не сохранён полностью)"),
S("SAN-BLOG-NACKY","https://nackyishiwougatu.com/entry/2022/01/23/%E8%AE%83%E5%B2%90%E3%81%8B%E3%81%8C%E3%82%8A%E6%89%8B%E3%81%BE%E3%82%8A_%E4%B8%8B%E6%8E%9B%E3%81%91%E5%8D%83%E9%B3%A5%E3%81%8B%E3%81%8C%E3%82%8A","блог nackyishiwougatu","2022","ja","блог",
  "«かがり目の形により『上掛け』と『下掛け』», большинство кику — 上掛け","","","上掛け vs 下掛け","пост о 下掛け","medium",""),
S("MUS-BUNKO","https://temaribunko.jp/","日本てまり文庫 (日本てまりの会)","n/d","ja","музей/галерея",
  "Названия техник в галерее (巻きかがり, 交差かがり, 麻の葉, ひな菊); техники не описаны","","","","","low"),
S("JTA-SITE","https://nihon-temari.jp/","日本てまりの会 (JTA)","n/d","ja","ассоциация",
  "Ссылки на Suess и Thompson; основатель 尾崎千代子","","","","","low"),
S("BOOK-OZAKI","ISBN 978-4-416-31412-8","尾崎敬子","2014","ja","книга (каталог)",
  "Только каталожная запись: 『基本のかがり方から始める はじめての手まり』 誠文堂新光社 — 15 техник; содержимое НЕ читал","","","","","low","Получить книгу",status="catalog"),
# --- TemariKai (EN) ---
S("TK-GT14",TK+"PatternsPages/Simple/GT14.html","Ginny Thompson (TemariKai)","2011, ©2014","en","схема с фото шагов",
  "Базовый образец: S8, 2 набора по 4, старт 5 мм от NP слева от линии, низ на 1/3 от экватора, stretch 1–2 мм, верх на ~1 нить шире и ниже, нить поверх прежних, чередование A1,B1,A2…, до экватора, парковка",
  "Pearl #5 ×2 цвета (+финиш), металлик для S8","S8 (Simple 8)","uwagake chidori kiku (kousa)","шаги a–o, фото GT14b…GT14o","high","Число рядов не задано (до экватора)",excerpt="excerpts/TK-GT14.md"),
S("TK-UWA",TK+"HowToPages/ToolKit/uwagakechidori.html","TemariKai ToolKit","©2014/2015","en","техника с фото",
  "Определение uwagake chidori; переход к следующему ряду до последнего верхнего стежка; «place the thread, then take the stitch»; верх: над прежними рядами и вокруг всех; stretch ~2 мм для #5 не константа; +1 нить шире и ниже",
  "Pearl #5","любая","uwagake chidori","фото uwagake01–06","high",excerpt="excerpts/TK-UWA.md"),
S("TK-KIKU",TK+"HowToPages/uwagakekiku.html","TemariKai","©2014","en","техника",
  "Кику = работа «сетами» линий; S8 → 2 набора по 4; низ мерить от экватора","","S8","uwagake kiku","","high",excerpt="excerpts/TK-KIKU.md"),
S("TK-STRETCH",TK+"HowToPages/stretchpoints.html","TemariKai (со ссылкой на Ozaki Sensei через Sue H./Sarah R.)","n/d","en","техника",
  "Правило «уложи нить вдоль хода — колоть там, где она пересекла линию»; ~2 мм для #5; у острых углов дальше","Pearl #5","","stretch points","","high",excerpt="excerpts/TK-STRETCH.md"),
S("TK-KAGARI",TK+"HowToPages/ToolKit/kagari.html","TemariKai ToolKit","©2014","en","техника",
  "Захват ~2 мм; умеренное натяжение (не сдвигать 地割り, не деформировать мари, без провиса)","","","kagari","","high",excerpt="excerpts/TK-KAGARI-LITTLE-ANCHOR.md"),
S("TK-CHIDORI",TK+"HowToPages/ToolKit/chidorikagari.html","TemariKai ToolKit","©2014","en","техника","Chidori: захват 1–2 мм; отличие от herringbone","","","chidori","","high"),
S("TK-LITTLE",TK+"HowToPages/ToolKit/littlethingsbasics.html","TemariKai ToolKit","©2014","en","основы",
  "Игла ⟂ линии, захват 1–2 мм симметрично; «lay the thread where you want it to go»; старт 2–5 см под обмоткой или узелок; «Carry the working thread under the starting thread»","","","","","high",excerpt="excerpts/TK-KAGARI-LITTLE-ANCHOR.md"),
S("TK-ANCHOR",TK+"HowToPages/anchorthread.html","TemariKai","©2014","en","основы",
  "Закрепление: для 23 см 3–4 см под обмоткой, то же отверстие, без bleed through; окончание так же, срез под натяжением","","","","","high",excerpt="excerpts/TK-KAGARI-LITTLE-ANCHOR.md"),
S("TK-UWAVAR",TK+"HowToPages/uwagakevariations.html","TemariKai","©2014","en","вариации",
  "Вариации uwagake (#3 — нить ПОД прежними рядами); «easier to begin stitching at the bottom point»","","","uwagake variations","","high"),
S("TK-KOUSA",TK+"HowToPages/kousastylehelp.html","TemariKai","©2014","en","техника","Kousa: чередование слоёв двух мотивов без отдельного переплетения иглой","","","kousa","","medium"),
S("TK-SIMPLE",TK+"HowToPages/simpledivision.html","TemariKai","©2014","en","разметка","Simple division; бумажная лента; проверка полюсов 1–2 мм","","S8","","","high"),
S("TK-SIZE",TK+"HowToPages/marisizing.html","TemariKai","©2014","en","размеры","Размер мари = окружность в см; таблица диаметр↔окружность","","","","","high"),
S("TK-GAUGE",TK+"ResourcesPages/threadgauges.html","TemariKai","©2014","en","справочник",
  "«DMC Perle 5 - 7 threads = 0.5cm» (0.714 мм); пример «10 rows … about .75cm» (0.75 мм) — внутреннее расхождение","DMC Perle #5","","","","medium",excerpt="excerpts/TK-GAUGE.md"),
S("TK-THREADS",TK+"HowToPages/stitchingthreads.html","TemariKai","©2014","en","справочник","Perle #5 — 2-ply twisted, не делится; Miyako 30 м","","","","","medium"),
S("TK-99DA04",TK+"PatternsPages/Simple/99DA04.html","TemariKai","n/d","en","схема","Расход ~10 yd/цвет на 25 см (другой узор; не калибровка)","Pearl #5","","","","low"),
S("SUESS-GLOSS","https://www.japanesetemari.com/TemariGlossarySuess2024.pdf","Barbara B. Suess","©2007 (файл 2024)","en","глоссарий (PDF)",
  "Термины (uwagake chidori = kiku herringbone; shitagake; sakasa; hokkyoku/nankyoku/sekido/jiwari/obi/dan/kai); «Stretch your points … as much as 3/8 inch»","","","","","high",excerpt="excerpts/SUESS-GLOSS.md"),
# --- RU ---
S("RU-EAGLE","https://eaglestemari.blogspot.com/2008/12/","Miss Eagle (Victoria)","2008-12","ru","блог МК",
  "S8, 1/3 от экватора; против часовой; переход «от розовой булавки к голубой, что слева»; игла ⟂ линии; вершина лепестка «на 5мм ниже предыдущего»","","S8","кику 2×4","пост декабрь 2008","medium",excerpt="excerpts/RU-BLOGS.md"),
S("RU-MASTERA","https://mastera-rukodeliya.ru/hrizantema","mastera-rukodeliya.ru","n/d","ru","МК",
  "Kinder-шар Ø7.5 см, 3.5 см от полюса; узелок; сначала одна звезда 5 рядов, потом вторая с явным НАД/ПОД; игла справа налево","","S8","кику, наборы последовательно","","medium",excerpt="excerpts/RU-BLOGS.md"),
S("RU-JARILO","https://jarilo70.blogspot.com/2015/08/3.html","jarilo70","2015-08","ru","блог МК",
  "Узелок; сначала все ряды одной звезды, потом второй поверх (без переплетения); низ 1.5–2 мм ниже кончика, иначе «ступенька»","","S8","кику, наборы последовательно","","medium",excerpt="excerpts/RU-BLOGS.md"),
S("RU-MYJULIA","https://www.myjulia.ru/post/583560/","Iuliia (myjulia.ru)","2013","ru","МК",
  "Пенопласт 6 см; 1/3 от экватора; игла вводится справа от меридиана, выводится слева; две звезды одной нитью со скрытым переходом; шаг 2–3 мм","","S8","кику","","medium","Открыт через WebFetch",excerpt="excerpts/RU-BLOGS.md"),
# --- physics ---
S("PHYS-CAPSTAN","https://en.wikipedia.org/wiki/Capstan_equation","Wikipedia (ссылки на Euler/Eytelwein; Konyukhov 2015)","live 2026","en","справочная статья",
  "T_load = T_hold·e^{μφ}; условия: нерастяжимая, без изгибной жёсткости; δR ≈ T·δφ; обобщение на произвольную поверхность (Konyukhov)","","","","","high","Первичные тексты Эйлера/Эйтельвейна не открывал",excerpt="excerpts/PHYS.md"),
S("PHYS-GEODCURV","https://en.wikipedia.org/wiki/Geodesic_curvature","Wikipedia (do Carmo 1976)","live 2026","en","справочная статья",
  "k² = k_g² + k_n²; сфера: k_n = 1/R, большие круги k_g = 0","","","","","high",excerpt="excerpts/PHYS.md"),
S("PHYS-SOFI2018","ECCM18 Athens 2018 proceedings PDF (копия: sources/raw/phys_airdrive.pdf)","T. Sofi, R. Schledjewski","2018","en","статья конференции",
  "Условие устойчивости негеодезической укладки волокна: µ > λ = |k_g/k_n|; µ для сухой намотки может превышать 0.5 (волокно-оправка/волокно-слой)","углеволокно/стекло (не хлопок)","","","","medium","Перенос на хлопок/обмотку мари — аналогия",excerpt="excerpts/PHYS.md"),
S("PHYS-COTTON-MU","https://www.tandfonline.com/doi/full/10.1080/15440478.2021.1875349","J. Natural Fibers","2021","en","статья (аннотация)",
  "Yarn-yarn μ хлопковой пряжи из тканей: compact 0.32, ring 0.36, OE 0.45; после крашения 0.35/0.40/0.52","хлопковая пряжа (не Perle #5)","","","abstract","medium","Полный текст не читал; метод и нагрузка не проверены",status="abstract",excerpt="excerpts/PHYS.md"),
S("PHYS-ASTM-D3412","https://store.astm.org/d3412_d3412m-13r20.html","ASTM","D3412/D3412M-13(2020)","en","стандарт (страница магазина)",
  "Метод капстана для коэффициента трения нить-нить: μ = ln(T2/T1)/θ","","","","","medium","Текст стандарта платный; формула — из описания/копии",status="abstract"),
S("TEX-BEHERA2012","https://cdn.intechopen.com/pdfs/36900/intech-modeling_of_woven_fabrics_geometry_and_properties.pdf","B.K. Behera, J. Militky, R. Mishra, D. Kremenakova (InTech)","2012","en","глава книги (обзор)",
  "Peirce 1937: d1+d2=h1+h2=D; эллиптическое сечение e=b/a; Kemp 1958 racetrack: h1+h2=B=b1+b2; сплющивание от межнитевого давления","ткани","","","eq. 9, 19, 26; §2.2.5","high","Первоисточники Peirce/Kemp платные, не читал",excerpt="excerpts/PHYS.md"),
S("TEX-VANWYK1946","https://repository.up.ac.za/handle/2263/59727","C.M. van Wyk","1946","en","статья (Onderstepoort J. Vet. Sci. 21(1))",
  "Давление сжатия массы волокон линейно по обратному кубу объёма (после повторного статического сжатия; при малых давлениях не выполняется)","шерсть (не хлопковая нить)","","","стр. ~119–144 (PDF репозитория)","high (закон) / low (перенос на перле)",excerpt="excerpts/PHYS.md"),
S("TEX-KAWABATA1985","https://www.jstage.jst.go.jp/article/jte1955/31/1/31_1_7/_pdf","S. Kawabata, M. Niwa, M. Matsudaira","1985","en","статья (J. Text. Mach. Soc. Japan 31(1))",
  "Метод «проволоки» для изменения толщины пряжи от натяжения и бокового давления; сила на перегибе 2T·sinθ (по обзору prior-project)","камвольная пряжа","","","","medium","Мной открыты заголовок/аннотация; численные данные — через prior-project review",status="abstract",excerpt="excerpts/PHYS.md"),
S("TEX-GRAMSCH2022","https://journals.sagepub.com/doi/full/10.1177/15589250211073249","S. Gramsch, E.G. Bell, A. Moghiseh, A. Schmeißer","2022","en","статья (J. Eng. Fibers Fabrics)",
  "Рост диаметра цилиндрической паковки от длины лучше всего описывается квадратным корнем (сохранение объёма для цилиндра); для шара то же сохранение даёт кубический корень — это мой/prior вывод, не измерение","пряжа на бобине","","","§ анализ, табл. 1","high (цилиндр) / вывод (шар)",excerpt="excerpts/PHYS.md"),
S("TEX-DURUR2000","https://etheses.whiterose.ac.uk/id/eprint/4047/1/uk_bl_ethos_550542.pdf","G. Durur","2000","en","диссертация (Leeds)",
  "Толщина скрещённых нитей; плотность паковки от натяжения (+25 % при ×3.75 T) — по prior-project review","","","","","medium","Мной не открыт",status="not-opened"),
S("TEX-AFRASHTEH2013","https://nopr.niscpr.res.in/bitstream/123456789/19249/1/IJFTR%2038(2)%20126-131.pdf","Afrashteh, Merati, Jeddi","2013","en","статья IJFTR","Толщина ткани ≈ сумма малых диаметров; сплющивание — по prior review","","","","","medium","Мной не открыт",status="not-opened"),
# --- math / virtual temari ---
S("EMARI","https://doi.org/10.5642/jhummath.202002.12","Giuffre & Stemkoski","2020","en","article (Journal of Humanistic Mathematics 10(2):237–257)",
  "«Virtual Temari: Artistically Inspired Mathematics» — reusable for sphere patterns / layer-height ideas, not craft needle routing. «Layer» = k × tube radius (w/2) for the whole curve, no contact — drawing convention; does not close U14. Normalization onto the sphere only at polyhedron vertices. Licenses: code MIT © 2019 stemkoski; article © authors, CC BY-NC-ND (DOAJ); Fig. 3 all rights reserved; polyhedra.js data: George Hart, non-commercial use only — not MIT.",
  "","","virtual temari / polyhedral sphere patterns","DOI 10.5642/jhummath.202002.12; JHM 10(2):237–257","high",
  "«Layer» drawing convention does not close U14; polyhedra.js (George Hart) non-commercial only — not MIT"),
# --- prior project ---
S("PRIOR-ISSUES","https://github.com/newYurk/temari/issues","newYurk/temari (владелица + агенты)","2026-09-08…24","ru","предыдущий проект: issues",
  "История попыток: законы укладки #106/#107/#101–#105, сжатие #93, #100 (верх/низ), #97, #94 (сквозные пересечения), #86/#36 (кику S8 GT14), #112 (архитектурный аудит)","","S8","GT14 uwagake kiku","см. prior-project/state.md","high (как запись истории)",
  "Код НЕ читался по указанию владелицы"),
S("PRIOR-THREAD-OVER-THREAD","prior-project/docs_thread-over-thread.md (копия из newYurk/temari docs/)","newYurk/temari","2026-09-23","ru","предыдущий проект: исследование",
  "Аналоговые оценки сечения 0.71×0.46, t_c≈0.37, подъём ≈0.28 мм при принятом T≈1 Н, m^0.85, закон роста паковки — явно НЕ измерены на перле #5","","","","","medium (как гипотеза)"),
S("PRIOR-THREAD","/workspace/temari-thread-search-report.md","предыдущий агент (поиск по нитям)","2026-09","ru/ja/en","внутренний отчёт",
  "Метраж/линейная плотность нитей #5 (25 м/5 г ≈ 200 tex), гейдж 0.71 мм, расход 99DA04","","","","","medium"),
# --- live needle video (EN/JA) ---
S("KARO-KIKU-V","https://www.youtube.com/watch?v=tiZkl_1Wv1Y","カロhandicraft (Karo handicraft)","n/d (YouTube; checked 2026-09-25)","ja","video lesson (~13 min) with live needle + colour diagrams",
  "uwagake chidori kagari with real hands/needle; ~2:37 needle under gold jiwari with wrapping threads; ~3:56 nested zigzags for later rows with tip offset; on-screen rule: equal distance from the pole; diagram note ~2–3 mm between row entry points; from row 2 change colour and stitch 2 rounds each",
  "","S8-style gold meridians (8 lines from pole)","上掛け千鳥かがり (uwagake chidori kagari) / kiku",
  "2:37 needle close-up; 3:56 colour row diagram; owner frames in sources/photos/karo-handicraft/ (gitignored)","high",
  "Exact mari circumference and thread brand not stated in the checked clips; whether '2 rounds per colour' matches GT14 alternate sets or Suess blocks",excerpt="excerpts/KARO-KIKU-V.md"),
S("SUESS-KIKU-V","https://www.youtube.com/watch?v=ceyC3uYHPxQ","Barbara B. Suess","Temari Challenge Kiku Herringbone Stitch Along (~9 min); checked 2026-09-24/25","en","video stitch-along",
  "Live English demo of kiku herringbone (= uwagake chidori); ~4:39 needle and first stitches close-up; recipe uses blocks (e.g. several A then several B) rather than strict A/B alternate — compare with GT14",
  "","","uwagake chidori / kiku herringbone","4:39 needle close-up; earlier work also used ~6:30 for tip behaviour","high",
  "Confirm exact block sizes (5A then 5B) from full watch vs alternate GT14",excerpt="excerpts/SUESS-KIKU-V.md"),
# --- not opened ---
S("NO-ASTITCH","astitchornine.com","—","—","en","блог","Домен истёк","","","","","—","",status="not-opened"),
S("NO-KAGA","kagatemari yubinuki","—","—","ja","сайт","HTTP 500","","","","","—","",status="not-opened"),
S("NO-TENTEMARI","tentemari.com","—","—","en","сайт","Домен продаётся","","","","","—","",status="not-opened"),
S("NO-CVH01",TK+"PatternsPages/.../CVH01","TemariKai","—","en","схема","Только поисковый сниппет","","","","","low","",status="snippet"),
S("NO-TF-REVIEW","https://doi.org/10.1080/20550340.2018.1500099","T&F","2018","en","обзор намотки","Бот-заглушка","","","","","—","",status="not-opened"),
S("NO-HAL","https://hal.science/hal-00570797","HAL","—","en","статья","Бот-заглушка","","","","","—","",status="not-opened"),
]
json.dump(L, open(os.path.join(H,'sources.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
st = {}
for s in L: st[s['status']] = st.get(s['status'],0)+1
md = ["# Источники (stage 1)", "", "Сгенерировано `sources/build_sources.py` → `sources.json`. Статусы: **opened** — открыт и прочитан мной 2026-09-24; **abstract** — только аннотация/заголовок/описание; **snippet** — только поисковый сниппет; **catalog** — только каталожная запись; **not-opened** — не удалось открыть (или известен только через prior-project).", "",
      "Итого: " + ", ".join(f"{k}: {v}" for k,v in sorted(st.items())) + f" (всего {len(L)}).", "",
      "Изображения в `sources/img/` — скачаны для внутреннего изучения (права у авторов: Olympus, TemariKai); не для публикации. Сырые страницы — `sources/raw/` (в .gitignore).", "",
      "| id | статус | язык | автор / орг., дата | что подтверждает | вариант / разметка | уверенность |", "|---|---|---|---|---|---|---|"]
for s in L:
    link = s['url'] if s['url'].startswith('http') else s['url']
    md.append(f"| [{s['id']}]({link.split(' ; ')[0]}) | {s['status']} | {s['lang']} | {s['author']}, {s['date']} | {s['confirms']} | {s['technique_variant']} / {s['marking']} | {s['confidence']} |")
md += ["", "## Открытые вопросы по источникам", ""]
for s in L:
    if s['open_questions']: md.append(f"- **{s['id']}**: {s['open_questions']}")
open(os.path.join(H,'sources.md'),'w',encoding='utf-8').write("\n".join(md)+"\n")
print(len(L), st)
