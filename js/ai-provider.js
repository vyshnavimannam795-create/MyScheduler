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
      description: "Get open (unbooked) time slots for a given date or a range of dates. Useful for finding available times and suggesting alternatives if a specific slot is unavailable.",
      parameters: {
        type: 'OBJECT',
        properties: { 
          date: { type: 'STRING', description: 'YYYY-MM-DD, optional single date' },
          start_date: { type: 'STRING', description: 'YYYY-MM-DD, optional range start' },
          end_date: { type: 'STRING', description: 'YYYY-MM-DD, optional range end' }
        },
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
      description: "Create a new meeting request for the visitor. Only call this once you have all required fields — ask the visitor for anything missing first. If the slot is unavailable, suggest other slots instead.",
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
      name: 'completeMeeting',
      description: "Mark an approved meeting as completed. You can optionally capture meeting minutes, action items, owner remarks, and a follow-up date.",
      parameters: {
        type: 'OBJECT',
        properties: {
          meeting_id: { type: 'STRING' },
          minutes:    { type: 'STRING', description: 'Meeting minutes/notes' },
          actions:    { type: 'STRING', description: 'Action items' },
          remarks:    { type: 'STRING', description: 'Owner remarks' },
          followup:   { type: 'STRING', description: 'YYYY-MM-DD for follow-up' },
        },
        required: ['meeting_id'],
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

// Caching structure to minimize database queries
let _contextCache = {
  visitor: null,
  owner: null,
  visitorTime: 0,
  ownerTime: 0
};

function invalidateContextCache() {
  _contextCache.visitor = null;
  _contextCache.owner = null;
  _contextCache.visitorTime = 0;
  _contextCache.ownerTime = 0;
}

// Trigger browser component updates immediately
async function refreshClientUI(userType, email = '') {
  try {
    if (userType === 'visitor') {
      if (typeof window.loadSlots === 'function') await window.loadSlots();
      if (typeof window.renderCalendar === 'function') await window.renderCalendar();
      if (typeof window.loadPastRequests === 'function' && email) {
        await window.loadPastRequests(email);
      }
    } else {
      if (typeof window.loadMeetings === 'function') await window.loadMeetings();
      if (typeof window.loadStats === 'function') await window.loadStats();
      if (typeof window.loadActivity === 'function') await window.loadActivity();
      if (typeof window.renderTable === 'function') window.renderTable();
      if (typeof window.loadSlotsView === 'function') await window.loadSlotsView();
    }
  } catch (err) {
    console.warn('UI refresh warning:', err);
  }
}

/* ── Tool dispatcher — executes the real app functions ───────── */
async function executeAgentTool(name, args = {}, userType) {
  try {
    // Any modification invalidates context cache immediately
    if (name !== 'getAvailableSlots' && name !== 'getMyBookings' && name !== 'getPendingRequests' && name !== 'getTodaySchedule' && name !== 'findMeetings') {
      invalidateContextCache();
    }

    switch (name) {
      /* ---- visitor tools ---- */
      case 'getAvailableSlots': {
        let query = db.from('slots').select('*').eq('status', 'available');
        let selectedDate = args.date;
        if (args.start_date && args.end_date) {
          query = query.gte('date', args.start_date).lte('date', args.end_date);
          selectedDate = `${args.start_date} to ${args.end_date}`;
        } else {
          selectedDate = args.date || getTodayStr();
          query = query.eq('date', selectedDate);
        }
        const { data: slots, error } = await query.order('date').order('start_time');
        if (error) return { error: error.message };
        const available = (slots || []).filter(s => !isSlotPast(s.date, s.end_time));
        return { 
          date: selectedDate, 
          slots: available.map(s => ({ id: s.id, date: s.date, start: s.start_time, end: s.end_time })) 
        };
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
        await refreshClientUI('visitor', args.email);
        return { success: true, meeting_id: meeting.id, status: 'pending' };
      }

      case 'cancelMyMeeting': {
        if (typeof window.cancelBookingCoreVisitor !== 'function') return { error: 'Cancel function not available on this page.' };
        await window.cancelBookingCoreVisitor(args.meeting_id, args.reason || '');
        await refreshClientUI('visitor');
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
        await refreshClientUI('owner');
        return { success: true };
      }

      case 'rejectMeeting': {
        if (typeof window.rejectMeetingCore !== 'function') return { error: 'Reject function not available on this page.' };
        await window.rejectMeetingCore(args.meeting_id);
        await refreshClientUI('owner');
        return { success: true };
      }

      case 'cancelMeeting': {
        if (typeof window.cancelMeetingCore !== 'function') return { error: 'Cancel function not available on this page.' };
        await window.cancelMeetingCore(args.meeting_id, args.reason);
        await refreshClientUI('owner');
        return { success: true };
      }

      case 'rescheduleMeeting': {
        if (typeof window.rescheduleMeetingCore !== 'function') return { error: 'Reschedule function not available on this page.' };
        await window.rescheduleMeetingCore(args.meeting_id, args.new_date, args.new_start_time, args.new_end_time, args.reason || '');
        await refreshClientUI('owner');
        return { success: true };
      }

      case 'completeMeeting': {
        if (typeof window.completeMeetingCore !== 'function') return { error: 'Complete function not available on this page.' };
        await window.completeMeetingCore(args.meeting_id, {
          minutes: args.minutes || '',
          actions: args.actions || '',
          remarks: args.remarks || '',
          followup: args.followup || null
        });
        await refreshClientUI('owner');
        return { success: true };
      }

      case 'addSlot': {
        if (typeof window.addSlotCore !== 'function') return { error: 'Add-slot function not available on this page.' };
        await window.addSlotCore(args.date, args.start_time, args.end_time);
        await refreshClientUI('owner');
        return { success: true };
      }

      case 'blockSlot': {
        if (typeof window.blockSlotCore !== 'function') return { error: 'Block-slot function not available on this page.' };
        await window.blockSlotCore(args.slot_id);
        await refreshClientUI('owner');
        return { success: true };
      }

      case 'deleteSlot': {
        if (typeof window.deleteSlotCore !== 'function') return { error: 'Delete-slot function not available on this page.' };
        await window.deleteSlotCore(args.slot_id);
        await refreshClientUI('owner');
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
    const now = Date.now();
    // Cache check
    if (_contextCache[userType] && (now - _contextCache[userType + 'Time'] < 30000)) {
      return _contextCache[userType];
    }

    try {
      const today = getTodayStr();

      if (userType === 'visitor') {
        // Fetch next 7 days of slots for multi-day context
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split('T')[0];

        const { data: slots } = await db.from('slots')
          .select('*')
          .gte('date', today)
          .lte('date', nextWeekStr)
          .eq('status', 'available')
          .order('date')
          .order('start_time');
          
        const available = (slots || []).filter(s => !isSlotPast(s.date, s.end_time));

        const context = `Today's date: ${today} (current time is ${getCurrentTimeStr()})
Owner Name: ${CONFIG.OWNER_NAME}
Available slots for the next 7 days:
${available.length ? available.map(s => `${s.date}: ${formatTimeRange(s.start_time, s.end_time)}`).join('\n') : 'none left'}
Booking policy:
${CONFIG.BOOKING_POLICY}`;

        _contextCache.visitor = context;
        _contextCache.visitorTime = now;
        return context;
      }

      // Owner context
      const { data: meetings } = await db.from('meetings')
        .select('status, date, start_time, end_time, visitor_name, meeting_title');
      const m = meetings || [];
      const counts = { pending: 0, approved: 0, completed: 0, cancelled: 0, rejected: 0 };
      m.forEach(x => { if (counts[x.status] !== undefined) counts[x.status]++; });

      const todaysApproved = m.filter(x => x.date === today && x.status === 'approved');
      const pendingList = m.filter(x => x.status === 'pending').slice(0, 15);

      const context = `Today's date: ${today} (current time is ${getCurrentTimeStr()})
Owner Name: ${CONFIG.OWNER_NAME}
Dashboard totals — total: ${m.length}, pending: ${counts.pending}, approved: ${counts.approved}, completed: ${counts.completed}, cancelled: ${counts.cancelled}, rejected: ${counts.rejected}
Today's approved meetings: ${todaysApproved.length ? todaysApproved.map(x => `${x.visitor_name} (${formatTimeRange(x.start_time, x.end_time)})`).join('; ') : 'none'}
Pending requests (up to 15): ${pendingList.length ? pendingList.map(x => `${x.visitor_name} - "${x.meeting_title}" on ${formatDateShort(x.date)} (${formatTimeRange(x.start_time, x.end_time)}) [ID: ${x.id}]`).join('\n') : 'none'}`;

      _contextCache.owner = context;
      _contextCache.ownerTime = now;
      return context;
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
You are a highly capable ACTION AGENT, not just a conversational chatbot. You have tools (functions) that allow you to interact directly with the scheduling system.
You MUST execute the host's backend logic to perform actions, rather than just telling the user how to do it.

IMPORTANT ACTION AND REASONING RULES:
1. **Understand Intent & Multi-Step Actions**:
   - Users might speak or write in descriptive, unstructured natural language (e.g. "I want to schedule an hour with Vyshnavi next Wednesday afternoon to review my thesis proposal").
   - Extract required parameters: Name, Email, Title, Description (min 25 chars), Date, Start Time, End Time.
   - For relative dates/times, resolve them contextually based on the current date (${getTodayStr()}).
2. **Handle Slot Unavailability & Suggest Alternatives**:
   - If a user requests a specific date/time slot that is unavailable, call "getAvailableSlots" with a range of dates around the requested date.
   - Summarize why the requested slot is unavailable and list the nearest available alternative slots (include date and time range formatted nicely). Ask the user to choose one of those alternatives.
3. **Handle Missing Details & Follow-up Questions**:
   - If required details for booking are missing (e.g. name, email, or meeting description is too short), ask a single, clear follow-up question for only the missing items. Do NOT request information already supplied in the conversation history.
4. **Enforce Confirmation Before Destructive Actions**:
   - DESTRUCTIVE tools are: cancelMyMeeting, cancelMeeting, rejectMeeting, deleteSlot, blockSlot.
   - Before executing any destructive tool, you MUST explicitly ask the user for confirmation (e.g., "Would you like to confirm the cancellation of John's meeting on July 30th?"). Only execute the tool after they respond with yes/confirm/proceed in their next message.
5. **Lookup Before Action**:
   - If you do not have a meeting_id or slot_id, call the appropriate search or lookup tool (findMeetings, getPendingRequests, getAvailableSlots) first to find it, then execute the action. Never invent IDs.
6. **Polite, Concise Output**:
   - Keep responses helpful and under 120 words. Use bullet points (•) for list items. Use plain text (no markdown headers, bold, italics, or complex syntax) so it reads well aloud in speech synthesis.`;

      const systemPrompt = userType === 'owner'
        ? `You are the AI scheduling agent embedded in the owner's dashboard of "MyScheduler", belonging to ${CONFIG.OWNER_NAME}. You have secure access to approve, reject, reschedule, cancel, complete meetings, and manage time slots. Read the live database context below to assist.
${agentRules}

LIVE DASHBOARD CONTEXT:
${context}`
        : `You are the public AI scheduling agent for "MyScheduler", helping visitors book and manage meetings with ${CONFIG.OWNER_NAME}. You can help them book, cancel, or look up their meetings. Read the live database context below to assist.
${agentRules}

LIVE BOOKING CONTEXT:
${context}`;

      // Support larger conversation history (up to last 14 turns) for context continuity
      const contents = conversationHistory.slice(-14).map(h => ({
        role: h.role === 'ai' ? 'model' : 'user',
        parts: [{ text: h.message }],
      }));
      contents.push({ role: 'user', parts: [{ text: question }] });

      const tools = [{ functionDeclarations: AGENT_TOOLS[userType] || [] }];
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.GEMINI_MODEL}:generateContent`;

      let finalText = null;
      const MAX_TURNS = 8; // Extended loop capacity for complex lookups/refinements

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
            generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
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

        // Execute every requested tool call and feed results back.
        // NOTE: Gemini's API only accepts "user" or "model" as valid
        // roles — "function" is not a real role and causes a 400 error
        // on every turn that involves a tool call. Function results
        // must be sent back as role "user".
        const responseParts = [];
        for (const fc of functionCalls) {
          const { name, args } = fc.functionCall;
          const result = await executeAgentTool(name, args || {}, userType);
          responseParts.push({ functionResponse: { name, response: result } });
        }
        contents.push({ role: 'user', parts: responseParts });
      }

      return finalText || "I've run into trouble finishing that action — could you try rephrasing?";
    } catch (err) {
      console.error('Gemini call failed:', err);
      return "⚠️ Sorry, I couldn't process that right now.";
    }
  },
};
