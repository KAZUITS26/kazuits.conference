import JSZip from 'jszip';

// ---- Единицы измерения Word (twips = 1/1440 дюйма) ----
const MM_TO_TWIPS = 56.6929;
const CM_TO_TWIPS = 566.929;

const TARGET = {
  pageWidth: 11906, // A4 портрет, ширина в twips
  pageHeight: 16838, // A4 портрет, высота в twips
  margin: Math.round(20 * MM_TO_TWIPS), // 20 мм
  fontSizeHalfPoints: 28, // 14pt = 28 half-points
  fontName: 'times new roman',
  lineSpacingVal: 240, // одинарный интервал (при lineRule=auto)
  firstLineIndent: Math.round(1.25 * CM_TO_TWIPS), // 1.25 см
  tolerance: 40 // twips, допуск на погрешности округления Word
};

function within(value, target, tol = TARGET.tolerance) {
  return Math.abs(value - target) <= tol;
}

function getAttr(tag, name) {
  const re = new RegExp(name + '="([^"]*)"', 'i');
  const m = tag.match(re);
  return m ? m[1] : null;
}

function findAllTags(xml, tagRegex) {
  const matches = [];
  let m;
  const re = new RegExp(tagRegex, 'gi');
  while ((m = re.exec(xml)) !== null) {
    matches.push(m[0]);
  }
  return matches;
}

