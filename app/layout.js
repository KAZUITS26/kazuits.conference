import './globals.css';
import ChatWidget from './components/ChatWidget';

export const metadata = {
  title: 'Регистрация на конференцию',
  description: 'Подача заявки и статьи для участия в научной конференции'
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <ChatWidget />
      </body>
    </html>
  );
}
