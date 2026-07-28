// ============================================================
//  /api/gemini-ask.js
//  Vercel serverless function — the ONLY place the Gemini API
//  key is ever used. The browser never sees it.
//
//  Set GEMINI_API_KEY as a Vercel Environment Variable
//  (Project Settings → Environment Variables) — NOT in config.js.
// ============================================================

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in this environment.');
    return res.status(500).json({ error: 'Server misconfigured: GEMINI_API_KEY is missing.' });
  }

  const { model, systemPrompt, contents, tools, generationConfig } = req.body || {};

  if (!model || !Array.isArray(contents)) {
    return res.status(400).json({ error: 'Request body must include "model" and "contents".' });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        ...(systemPrompt ? { system_instruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents,
        tools,
        generationConfig: generationConfig || { temperature: 0.3, maxOutputTokens: 800 },
      }),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('Gemini API error:', JSON.stringify(data));
      return res.status(geminiRes.status).json({ error: data });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('gemini-ask proxy failed:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
