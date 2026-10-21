import nodemailer from 'nodemailer';

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) {
    throw new Error('Не заданы GMAIL_USER / GMAIL_APP_PASSWORD');
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: user.trim(), pass }
  });
}

export async function sendEmails({
  authorEmail,
  authorName,
  articleTitle,
  checkOk,
  checkSummary,
  articleBuffer,
  articleFileName,
  applicationBuffer,
  applicationFileName,
  organization,
  city,
  country,
  degree,
  section,
  phone
}) {
  const user = (process.env.GMAIL_USER || '').trim();
  const notifyEmail = (process.env.NOTIFY_EMAIL || 'konferencia.edu@gmail.com').trim();
  // Организатор получает ВСЕ заявки — и прошедшие, и не прошедшие проверку,
  // с крупной пометкой статуса в теме и в начале письма.

  if (!user || !process.env.GMAIL_APP_PASSWORD) {
    console.error('GMAIL_USER / GMAIL_APP_PASSWORD не заданы — письма не отправлены');
    return { sent: false, organizerSent: false, authorSent: false, reason: 'no_credentials' };
  }

  const transporter = getTransporter();
  const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const out = { sent: false, organizerSent: false, authorSent: false, errors: [] };

  // 1) СНАЧАЛА организатору — чтобы сбой письма автору (например, опечатка
  //    в его адресе) не мешал вам получить заявку.
  if (notifyEmail) {
    const attachments = [];
    if (articleBuffer) {
      attachments.push({ filename: articleFileName || 'Статья.docx', content: articleBuffer, contentType: docxMime });
    }
    if (applicationBuffer) {
      attachments.push({ filename: applicationFileName || 'Заявка.docx', content: applicationBuffer, contentType: docxMime });
    }
    try {
      await transporter.sendMail({
        from: `Оргкомитет конференции <${user}>`,
        to: notifyEmail,
        subject: `${checkOk ? '✅ ПРОШЛА ПРОВЕРКУ' : '❌ НЕ ПРОШЛА ПРОВЕРКУ'} — ${articleTitle}`,
        html: `
          <div style="font-family:Arial,sans-serif;font-size:32px;font-weight:bold;text-align:center;padding:24px;border-radius:8px;margin-bottom:16px;color:#ffffff;background:${checkOk ? '#16a34a' : '#dc2626'};">
            ${checkOk ? '✅ ПРОШЛА ПРОВЕРКУ' : '❌ НЕ ПРОШЛА ПРОВЕРКУ'}
          </div>
          <p>Автор: ${authorName} (${authorEmail})</p>
          <p>Организация: ${organization || '—'}, ${city || ''}${city && country ? ', ' : ''}${country || ''}</p>
          <p>Учёная степень: ${degree || '—'}</p>
          <p>Телефон: ${phone || '—'}</p>
          <p>Секция: ${section || '—'}</p>
          <p>Статья: ${articleTitle}</p>
          <p>Во вложении — файлы заявки и статьи.</p>
          <pre style="white-space:pre-wrap;font-family:monospace;background:#f5f5f5;padding:12px;border-radius:6px;">${checkSummary}</pre>
        `,
        attachments
      });
      out.organizerSent = true;
    } catch (e) {
      console.error('ОШИБКА отправки письма организатору:', e);
      out.errors.push('organizer: ' + (e && e.message ? e.message : String(e)));
    }
  }

  // 2) Автору — результат проверки.
  const statusText = checkOk
    ? 'Статья прошла автоматическую проверку оформления и передана организаторам.'
    : 'В статье обнаружены несоответствия требованиям оформления. Пожалуйста, исправьте и загрузите статью повторно.';
  try {
    await transporter.sendMail({
      from: `Оргкомитет конференции <${user}>`,
      to: authorEmail,
      subject: `Статья "${articleTitle}" — результат проверки оформления`,
      html: `
        <p>Здравствуйте, ${authorName}!</p>
        <p>${statusText}</p>
        <pre style="white-space:pre-wrap;font-family:monospace;background:#f5f5f5;padding:12px;border-radius:6px;">${checkSummary}</pre>
        <p>С уважением,<br/>Оргкомитет конференции</p>
      `
    });
    out.authorSent = true;
  } catch (e) {
    console.error('ОШИБКА отправки письма автору:', e);
    out.errors.push('author: ' + (e && e.message ? e.message : String(e)));
  }

  out.sent = out.organizerSent || out.authorSent;
  return out;
}
