import { NextResponse } from 'next/server';
import { SYSTEM_PROMPT } from '@/lib/requirements';

export const runtime = 'nodejs';

export async function POST(req) {
  try {
    const { messages } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ИИ-ассистент временно недоступен (не задан ключ API).' },
        { status: 500 }
      );
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Пустое сообщение.' }, { status: 400 });
    }

    // Gemini не различает системную роль в истории — передаём системный
    // промпт отдельным полем systemInstruction, а историю переводим в
    // формат Gemini: role "model" вместо "assistant", поле "parts" вместо "content".
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const model = 'gemini-3.6-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          },
          contents,
          generationConfig: {
            maxOutputTokens: 700
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', errText);
      return NextResponse.json({ error: 'Ошибка при обращении к ИИ-ассистенту.' }, { status: 502 });
    }

    const data = await response.json();
    const text =
      data.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') ||
      'Извините, не удалось сформировать ответ.';

    return NextResponse.json({ reply: text });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Внутренняя ошибка сервера.' }, { status: 500 });
  }
}
