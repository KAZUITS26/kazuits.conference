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

export async function sendEmails({ authorEmail, authorName, articleTitle, checkOk, checkSummary }) {
  const user = process.env.GMAIL_USER;
  const notifyEmail = process.env.NOTIFY_EMAIL || user;

  if (!user || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('GMAIL_USER / GMAIL_APP_PASSWORD не заданы — письма не отправлены');
    return { sent: false, reason: 'no_credentials' };
  }

  const transporter = getTransporter();

  const statusText = checkOk
    ? 'Статья прошла автоматическую проверку оформления и передана организаторам.'
    : 'В статье обнаружены несоответствия требованиям оформления. Пожалуйста, исправьте и загрузите статью повторно.';

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

  // Координатору (копия), только если статья прошла проверку
  if (notifyEmail && checkOk) {
    await transporter.sendMail({
      from: `Оргкомитет конференции <${user}>`,
      to: notifyEmail,
      subject: `Новая статья прошла проверку: ${articleTitle}`,
      html: `
        <p>Автор: ${authorName} (${authorEmail})</p>
        <p>Статья: ${articleTitle}</p>
        <p>Файлы и данные сохранены в базе (Supabase).</p>
      `
    });
  }

  return { sent: true };
}
