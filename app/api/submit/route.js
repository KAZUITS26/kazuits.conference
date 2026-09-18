import { NextResponse } from 'next/server';
import { checkDocx, checkApplicationDocx, checkFileName } from '@/lib/docxChecker';
import { sendEmails } from '@/lib/email';
import { appendSubmissionRow } from '@/lib/googleSheets';

export const runtime = 'nodejs';

function summarize(results) {
  const lines = [];
  for (const r of results) {
    if (r.severity === 'auto') {
      lines.push(`${r.ok ? '✅' : '❌'} ${r.label} — ${r.detail}`);
    } else {
      lines.push(`⚠️ (ручная проверка) ${r.label} — ${r.detail}`);
    }
  }
  return lines.join('\n');
}

export async function POST(req) {
  try {
    const formData = await req.formData();

    const fullName = formData.get('fullName');
    const email = formData.get('email');
    const organization = formData.get('organization');
    const city = formData.get('city');
    const country = formData.get('country');
    const degree = formData.get('degree');
    const articleTitle = formData.get('articleTitle');
    const section = formData.get('section');
    const phone = formData.get('phone');

    const applicationFile = formData.get('applicationFile');
    const articleFile = formData.get('articleFile');

    if (!fullName || !email || !articleTitle || !articleFile) {
      return NextResponse.json({ error: 'Заполните все обязательные поля и приложите файл статьи.' }, { status: 400 });
    }

    const articleBuffer = Buffer.from(await articleFile.arrayBuffer());
    const applicationBuffer = applicationFile ? Buffer.from(await applicationFile.arrayBuffer()) : null;

    // Проверка имён файлов
    const lastName = fullName.split(' ')[0];
    const articleNameOk = checkFileName(articleFile.name, 'Статья', lastName);
    const applicationNameOk = applicationFile ? checkFileName(applicationFile.name, 'Заявка', lastName) : false;

    // Проверка оформления статьи
    const { overallOk, results } = await checkDocx(articleBuffer, { fullName, articleTitle });

    // Проверка файла заявки (базовая — без точного шаблона полей)
    let applicationOk = true;
    if (applicationFile) {
      const appCheck = await checkApplicationDocx(applicationBuffer);
      applicationOk = appCheck.overallOk;
      results.push(
        { label: '— Проверка файла заявки —', ok: null, detail: '', severity: 'manual' },
        ...appCheck.results
      );
    }

    if (!articleNameOk) {
      results.unshift({
        label: 'Имя файла статьи',
        ok: false,
        detail: `Ожидается формат «Статья Фамилия И.О. Тема.docx», получено: «${articleFile.name}»`,
        severity: 'auto'
      });
    }
    if (applicationFile && !applicationNameOk) {
      results.unshift({
        label: 'Имя файла заявки',
        ok: false,
        detail: `Ожидается формат «Заявка Фамилия И.О..docx», получено: «${applicationFile.name}»`,
        severity: 'auto'
      });
    }

    const finalOk = overallOk && articleNameOk && applicationOk && (applicationFile ? applicationNameOk : true);
    const checkSummary = summarize(results);

    // Отправка писем: автору — всегда результат проверки; организатору
    // (konferencia.edu@gmail.com) — только если проверка пройдена, вместе
    // с файлами заявки и статьи вложениями. Никакие файлы никуда в базу
    // не сохраняются — только пересылаются по почте.
    let emailResult = { sent: false };
    try {
      emailResult = await sendEmails({
        authorEmail: email,
        authorName: fullName,
        articleTitle,
        checkOk: finalOk,
        checkSummary,
        articleBuffer,
        articleFileName: articleFile.name,
        applicationBuffer,
        applicationFileName: applicationFile ? applicationFile.name : null,
        organization,
        city,
        country,
        degree,
        section,
        phone
      });
    } catch (mailErr) {
      console.error('Email error:', mailErr);
    }

    // Запись строки с данными заявки в Google Sheets — для удобного общего
    // списка заявок. Только текстовые данные и статус проверки, без самих
    // файлов (файлы, как и раньше, идут вложениями в письме организатору).
    try {
      await appendSubmissionRow([
        new Date().toISOString(),
        fullName,
        email,
        organization || '',
        city || '',
        country || '',
        degree || '',
        phone || '',
        articleTitle,
        section || '',
        finalOk ? 'Прошла проверку' : 'Не прошла проверку',
        articleFile.name,
        applicationFile ? applicationFile.name : ''
      ]);
    } catch (sheetErr) {
      console.error('Google Sheets error:', sheetErr);
    }

    // Участникам показываем только автопроверки (зелёные/красные).
    // Пункты «требует ручной проверки» (жёлтые) видят только организаторы —
    // они попадают в письмо-копию организатору (checkSummary), но не в этот ответ.
    const participantResults = results.filter(r => r.severity !== 'manual');

    return NextResponse.json({
      ok: finalOk,
      emailSent: emailResult.sent,
      results: participantResults
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера при обработке заявки.' }, { status: 500 });
  }
}
