import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/requirements';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { messages } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ИИ-ассистент временно недоступен (не задан ключ API).' },
        { status: 500 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Пустое сообщение.' }, { status: 400 });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: messages.map(m => ({ role: m.role, content: m.content }))
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return NextResponse.json({ error: 'Ошибка при обращении к ИИ-ассистенту.' }, { status: 502 });
    }

    const data = await response.json();
    const text = data.content?.map(c => c.text || '').join('\n') || 'Извините, не удалось сформировать ответ.';

    return NextResponse.json({ reply: text });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера.' }, { status: 500 });
  }
}
