// ============================================================
//  MyScheduler — Predefined Chat Bot Assistant Module
// ============================================================

class AIAssistant {
  constructor({ messagesEl, inputEl, sendBtn, chipsEl, type = 'visitor' }) {
    this.messagesEl = messagesEl;
    this.inputEl    = inputEl;
    this.sendBtn    = sendBtn;
    this.chipsEl    = chipsEl;
    this.type       = type;         // 'visitor' | 'owner'
    this.history    = [];
    this.isLoading  = false;
    this.visitorEmail = '';         // set via setVisitorEmail() once known

    // ── Chat session id (persists per browser tab, per dashboard type) ──
    const storageKey = `chatSessionId_${this.type}`;
    this.sessionId = sessionStorage.getItem(storageKey);
    if (!this.sessionId) {
      this.sessionId = crypto.randomUUID();
      sessionStorage.setItem(storageKey, this.sessionId);
    }

    this._bindEvents();
    this._loadHistoryThenGreet();
  }

  // ── Allow the app to tell the assistant who the visitor is ──
  setVisitorEmail(email) {
    this.visitorEmail = email || '';
  }

  // ── Load past chat history from Supabase, or show greeting if none ──
  async _loadHistoryThenGreet() {
    try {
      const { data, error } = await db
        .from('chat_messages')
        .select('*')
        .eq('session_id', this.sessionId)
        .eq('bot_type', 'chatbot')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        data.forEach(row => {
          this._addBubble(row.role === 'ai' ? 'ai' : 'user', row.message, false);
        });
        return;
      }
    } catch (err) {
      console.error('Could not load chat history:', err);
    }
    // No history found (or load failed) — show the greeting instead
    this._renderGreeting();
  }

  // ── Save a single message to Supabase ──
  async _saveMessage(role, message) {
    try {
      const { error } = await db.from('chat_messages').insert([{
        session_id: this.sessionId,
        bot_type:   'chatbot',
        user_type:  this.type,   // 'visitor' | 'owner'
        role:       role,        // 'user' | 'ai'
        message:    message,
      }]);
      if (error) throw error;
    } catch (err) {
      console.error('Could not save chat message:', err);
    }
  }

  // ── Greeting ──────────────────────────────────────────────
  _renderGreeting() {
    const msg = this.type === 'owner'
      ? "👋 Hello! I can help you manage meetings.\nHere are some suggestions:"
      : "Hello! I'm your AI assistant.\nHow can I help you today?";
    this._addBubble('ai', msg, true);
  }

  // ── Event Binding ──────────────────────────────────────────
  _bindEvents() {
    // Clean up event listeners first if they were previously bound
    this.sendBtn?.replaceWith(this.sendBtn.cloneNode(true));
    this.sendBtn = document.getElementById(this.sendBtn?.id) || this.sendBtn;

    this.sendBtn?.addEventListener('click', () => this._handleSend());
    this.inputEl?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this._handleSend(); }
    });

    // Re-bind chips click
    this.chipsEl?.querySelectorAll('.ai-chip').forEach(chip => {
      chip.replaceWith(chip.cloneNode(true));
    });
    this.chipsEl?.querySelectorAll('.ai-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        // Strip out the icon from the text content
        const q = chip.textContent.replace(/^[^\w]*/, '').trim();
        if (this.inputEl) this.inputEl.value = q;
        this._handleSend();
      });
    });
  }

  // ── Send Flow ──────────────────────────────────────────────
  async _handleSend() {
    if (this.isLoading) return;
    const text = this.inputEl?.value.trim();
    if (!text) return;

    // Auto-detect visitor email if available in the form
    if (this.type === 'visitor') {
      const formEmail = document.getElementById('visitorEmail')?.value?.trim();
      if (formEmail) this.setVisitorEmail(formEmail);
    }

    this.inputEl.value = '';

    this._addBubble('user', text, true);
    this._showTyping();
    this.isLoading = true;
    if (this.sendBtn) this.sendBtn.disabled = true;

    try {
      // Small artificial delay to simulate AI thinking
      await new Promise(r => setTimeout(r, 600));
      const reply = await this._getPredefinedReply(text);
      this._removeTyping();
      this._addBubble('ai', reply, true);
    } catch (err) {
      this._removeTyping();
      const errMsg = '⚠️ Sorry, I encountered an issue. Please try again.';
      this._addBubble('ai', errMsg, true);
      console.error('Bot error:', err);
    } finally {
      this.isLoading = false;
      if (this.sendBtn) this.sendBtn.disabled = false;
    }
  }

  // ── Predefined Chat Bot Rules (fast paths) + AI agent fallback ─
  async _getPredefinedReply(text) {
    const query = text.toLowerCase().trim();
    const today = getTodayStr();

    // Helper to record the AI's reply once we have it. (The user's turn
    // is recorded further down, right before we hand off to the AI
    // agent — see the NOTE there for why it isn't pushed here.)
    const pushAiReply = (reply) => { this.history.push({ role: 'ai', message: reply }); return reply; };

    // Determine if it is a simple query suitable for predefined fast-path rules
    const isSimpleVisitorQuery = this.type === 'visitor' && (
      query === 'available slots' || query === 'slots today' ||
      query === 'cancellation policy' || query === 'policy' ||
      query === 'how to book' || query === 'how do i schedule' || query === 'schedule a meeting'
    );

    const isSimpleOwnerQuery = this.type === 'owner' && (
      query === 'workload' ||
      query === 'today\'s schedule' || query === 'today schedule' ||
      query === 'demand' || query === 'most requests'
    );

    // ── Visitor Reply Rules (Fast-Path) ──
    if (this.type === 'visitor' && isSimpleVisitorQuery) {
      if (query.includes('available slots') || query.includes('slots today')) {
        try {
          const { data: slots } = await db.from('slots')
            .select('*').eq('date', today).eq('status','available')
            .order('start_time');
          const available = (slots || []).filter(s => !isSlotPast(s.date, s.end_time));
          if (available.length === 0) {
            return pushAiReply("There are no available slots left for today. You can select another date in the calendar!");
          }
          const slotList = available.map(s => `• ${formatTimeRange(s.start_time, s.end_time)}`).join('\n');
          return pushAiReply(`Here are the available slots for today:\n${slotList}`);
        } catch (err) {
          return pushAiReply("Could not retrieve slots right now. Please check the 'Available Slots' panel.");
        }
      }
      if (query.includes('schedule a meeting') || query.includes('how do i schedule') || query.includes('how to book')) {
        return pushAiReply("To schedule a meeting:\n1. Choose an available slot from the 'Available Slots' list.\n2. Fill in the 'Meeting Details' form (Your Name, Email, Title, and Description).\n3. Click the 'Request Meeting' button.");
      }
      if (query.includes('policy')) {
        return pushAiReply("Cancellation Policy:\n- Meetings can be requested and cancelled at any time.\n- The owner will review and update the status of your meeting (Pending, Approved, Rejected, Cancelled).");
      }
    }

    // ── Owner Reply Rules (Fast-Path) ──
    if (this.type === 'owner' && isSimpleOwnerQuery) {
      if (query.includes('today\'s schedule') || query.includes('today schedule')) {
        try {
          const { data } = await db.from('meetings').select('*').eq('date', today).eq('status', 'approved').order('start_time');
          const todayM = data || [];
          if (todayM.length === 0) {
            return pushAiReply("You have no approved meetings scheduled for today.");
          }
          const list = todayM.map(m => `• ${formatTimeRange(m.start_time, m.end_time)}: ${m.visitor_name} ("${m.meeting_title}")`).join('\n');
          return pushAiReply(`Here is your schedule for today:\n${list}`);
        } catch (err) {
          return pushAiReply("Could not load today's schedule.");
        }
      }
      if (query.includes('workload')) {
        try {
          const { data } = await db.from('meetings').select('status');
          const m = data || [];
          const approved = m.filter(x => x.status === 'approved').length;
          const pending = m.filter(x => x.status === 'pending').length;
          let statusStr = "Light";
          if (approved > 5) statusStr = "Heavy";
          else if (approved > 2) statusStr = "Moderate";
          return pushAiReply(`Workload Status:\n- Approved meetings: ${approved}\n- Pending requests: ${pending}\nYour current workload is: ${statusStr}`);
        } catch (err) {
          return pushAiReply("Could not analyze workload.");
        }
      }
      if (query.includes('most requests') || query.includes('demand')) {
        try {
          const { data } = await db.from('meetings').select('date, start_time, end_time').eq('status', 'pending');
          if (!data || data.length === 0) {
            return pushAiReply("There are no pending requests to evaluate slot demand.");
          }
          const counts = {};
          data.forEach(m => {
            const dateStr = formatDate(m.date);
            const timeRange = formatTimeRange(m.start_time, m.end_time);
            const key = `${dateStr} (${timeRange})`;
            counts[key] = (counts[key] || 0) + 1;
          });
          const sorted = Object.entries(counts).sort((a,b) => b[1] - a[1]);
          const list = sorted.map(([slotInfo, count]) => `• ${slotInfo}: ${count} request(s)`).join('\n');
          return pushAiReply(`Slot demand based on pending requests:\n${list}`);
        } catch (err) {
          return pushAiReply("Could not fetch demand stats.");
        }
      }
    }

    // ── Handoff to AI Agent (Gemini + tools) ──
    if (typeof AI_PROVIDER !== 'undefined') {
      try {
        let enhancedText = text;
        if (this.type === 'visitor') {
          const formEmail = this.visitorEmail || document.getElementById('visitorEmail')?.value?.trim();
          if (formEmail) {
            enhancedText += `\n(System Note: The visitor's current email is ${formEmail})`;
          }
        }
        // NOTE: AI_PROVIDER.ask appends `enhancedText` to the contents
        // itself, so the current turn must NOT already be in
        // this.history when we call it — otherwise Gemini receives the
        // same message twice in one request. Record it only after.
        const reply = await AI_PROVIDER.ask(this.type, enhancedText, this.history);
        this.history.push({ role: 'user', message: text });
        return pushAiReply(reply);
      } catch (e) {
        console.error('AI_PROVIDER.ask failed:', e);
      }
    }

    this.history.push({ role: 'user', message: text });
    return pushAiReply("I'm sorry, I couldn't reach the AI service right now. Please try again or use the forms on screen.");
  }

  // ── Bubble Rendering ───────────────────────────────────────
  // persist: whether this bubble should be saved to chat_history.
  // Set to false when re-rendering bubbles loaded FROM history (avoids duplicate saves).
  _addBubble(role, text, persist = true) {
    const div = document.createElement('div');
    div.className = `ai-bubble ${role}`;
    // Replace newlines with <br> for neat display
    div.innerHTML = text.replace(/\n/g, '<br>');
    this.messagesEl?.appendChild(div);
    this._scrollBottom();

    if (persist) {
      // chat_messages.role only allows 'user' | 'ai' — no remapping needed
      this._saveMessage(role, text);
    }
  }

  _showTyping() {
    const div = document.createElement('div');
    div.className = 'ai-typing';
    div.id = 'ai-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    this.messagesEl?.appendChild(div);
    this._scrollBottom();
  }

  _removeTyping() {
    document.getElementById('ai-typing')?.remove();
  }

  _scrollBottom() {
    if (this.messagesEl) {
      requestAnimationFrame(() => {
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
      });
    }
  }

  // ── New Chat ───────────────────────────────────────────────
  reset() {
    this.history = [];
    if (this.messagesEl) this.messagesEl.innerHTML = '';
    if (this.chipsEl) this.chipsEl.style.display = '';

    // Start a fresh session so old history doesn't reload next time
    const storageKey = `chatSessionId_${this.type}`;
    this.sessionId = crypto.randomUUID();
    sessionStorage.setItem(storageKey, this.sessionId);

    this._renderGreeting();
  }
}
