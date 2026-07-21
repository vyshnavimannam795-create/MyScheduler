// ============================================================
//  MyScheduler — Voice Assistant Chatbot (voice-bot.js)
// ============================================================

class VoiceBot {
  constructor() {
    this.isOpen = false;
    this.isMuted = false;
    this.isListening = false;
    this.recognition = null;
    this.synthesis = window.speechSynthesis;
    this.activeUtterance = null;
    
    // Check role based on DOM elements
    this.role = document.getElementById('meetingForm') ? 'visitor' : 'owner';

    // Chat history persistence
    this.botType = `voicebot_${this.role}`;
    this.sessionId = AI_PROVIDER.getSessionId(this.botType);
    this.conversationHistory = [];
    this._historyRestored = false;

    // Conversation State Machine
    this.state = {
      intent: null, // 'book' | 'view' | 'cancel' | 'reschedule' | 'approve' | 'reject' | 'add_slot' | 'delete_slot'
      step: null,
      slots: {
        name: '',
        email: '',
        title: '',
        desc: '',
        date: '',
        time: '',
        endTime: '',
        meetingId: '',
        meetingsList: []
      }
    };

    this.initUI();
    this.initSpeech();
    this._restoreHistory();
  }

  // ── Restore prior conversation from Supabase, if any ───────
  async _restoreHistory() {
    try {
      const past = await AI_PROVIDER.loadHistory(this.sessionId, this.botType);
      if (past.length > 0) {
        this.messagesEl.innerHTML = '';
        this.conversationHistory = [];
        past.forEach(m => this.addBubble(m.role, m.message, true, false));
      } else {
        this._showGreeting();
      }
      this._historyRestored = true;
    } catch (err) {
      console.warn('Voice bot history restore failed:', err);
      this._showGreeting();
    }
  }

