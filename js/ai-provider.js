// ============================================================
//  MyScheduler — AI Provider (Google Gemini) + Chat History
//  Shared by ai.js (chatbot) and voice-bot.js (voice assistant)
// ============================================================

/* ============================================================
 *  AI AGENT TOOLS — function-calling declarations for Gemini.
 *  Each tool maps to a *Core function that already lives in
 *  app-v28.js (visitor) or owner-v28.js (owner). We never
 *  reimplement business logic here — only call it.
 * ============================================================ */
const AGENT_TOOLS = {
  visitor: [
    {
      name: 'getAvailableSlots',
      description: "Get open (unbooked) time slots for a given date. Defaults to today if no date given.",
      parameters: {
        type: 'OBJECT',
        properties: { date: { type: 'STRING', description: 'YYYY-MM-DD, optional' } },
      },
    },
    {
      name: 'getMyBookings',
      description: "Look up the visitor's own past and upcoming meeting requests by their email address.",
      parameters: {
        type: 'OBJECT',
        properties: { email: { type: 'STRING' } },
        required: ['email'],
      },
    },
    {
      name: 'bookMeeting',
      description: "Create a new meeting request for the visitor. Only call this once you have all required fields — ask the visitor for anything missing first.",
      parameters: {
        type: 'OBJECT',
        properties: {
          name:        { type: 'STRING' },
          email:       { type: 'STRING' },
          title:       { type: 'STRING', description: 'short meeting title' },
          description: { type: 'STRING', description: 'must be at least 25 characters' },
          date:        { type: 'STRING', description: 'YYYY-MM-DD' },
          start_time:  { type: 'STRING', description: 'HH:MM in 24-hour time' },
          end_time:    { type: 'STRING', description: 'HH:MM in 24-hour time' },
        },
        required: ['name', 'email', 'title', 'description', 'date', 'start_time', 'end_time'],
      },
    },
    {
      name: 'cancelMyMeeting',
      description: "Cancel one of the visitor's own meetings by its ID. DESTRUCTIVE — you must have already gotten the visitor's explicit yes/confirm in this conversation before calling this.",
      parameters: {
        type: 'OBJECT',
        properties: {
          meeting_id: { type: 'STRING' },
          reason:     { type: 'STRING' },
        },
        required: ['meeting_id'],
      },
    },
  ],

  owner: [
    {
      name: 'getPendingRequests',
      description: "List meeting requests awaiting the owner's approval.",
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'getTodaySchedule',
      description: "List today's approved meetings.",
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'findMeetings',
      description: "Search meetings by visitor name and/or status and/or date, to find a meeting_id before acting on it.",
      parameters: {
        type: 'OBJECT',
        properties: {
          visitor_name: { type: 'STRING' },
          status:       { type: 'STRING', description: 'pending | approved | rejected | cancelled | completed' },
          date:         { type: 'STRING', description: 'YYYY-MM-DD' },
        },
      },
    },
    {
      name: 'approveMeeting',
      description: "Approve a pending meeting request.",
      parameters: {
        type: 'OBJECT',
        properties: { meeting_id: { type: 'STRING' }, remarks: { type: 'STRING' } },
        required: ['meeting_id'],
      },
    },
    {
      name: 'rejectMeeting',
      description: "Reject a pending meeting request. DESTRUCTIVE — get explicit owner confirmation first.",
      parameters: {
        type: 'OBJECT',
        properties: { meeting_id: { type: 'STRING' } },
        required: ['meeting_id'],
      },
    },
    {
      name: 'cancelMeeting',
      description: "Cancel a pending or approved meeting. DESTRUCTIVE — get explicit owner confirmation first, and always ask for a reason if one wasn't given.",
      parameters: {
        type: 'OBJECT',
        properties: { meeting_id: { type: 'STRING' }, reason: { type: 'STRING' } },
        required: ['meeting_id', 'reason'],
      },
    },
    {
      name: 'rescheduleMeeting',
      description: "Suggest a new date/time for a meeting. Sends the visitor a reschedule proposal to confirm.",
      parameters: {
        type: 'OBJECT',
        properties: {
          meeting_id:     { type: 'STRING' },
          new_date:       { type: 'STRING', description: 'YYYY-MM-DD' },
          new_start_time: { type: 'STRING', description: 'HH:MM 24-hour' },
          new_end_time:   { type: 'STRING', description: 'HH:MM 24-hour' },
          reason:         { type: 'STRING' },
        },
        required: ['meeting_id', 'new_date', 'new_start_time', 'new_end_time'],
      },
    },
    {
      name: 'addSlot',
      description: "Create a new open/available time slot.",
      parameters: {
        type: 'OBJECT',
        properties: {
          date:       { type: 'STRING', description: 'YYYY-MM-DD' },
          start_time: { type: 'STRING', description: 'HH:MM 24-hour' },
          end_time:   { type: 'STRING', description: 'HH:MM 24-hour' },
        },
        required: ['date', 'start_time', 'end_time'],
      },
    },
    {
      name: 'blockSlot',
      description: "Block a slot so visitors can't book it. DESTRUCTIVE for that slot's availability — get explicit owner confirmation first.",
      parameters: {
        type: 'OBJECT',
        properties: { slot_id: { type: 'STRING' } },
        required: ['slot_id'],
      },
    },
    {
      name: 'deleteSlot',
      description: "Permanently delete a slot. DESTRUCTIVE — get explicit owner confirmation first.",
      parameters: {
        type: 'OBJECT',
        properties: { slot_id: { type: 'STRING' } },
        required: ['slot_id'],
      },
    },
  ],
};

