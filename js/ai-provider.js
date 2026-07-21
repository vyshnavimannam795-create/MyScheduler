// ============================================================
//  MyScheduler — AI Provider (Google Gemini) + Chat History
//  Shared by ai.js (chatbot) and voice-bot.js (voice assistant)
// ============================================================

const AI_PROVIDER = {

  /* ── Session Management ─────────────────────────────────── */
  // One persistent session id per (botType) per browser, so history
  // survives page reloads. "New Chat" starts a fresh session.
  getSessionId(botType) {
    const key = `ms_${botType}_session`;
    let id = localStorage.getItem(key);
    if (!id) {
      id = this._genId();
      localStorage.setItem(key, id);
    }
    return id;
  },

  newSession(botType) {
    const key = `ms_${botType}_session`;
    const id = this._genId();
    localStorage.setItem(key, id);
    return id;
  },

  _genId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  },

  /* ── History Persistence (Supabase) ─────────────────────── */
  async logMessage({ sessionId, botType, userType, role, message }) {
    try {
      if (!db || !message) return;
      await db.from('chat_messages').insert({
        session_id: sessionId,
        bot_type:   botType,
        user_type:  userType,
        role,
        message:    String(message).slice(0, 8000),
      });
    } catch (err) {
      console.warn('Chat log failed:', err);
    }
  },

  async loadHistory(sessionId, botType) {
    try {
      if (!db) return [];
      const { data, error } = await db.from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .eq('bot_type', botType)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('Load chat history failed:', err);
      return [];
    }
  },

  /* ── Internal Website Context (so AI can answer real questions) ─ */
  async getInternalContext(userType) {
    try {
      const today = getTodayStr();

      if (userType === 'visitor') {
        const { data: slots } = await db.from('slots')
          .select('*').eq('date', today).eq('status', 'available')
          .order('start_time');
        const available = (slots || []).filter(s => !isSlotPast(s.date, s.end_time));

        return `Today's date: ${today}
Owner: ${CONFIG.OWNER_NAME}
Available slots today: ${available.length ? available.map(s => formatTimeRange(s.start_time, s.end_time)).join(', ') : 'none left'}
Booking policy:
${CONFIG.BOOKING_POLICY}`;
      }

      // Owner context
      const { data: meetings } = await db.from('meetings')
        .select('status, date, start_time, end_time, visitor_name, meeting_title');
      const m = meetings || [];
      const counts = { pending: 0, approved: 0, completed: 0, cancelled: 0, rejected: 0 };
      m.forEach(x => { if (counts[x.status] !== undefined) counts[x.status]++; });

      const todaysApproved = m.filter(x => x.date === today && x.status === 'approved');
      const pendingList = m.filter(x => x.status === 'pending').slice(0, 10);

      return `Today's date: ${today}
Owner: ${CONFIG.OWNER_NAME}
Dashboard totals — total: ${m.length}, pending: ${counts.pending}, approved: ${counts.approved}, completed: ${counts.completed}, cancelled: ${counts.cancelled}, rejected: ${counts.rejected}
Today's approved meetings: ${todaysApproved.length ? todaysApproved.map(x => `${x.visitor_name} (${formatTimeRange(x.start_time, x.end_time)})`).join('; ') : 'none'}
Pending requests (up to 10): ${pendingList.length ? pendingList.map(x => `${x.visitor_name} - "${x.meeting_title}" on ${formatDateShort(x.date)}`).join('; ') : 'none'}`;
    } catch (err) {
      console.warn('Context build failed:', err);
      return '';
    }
  },

  /* ── Gemini Call ─────────────────────────────────────────── */
  async ask(userType, question, conversationHistory = []) {
    if (!CONFIG.GEMINI_API_KEY) {
      return "AI answers aren't fully set up yet — add your GEMINI_API_KEY in config.js. Meanwhile, try one of the suggested questions or the built-in commands.";
    }

    try {
      const context = await this.getInternalContext(userType);

      const systemPrompt = userType === 'owner'
        ? `You are the AI assistant embedded in the owner's dashboard of "MyScheduler", a meeting scheduling web app belonging to ${CONFIG.OWNER_NAME}. You can see live data from the app below — use it to answer accurately. If asked something unrelated to the app, still answer helpfully like a normal general-purpose assistant. Be concise (usually under 100 words), use plain text (no markdown headers), and use short bullet lines with "•" when listing multiple items.

LIVE DASHBOARD DATA:
${context}`
        : `You are the AI assistant on the public booking page of "MyScheduler", a meeting scheduling web app. Visitors use this page to book meetings with ${CONFIG.OWNER_NAME}. You can see live data from the app below — use it to answer accurately. If asked something unrelated to the app, still answer helpfully like a normal general-purpose assistant. Be concise (usually under 100 words), use plain text (no markdown headers), and use short bullet lines with "•" when listing multiple items.

LIVE BOOKING DATA:
${context}`;

      // Include recent turns for conversational continuity
      const contents = conversationHistory.slice(-8).map(h => ({
        role: h.role === 'ai' ? 'model' : 'user',
        parts: [{ text: h.message }],
      }));
      contents.push({ role: 'user', parts: [{ text: question }] });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent?key=${CONFIG.GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { temperature: 0.6, maxOutputTokens: 400 },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error('Gemini API error:', errText);
        return "I couldn't reach the AI service just now. Please try again in a moment.";
      }

      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim();
      return text || "I'm not sure how to answer that — could you rephrase?";
    } catch (err) {
      console.error('Gemini call failed:', err);
      return "⚠️ Sorry, I couldn't process that right now.";
    }
  },
};
