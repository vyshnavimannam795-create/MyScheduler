// ============================================================
//  MyScheduler — /api/chat  (Vercel Serverless Function)
//  Server-side proxy to Google Gemini so the API key never
//  reaches the browser. Deploy this file at:  /api/chat.js
//
//  Set the environment variable in your Vercel project:
//    GEMINI_API_KEY   — from https://aistudio.google.com/app/apikey
//    GEMINI_MODEL     — optional, defaults to gemini-2.0-flash
// ============================================================

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Missing GEMINI_API_KEY environment variable on the server.' });
  }

  const { system, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'A non-empty "messages" array is required.' });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

  // Gemini expects role: 'user' | 'model' (not 'assistant')
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }));

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return res.status(502).json({ error: 'Gemini API request failed.' });
    }

    const data = await geminiRes.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    return res.status(200).json({
      reply: reply || "Sorry, I couldn't come up with an answer for that — could you try rephrasing?",
    });
  } catch (err) {
    console.error('Chat proxy error:', err);
    return res.status(500).json({ error: 'Internal server error while contacting Gemini.' });
  }
};
