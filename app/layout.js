import './globals.css';

export const metadata = {
  title: 'Регистрация на конференцию',
  description: 'Подача заявки и статьи для участия в научной конференции'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
