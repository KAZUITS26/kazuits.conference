import nodemailer from 'nodemailer';

function getTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error('Не заданы GMAIL_USER / GMAIL_APP_PASSWORD');
  }
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
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
  const user = process.env.GMAIL_USER;
  // По умолчанию копия с материалами уходит на konferencia.edu@gmail.com,
  // если в переменной окружения NOTIFY_EMAIL не указан другой адрес.
  const notifyEmail = process.env.NOTIFY_EMAIL || 'konferencia.edu@gmail.com';

  if (!user || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_USER / GMAIL_APP_PASSWORD не заданы — письма не отправлены');
    return { sent: false, reason: 'no_credentials' };
  }

  const transporter = getTransporter();

  const statusText = checkOk
    ? 'Статья прошла автоматическую проверку оформления и передана организаторам.'
    : 'В статье обнаружены несоответствия требованиям оформления. Пожалуйста, исправьте и загрузите статью повторно.';

  const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // Автору
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

  // Организатору (konferencia.edu@gmail.com) — только если статья прошла проверку,
  // вместе с файлами заявки и статьи вложениями. Никакие данные при этом
  // не сохраняются в какой-либо базе данных — только пересылаются письмом.
  if (notifyEmail && checkOk) {
    const attachments = [];
    if (articleBuffer) {
      attachments.push({ filename: articleFileName || 'Статья.docx', content: articleBuffer, contentType: docxMime });
    }
    if (applicationBuffer) {
      attachments.push({ filename: applicationFileName || 'Заявка.docx', content: applicationBuffer, contentType: docxMime });
    }

    await transporter.sendMail({
      from: `Оргкомитет конференции <${user}>`,
      to: notifyEmail,
      subject: `Новая статья прошла проверку: ${articleTitle}`,
      html: `
        <p>Автор: ${authorName} (${authorEmail})</p>
        <p>Организация: ${organization || '—'}, ${city || ''}${city && country ? ', ' : ''}${country || ''}</p>
        <p>Учёная степень: ${degree || '—'}</p>
        <p>Телефон: ${phone || '—'}</p>
        <p>Секция: ${section || '—'}</p>
        <p>Статья: ${articleTitle}</p>
        <p>Во вложении — файл(ы) заявки и статьи, прошедшей автоматическую проверку оформления.</p>
        <pre style="white-space:pre-wrap;font-family:monospace;background:#f5f5f5;padding:12px;border-radius:6px;">${checkSummary}</pre>
      `,
      attachments
    });
  }

  return { sent: true };
}