function xmlToPlainText(xml) {
  // Переносы абзацев -> \n, затем убираем все теги
  let text = xml
    .replace(/<w:p[ >]/gi, '\n<w:p ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text;
}

function countWords(str) {
  return (str.trim().match(/[A-Za-zА-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі]+/g) || []).length;
}

function extractBetween(text, startMarkers, endMarkers) {
  const lower = text.toLowerCase();
  let startIdx = -1;
  for (const s of startMarkers) {
    const i = lower.indexOf(s.toLowerCase());
    if (i !== -1) { startIdx = i + s.length; break; }
  }
  if (startIdx === -1) return null;
  let endIdx = text.length;
  for (const e of endMarkers) {
    const i = lower.indexOf(e.toLowerCase(), startIdx);
    if (i !== -1 && i < endIdx) endIdx = i;
  }
  return text.slice(startIdx, endIdx);
}

function countKeywords(segment) {
  if (!segment) return 0;
  const cleaned = segment.replace(/\n/g, ' ').trim();
  if (!cleaned) return 0;
  return cleaned.split(/[,;]/).map(s => s.trim()).filter(Boolean).length;
}

export async function checkDocx(buffer, meta = {}) {
  const results = [];
  const pass = (label, ok, detail) => results.push({ label, ok, detail, severity: 'auto' });
  const manual = (label, detail) => results.push({ label, ok: null, detail, severity: 'manual' });

  let zip, xml, mediaFiles;
  try {
    zip = await JSZip.loadAsync(buffer);
    xml = await zip.file('word/document.xml').async('string');
    mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'));
  } catch (e) {
    return {
      overallOk: false,
      results: [{ label: 'Формат файла', ok: false, detail: 'Не удалось открыть файл как .docx (возможно, это .doc, .pdf или повреждённый файл)', severity: 'auto' }]
    };
  }

  // ---- 1. Размер страницы (A4) ----
  const pgSzTag = xml.match(/<w:pgSz\b[^>]*\/?>/i);
  if (pgSzTag) {
    const w = parseInt(getAttr(pgSzTag[0], 'w:w'), 10);
    const h = parseInt(getAttr(pgSzTag[0], 'w:h'), 10);
    const orient = getAttr(pgSzTag[0], 'w:orient');
    const isA4Portrait =
      within(w, TARGET.pageWidth) && within(h, TARGET.pageHeight) && orient !== 'landscape';
    pass('Формат страницы А4, книжная ориентация', isA4Portrait,
      `Найдено: ${w}x${h} twips${orient ? ', ' + orient : ''}`);
  } else {
    manual('Формат страницы А4', 'Не удалось найти секцию pgSz в документе — проверьте вручную.');
  }

  // ---- 2. Поля 20мм ----
  const pgMarTag = xml.match(/<w:pgMar\b[^>]*\/?>/i);
  if (pgMarTag) {
    const top = parseInt(getAttr(pgMarTag[0], 'w:top'), 10);
    const bottom = parseInt(getAttr(pgMarTag[0], 'w:bottom'), 10);
    const left = parseInt(getAttr(pgMarTag[0], 'w:left'), 10);
    const right = parseInt(getAttr(pgMarTag[0], 'w:right'), 10);
    const ok = [top, bottom, left, right].every(v => within(v, TARGET.margin));
    pass('Поля страницы 20 мм со всех сторон', ok,
      `top=${top}, bottom=${bottom}, left=${left}, right=${right} (цель: ${TARGET.margin} twips ±${TARGET.tolerance})`);
  } else {
    manual('Поля страницы', 'Не удалось найти pgMar — проверьте вручную.');
  }

  // ---- 3. Шрифт Times New Roman ----
  const fontTags = findAllTags(xml, '<w:rFonts\\b[^>]*\\/>');
  if (fontTags.length) {
    let tnrCount = 0, total = 0;
    for (const t of fontTags) {
      const ascii = getAttr(t, 'w:ascii');
      if (ascii) {
        total++;
        if (ascii.toLowerCase() === TARGET.fontName) tnrCount++;
      }
    }
    const ratio = total ? tnrCount / total : 0;
    pass('Шрифт Times New Roman', ratio >= 0.9,
      `${tnrCount} из ${total} указаний шрифта — Times New Roman (${Math.round(ratio * 100)}%)`);
  } else {
    manual('Шрифт Times New Roman', 'Явных указаний шрифта в XML не найдено (возможно, задан только в стилях) — проверьте вручную.');
  }

  // ---- 4. Кегль 14пт ----
  const szTags = findAllTags(xml, '<w:sz\\b[^>]*\\/>');
  if (szTags.length) {
    let count14 = 0, total = 0;
    for (const t of szTags) {
      const v = parseInt(getAttr(t, 'w:val'), 10);
      if (!isNaN(v)) {
        total++;
        if (v === TARGET.fontSizeHalfPoints) count14++;
      }
    }
    const ratio = total ? count14 / total : 0;
    pass('Размер шрифта 14 пт', ratio >= 0.8,
      `${count14} из ${total} указаний размера — 14пт (${Math.round(ratio * 100)}%)`);
  } else {
    manual('Размер шрифта 14 пт', 'Явных указаний размера в XML не найдено — проверьте вручную.');
  }

  // ---- 5. Межстрочный интервал одинарный ----
  const spacingTags = findAllTags(xml, '<w:spacing\\b[^>]*\\/>');
  const lineSpacingTags = spacingTags.filter(t => getAttr(t, 'w:line') !== null);
  if (lineSpacingTags.length) {
    let singleCount = 0;
    for (const t of lineSpacingTags) {
      const line = parseInt(getAttr(t, 'w:line'), 10);
      if (within(line, TARGET.lineSpacingVal, 5)) singleCount++;
    }
    const ratio = singleCount / lineSpacingTags.length;
    pass('Межстрочный интервал одинарный', ratio >= 0.8,
      `${singleCount} из ${lineSpacingTags.length} абзацев с одинарным интервалом (${Math.round(ratio * 100)}%)`);
  } else {
    manual('Межстрочный интервал', 'Явных настроек интервала не найдено — проверьте вручную.');
  }

  // ---- 6. Абзацный отступ 1.25 см ----
  const indTags = findAllTags(xml, '<w:ind\\b[^>]*\\/>');
  const firstLineTags = indTags.filter(t => getAttr(t, 'w:firstLine') !== null);
  if (firstLineTags.length) {
    let okCount = 0;
    for (const t of firstLineTags) {
      const v = parseInt(getAttr(t, 'w:firstLine'), 10);
      if (within(v, TARGET.firstLineIndent, 60)) okCount++;
    }
    const ratio = okCount / firstLineTags.length;
    pass('Абзацный отступ 1.25 см', ratio >= 0.5,
      `${okCount} из ${firstLineTags.length} абзацев с отступом ~1.25см (${Math.round(ratio * 100)}%)`);
  } else {
    manual('Абзацный отступ 1.25 см', 'Не найдено настроек firstLine — возможно, отступ сделан пробелами/табуляцией (это нарушение) — проверьте вручную.');
  }

  // ---- Текстовые проверки ----
  const text = xmlToPlainText(xml);
  const lowerText = text.toLowerCase();

  // УДК / МРНТИ
  const hasUDK = /удк/i.test(text.slice(0, 2000));
  const hasMRNTI = /мрнти/i.test(text.slice(0, 2000));
  pass('Указан индекс УДК', hasUDK, hasUDK ? 'Найдено' : 'УДК не найден в начале документа');
  pass('Указан индекс МРНТИ', hasMRNTI, hasMRNTI ? 'Найдено' : 'МРНТИ не найден в начале документа');

  // Аннотации на 3 языках
  const ruAbstract = extractBetween(text, ['Аннотация:', 'Аннотация'], ['Ключевые слова', 'Abstract', 'Аңдатпа']);
  const enAbstract = extractBetween(text, ['Abstract:', 'Abstract'], ['Key words', 'Keywords']);
  const kkAbstract = extractBetween(text, ['Аңдатпа:', 'Аңдатпа'], ['Түйін сөздер', 'Аннотация']);

  for (const [name, seg] of [['русском', ruAbstract], ['английском', enAbstract], ['казахском', kkAbstract]]) {
    if (seg) {
      const wc = countWords(seg);
      pass(`Аннотация на ${name} языке — объём 150-300 слов`, wc >= 150 && wc <= 300, `Найдено слов: ${wc}`);
    } else {
      manual(`Аннотация на ${name} языке`, 'Не удалось автоматически найти и выделить текст — проверьте вручную.');
    }
  }

  // Ключевые слова
  const ruKw = extractBetween(text, ['Ключевые слова:', 'Ключевые слова'], ['Abstract', 'Aңдатпа', '\n\n']);
  const enKw = extractBetween(text, ['Key words:', 'Keywords:'], ['\n\n']);
  const kkKw = extractBetween(text, ['Түйін сөздер:', 'Түйін сөздер'], ['Аннотация', '\n\n']);
  for (const [name, seg] of [['русские', ruKw], ['английские', enKw], ['казахские', kkKw]]) {
    if (seg) {
      const n = countKeywords(seg.split('\n')[0]);
      pass(`Ключевые слова (${name}) — от 5 до 10`, n >= 5 && n <= 10, `Найдено: ${n}`);
    } else {
      manual(`Ключевые слова (${name})`, 'Не удалось автоматически найти — проверьте вручную.');
    }
  }

  // Структура IMRAD
  const sections = [
    ['Введение', ['введение']],
    ['Материалы и методы', ['материалы и методы']],
    ['Результаты', ['результаты']],
    ['Обсуждение', ['обсуждение']],
    ['Заключение/Выводы', ['заключение', 'выводы', 'conclusion']],
    ['Список литературы', ['список литературы', 'список использованной литературы', 'references']]
  ];
  for (const [name, keys] of sections) {
    const found = keys.some(k => lowerText.includes(k));
    pass(`Раздел «${name}» присутствует`, found, found ? 'Найден' : 'Не найден в тексте');
  }

  // Список литературы — количество источников
  const refsSegment = extractBetween(text, ['Список литературы', 'СПИСОК ЛИТЕРАТУРЫ', 'References'], ['\n\n\n', '__END__']) || '';
  const refLines = refsSegment.split('\n').map(s => s.trim()).filter(s => /^\d+[.)]/.test(s));
  pass('Список литературы — не менее 15 источников', refLines.length >= 15,
    `Найдено пронумерованных источников: ${refLines.length}`);

  // Ссылки в тексте вида [1]
  const bracketRefs = text.match(/\[\d+(,\s*с\.\s*\d+)?\]/g) || [];
  pass('В тексте используются ссылки на источники вида [1]', bracketRefs.length > 0,
    `Найдено упоминаний: ${bracketRefs.length}`);

  // ---- Графика ----
  if (mediaFiles.length) {
    const nonJpeg = mediaFiles.filter(f => !/\.(jpe?g)$/i.test(f));
    pass('Изображения в формате JPEG', nonJpeg.length === 0,
      nonJpeg.length ? `Не в JPEG: ${nonJpeg.map(f => f.split('/').pop()).join(', ')}` : 'Все изображения в JPEG');
    manual('Изображения чёрно-белые', `В файле ${mediaFiles.length} изображений — цветовую гамму нужно проверить визуально.`);
  }

  // ---- Пункты, требующие ручной проверки в любом случае ----
  manual('Название и номера таблиц над таблицей, рисунков — под рисунком', 'Проверьте расположение подписей вручную.');
  manual('Отсутствие автонумерации рисунков/таблиц/списка литературы', 'Проверьте, что нумерация проставлена вручную, а не через функцию Word.');
  manual('Актуальность источников (5-7 лет) и доля WoS/Scopus ≥30%', 'Требует сверки по годам и базам данных — проверьте вручную.');
  manual('Оформление списка литературы по выбранному стилю (ГОСТ/APA/IEEE и т.п.)', 'Автоматическая проверка стиля библиографии не производится — проверьте вручную.');

  const autoResults = results.filter(r => r.severity === 'auto');
  const overallOk = autoResults.every(r => r.ok);

  return { overallOk, results };
}

export function checkFileName(fileName, kind, lastNameFirstAuthor) {
  // kind: 'Заявка' | 'Статья'
  const name = fileName.toLowerCase();
  const hasKind = name.includes(kind.toLowerCase());
  const hasAuthor = lastNameFirstAuthor
    ? name.includes(lastNameFirstAuthor.toLowerCase().split(' ')[0])
    : true;
  return hasKind && hasAuthor;
}
