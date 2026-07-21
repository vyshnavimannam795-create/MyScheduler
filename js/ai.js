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
    this.sessionKey = `chatbot_${type}`;  // used for localStorage key, keeps visitor/owner sessions separate
    this.botType    = 'chatbot';           // must match the chat_messages CHECK constraint
    this.sessionId  = AI_PROVIDER.getSessionId(this.sessionKey);
    this._bindEvents();
    this._init();
  }

  // ── Init: restore history from Supabase, or show greeting ──
  async _init() {
    const past = await AI_PROVIDER.loadHistory(this.sessionId, this.botType);
    if (past.length > 0) {
      if (this.chipsEl) this.chipsEl.style.display = 'none';
      past.forEach(m => this._addBubble(m.role, m.message, { log: false }));
    } else {
      this._renderGreeting();
    }
  }

  // ── Greeting ──────────────────────────────────────────────
  _renderGreeting() {
    const msg = this.type === 'owner'
      ? "👋 Hello! I can help you manage meetings.\nHere are some suggestions:"
      : "Hello! I'm your AI assistant.\nHow can I help you today?";
    this._addBubble('ai', msg);
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

    this.inputEl.value = '';

    this._addBubble('user', text);
    this._showTyping();
    this.isLoading = true;
    if (this.sendBtn) this.sendBtn.disabled = true;

    try {
      // Small artificial delay to simulate AI thinking
      await new Promise(r => setTimeout(r, 600));
      const reply = await this._getPredefinedReply(text);
      this._removeTyping();
      this._addBubble('ai', reply);
    } catch (err) {
      this._removeTyping();
      this._addBubble('ai', '⚠️ Sorry, I encountered an issue. Please try again.');
      console.error('Bot error:', err);
    } finally {
      this.isLoading = false;
      if (this.sendBtn) this.sendBtn.disabled = false;
    }
  }

  // ── Predefined Chat Bot Rules ──────────────────────────────
  async _getPredefinedReply(text) {
    const query = text.toLowerCase().trim();
    const today = getTodayStr();

    // ── Visitor Reply Rules ──
    if (this.type === 'visitor') {
      if (query.includes('available slots') || query.includes('slots today')) {
        try {
          const { data: slots } = await db.from('slots')
            .select('*').eq('date', today).eq('status','available')
            .order('start_time');
          const available = (slots || []).filter(s => !isSlotPast(s.date, s.end_time));
          if (available.length === 0) {
            return "There are no available slots left for today. You can select another date in the calendar!";
          }
          const slotList = available.map(s => `• ${formatTimeRange(s.start_time, s.end_time)}`).join('\n');
          return `Here are the available slots for today:\n${slotList}`;
        } catch (err) {
          return "Could not retrieve slots right now. Please check the 'Available Slots' panel.";
        }
      }
      if (query.includes('schedule a meeting') || query.includes('how do i schedule')) {
        return "To schedule a meeting:\n1. Choose an available slot from the 'Available Slots' list.\n2. Fill in the 'Meeting Details' form (Your Name, Email, Title, and Description).\n3. Click the 'Request Meeting' button.";
      }
      if (query.includes('reschedule')) {
        return "If you need to reschedule, you can choose another slot and submit a new request, or coordinate with the owner who can suggest a rescheduled time from their dashboard.";
      }
      if (query.includes('cancellation policy')) {
        return "Cancellation Policy:\n- Meetings can be requested and cancelled at any time.\n- The owner will review and update the status of your meeting (Pending, Approved, Rejected, Cancelled).";
      }

      // No built-in rule matched — fall back to the AI for open-ended questions
      return await AI_PROVIDER.ask('visitor', text, this.history);
    }

    // ── Owner Reply Rules ──
    if (this.type === 'owner') {
      if (query.includes('need my attention') || query.includes('attention')) {
        try {
          const { data } = await db.from('meetings').select('*').eq('status', 'pending');
          const pending = data || [];
          if (pending.length === 0) {
            return "Good news! You have no pending meeting requests awaiting your attention.";
          }
          const list = pending.map(m => `• ${m.visitor_name} - "${m.meeting_title}" on ${formatDateShort(m.date)} at ${formatTimeRange(m.start_time, m.end_time)}`).join('\n');
          return `You have ${pending.length} pending request(s) awaiting approval:\n${list}`;
        } catch (err) {
          return "Could not load pending requests.";
        }
      }
      if (query.includes('today\'s schedule') || query.includes('today schedule')) {
        try {
          const { data } = await db.from('meetings').select('*').eq('date', today).eq('status', 'approved').order('start_time');
          const todayM = data || [];
          if (todayM.length === 0) {
            return "You have no approved meetings scheduled for today.";
          }
          const list = todayM.map(m => `• ${formatTimeRange(m.start_time, m.end_time)}: ${m.visitor_name} ("${m.meeting_title}")`).join('\n');
          return `Here is your schedule for today:\n${list}`;
        } catch (err) {
          return "Could not load today's schedule.";
        }
      }
      if (query.includes('optimal meeting times') || query.includes('suggest optimal')) {
        try {
          const { data: slots } = await db.from('slots').select('*').eq('date', today).eq('status', 'available').order('start_time');
          const available = (slots || []).filter(s => !isSlotPast(s.date, s.end_time));
          if (available.length === 0) {
            return "No available slots remain for today. You might want to create new slots in the Slots Management section.";
          }
          const best = available.slice(0, 3).map(s => `• ${formatTimeRange(s.start_time, s.end_time)}`).join('\n');
          return `The best open slots today are:\n${best}`;
        } catch (err) {
          return "Could not fetch slots.";
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
          return `Workload Status:\n- Approved meetings: ${approved}\n- Pending requests: ${pending}\nYour current workload is: ${statusStr}`;
        } catch (err) {
          return "Could not analyze workload.";
        }
      }
      if (query.includes('most requests') || query.includes('slots have most')) {
        try {
          const { data } = await db.from('meetings').select('date, start_time, end_time').eq('status', 'pending');
          if (!data || data.length === 0) {
            return "There are no pending requests to evaluate slot demand.";
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
          return `Slot demand based on pending requests:\n${list}`;
        } catch (err) {
          return "Could not fetch demand stats.";
        }
      }

      // No built-in rule matched — fall back to the AI for open-ended questions
      return await AI_PROVIDER.ask('owner', text, this.history);
    }

    return await AI_PROVIDER.ask(this.type, text, this.history);
  }

  // ── Bubble Rendering ───────────────────────────────────────
  _addBubble(role, text, { log = true } = {}) {
    const div = document.createElement('div');
    div.className = `ai-bubble ${role}`;
    // Replace newlines with <br> for neat display
    div.innerHTML = text.replace(/\n/g, '<br>');
    this.messagesEl?.appendChild(div);
    this._scrollBottom();

    this.history.push({ role, message: text });

    if (log) {
      AI_PROVIDER.logMessage({
        sessionId: this.sessionId,
        botType:   this.botType,
        userType:  this.type,
        role,
        message:   text,
      });
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
    this.sessionId = AI_PROVIDER.newSession(this.sessionKey);
    if (this.messagesEl) this.messagesEl.innerHTML = '';
    if (this.chipsEl) this.chipsEl.style.display = '';
    this._renderGreeting();
  }
}
