'use client';

import { useState } from 'react';

export default function RegisterPage() {
  const [submitting, setSubmitting] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResponse(null);

    const form = e.target;
    const data = new FormData(form);

    try {
      const res = await fetch('/api/submit', { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Ошибка отправки');
      } else {
        setResponse(json);
      }
    } catch (err) {
      setError('Не удалось отправить форму. Проверьте соединение и попробуйте снова.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container">
      <h1>Регистрация и подача статьи</h1>
      <p className="lead">Поля, отмеченные *, обязательны для заполнения.</p>

      <form className="card" onSubmit={handleSubmit}>
        <h2>Данные автора</h2>

        <label>ФИО первого автора *</label>
        <input type="text" name="fullName" required placeholder="Иванов Иван Иванович" />

        <div className="two-col">
          <div>
            <label>Email *</label>
            <input type="email" name="email" required />
          </div>
          <div>
            <label>Телефон</label>
            <input type="tel" name="phone" />
          </div>
        </div>

        <label>Учёная степень / звание</label>
        <input type="text" name="degree" placeholder="кандидат технических наук" />

        <label>Организация *</label>
        <input type="text" name="organization" required />

        <div className="two-col">
          <div>
            <label>Город *</label>
            <input type="text" name="city" required />
          </div>
          <div>
            <label>Страна *</label>
            <input type="text" name="country" required />
          </div>
        </div>

        <h2 style={{ marginTop: 28 }}>Статья</h2>

        <label>Название статьи *</label>
        <input type="text" name="articleTitle" required />

        <label>Секция / направление конференции</label>
        <input type="text" name="section" />

        <label>Файл заявки (docx)</label>
        <input type="file" name="applicationFile" accept=".docx" />
        <div className="file-hint">Формат имени: «Заявка Фамилия И.О..docx». Файл будет проверен на корректность и заполненность.</div>

        <label>Файл статьи (docx) *</label>
        <input type="file" name="articleFile" accept=".docx" required />
        <div className="file-hint">Формат имени: «Статья Фамилия И.О. Тема.docx»</div>

        <button className="submit" type="submit" disabled={submitting}>
          {submitting ? 'Проверяем и отправляем…' : 'Отправить заявку'}
        </button>
      </form>

      {error && <div className="status-banner status-bad">{error}</div>}

      {response && (
        <div className="card">
          <div className={`status-banner ${response.ok ? 'status-ok' : 'status-bad'}`}>
            {response.ok
              ? 'Статья прошла проверку оформления и передана организаторам.'
              : 'Статья не прошла проверку оформления. Исправьте замечания ниже и загрузите файл повторно.'}
          </div>
          <ul className="result-list">
            {response.results?.map((r, i) => (
              <li
                key={i}
                className={
                  r.severity === 'manual'
                    ? 'result-manual'
                    : r.ok
                    ? 'result-ok'
                    : 'result-bad'
                }
              >
                {r.severity === 'manual' ? '⚠️ ' : r.ok ? '✅ ' : '❌ '}
                <strong>{r.label}</strong> — {r.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
