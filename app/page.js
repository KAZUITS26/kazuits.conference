import Link from 'next/link';

export default function Home() {
  return (
    <div className="container">
      <h1>Научная конференция</h1>
      <p className="lead">
        Регистрация участников и приём статей. Загрузите файл статьи — система автоматически
        проверит соответствие требованиям к оформлению. Если всё в порядке, статья будет
        передана организаторам и сохранена в базе, а вам придёт письмо с результатом.
      </p>
      <div className="card">
        <h2>Готовы подать заявку?</h2>
        <p className="lead">Подготовьте два файла: «Заявка Фамилия И.О..docx» и «Статья Фамилия И.О. Тема.docx».</p>
        <Link href="/register">
          <button className="submit">Перейти к регистрации</button>
        </Link>
      </div>
    </div>
  );
}
