import crypto from 'crypto';

// Запись строк с данными заявок в Google Sheets через сервисный аккаунт.
// Никаких файлов сюда не попадает (файлы по-прежнему уходят вложениями на
// почту, см. lib/email.js) — таблица хранит только текстовые данные анкеты
// и результат проверки, чтобы было удобно посмотреть список заявок разом.

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function getAccessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // В переменных окружения перенос строки в приватном ключе обычно хранится
  // как буквальное "\n" — превращаем обратно в настоящий перенос строки.
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Не заданы GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Не удалось получить токен доступа Google: ${errText}`);
  }

  const data = await res.json();
  return data.access_token;
}

// row — обычный массив значений в порядке столбцов (см. использование в
// app/api/submit/route.js). Возвращает { added: true|false }, никогда не
// бросает исключение наружу — при ошибке просто логирует и продолжает.
export async function appendSubmissionRow(row) {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Заявки';

  if (!sheetId || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    console.warn('Google Sheets не настроен (GOOGLE_SHEET_ID / GOOGLE_SERVICE_ACCOUNT_*) — строка не добавлена');
    return { added: false, reason: 'not_configured' };
  }

  try {
    const token = await getAccessToken();
    const range = encodeURIComponent(`${sheetName}!A1`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ values: [row] })
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Ошибка записи строки в Google Sheets:', errText);
      return { added: false, reason: 'api_error' };
    }

    return { added: true };
  } catch (e) {
    console.error('Ошибка при обращении к Google Sheets:', e);
    return { added: false, reason: 'exception' };
  }
}
