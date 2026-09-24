# -*- coding: utf-8 -*-
"""Записывает короткие дословные выдержки из открытых источников в sources/excerpts/."""
import os
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'excerpts')
E = {
"OLY-BASIC.md": ("Olympus 基本のかがり方（ますかがり）", "https://www.olympus-thread.com/lesson/24/", [
 "糸は、２～３㎝ほど離れた所から…地割り糸のきわに針を出します。※糸に玉とめなどはしません。",
 "針を出した向きとは逆方向にかがっていくことで、糸が抜けにくくなります。",
 "地割り糸とともに、手まり芯を少しすくうように",
 "※かがる向きは、進行方向とは常に逆方向です",
 "糸を左手の親指で、押さえながら",
 "針は地割り糸と垂直に交わるように",
 "軽くひっぱりながら、糸を切ると糸はしが手まり芯の中に隠れ"]),
"OLY-TM7-L.md": ("Olympus TM-7 古典菊 (lesson/58; старая страница tm7.html ©2006-2010)", "https://www.olympus-thread.com/lesson/58/ ; https://www.olympus-thread.com/original/tedukuri_lesson/temari201103/tm7.html", [
 "TM-2八重菊と同じ技法をアレンジ",
 "北極、南極を16等分",
 "２～３㎝ほど離れた所から、スタート位置目印のピンクピンのきわに針を出します。",
 "右隣の地割り糸、赤ピンから3〜4mmの所をかがります。",
 "糸を少し緩ませて、花びらの丸みを意識しながら",
 "指定された段数で、花びらの先が水色ピンに届くように",
 "糸を足す時はかがり終わりの糸にかぶせるように",
 "(пересказ) Материалы: ＪＷ-8 8等分 白の手まり芯; 5番 各ひとかせ; ラメ L2"]),
"OLY-TM7-V.md": ("YouTube VF5ipH3Qj6w «手まり ＴＭ7-2 古典菊» (olympusthread, загружено 2011-09-20, 294 c). Субтитры прочитаны с кадров, таймкоды ±~3 с", "https://www.youtube.com/watch?v=VF5ipH3Qj6w", [
 "~0:42 2〜3cm離れた所からピンクピンに針を出します※糸に玉どめなどはしません",
 "~0:56 右隣の地割り糸、北極の赤ピンから3〜4mmの所をかがります",
 "~1:02 針は地割り糸と垂直に交わるようにかがると仕上がりがきれいになります",
 "~1:14 白ピンの所を同様にかがります 花びらの丸みを意識してかがりましょう",
 "~1:24–1:30 赤ピンから3〜4mmの所を先程と同じ距離になるようにかがります",
 "~1:36–1:48 手まり芯を回転させながら白ピンを順番にかがっていきます",
 "~1:54–2:00 糸を左手の親指で押さえながらかがるとかがりやすく きれいにかがれます",
 "~2:06–2:18 ピンクピンまで一周かがったら左隣の黄ピンに糸を渡します",
 "~2:24–2:30 同様に黄ピンを一周かがりピンクピンに戻ってきたら一段目の終了です",
 "~2:48–2:54 ピンクピンの糸の少し下に針を出します",
 "~3:00–3:12 並べるように糸を置き、赤ピン付近で一段目の糸も一緒にかがるようにします",
 "~3:24–3:30 白ピンの所では糸と地割り糸が自然に交わる所をかがります",
 "~3:36–3:42 そうすると糸間隔が混みすぎず適度な密度に仕上がります",
 "~3:48–3:54 反対に赤ピン付近では隙間が出来ないように混み気味でかがります",
 "~4:00–4:06 糸の流れに沿わせるようにすると仕上がりがきれいになります",
 "~4:12 …白ピンを一周 黄ピンを一周かがり二段目の終了です"]),
"OLY-TM2.md": ("Olympus TM-2 (lesson/63, старая TM2.html)", "https://www.olympus-thread.com/lesson/63/", [
 "(пересказ) Страница описывает только つむ型クロス (4等分・黒): нить цепляют за булавки и наматывают, фиксируют 帯かがり.",
 "(пересказ) Обложка набора: два шара — «つむ型クロス (4等分・黒)» и «八重菊 (8等分・白)». Техника 八重菊 на странице не показана."]),
"TK-GT14.md": ("TemariKai GT14 (Ginny Thompson, 2011; ©2014)", "https://www.temarikai.com/PatternsPages/Simple/GT14.html", [
 "enter … just to the left of one marking line, 5 mm down from the NP. Move 1 marking line to the right and take small stitch just below pin",
 "Park the thread",
 "When taking bottom stitch, \"stretch\" stitch placement an extra 1-2 mm",
 "When taking the top stitch, place needle about 1 thread width wider and below previous stitch",
 "The working thread is always take[n] over the previously placed threads before taking the top stitch",
 "interweave … kousa style",
 "Work to the equator",
 "(пересказ) мари 23–25 cm, Pearl #5 два цвета (+3-й финиш), булавки на 1/3 расстояния NP–экватор от экватора, разметка S8 золотым металликом."]),
"TK-UWA.md": ("TemariKai ToolKit: Uwagake Chidori Kagari (©2014/2015)", "https://www.temarikai.com/HowToPages/ToolKit/uwagakechidori.html", [
 "(пересказ) uwa = over, gake = stitch, chidori = zigzag",
 "Proceed to the next step before taking the last stitch of this round near the pole",
 "place the thread, then take the stitch to keep it there",
 "carry the thread over the previously laid threads, and take a stitch around all of them. Allow the stitch width to widen",
 "for #5 pearl cotton, the stretch distance is usually about 2mm, but this is not a constant value. It will change based on the thread, number of divisions and size of the mari",
 "Each ensuing round will be about 1 thread-width wider and lower",
 "Подписи фото: «Thread is taken over previous rounds»; «Take small stitch at bottom of zigzag under previous point»"]),
"TK-KIKU.md": ("TemariKai ToolKit: Uwagake & Kiku", "https://www.temarikai.com/HowToPages/uwagakekiku.html", [
 "Kiku designs are accomplished by working on \"sets\" of lines - the above example has 2 sets of 4",
 "(пересказ) Нижние точки мерить вверх от экватора; верхние — равномерно вокруг полюса."]),
"TK-STRETCH.md": ("TemariKai: Stretch the Points", "https://www.temarikai.com/HowToPages/stretchpoints.html", [
 "carry the thread … straight along its lay, and where it crosses the marking line is generally where the stitch needs to go",
 "(пересказ) Для #5 ~2 мм; у острого угла стежок дальше."]),
"TK-KAGARI-LITTLE-ANCHOR.md": ("TemariKai ToolKit: Kagari / Little Things / Anchoring", "https://www.temarikai.com/HowToPages/ToolKit/kagari.html ; https://www.temarikai.com/HowToPages/ToolKit/littlethingsbasics.html ; https://www.temarikai.com/HowToPages/anchorthread.html", [
 "(пересказ) Kagari: захват about 2mm; умеренное натяжение: не сдвигать 地割り, не деформировать шар, без провисания.",
 "Little Things: игла перпендикулярно линии, захват 1–2 мм симметрично; «lay the thread where you want it to go»; «Carry the working thread under the starting thread».",
 "(пересказ) Anchoring: для 23 см — 3–4 см под обмоткой, вход в то же отверстие; без «bleed through»; окончание: вывести рядом, войти в то же отверстие, пройти под обмоткой, срезать под натяжением."]),
"TK-GAUGE.md": ("TemariKai: Thread Gauges", "https://www.temarikai.com/ResourcesPages/threadgauges.html", [
 "DMC Perle 5 - 7 threads = 0.5cm",
 "(пересказ) Пример на той же странице «10 rows … about .75cm» → 0.75 мм/нить; внутреннее расхождение с 0.714 мм."]),
"SUESS-GLOSS.md": ("Barbara Suess, Temari Glossary (PDF, ©2007, файл 2024)", "https://www.japanesetemari.com/TemariGlossarySuess2024.pdf", [
 "uwagake chidori — «kiku herringbone»; «on the inside points stitch under and around all previous stitches»",
 "shitagake — «Descending herringbone … close together but not overlapping»",
 "«Stretch your points … as much as 3/8 inch depending on the design»"]),
"SAN-KITS.md": ("讃岐かがり手まり (eiko-temari): наборы やさしい菊かがり / 八重菊; about-temari", "https://shop.eiko-temari.jp/items/29621770 ; https://shop.eiko-temari.jp/items/72759965 ; https://eiko-temari.jp/about-temari/", [
 "8片の花びらを4枚ずつ交互にかがる",
 "ほとんどの菊文様の基礎",
 "(пересказ) 20cm / 8等分; やさしい菊かがり: 土台まり円周20cm / 8等分, 初めての手まり",
 "糸をいじめない",
 "糸が重ならないように気をつけてかがると、面が整って"]),
"RU-BLOGS.md": ("Русскоязычные мастер-классы (EAGLE, MASTERA, JARILO, MYJULIA)", "см. sources.json", [
 "EAGLE: «Двигаемся от меридиана к меридиану против часовой стрелки»; «провести нитку от розовой булавки к голубой, что слева»; «Стежок … в вершине \"лепестка\" … на 5мм ниже предыдущего».",
 "MASTERA (пересказ): сначала голубая звезда 5 рядов, потом розовая с явным переплетением НАД/ПОД; большой узелок; игла справа налево.",
 "JARILO: узелок; сначала все зелёные ряды, потом жёлтые поверх; «1.5 до 2 мм» ниже кончика, иначе «ступенька».",
 "MYJULIA: «вводим иглу у полюса справа от меридиана, выводим слева»; «новый стежок на 2-3 мм ниже»."]),
"PHYS.md": ("Физика и текстильная механика (открытые мной 2026-09-24)", "см. sources.json", [
 "Wikipedia Capstan equation: T_load = T_hold·e^{μφ}; нерастяжимая нить без изгибной жёсткости; δR ≈ T·δφ (пересказ формул).",
 "Wikipedia Geodesic curvature: k² = k_g² + k_n²; на сфере k_n = 1/R, большие круги k_g = 0 (пересказ формул).",
 "T. Sofi & R. Schledjewski, ECCM18 2018: «condition for the fiber to be stable … µ > λ = |k_g/k_n|».",
 "J. Natural Fibers doi 10.1080/15440478.2021.1875349 (только аннотация): yarn-yarn μ хлопка compact 0.32 / ring 0.36 / OE 0.45; после крашения 0.35/0.40/0.52.",
 "Behera et al., InTech 2012 (изложение Peirce/Kemp): «d1+d2=h1+h2=D» (eq. 9); «h1+h2 = B = b1 +b2»; «This inter-yarn pressure results in considerable yarn flattening normal to the plane of the cloth even in a highly twisted yarn».",
 "van Wyk 1946, Onderstepoort J. Vet. Sci. 21(1): «the pressure should bear a linear relation to the inverse cube of the volume»; «the inverse cube law holds only after repeated compression by the static method, and the results at low pressures do not follow the law».",
 "Kawabata, Niwa, Matsudaira 1985, J. Text. Mach. Soc. Japan 31(1): «Measurement of Yarn Thickness Change Caused by Tension and Lateral Pressure by Wire Method» (открыты заголовок и аннотация; численные таблицы мной не переносились).",
 "Gramsch et al. 2022, J. Eng. Fibers Fabrics: «the mean square error is minimal for the square root function» (рост диаметра цилиндрической паковки от длины)."]),
}
os.makedirs(OUT, exist_ok=True)
for fn,(title,url,qs) in E.items():
    with open(os.path.join(OUT, fn),'w',encoding='utf-8') as f:
        f.write(f"# {title}\n\nURL: {url}\n\nОткрыто: 2026-09-24 (исполнитель stage 1). Строки без пометки «(пересказ)» — дословные фрагменты (многоточие = пропуск).\n\n")
        for q in qs: f.write(f"- {q}\n")
print(len(E), 'files')