/* ── Tool dispatcher — executes the real app functions ───────── */
async function executeAgentTool(name, args = {}, userType) {
  try {
    switch (name) {
      /* ---- visitor tools ---- */
      case 'getAvailableSlots': {
        const date = args.date || getTodayStr();
        const { data: slots, error } = await db.from('slots')
          .select('*').eq('date', date).eq('status', 'available').order('start_time');
        if (error) return { error: error.message };
        const available = (slots || []).filter(s => !isSlotPast(date, s.end_time));
        return { date, slots: available.map(s => ({ start: s.start_time, end: s.end_time })) };
      }

      case 'getMyBookings': {
        if (!args.email) return { error: 'Email is required.' };
        const { data, error } = await db.from('meetings')
          .select('*').eq('email', args.email).order('date', { ascending: false });
        if (error) return { error: error.message };
        return {
          bookings: (data || []).map(m => ({
            id: m.id, title: m.meeting_title, date: m.date,
            start: m.start_time, end: m.end_time, status: m.status,
          })),
        };
      }

      case 'bookMeeting': {
        if (typeof window.createBookingCore !== 'function') return { error: 'Booking function not available on this page.' };
        const meeting = await window.createBookingCore({
          name: args.name, email: args.email, title: args.title,
          desc: args.description, date: args.date, start: args.start_time, end: args.end_time,
        });
        return { success: true, meeting_id: meeting.id, status: 'pending' };
      }

      case 'cancelMyMeeting': {
        if (typeof window.cancelBookingCoreVisitor !== 'function') return { error: 'Cancel function not available on this page.' };
        await window.cancelBookingCoreVisitor(args.meeting_id, args.reason || '');
        return { success: true };
      }

      /* ---- owner tools ---- */
      case 'getPendingRequests': {
        const { data, error } = await db.from('meetings').select('*').eq('status', 'pending');
        if (error) return { error: error.message };
        return {
          requests: (data || []).map(m => ({
            id: m.id, name: m.visitor_name, title: m.meeting_title,
            date: m.date, start: m.start_time, end: m.end_time,
          })),
        };
      }

      case 'getTodaySchedule': {
        const today = getTodayStr();
        const { data, error } = await db.from('meetings')
          .select('*').eq('date', today).eq('status', 'approved').order('start_time');
        if (error) return { error: error.message };
        return {
          meetings: (data || []).map(m => ({
            id: m.id, name: m.visitor_name, title: m.meeting_title, start: m.start_time, end: m.end_time,
          })),
        };
      }

      case 'findMeetings': {
        let query = db.from('meetings').select('*');
        if (args.status)       query = query.eq('status', args.status);
        if (args.date)         query = query.eq('date', args.date);
        const { data, error } = await query;
        if (error) return { error: error.message };
        let rows = data || [];
        if (args.visitor_name) {
          const q = args.visitor_name.toLowerCase();
          rows = rows.filter(m => m.visitor_name.toLowerCase().includes(q));
        }
        return {
          matches: rows.slice(0, 15).map(m => ({
            id: m.id, name: m.visitor_name, title: m.meeting_title,
            date: m.date, start: m.start_time, end: m.end_time, status: m.status,
          })),
        };
      }

      case 'approveMeeting': {
        if (typeof window.approveMeetingCore !== 'function') return { error: 'Approve function not available on this page.' };
        await window.approveMeetingCore(args.meeting_id, args.remarks || '');
        return { success: true };
      }

      case 'rejectMeeting': {
        if (typeof window.rejectMeetingCore !== 'function') return { error: 'Reject function not available on this page.' };
        await window.rejectMeetingCore(args.meeting_id);
        return { success: true };
      }

      case 'cancelMeeting': {
        if (typeof window.cancelMeetingCore !== 'function') return { error: 'Cancel function not available on this page.' };
        await window.cancelMeetingCore(args.meeting_id, args.reason);
        return { success: true };
      }

      case 'rescheduleMeeting': {
        if (typeof window.rescheduleMeetingCore !== 'function') return { error: 'Reschedule function not available on this page.' };
        await window.rescheduleMeetingCore(args.meeting_id, args.new_date, args.new_start_time, args.new_end_time, args.reason || '');
        return { success: true };
      }

      case 'addSlot': {
        if (typeof window.addSlotCore !== 'function') return { error: 'Add-slot function not available on this page.' };
        await window.addSlotCore(args.date, args.start_time, args.end_time);
        return { success: true };
      }

      case 'blockSlot': {
        if (typeof window.blockSlotCore !== 'function') return { error: 'Block-slot function not available on this page.' };
        await window.blockSlotCore(args.slot_id);
        return { success: true };
      }

      case 'deleteSlot': {
        if (typeof window.deleteSlotCore !== 'function') return { error: 'Delete-slot function not available on this page.' };
        await window.deleteSlotCore(args.slot_id);
        return { success: true };
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

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

  /* ── Gemini Call (with function-calling agent loop) ─────────── */
  async ask(userType, question, conversationHistory = []) {
    if (!CONFIG.GEMINI_API_KEY) {
      return "AI answers aren't fully set up yet — add your GEMINI_API_KEY in config.js. Meanwhile, try one of the suggested questions or the built-in commands.";
    }

    try {
      const context = await this.getInternalContext(userType);

      const agentRules = `
You are also an ACTION AGENT, not just a chatbot. You have tools (functions) that let you actually perform ${userType === 'owner' ? "owner dashboard actions (approve, reject, reschedule, cancel, mark completed, add/block/delete slots)" : "visitor actions (book a meeting, cancel your own meeting, look up your bookings)"}.

Rules for using tools:
- Prefer calling a tool over just describing what the user could do manually.
- If required details are missing (e.g. date/time/email/description), ask a short follow-up question for ONLY the missing piece(s) — don't re-ask for things already given in this conversation.
- Before calling any tool whose description says DESTRUCTIVE, you must first ask the user to explicitly confirm (e.g. "Cancel John's 3 PM meeting — confirm?") and wait for their next message to say yes/confirm. Only call the tool after that confirmation appears in the conversation.
- When you don't know a meeting_id or slot_id yet, first call a lookup tool (getPendingRequests / findMeetings / getAvailableSlots) to find it, then act.
- After a tool call succeeds, tell the user plainly what happened in 1-2 sentences — don't just repeat the raw tool result.
- If a tool returns an error, explain it briefly and suggest what to try instead (e.g. a different time slot).
- Never invent a meeting_id, slot_id, date, or time — only use values that came from the user or from a tool result.`;

      const systemPrompt = userType === 'owner'
        ? `You are the AI assistant embedded in the owner's dashboard of "MyScheduler", a meeting scheduling web app belonging to ${CONFIG.OWNER_NAME}. You can see live data from the app below — use it to answer accurately. If asked something unrelated to the app, still answer helpfully like a normal general-purpose assistant. Be concise (usually under 100 words), use plain text (no markdown headers), and use short bullet lines with "•" when listing multiple items.
${agentRules}

LIVE DASHBOARD DATA:
${context}`
        : `You are the AI assistant on the public booking page of "MyScheduler", a meeting scheduling web app. Visitors use this page to book meetings with ${CONFIG.OWNER_NAME}. You can see live data from the app below — use it to answer accurately. If asked something unrelated to the app, still answer helpfully like a normal general-purpose assistant. Be concise (usually under 100 words), use plain text (no markdown headers), and use short bullet lines with "•" when listing multiple items.
${agentRules}

LIVE BOOKING DATA:
${context}`;

      // Include recent turns for conversational continuity
      const contents = conversationHistory.slice(-8).map(h => ({
        role: h.role === 'ai' ? 'model' : 'user',
        parts: [{ text: h.message }],
      }));
      contents.push({ role: 'user', parts: [{ text: question }] });

      const tools = [{ functionDeclarations: AGENT_TOOLS[userType] || [] }];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent`;

      // Function-calling loop: model may call tools, we execute them and feed
      // results back, until it produces a final plain-text answer.
      let finalText = null;
      const MAX_TURNS = 5;

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': CONFIG.GEMINI_API_KEY,
          },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents,
            tools,
            generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('Gemini API error:', errText);
          return "I couldn't reach the AI service just now. Please try again in a moment.";
        }

        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const functionCalls = parts.filter(p => p.functionCall);

        if (functionCalls.length === 0) {
          finalText = parts.map(p => p.text || '').join('').trim();
          break;
        }

        // Record the model's function-call turn
        contents.push({ role: 'model', parts });

        // Execute every requested tool call and feed results back
        const responseParts = [];
        for (const fc of functionCalls) {
          const { name, args } = fc.functionCall;
          const result = await executeAgentTool(name, args || {}, userType);
          responseParts.push({ functionResponse: { name, response: result } });
        }
        contents.push({ role: 'function', parts: responseParts });
        // loop again so the model can turn the tool result into a reply
      }

      return finalText || "I've run into trouble finishing that action — could you try rephrasing?";
    } catch (err) {
      console.error('Gemini call failed:', err);
      return "⚠️ Sorry, I couldn't process that right now.";
    }
  },
};
