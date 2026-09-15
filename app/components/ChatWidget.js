'use client';

import { useState, useRef, useEffect } from 'react';

function ArayAvatar({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 130 130" xmlns="http://www.w3.org/2000/svg">
      <circle cx="65" cy="65" r="65" fill="#E9E4D8" />
      <g fill="#C9A667">
        <circle cx="65" cy="65" r="16" />
        <path d="M65 20 L71 40 L65 48 L59 40 Z" />
        <path d="M65 110 L71 90 L65 82 L59 90 Z" />
        <path d="M20 65 L40 59 L48 65 L40 71 Z" />
        <path d="M110 65 L90 71 L82 65 L90 59 Z" />
        <path d="M33 33 L48 42 L48 50 L40 48 Z" />
        <path d="M97 97 L82 88 L82 80 L90 82 Z" />
        <path d="M97 33 L82 42 L82 50 L90 48 Z" />
        <path d="M33 97 L48 88 L48 80 L40 82 Z" />
      </g>
      <circle cx="65" cy="65" r="8" fill="#B03A4A" />
    </svg>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Сәлем! Я Арай, ИИ-ассистент конференции. Спросите меня о требованиях к оформлению статьи или заявки.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(m => [...m, { role: 'assistant', content: data.error || 'Произошла ошибка, попробуйте позже.' }]);
      }
    } catch {
      setMessages(m => [...m, { role: 'assistant', content: 'Не удалось связаться с сервером. Попробуйте позже.' }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <button className="chat-fab" onClick={() => setOpen(o => !o)} aria-label="Открыть чат">
        {open ? '✕' : <ArayAvatar size={30} />}
      </button>

      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <ArayAvatar size={26} />
            <span>Арай — ИИ-ассистент конференции</span>
          </div>
          <div className="chat-body" ref={scrollRef}>
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.role === 'user' ? 'chat-msg-user' : 'chat-msg-bot'}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="chat-msg chat-msg-bot">Печатает…</div>}
          </div>
          <div className="chat-input-row">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Спросите про оформление статьи…"
              rows={1}
            />
            <button onClick={send} disabled={loading}>➤</button>
          </div>
        </div>
      )}
    </>
  );
}