  // ── UI Initialization ──────────────────────────────────────
  initUI() {
    const SVG_ICONS = {
      launcher: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
      mic: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`,
      speakerOn: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
      speakerMuted: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
      close: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
      send: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`
    };
    this.SVG_ICONS = SVG_ICONS;

    // Create floating launcher & panel elements
    const launcher = document.createElement('button');
    launcher.className = 'voice-bot-launcher';
    launcher.id = 'voiceBotLauncher';
    launcher.innerHTML = SVG_ICONS.launcher;
    launcher.title = 'Open Voice Assistant';

    const panel = document.createElement('div');
    panel.className = 'voice-bot-panel';
    panel.id = 'voiceBotPanel';
    panel.innerHTML = `
      <div class="voice-bot-header">
        <div class="voice-bot-title-wrap">
          <span style="display: flex; align-items: center;">${SVG_ICONS.mic}</span>
          <span class="voice-bot-title">${this.role === 'owner' ? 'Dashboard Voice AI' : 'Voice Assistant AI'}</span>
        </div>
        <div class="voice-bot-header-btns">
          <button class="voice-bot-header-btn" id="voiceBotMuteBtn" title="Mute/Unmute Responses">${SVG_ICONS.speakerOn}</button>
          <button class="voice-bot-header-btn" id="voiceBotCloseBtn" title="Close Panel">${SVG_ICONS.close}</button>
        </div>
      </div>
      <div class="voice-bot-status-text hidden" id="voiceBotStatus">Listening...</div>
      <div class="voice-bot-messages" id="voiceBotMessages"></div>
      <div class="voice-bot-controls">
        <button class="voice-bot-mic-btn" id="voiceBotMicBtn" title="Speak to assistant">${SVG_ICONS.mic}</button>
        <input type="text" class="input voice-bot-input" id="voiceBotInput" placeholder="Type or say something...">
        <button class="voice-bot-send-btn" id="voiceBotSendBtn">${SVG_ICONS.send}</button>
      </div>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    // DOM references
    this.launcherEl = launcher;
    this.panelEl = panel;
    this.messagesEl = document.getElementById('voiceBotMessages');
    this.inputEl = document.getElementById('voiceBotInput');
    this.micBtnEl = document.getElementById('voiceBotMicBtn');
    this.sendBtnEl = document.getElementById('voiceBotSendBtn');
    this.muteBtnEl = document.getElementById('voiceBotMuteBtn');
    this.closeBtnEl = document.getElementById('voiceBotCloseBtn');
    this.statusEl = document.getElementById('voiceBotStatus');

    // Event listeners
    this.launcherEl.addEventListener('click', () => this.togglePanel(true));
    this.closeBtnEl.addEventListener('click', () => this.togglePanel(false));
    this.muteBtnEl.addEventListener('click', () => this.toggleMute());
    this.sendBtnEl.addEventListener('click', () => this.handleTextInput());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleTextInput();
    });
    this.micBtnEl.addEventListener('click', () => this.toggleVoiceListening());

    // Greeting is shown by _restoreHistory() once we know whether this is
    // a brand-new session or a returning one (to avoid duplicate greetings).
  }

  _showGreeting() {
    if (this.role === 'owner') {
      this.addBubble('ai', `Hello! I am your dashboard voice assistant. You can say:
- "Show stats"
- "Show pending requests"
- "Approve request [number]"
- "Reject request [number]"
- "Add a slot for [date] at [time]"
- "Delete slot for [date] at [time]"`, true);
    } else {
      this.addBubble('ai', "Hello! I am your voice-enabled scheduler assistant. You can say: 'Book a meeting', 'View my appointments', 'Reschedule a meeting', or 'Cancel my appointment'. How can I help you today?", true);
    }
  }

  // ── Speech API Setup ──────────────────────────────────────
  initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.micBtnEl.classList.add('listening');
        this.statusEl.classList.remove('hidden');
        this.statusEl.textContent = 'Listening... Speak now';
      };

      this.recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        this.addBubble('user', text);
        this.processInput(text);
      };

      this.recognition.onerror = (event) => {
        console.error('Speech recognition error', event);
        this.statusEl.textContent = 'Error: could not hear clearly';
        setTimeout(() => this.statusEl.classList.add('hidden'), 2000);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.micBtnEl.classList.remove('listening');
        this.statusEl.classList.add('hidden');
      };

      // Do NOT request mic permission here! That would trigger permissions on page load.
      // SpeechRecognition automatically asks for microphone permission when start() is called.
    } else {
      this.micBtnEl.style.display = 'none';
      console.warn('SpeechRecognition is not supported in this browser.');
    }
  }

  // ── Panel Actions ─────────────────────────────────────────
  togglePanel(open) {
    this.isOpen = open;
    if (open) {
      this.panelEl.classList.add('active');
      this.launcherEl.style.display = 'none';
      if (this.synthesis.paused) this.synthesis.resume();
    } else {
      this.panelEl.classList.remove('active');
      this.launcherEl.style.display = 'flex';
      this.stopSpeaking();
      if (this.recognition && this.isListening) this.recognition.stop();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.muteBtnEl.innerHTML = this.isMuted ? this.SVG_ICONS.speakerMuted : this.SVG_ICONS.speakerOn;
    if (this.isMuted) this.stopSpeaking();
  }

  toggleVoiceListening() {
    if (!this.recognition) return;
    if (this.isListening) {
      this.recognition.stop();
    } else {
      this.stopSpeaking();
      try {
        this.recognition.start();
        
        // Show console notice if loaded via file:// protocol
        if (window.location.protocol === 'file:') {
          console.warn("MyScheduler: Running via file:// protocol. The browser will ask for microphone permission every time the mic is started. To persist permissions, serve this folder through a local HTTP server.");
        }
      } catch (err) {
        console.error("Speech recognition start failed:", err);
      }
    }
  }

  // ── Communication Helpers ─────────────────────────────────
  addBubble(role, text, silent = false, log = true) {
    const div = document.createElement('div');
    div.className = `voice-bot-bubble ${role}`;
    div.innerHTML = text.replace(/\n/g, '<br>');
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;

    this.conversationHistory.push({ role, message: text });

    if (log) {
      AI_PROVIDER.logMessage({
        sessionId: this.sessionId,
        botType:   this.botType,
        userType:  this.role,
        role,
        message:   text,
      });
    }

    // Only speak if panel is open and not explicitly silenced
    if (role === 'ai' && this.isOpen && !silent) {
      this.speak(text);
    }
  }

  showTyping() {
    this.removeTyping();
    const div = document.createElement('div');
    div.className = 'voice-bot-typing';
    div.id = 'voiceBotTyping';
    div.innerHTML = '<span></span><span></span><span></span>';
    this.messagesEl.appendChild(div);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  removeTyping() {
    const el = document.getElementById('voiceBotTyping');
    if (el) el.remove();
  }

  speak(text) {
    if (this.isMuted || !this.synthesis) return;
    this.stopSpeaking();
    
    const cleanText = text.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF]/g, '').trim();
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    this.activeUtterance = utterance;
    this.synthesis.speak(utterance);
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }

  handleTextInput() {
    const text = this.inputEl.value.trim();
    if (!text) return;
    this.inputEl.value = '';
    this.addBubble('user', text);
    this.showTyping();
    setTimeout(() => {
      this.removeTyping();
      this.processInput(text);
    }, 600);
  }

  // ── Conversational Intent Logic ───────────────────────────
  async processInput(text) {
    const input = text.toLowerCase().trim();

    // Reset or cancel
    if (input === 'reset' || input === 'start over' || input === 'clear') {
      this.resetState();
      if (this.role === 'owner') {
        this.addBubble('ai', "Let's reset. Say: 'Show stats', 'Show requests', 'Approve request', or 'Add slot'.");
      } else {
        this.addBubble('ai', "Let's start over. You can say: 'Book a meeting', 'View my appointments', 'Reschedule', or 'Cancel'.");
      }
      return;
    }

    this.showTyping();
    try {
      if (this.role === 'owner') {
        await this.processOwnerInput(input, text);
      } else {
        await this.processVisitorInput(input, text);
      }
    } catch (err) {
      console.error(err);
      this.addBubble('ai', "⚠️ Sorry, I encountered an issue. Let's try that command again.");
      this.resetState();
    } finally {
      this.removeTyping();
    }
  }

  // ── VISITOR FLOWS ─────────────────────────────────────────
  async processVisitorInput(input, text) {
    if (!this.state.intent) {
      if (input.includes('book') || input.includes('schedule') || input.includes('make an appointment')) {
        this.state.intent = 'book';
        this.state.step = 'waiting_name';
        this.addBubble('ai', "Sure, let's book an appointment. First, what is your full name?");
        return;
      }
      
      if (input.includes('view') || input.includes('show') || input.includes('list') || input.includes('my appointment')) {
        this.state.intent = 'view';
        this.state.step = 'waiting_email';
        this.addBubble('ai', "To view your appointments, please tell me your email address.");
        return;
      }

      if (input.includes('reschedule') || input.includes('change time')) {
        this.state.intent = 'reschedule';
        this.state.step = 'waiting_email';
        this.addBubble('ai', "To reschedule an appointment, please enter your email address first.");
        return;
      }

      if (input.includes('cancel') || input.includes('delete my appointment')) {
        this.state.intent = 'cancel';
        this.state.step = 'waiting_email';
        this.addBubble('ai', "To cancel an appointment, please tell me your email address.");
        return;
      }

      // No built-in voice command matched — let the AI answer freely
      const aiReply = await AI_PROVIDER.ask('visitor', text, this.conversationHistory);
      this.addBubble('ai', aiReply);
      return;
    }

    // Process steps
    if (this.state.intent === 'book') {
      await this.handleBookingSteps(input, text);
    } else if (this.state.intent === 'view') {
      await this.handleViewingSteps(input, text);
    } else if (this.state.intent === 'cancel') {
      await this.handleCancellationSteps(input, text);
    } else if (this.state.intent === 'reschedule') {
      await this.handleReschedulingSteps(input, text);
    }
  }

  // ── OWNER FLOWS ───────────────────────────────────────────
  async processOwnerInput(input, text) {
    const slots = this.state.slots;

    // Detect new intent if idle
    if (!this.state.intent) {
      // 1. Show Stats
      if (input.includes('stats') || input.includes('summary') || input.includes('dashboard stats')) {
        const { data: meetings, error } = await db.from('meetings').select('status');
        if (error) throw error;
        
        const counts = { pending: 0, approved: 0, completed: 0, cancelled: 0, rejected: 0 };
        (meetings || []).forEach(m => {
          if (counts[m.status] !== undefined) counts[m.status]++;
        });

        this.addBubble('ai', `📊 Current Dashboard Stats:
- Total Requests: ${(meetings || []).length}
- Pending Requests: ${counts.pending}
- Approved Meetings: ${counts.approved}
- Completed Meetings: ${counts.completed}
- Cancelled Meetings: ${counts.cancelled}`);
        return;
      }

      // 2. Show Pending Requests
      if (input.includes('requests') || input.includes('pending') || input.includes('show meetings')) {
        const { data: pending, error } = await db.from('meetings')
          .select('*').eq('status', 'pending').order('date');
        if (error) throw error;

        if (!pending || pending.length === 0) {
          this.addBubble('ai', "You have no pending meeting requests right now.");
          return;
        }

        slots.meetingsList = pending;
        const listStr = pending.map((m, idx) => `${idx + 1}. "${m.meeting_title}" from ${m.visitor_name} on ${formatDateShort(m.date)} at ${formatTimeRange(m.start_time, m.end_time)}`).join('\n');
        this.addBubble('ai', `📋 Here are your pending requests:\n${listStr}\n\nYou can say: "Approve request [number]" or "Reject request [number]".`);
        return;
      }

      // 3. Approve
      if (input.includes('approve')) {
        const index = this.parseNumber(input);
        if (index && slots.meetingsList.length > 0 && index <= slots.meetingsList.length) {
          const selected = slots.meetingsList[index - 1];
          slots.meetingId = selected.id;
          slots.name = selected.visitor_name;
          this.state.intent = 'approve';
          this.state.step = 'confirm_approve';
          this.addBubble('ai', `Are you sure you want to approve "${selected.meeting_title}" from ${selected.visitor_name} on ${formatDateShort(selected.date)}? (Say 'yes' or 'no')`);
          return;
        } else {
          // No active list, fetch pending first
          const { data: pending, error } = await db.from('meetings')
            .select('*').eq('status', 'pending').order('date');
          if (error) throw error;
          if (!pending || pending.length === 0) {
            this.addBubble('ai', "You have no pending requests to approve.");
            return;
          }
          slots.meetingsList = pending;
          const listStr = pending.map((m, idx) => `${idx + 1}. "${m.meeting_title}" from ${m.visitor_name}`).join('\n');
          this.state.intent = 'approve';
          this.state.step = 'select_req';
          this.addBubble('ai', `Please say the index number of the request to approve:\n${listStr}`);
          return;
        }
      }

      // 4. Reject
      if (input.includes('reject') || input.includes('decline')) {
        const index = this.parseNumber(input);
        if (index && slots.meetingsList.length > 0 && index <= slots.meetingsList.length) {
          const selected = slots.meetingsList[index - 1];
          slots.meetingId = selected.id;
          this.state.intent = 'reject';
          this.state.step = 'confirm_reject';
          this.addBubble('ai', `Are you sure you want to reject "${selected.meeting_title}" from ${selected.visitor_name}? (Say 'yes' or 'no')`);
          return;
        } else {
          const { data: pending, error } = await db.from('meetings')
            .select('*').eq('status', 'pending').order('date');
          if (error) throw error;
          if (!pending || pending.length === 0) {
            this.addBubble('ai', "You have no pending requests to reject.");
            return;
          }
          slots.meetingsList = pending;
          const listStr = pending.map((m, idx) => `${idx + 1}. "${m.meeting_title}" from ${m.visitor_name}`).join('\n');
          this.state.intent = 'reject';
          this.state.step = 'select_req';
          this.addBubble('ai', `Please say the index number of the request to reject:\n${listStr}`);
          return;
        }
      }

      // 5. Add slot
      if (input.includes('add slot') || input.includes('create slot') || input.includes('make slot')) {
        this.state.intent = 'add_slot';
        this.state.step = 'waiting_date';
        this.addBubble('ai', "What date should the slot be added? (e.g. YYYY-MM-DD, or 'today', 'tomorrow')");
        return;
      }

      // 6. Delete slot
      if (input.includes('delete slot') || input.includes('remove slot') || input.includes('block slot')) {
        this.state.intent = 'delete_slot';
        this.state.step = 'waiting_date';
        this.addBubble('ai', "What date is the slot you'd like to delete? (e.g. YYYY-MM-DD)");
        return;
      }

      // No built-in voice command matched — let the AI answer freely
      const aiReply = await AI_PROVIDER.ask('owner', text, this.conversationHistory);
      this.addBubble('ai', aiReply);
      return;
    }

    // Process Active Intents
    if (this.state.intent === 'approve') {
      if (this.state.step === 'select_req') {
        const idx = this.parseNumber(input);
        if (idx && idx > 0 && idx <= slots.meetingsList.length) {
          const selected = slots.meetingsList[idx - 1];
          slots.meetingId = selected.id;
          slots.name = selected.visitor_name;
          this.state.step = 'confirm_approve';
          this.addBubble('ai', `Are you sure you want to approve "${selected.meeting_title}" from ${selected.visitor_name}? (Say 'yes' or 'no')`);
        } else {
          this.addBubble('ai', "Invalid index. Please choose a valid request number.");
        }
        return;
      }

      if (this.state.step === 'confirm_approve') {
        if (input.includes('yes') || input.includes('confirm') || input.includes('ok')) {
          this.addBubble('ai', `Approving request...`);
          // Call owner dashboard logic if available, else direct DB call
          if (window.confirmApprove) {
            // Find meeting in global scope and select it
            if (window.allMeetings) {
              window.selectedMeeting = window.allMeetings.find(m => m.id === slots.meetingId);
            }
            await window.confirmApprove();
          } else {
            // Fallback DB call
            const meeting = slots.meetingsList.find(m => m.id === slots.meetingId);
            await db.from('meetings').update({ status: 'approved' }).eq('id', slots.meetingId);
            await db.from('slots').update({ status: 'booked' }).eq('date', meeting.date).eq('start_time', meeting.start_time);
          }
          this.addBubble('ai', `<span class="voice-bot-success-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> Request from ${slots.name} has been approved successfully!`);
          this.resetState();
          this.refreshOwnerUI();
        } else {
          this.addBubble('ai', "Approval cancelled.");
          this.resetState();
        }
      }
    }

    if (this.state.intent === 'reject') {
      if (this.state.step === 'select_req') {
        const idx = this.parseNumber(input);
        if (idx && idx > 0 && idx <= slots.meetingsList.length) {
          const selected = slots.meetingsList[idx - 1];
          slots.meetingId = selected.id;
          this.state.step = 'confirm_reject';
          this.addBubble('ai', `Are you sure you want to reject "${selected.meeting_title}" from ${selected.visitor_name}? (Say 'yes' or 'no')`);
        } else {
          this.addBubble('ai', "Invalid index. Please select a valid number.");
        }
        return;
      }

      if (this.state.step === 'confirm_reject') {
        if (input.includes('yes') || input.includes('reject') || input.includes('confirm')) {
          this.addBubble('ai', `Rejecting request...`);
          if (window.quickReject) {
            await window.quickReject(slots.meetingId);
          } else {
            await db.from('meetings').update({ status: 'rejected' }).eq('id', slots.meetingId);
          }
          this.addBubble('ai', `<span class="voice-bot-error-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span> Meeting request rejected successfully.`);
          this.resetState();
          this.refreshOwnerUI();
        } else {
          this.addBubble('ai', "Rejection cancelled.");
          this.resetState();
        }
      }
    }

    if (this.state.intent === 'add_slot') {
      if (this.state.step === 'waiting_date') {
        const date = this.parseDate(input);
        if (!date) {
          this.addBubble('ai', "I couldn't parse the date. Please say YYYY-MM-DD.");
          return;
        }
        slots.date = date;
        this.state.step = 'waiting_time';
        this.addBubble('ai', `Date set to ${formatDate(date)}. What is the start time? (e.g. 2 PM, 14:00, or 9 AM)`);
        return;
      }

      if (this.state.step === 'waiting_time') {
        const start = this.parseTime(input);
        if (!start) {
          this.addBubble('ai', "Couldn't parse start time. Please say a valid time (e.g., '10 AM', '3 PM').");
          return;
        }
        slots.time = start;
        
        // Default end time to +1 hour
        const [h, m] = start.split(':').map(Number);
        const endHour = (h + 1) % 24;
        slots.endTime = `${String(endHour).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

        this.state.step = 'confirm_add';
        this.addBubble('ai', `Confirm creating slot on ${formatDate(slots.date)} at ${formatTime(slots.time)} to ${formatTime(slots.endTime)}? (Say 'yes' or 'no')`);
        return;
      }

      if (this.state.step === 'confirm_add') {
        if (input.includes('yes') || input.includes('confirm') || input.includes('ok')) {
          this.addBubble('ai', "Creating slot in database...");
          const { error } = await db.from('slots').insert({
            date: slots.date,
            start_time: slots.time + ':00',
            end_time: slots.endTime + ':00',
            status: 'available'
          });
          if (error) throw error;

          this.addBubble('ai', `<span class="voice-bot-success-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> Available slot created successfully on ${formatDate(slots.date)} at ${formatTime(slots.time)}!`);
          this.resetState();
          this.refreshOwnerUI();
        } else {
          this.addBubble('ai', "Cancelled slot creation.");
          this.resetState();
        }
      }
    }

    if (this.state.intent === 'delete_slot') {
      if (this.state.step === 'waiting_date') {
        const date = this.parseDate(input);
        if (!date) {
          this.addBubble('ai', "I couldn't parse the date. Please say YYYY-MM-DD.");
          return;
        }
        slots.date = date;
        this.state.step = 'waiting_time';
        this.addBubble('ai', `What is the start time of the slot to delete? (e.g. 10 AM, 3 PM)`);
        return;
      }

      if (this.state.step === 'waiting_time') {
        const start = this.parseTime(input);
        if (!start) {
          this.addBubble('ai', "Invalid time. Please try again.");
          return;
        }
        slots.time = start;
        this.state.step = 'confirm_delete';
        this.addBubble('ai', `Confirm deleting slot on ${formatDate(slots.date)} at ${formatTime(slots.time)}? (Say 'yes' or 'no')`);
        return;
      }

      if (this.state.step === 'confirm_delete') {
        if (input.includes('yes') || input.includes('confirm') || input.includes('ok')) {
          this.addBubble('ai', "Deleting slot...");
          const { error } = await db.from('slots')
            .delete()
            .eq('date', slots.date)
            .eq('start_time', slots.time + ':00');
          
          if (error) throw error;
          this.addBubble('ai', `<span class="voice-bot-success-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> Slot has been deleted.`);
          this.resetState();
          this.refreshOwnerUI();
        } else {
          this.addBubble('ai', "Deletion cancelled.");
          this.resetState();
        }
      }
    }
  }

  // ── BOOKING FLOW ──────────────────────────────────────────
  async handleBookingSteps(input, text) {
    const slots = this.state.slots;

    if (this.state.step === 'waiting_name') {
      slots.name = text.trim();
      this.state.step = 'waiting_email';
      this.addBubble('ai', `Thanks, ${slots.name}. What is your email address?`);
      return;
    }

    if (this.state.step === 'waiting_email') {
      const email = text.trim().toLowerCase();
      if (!email.includes('@')) {
        this.addBubble('ai', "That doesn't look like a valid email address. Please type it or say it again.");
        return;
      }
      slots.email = email;
      this.state.step = 'waiting_title';
      this.addBubble('ai', "Got it. What should be the title of our meeting?");
      return;
    }

    if (this.state.step === 'waiting_title') {
      slots.title = text.trim();
      this.state.step = 'waiting_desc';
      this.addBubble('ai', "Please provide a brief description of the meeting (minimum 25 characters).");
      return;
    }

    if (this.state.step === 'waiting_desc') {
      const desc = text.trim();
      if (desc.length < 25) {
        this.addBubble('ai', `Your description is too short (${desc.length}/25 characters). Please provide a longer description.`);
        return;
      }
      slots.desc = desc;
      this.state.step = 'waiting_date';
      this.addBubble('ai', "On which date would you like to schedule? (Use format YYYY-MM-DD or say 'today', 'tomorrow', 'next Monday')");
      return;
    }

    if (this.state.step === 'waiting_date') {
      const date = this.parseDate(input);
      if (!date) {
        this.addBubble('ai', "I couldn't parse that date. Please tell me in YYYY-MM-DD format (e.g. 2026-07-14).");
        return;
      }
      slots.date = date;
      this.state.step = 'waiting_time';

      this.addBubble('ai', "Loading available slots for " + formatDate(date) + "...");
      const available = await this.getAvailableSlots(date);
      if (available.length === 0) {
        this.addBubble('ai', `Sorry, there are no available slots left on ${formatDate(date)}. Please select another date.`);
        this.state.step = 'waiting_date';
        return;
      }

      const listStr = available.map((s, idx) => `${idx + 1}. ${formatTimeRange(s.start_time, s.end_time)}`).join('\n');
      this.addBubble('ai', `Here are the available slots. Please say the number (e.g. '1', '2') or type the start time:\n${listStr}`);
      return;
    }

    if (this.state.step === 'waiting_time') {
      const available = await this.getAvailableSlots(slots.date);
      let selectedSlot = null;

      const num = this.parseNumber(input);
      if (num && num > 0 && num <= available.length) {
        selectedSlot = available[num - 1];
      } else {
        selectedSlot = available.find(s => s.start_time.startsWith(input) || formatTime(s.start_time).toLowerCase().includes(input));
      }

      if (!selectedSlot) {
        this.addBubble('ai', "Invalid selection. Please choose one of the available numbers.");
        return;
      }

      slots.time = selectedSlot.start_time;
      slots.endTime = selectedSlot.end_time;
      this.state.step = 'confirm';
      this.addBubble('ai', `Please confirm your booking details:\nName: ${slots.name}\nEmail: ${slots.email}\nTitle: ${slots.title}\nDate: ${formatDate(slots.date)}\nTime: ${formatTimeRange(slots.time, slots.endTime)}\n\nSay 'yes' or 'confirm' to complete booking.`);
      return;
    }

    if (this.state.step === 'confirm') {
      if (input.includes('yes') || input.includes('confirm') || input.includes('correct') || input.includes('ok')) {
        this.addBubble('ai', "Submitting your request to the database...");

        const payload = {
          visitor_name: slots.name,
          email: slots.email,
          meeting_title: slots.title,
          description: slots.desc,
          date: slots.date,
          start_time: slots.time,
          end_time: slots.endTime,
          status: 'pending',
          visitor_message: slots.desc,
        };

        const { error } = await db.from('meetings').insert(payload);
        if (error) throw error;

        try {
          await db.from('activity_log').insert({
            action: 'requested',
            description: `${slots.name} requested a meeting via Voice Bot`,
            actor: 'visitor',
          });
        } catch (e) {}

        await sendSystemEmail({
          to: CONFIG.OWNER_EMAIL,
          subject: `📅 New Meeting Request from ${slots.name} (Voice Bot)`,
          message: `Visitor Details: ${slots.name} (${slots.email})\nMeeting: ${slots.title}\nDate: ${formatDate(slots.date)} at ${formatTimeRange(slots.time, slots.endTime)}\nDescription: ${slots.desc}`
        });

        await sendSystemEmail({
          to: slots.email,
          subject: `📅 Meeting Request Received — MyScheduler`,
          message: `Hello ${slots.name}, your meeting request on ${formatDate(slots.date)} at ${formatTimeRange(slots.time, slots.endTime)} is pending review.`
        });

        if (window.loadSlots) await window.loadSlots();
        if (window.renderCalendar) await window.renderCalendar();

        this.addBubble('ai', `<span class="voice-bot-success-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> Your appointment has been successfully requested! We sent confirmation emails to you and the Owner. Is there anything else I can do for you?`);
        this.resetState();
      } else {
        this.addBubble('ai', "Booking cancelled. How else can I help you?");
        this.resetState();
      }
    }
  }

  // ── VIEWING FLOW ──────────────────────────────────────────
  async handleViewingSteps(input, text) {
    if (this.state.step === 'waiting_email') {
      const email = text.trim().toLowerCase();
      if (!email.includes('@')) {
        this.addBubble('ai', "Invalid email address. Please provide a valid email.");
        return;
      }

      this.state.slots.email = email;
      const { data: meetings, error } = await db.from('meetings')
        .select('*').eq('email', email)
        .order('date', { ascending: true });

      if (error) throw error;

      if (!meetings || meetings.length === 0) {
        this.addBubble('ai', `I couldn't find any appointments scheduled for email ${email}.`);
        this.resetState();
        return;
      }

      const listStr = meetings.map((m, idx) => `${idx + 1}. "${m.meeting_title}" on ${formatDateShort(m.date)} at ${formatTimeRange(m.start_time, m.end_time)} [Status: ${m.status}]`).join('\n');
      this.addBubble('ai', `Here are your appointments:\n${listStr}`);
      this.resetState();
    }
  }

  // ── CANCELLATION FLOW ─────────────────────────────────────
  async handleCancellationSteps(input, text) {
    const slots = this.state.slots;

    if (this.state.step === 'waiting_email') {
      const email = text.trim().toLowerCase();
      if (!email.includes('@')) {
        this.addBubble('ai', "Invalid email. Please tell me your email address.");
        return;
      }
      slots.email = email;

      const { data: meetings, error } = await db.from('meetings')
        .select('*').eq('email', email)
        .in('status', ['pending', 'approved']);

      if (error) throw error;

      if (!meetings || meetings.length === 0) {
        this.addBubble('ai', `You have no pending or approved appointments that can be cancelled.`);
        this.resetState();
        return;
      }

      slots.meetingsList = meetings;
      if (meetings.length === 1) {
        slots.meetingId = meetings[0].id;
        this.state.step = 'confirm_cancel';
        this.addBubble('ai', `Confirm cancellation for meeting "${meetings[0].meeting_title}" on ${formatDateShort(meetings[0].date)}? Say 'yes' or 'no'.`);
      } else {
        const listStr = meetings.map((m, idx) => `${idx + 1}. "${m.meeting_title}" on ${formatDateShort(m.date)}`).join('\n');
        this.state.step = 'select_meeting';
        this.addBubble('ai', `Please say the number of the meeting you'd like to cancel:\n${listStr}`);
      }
      return;
    }

    if (this.state.step === 'select_meeting') {
      const num = this.parseNumber(input);
      if (num && num > 0 && num <= slots.meetingsList.length) {
        const selected = slots.meetingsList[num - 1];
        slots.meetingId = selected.id;
        this.state.step = 'confirm_cancel';
        this.addBubble('ai', `Confirm cancellation for meeting "${selected.meeting_title}" on ${formatDateShort(selected.date)}? Say 'yes' or 'no'.`);
      } else {
        this.addBubble('ai', "Invalid selection. Please choose one of the available numbers.");
      }
      return;
    }

    if (this.state.step === 'confirm_cancel') {
      if (input.includes('yes') || input.includes('confirm') || input.includes('ok')) {
        const meeting = slots.meetingsList.find(m => m.id === slots.meetingId);
        if (!meeting) throw new Error('Meeting not found');

        if (window.cancelMeetingByVisitor) {
          this.togglePanel(false);
          await window.cancelMeetingByVisitor(meeting.id);
        } else {
          await db.from('meetings').update({ status: 'cancelled', cancelled_by: 'visitor' }).eq('id', meeting.id);
          this.addBubble('ai', "Cancelled successfully.");
        }
        this.resetState();
      } else {
        this.addBubble('ai', "Ok, I did not cancel the appointment. Anything else I can do?");
        this.resetState();
      }
    }
  }

  // ── RESCHEDULING FLOW ─────────────────────────────────────
  async handleReschedulingSteps(input, text) {
    const slots = this.state.slots;

    if (this.state.step === 'waiting_email') {
      const email = text.trim().toLowerCase();
      if (!email.includes('@')) {
        this.addBubble('ai', "Invalid email. Please provide a valid email.");
        return;
      }
      slots.email = email;

      const { data: meetings, error } = await db.from('meetings')
        .select('*').eq('email', email)
        .in('status', ['pending', 'approved']);

      if (error) throw error;

      if (!meetings || meetings.length === 0) {
        this.addBubble('ai', `You have no pending or approved appointments that can be rescheduled.`);
        this.resetState();
        return;
      }

      slots.meetingsList = meetings;
      if (meetings.length === 1) {
        slots.meetingId = meetings[0].id;
        this.state.step = 'waiting_new_date';
        this.addBubble('ai', `We are rescheduling "${meetings[0].meeting_title}". What is the new date? (e.g. YYYY-MM-DD or 'tomorrow')`);
      } else {
        const listStr = meetings.map((m, idx) => `${idx + 1}. "${m.meeting_title}" on ${formatDateShort(m.date)}`).join('\n');
        this.state.step = 'select_meeting';
        this.addBubble('ai', `Please say the number of the meeting you'd like to reschedule:\n${listStr}`);
      }
      return;
    }

    if (this.state.step === 'select_meeting') {
      const num = this.parseNumber(input);
      if (num && num > 0 && num <= slots.meetingsList.length) {
        const selected = slots.meetingsList[num - 1];
        slots.meetingId = selected.id;
        this.state.step = 'waiting_new_date';
        this.addBubble('ai', `We are rescheduling "${selected.meeting_title}". What is the new date? (e.g. YYYY-MM-DD)`);
      } else {
        this.addBubble('ai', "Invalid selection. Please say one of the numbers.");
      }
      return;
    }

    if (this.state.step === 'waiting_new_date') {
      const date = this.parseDate(input);
      if (!date) {
        this.addBubble('ai', "Invalid date format. Please say or type a date like 2026-07-15.");
        return;
      }
      slots.date = date;
      this.state.step = 'waiting_new_time';

      this.addBubble('ai', "Checking available slots for " + formatDate(date) + "...");
      const available = await this.getAvailableSlots(date);
      if (available.length === 0) {
        this.addBubble('ai', `Sorry, there are no slots available on ${formatDate(date)}.`);
        this.state.step = 'waiting_new_date';
        return;
      }

      const listStr = available.map((s, idx) => `${idx + 1}. ${formatTimeRange(s.start_time, s.end_time)}`).join('\n');
      this.addBubble('ai', `Available slots for new date:\n${listStr}\nPlease select a slot number:`);
      return;
    }

    if (this.state.step === 'waiting_new_time') {
      const available = await this.getAvailableSlots(slots.date);
      let selectedSlot = null;

      const num = this.parseNumber(input);
      if (num && num > 0 && num <= available.length) {
        selectedSlot = available[num - 1];
      } else {
        selectedSlot = available.find(s => s.start_time.startsWith(input) || formatTime(s.start_time).toLowerCase().includes(input));
      }

      if (!selectedSlot) {
        this.addBubble('ai', "Invalid slot selection. Please choose an available index.");
        return;
      }

      slots.time = selectedSlot.start_time;
      slots.endTime = selectedSlot.end_time;
      this.state.step = 'confirm_resched';
      this.addBubble('ai', `Confirm reschedule to:\nDate: ${formatDate(slots.date)}\nTime: ${formatTimeRange(slots.time, slots.endTime)}\n\nSay 'yes' to submit.`);
      return;
    }

    if (this.state.step === 'confirm_resched') {
      if (input.includes('yes') || input.includes('confirm') || input.includes('ok')) {
        const meeting = slots.meetingsList.find(m => m.id === slots.meetingId);

        const { error } = await db.from('meetings').update({
          date: slots.date,
          start_time: slots.time,
          end_time: slots.endTime,
          status: 'pending',
          cancelled_by: null,
          cancellation_reason: null
        }).eq('id', slots.meetingId);

        if (error) throw error;

        if (meeting.status === 'approved') {
          try {
            await db.from('slots').update({ status: 'available' })
              .eq('date', meeting.date)
              .eq('start_time', meeting.start_time)
              .eq('status', 'booked');
          } catch (e) {}
        }

        try {
          await db.from('activity_log').insert({
            action: 'rescheduled',
            description: `${meeting.visitor_name} rescheduled their meeting via Voice Bot`,
            meeting_id: slots.meetingId,
            actor: 'visitor'
          });
        } catch (e) {}

        await sendSystemEmail({
          to: CONFIG.OWNER_EMAIL,
          subject: `🔄 Reschedule Requested: ${meeting.visitor_name} (Voice Bot)`,
          message: `Visitor has rescheduled their meeting title: ${meeting.meeting_title}.\nNew Date: ${formatDate(slots.date)} at ${formatTimeRange(slots.time, slots.endTime)}`
        });

        if (window.loadSlots) await window.loadSlots();
        if (window.renderCalendar) await window.renderCalendar();

        this.addBubble('ai', `<span class="voice-bot-success-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span> Your meeting has been rescheduled successfully! It is now pending owner approval. Is there anything else you need?`);
        this.resetState();
      } else {
        this.addBubble('ai', "Rescheduling cancelled.");
        this.resetState();
      }
    }
  }

  // ── DATE/TIME/NUMBER PARSING HELPERS ──────────────────────
  parseNumber(input) {
    const words = {
      'one': 1, 'first': 1,
      'two': 2, 'second': 2, 'to': 2, 'too': 2,
      'three': 3, 'third': 3,
      'four': 4, 'fourth': 4, 'for': 4,
      'five': 5, 'fifth': 5,
      'six': 6, 'sixth': 6,
      'seven': 7, 'seventh': 7,
      'eight': 8, 'eighth': 8, 'ate': 8,
      'nine': 9, 'ninth': 9,
      'ten': 10, 'tenth': 10
    };
    
    const cleanInput = input.toLowerCase().trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    const tokens = cleanInput.split(/\s+/);
    for (const token of tokens) {
      if (words[token] !== undefined) return words[token];
    }
    const digitMatch = cleanInput.match(/\d+/);
    if (digitMatch) {
      return parseInt(digitMatch[0], 10);
    }
    return null;
  }

  parseDate(text) {
    const today = new Date();
    if (text.includes('today')) {
      return getTodayStr();
    }
    if (text.includes('tomorrow')) {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    // Match YYYY-MM-DD
    const match = text.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (match) {
      return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    }
    // Match Month Day (e.g. July 14 or Jul 14)
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthFull = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
    for (let i = 0; i < 12; i++) {
      if (text.includes(months[i]) || text.includes(monthFull[i])) {
        const dayMatch = text.match(/\b(\d{1,2})(st|nd|rd|th)?\b/);
        if (dayMatch) {
          const day = parseInt(dayMatch[1], 10);
          const targetDate = new Date(today.getFullYear(), i, day);
          if (targetDate < today && targetDate.toDateString() !== today.toDateString()) {
            targetDate.setFullYear(today.getFullYear() + 1);
          }
          return targetDate.toISOString().split('T')[0];
        }
      }
    }
    return null;
  }

  parseTime(text) {
    // Parse time like 2 PM, 14:00, 9 AM
    const clean = text.toLowerCase().replace(/[^\s\d:ap]/g, '').trim();
    // Check HH:MM format
    const matchHHMM = clean.match(/(\d{1,2}):(\d{2})/);
    let hour = -1, min = 0;
    
    if (matchHHMM) {
      hour = parseInt(matchHHMM[1], 10);
      min = parseInt(matchHHMM[2], 10);
    } else {
      const matchHour = clean.match(/(\d{1,2})/);
      if (matchHour) hour = parseInt(matchHour[1], 10);
    }

    if (hour === -1) return null;

    // Check PM
    if (clean.includes('pm') && hour < 12) {
      hour += 12;
    } else if (clean.includes('am') && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
  }

  async getAvailableSlots(date) {
    try {
      const { data: slots, error } = await db.from('slots')
        .select('*').eq('date', date).eq('status', 'available')
        .order('start_time');
      if (error) throw error;
      return (slots || []).filter(s => !isSlotPast(s.date, s.end_time));
    } catch (err) {
      console.error(err);
      return [];
    }
  }

  // Reload main dashboard tables/counters
  async refreshOwnerUI() {
    try {
      if (window.loadMeetings) await window.loadMeetings();
      if (window.loadStats) await window.loadStats();
      if (window.loadActivity) await window.loadActivity();
      if (window.renderTable) window.renderTable();
    } catch (e) {
      console.warn("UI refresh warning:", e);
    }
  }

  resetState() {
    this.state = {
      intent: null,
      step: null,
      slots: {
        name: '',
        email: '',
        title: '',
        desc: '',
        date: '',
        time: '',
        endTime: '',
        meetingId: '',
        meetingsList: []
      }
    };
  }
}

// Instantiate voice chatbot when page finishes loading
document.addEventListener('DOMContentLoaded', () => {
  // Check if we are on owner page (has logoutBtn) or visitor page (has meetingForm)
  if (document.getElementById('meetingForm') || document.getElementById('logoutBtn')) {
    window.voiceBot = new VoiceBot();
  }
});
