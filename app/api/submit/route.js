import { NextResponse } from 'next/server';
import { checkDocx, checkApplicationDocx, checkFileName } from '@/lib/docxChecker';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEmails } from '@/lib/email';

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

    // Сохранение в Supabase (база + файлы)
    let submissionId = null;
    try {
      const supabase = getSupabaseAdmin();

      const articlePath = `articles/${Date.now()}_${articleFile.name}`;
      await supabase.storage.from('papers').upload(articlePath, articleBuffer, {
        contentType: articleFile.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      let applicationPath = null;
      if (applicationFile) {
        applicationPath = `applications/${Date.now()}_${applicationFile.name}`;
        await supabase.storage.from('papers').upload(applicationPath, applicationBuffer, {
          contentType: applicationFile.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        });
      }

      const { data, error } = await supabase.from('submissions').insert({
        full_name: fullName,
        email,
        organization,
        city,
        country,
        degree,
        article_title: articleTitle,
        section,
        phone,
        article_path: articlePath,
        application_path: applicationPath,
        check_passed: finalOk,
        check_summary: checkSummary,
        status: finalOk ? 'passed' : 'rejected'
      }).select('id').single();

      if (error) throw error;
      submissionId = data?.id;
    } catch (dbErr) {
      console.error('Supabase error:', dbErr);
      // Не прерываем процесс полностью — продолжаем, но сообщаем об ошибке сохранения
    }

    // Отправка писем
    try {
      await sendEmails({
        authorEmail: email,
        authorName: fullName,
        articleTitle,
        checkOk: finalOk,
        checkSummary
      });
    } catch (mailErr) {
      console.error('Email error:', mailErr);
    }

    return NextResponse.json({
      ok: finalOk,
      submissionId,
      results
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера при обработке заявки.' }, { status: 500 });
  }
}
