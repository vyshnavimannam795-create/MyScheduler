// ============================================================
//  MyScheduler — Visitor Page Logic (app.js)
// ============================================================

let visitorAI = null;
let slotsChannel, meetingsChannel;
let currentCalMonth = new Date().getMonth();
let currentCalYear  = new Date().getFullYear();
let selectedDateStr = getTodayStr();

let calendarRenderId = 0;

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme();
  initSupabase();

  // Set default date to today
  const today = getTodayStr();
  document.getElementById('meetingDate').value = today;
  document.getElementById('meetingDate').min   = today;

  // Init Calendar & Load slots
  initCalendar();
  await loadSlots();

  // Subscribe to realtime changes
  subscribeRealtime();

  // Init AI
  visitorAI = new AIAssistant({
    messagesEl: document.getElementById('aiMessages'),
    inputEl:    document.getElementById('aiInput'),
    sendBtn:    document.getElementById('aiSend'),
    chipsEl:    document.getElementById('aiChips'),
    type:       'visitor',
  });

  const clearChatBtn = document.getElementById('visitorNewChat');
  if (clearChatBtn) {
    clearChatBtn.addEventListener('click', () => visitorAI.reset());
  }

  // Owner Dashboard button → login modal
  document.getElementById('btnOwnerDashboard').addEventListener('click', () => openLoginModal());
  const footerOwner = document.getElementById('footerOwnerLink');
  if (footerOwner) {
    footerOwner.addEventListener('click', (e) => {
      e.preventDefault();
      openLoginModal();
    });
  }

  // Login modal events
  document.getElementById('loginClose').addEventListener('click',  closeLoginModal);
  document.getElementById('loginCancel').addEventListener('click', closeLoginModal);
  document.getElementById('loginSubmit').addEventListener('click', handleLogin);
  document.getElementById('passcodeInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
  });

  // Password show/hide
  document.getElementById('pwToggle').addEventListener('click', () => {
    const inp = document.getElementById('passcodeInput');
    const btn = document.getElementById('pwToggle');
    inp.type = inp.type === 'password' ? 'text' : 'password';
    btn.textContent = inp.type === 'password' ? '👁' : '🙈';
  });

  // Form submit
  document.getElementById('meetingForm').addEventListener('submit', handleMeetingSubmit);

  // Description live validation
  document.getElementById('meetingDesc').addEventListener('input', validateDesc);

  // Auto-fill end time when start time is set (+ 1 hour)
  document.getElementById('startTime').addEventListener('change', () => {
    const s = document.getElementById('startTime').value;
    if (s) {
      const [h, m] = s.split(':').map(Number);
      const endH   = String((h + 1) % 24).padStart(2, '0');
      document.getElementById('endTime').value = `${endH}:${String(m).padStart(2,'0')}`;
    }
  });

  // Close modals on overlay click
  document.getElementById('loginOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('loginOverlay')) closeLoginModal();
  });

  // Fetch past requests & upcoming bookings when email changes
  const emailInput = document.getElementById('visitorEmail');
  emailInput.addEventListener('input', debounce(async (e) => {
    const email = e.target.value.trim();
    if (email && email.includes('@')) {
      await loadPastRequests(email);
    } else {
      document.getElementById('pastRequestsStatus').classList.remove('hidden');
      document.getElementById('pastRequestsStatus').textContent = 'Enter your email address above to view your previous requests.';
      document.getElementById('pastRequestsList').classList.add('hidden');
      resetBookingCard();
    }
  }, 400));

  emailInput.addEventListener('change', async (e) => {
    const email = e.target.value.trim();
    if (email && email.includes('@')) {
      await loadPastRequests(email);
    }
  });
});

/* ── LOAD SLOTS ─────────────────────────────────────────────── */
async function loadSlots() {
  try {
    const today = getTodayStr();
    const dateStr = selectedDateStr;

    // Header Date display update
    document.getElementById('slotsHeaderDate').textContent = `Available Time Slots for ${formatDate(dateStr)}`;

    // Fetch slots for selected date
    const { data: slots, error } = await db.from('slots')
      .select('*').eq('date', dateStr).order('start_time');

    if (error) throw error;

    // If no slots exist for today, initialize default ones
    if ((slots || []).length === 0) {
      await initDefaultSlots(dateStr);
      return loadSlots();
    }

    // Get meetings for the selected date
    const { data: meetings } = await db.from('meetings')
      .select('start_time,end_time,status').eq('date', dateStr);

    renderUnifiedSlots(slots || [], meetings || [], dateStr);
  } catch (err) {
    console.error('Load slots error:', err);
  }
}

async function initDefaultSlots(dateStr) {
  const slots = buildDefaultSlotsForDate(dateStr);
  const { error } = await db.from('slots').upsert(slots, { onConflict: 'date,start_time,end_time' });
  if (error) console.error('Init slots error:', error);
}

/* ── RENDER UNIFIED SLOTS ────────────────────────────────────── */
function renderUnifiedSlots(slots, meetings, dateStr) {
  const el = document.getElementById('unifiedSlotList');
  if (!el) return;

  if (slots.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🕐</div><p>No slots available for this day</p></div>`;
    return;
  }

  el.innerHTML = slots.map(slot => {
    const rangeText = formatTimeRange(slot.start_time, slot.end_time);
    const isPast = isSlotPast(dateStr, slot.end_time);
    
    const hasApproved = meetings.some(m => 
      m.start_time === slot.start_time && m.end_time === slot.end_time && m.status === 'approved'
    );

    const pendingMeetings = meetings.filter(m =>
      m.start_time === slot.start_time && m.end_time === slot.end_time && m.status === 'pending'
    );
    const pendingCount = pendingMeetings.length;

    let badgeHtml = '';
    let btnHtml = '';
    let isSlotDisabled = false;

    if (isPast) {
      badgeHtml = `<span class="badge badge-secondary" style="background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb">Completed</span>`;
      btnHtml = `<button type="button" class="btn btn-secondary btn-sm" disabled style="opacity:0.4">🔒 Blocked</button>`;
      isSlotDisabled = true;
    } else if (slot.status === 'blocked' || slot.status === 'booked' || hasApproved) {
      badgeHtml = `<span class="badge badge-danger">Booked</span>`;
      btnHtml = `<button type="button" class="btn btn-secondary btn-sm" disabled style="opacity:0.4">🔒 Blocked</button>`;
      isSlotDisabled = true;
    } else if (pendingCount > 0) {
      badgeHtml = `<span class="badge badge-warning" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe">${pendingCount} Pending</span>`;
      btnHtml = `<button type="button" class="btn btn-primary btn-sm" onclick="selectSlotTime('${slot.start_time}', '${slot.end_time}')">Select</button>`;
    } else {
      badgeHtml = `<span class="badge badge-success">Available</span>`;
      btnHtml = `<button type="button" class="btn btn-primary btn-sm" onclick="selectSlotTime('${slot.start_time}', '${slot.end_time}')">Select</button>`;
    }

    return `
      <div class="slot-item ${isSlotDisabled ? 'booked' : ''}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border)">
        <div style="font-size:13.5px;font-weight:600">${rangeText}</div>
        <div style="display:flex;align-items:center;gap:12px">
          ${badgeHtml}
          ${btnHtml}
        </div>
      </div>`;
  }).join('');
}

/* ── SELECT SLOT → AUTOFILL FORM ─────────────────────────────── */
function selectSlotTime(start, end) {
  document.getElementById('startTime').value = start.slice(0, 5);
  document.getElementById('endTime').value   = end.slice(0, 5);
  
  showToast(`Selected time slot: ${formatTimeRange(start, end)}`, 'success');
  
  const formCard = document.getElementById('meetingForm');
  if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
window.selectSlotTime = selectSlotTime;

/* ── CALENDAR LOGIC ─────────────────────────────────────────── */
function initCalendar() {
  const prev = document.getElementById('calPrevMonth');
  const next = document.getElementById('calNextMonth');
  
  if (prev && next) {
    prev.addEventListener('click', () => {
      currentCalMonth--;
      if (currentCalMonth < 0) {
        currentCalMonth = 11;
        currentCalYear--;
      }
      renderCalendar();
    });

    next.addEventListener('click', () => {
      currentCalMonth++;
      if (currentCalMonth > 11) {
        currentCalMonth = 0;
        currentCalYear++;
      }
      renderCalendar();
    });
  }

  // Sync date input change with calendar
  document.getElementById('meetingDate').addEventListener('change', (e) => {
    const val = e.target.value;
    if (val) {
      selectedDateStr = val;
      const [y, m, d] = val.split('-').map(Number);
      currentCalYear = y;
      currentCalMonth = m - 1;
      renderCalendar();
      loadSlots();
    }
  });

  renderCalendar();
}

async function getMonthData(year, month) {
  const start = `${year}-${String(month + 1).padStart(2,'0')}-01`;
  const end   = `${year}-${String(month + 1).padStart(2,'0')}-31`;
  
  const { data: slots } = await db.from('slots').select('date,status').gte('date', start).lte('date', end);
  const { data: meetings } = await db.from('meetings').select('date,status,new_date').gte('date', start).lte('date', end);
  
  return { slots: slots || [], meetings: meetings || [] };
}

async function renderCalendar() {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calMonthYear');
  if (!grid || !label) return;

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  label.textContent = `${monthNames[currentCalMonth]} ${currentCalYear}`;

  const currentId = ++calendarRenderId;

  let slots = [];
  let meetings = [];
  try {
    const data = await getMonthData(currentCalYear, currentCalMonth);
    if (currentId !== calendarRenderId) return; // Stale render request, abort
    slots = data.slots || [];
    meetings = data.meetings || [];
  } catch (err) {
    console.error('Failed to load month calendar data:', err);
    if (currentId !== calendarRenderId) return; // Stale render request, abort
  }

  // Clear dates grid only after data has loaded to prevent stacking and duplicate renders
  grid.innerHTML = '';

  const firstDayIndex = new Date(currentCalYear, currentCalMonth, 1).getDay();
  const daysInMonth = new Date(currentCalYear, currentCalMonth + 1, 0).getDate();
  const prevDaysInMonth = new Date(currentCalYear, currentCalMonth, 0).getDate();
  const todayStr = getTodayStr();

  // 1. Prev month trailing days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const day = prevDaysInMonth - i;
    const cell = document.createElement('div');
    cell.className = 'calendar-date-cell other-month disabled';
    cell.textContent = day;
    grid.appendChild(cell);
  }

  // 2. Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentCalYear}-${String(currentCalMonth + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const cell = document.createElement('div');
    cell.className = 'calendar-date-cell';
    cell.textContent = day;

    if (dateStr < todayStr) {
      cell.classList.add('disabled');
    }

    if (dateStr === selectedDateStr) {
      cell.classList.add('active');
    }

    const daySlots = slots.filter(s => s.date === dateStr);
    const dayMeetings = meetings.filter(m => m.date === dateStr);

    let dotColor = '';
    const rescheduledCount = dayMeetings.filter(m => m.status === 'pending' && m.new_date).length;
    
    if (rescheduledCount > 0) {
      dotColor = 'blue';
    } else {
      const availCount = daySlots.length > 0 
        ? daySlots.filter(s => s.status === 'available').length 
        : 6;
      
      if (availCount === 0) {
        dotColor = 'red';
      } else if (availCount <= 2) {
        dotColor = 'yellow';
      } else {
        dotColor = 'green';
      }
    }

    if (dotColor && dateStr >= todayStr) {
      const dot = document.createElement('span');
      dot.className = `calendar-dot ${dotColor}`;
      cell.appendChild(dot);
    }

    cell.addEventListener('click', () => {
      document.querySelectorAll('.calendar-date-cell').forEach(c => c.classList.remove('active'));
      cell.classList.add('active');
      selectedDateStr = dateStr;
      document.getElementById('meetingDate').value = dateStr;
      loadSlots();
    });

    grid.appendChild(cell);
  }

  // 3. Next month leading days
  const totalCells = firstDayIndex + daysInMonth;
  const targetCells = totalCells <= 35 ? 35 : 42;
  const remaining = targetCells - totalCells;
  for (let i = 1; i <= remaining; i++) {
    const cell = document.createElement('div');
    cell.className = 'calendar-date-cell other-month disabled';
    cell.textContent = i;
    grid.appendChild(cell);
  }
}

/* ── PAST REQUESTS & BOOKINGS ────────────────────────────────── */
async function loadPastRequests(email) {
  const statusEl = document.getElementById('pastRequestsStatus');
  const listEl = document.getElementById('pastRequestsList');
  if (!statusEl || !listEl) return;

  statusEl.textContent = 'Searching requests…';
  
  const { data: meetings, error } = await db.from('meetings')
    .select('*')
    .eq('email', email)
    .order('requested_at', { ascending: false });

  if (error) {
    statusEl.textContent = 'Error loading requests.';
    return;
  }

  if (!meetings || meetings.length === 0) {
    statusEl.textContent = 'No previous requests found for this email.';
    listEl.classList.add('hidden');
    resetBookingCard();
    return;
  }

  statusEl.classList.add('hidden');
  listEl.classList.remove('hidden');

  listEl.innerHTML = meetings.map(m => {
    const dateStr = formatDateShort(m.date);
    const timeStr = formatTimeRange(m.start_time, m.end_time);
    const isCancelable = m.status === 'pending' || m.status === 'approved';
    const cancelBtn = isCancelable
      ? `<button class="btn btn-danger btn-xs" onclick="cancelMeetingByVisitor('${m.id}')" style="margin-left: 8px; padding: 4px 8px; font-size: 10px; border-radius: 4px; line-height: 1; border: none; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; height: 22px;">Cancel</button>`
      : '';
    return `
      <div style="background:var(--surface-2);border:1px solid var(--border);padding:10px 12px;border-radius:6px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:700;color:var(--text)">${escapeHtml(m.meeting_title)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📅 ${dateStr} at ${timeStr}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${statusPill(m.status, m)}
          ${cancelBtn}
        </div>
      </div>`;
  }).join('');

  // Update upcoming Booking Details card
  const now = new Date();
  const upcoming = meetings.find(m => {
    if (m.status !== 'approved') return false;
    const mDateTime = new Date(m.date + 'T' + m.start_time);
    return mDateTime > now;
  });

  const bookingBody = document.getElementById('visitorBookingBody');
  if (bookingBody) {
    if (upcoming) {
      bookingBody.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:8px;text-align:left;background:#f5f3ff;border:1px solid rgba(124, 58, 237, 0.2);padding:12px;border-radius:8px;width:100%">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="font-size:24px">🎉</div>
            <div>
              <div style="font-size:13px;font-weight:700;color:var(--clr-primary)">Upcoming Confirmed Meeting</div>
              <div style="font-size:12.5px;font-weight:600;margin-top:2px">${escapeHtml(upcoming.meeting_title)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📅 ${formatDate(upcoming.date)}</div>
              <div style="font-size:11px;color:var(--text-muted)">⏰ ${formatTimeRange(upcoming.start_time, upcoming.end_time)}</div>
            </div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="cancelMeetingByVisitor('${upcoming.id}')" style="margin-top:4px;width:100%;font-size:11px;padding:6px;cursor:pointer">Cancel Meeting</button>
        </div>`;
    } else {
      resetBookingCard();
    }
  }
}

function resetBookingCard() {
  const bookingBody = document.getElementById('visitorBookingBody');
  if (bookingBody) {
    bookingBody.innerHTML = `
      <div style="font-size:32px;margin-bottom:8px">📅</div>
      <p class="text-sm font-semibold" style="margin-bottom:4px">You don't have any upcoming booking.</p>
      <p class="text-xs text-muted">Book a meeting to see your details here.</p>`;
  }
}

/* ── FORM VALIDATION ─────────────────────────────────────────── */
function validateDesc() {
  const val    = document.getElementById('meetingDesc').value;
  const helper = document.getElementById('descHelper');
  const len    = val.length;
  helper.textContent = `${len}/25 characters minimum`;
  helper.className   = len >= 25 ? 'helper-text' : 'helper-text error-text';
}

/* ── SUBMIT MEETING REQUEST ──────────────────────────────────── */
async function handleMeetingSubmit(e) {
  e.preventDefault();
  clearFieldErrors();

  const name  = document.getElementById('visitorName').value.trim();
  const email = document.getElementById('visitorEmail').value.trim();
  const title = document.getElementById('meetingTitle').value.trim();
  const desc  = document.getElementById('meetingDesc').value.trim();
  const date  = document.getElementById('meetingDate').value;
  const start = document.getElementById('startTime').value;
  const end   = document.getElementById('endTime').value;

  let hasError = false;

  if (!name)  { setFieldError('visitorName', 'Name is required'); hasError = true; }
  if (!email || !email.includes('@')) { setFieldError('visitorEmail', 'Valid email required'); hasError = true; }
  if (!title) { setFieldError('meetingTitle', 'Meeting title is required'); hasError = true; }
  if (desc.length < 25) { setFieldError('meetingDesc', 'Description must be at least 25 characters'); hasError = true; }
  if (!date)  { setFieldError('meetingDate', 'Date is required'); hasError = true; }
  if (!start) { setFieldError('startTime', 'Start time required'); hasError = true; }
  if (!end)   { setFieldError('endTime', 'End time required'); hasError = true; }
  if (start && end && start >= end) { setFieldError('endTime', 'End time must be after start time'); hasError = true; }

  if (hasError) return;

  // Check for date/time conflict
  const { data: existing } = await db.from('meetings')
    .select('id').eq('date', date).eq('start_time', start + ':00')
    .in('status', ['approved']);

  if (existing && existing.length > 0) {
    showToast('That time is already booked. Please choose another slot.', 'error');
    return;
  }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Submitting…';

  try {
    const payload = {
      visitor_name:    name,
      email:           email,
      meeting_title:   title,
      description:     desc,
      date:            date,
      start_time:      start + ':00',
      end_time:        end   + ':00',
      status:          'pending',
      visitor_message: desc,
    };

    const { error } = await db.from('meetings').insert(payload);
    if (error) throw error;

    // Log activity
    try {
      await db.from('activity_log').insert({
        action:      'requested',
        description: `${name} requested a meeting`,
        actor:       'visitor',
      });
    } catch (e) {
      console.warn('Activity log err:', e);
    }

    // Send email notification to owner (vyshnavimannam795@gmail.com)
    await sendSystemEmail({
      to: CONFIG.OWNER_EMAIL,
      subject: `📅 New Meeting Request from ${name}`,
      message: `
Hello Vyshnavi!

You have a new meeting request on MyScheduler.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VISITOR DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name    : ${name}
Email   : ${email}

MEETING DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title   : ${title}
Date    : ${formatDate(date)}
Time    : ${formatTimeRange(start + ':00', end + ':00')}
Description:
${desc}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Please log in to your dashboard to approve or reject this request.

Dashboard: ${window.location.origin}/owner.html
      `.trim()
    });

    // Send confirmation email to visitor (sends via EmailJS if configured)
    await sendSystemEmail({
      to: email,
      subject: `📅 Meeting Request Received — MyScheduler`,
      message: `
Hello ${name},

Your meeting request has been successfully sent to Vyshnavi Mannam.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title   : ${title}
Date    : ${formatDate(date)}
Time    : ${formatTimeRange(start + ':00', end + ':00')}

Status  : Pending

Your request is sent to the Owner and the current status is pending. We will notify you once Vyshnavi reviews and updates your request.

Thank you,
MyScheduler System
      `.trim()
    });

    showToast('Meeting request submitted! You\'ll hear back soon.', 'success');
    document.getElementById('meetingForm').reset();
    document.getElementById('meetingDate').value = getTodayStr();
    document.getElementById('descHelper').textContent = 'Minimum 25 characters';
    document.getElementById('descHelper').className   = 'helper-text';

    await loadSlots();

  } catch (err) {
    console.error('Submit error:', err);
    showToast('Something went wrong: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '✈ Request Meeting';
  }
}

function setFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.add('error');
    let helper = el.nextElementSibling;
    if (!helper || !helper.classList.contains('helper-text')) {
      helper = document.createElement('div');
      helper.className = 'helper-text error-text';
      el.parentNode.insertBefore(helper, el.nextSibling);
    }
    helper.textContent = msg;
    helper.className   = 'helper-text error-text';
  }
}

function clearFieldErrors() {
  document.querySelectorAll('.input.error, .textarea.error').forEach(el => el.classList.remove('error'));
}

/* ── OWNER LOGIN MODAL ──────────────────────────────────────── */
function openLoginModal() {
  document.getElementById('loginOverlay').classList.add('active');
  document.getElementById('passcodeInput').value = '';
  document.getElementById('loginError').classList.add('hidden');
  setTimeout(() => document.getElementById('passcodeInput').focus(), 100);
}

function closeLoginModal() {
  document.getElementById('loginOverlay').classList.remove('active');
  document.getElementById('passcodeInput').value = '';
  document.getElementById('loginError').classList.add('hidden');
}

async function handleLogin() {
  const passcode = document.getElementById('passcodeInput').value;
  if (!passcode) return;

  const btn = document.getElementById('loginSubmit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';

  try {
    const hash = await sha256(passcode);

    const { data, error } = await db.from('settings')
      .select('value').eq('key', 'owner_passcode_hash').single();

    if (error || !data) throw new Error('Could not verify passcode');

    if (hash === data.value) {
      setOwnerAuth(true);
      closeLoginModal();
      showAccessGranted();
    } else {
      document.getElementById('loginError').classList.remove('hidden');
      document.getElementById('passcodeInput').value = '';
      document.getElementById('passcodeInput').focus();
    }
  } catch (err) {
    console.error('Login error:', err);
    document.getElementById('loginError').classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Login';
  }
}

/* ── ACCESS GRANTED ─────────────────────────────────────────── */
function showAccessGranted() {
  document.getElementById('accessOverlay').classList.add('active');
  setTimeout(() => {
    window.location.href = 'owner.html';
  }, 1800);
}

/* ── REALTIME ────────────────────────────────────────────────── */
function subscribeRealtime() {
  slotsChannel = db.channel('visitor-slots')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'slots' }, () => { loadSlots(); renderCalendar(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, () => { loadSlots(); renderCalendar(); })
    .subscribe();
}

async function cancelMeetingByVisitor(meetingId) {
  const reason = prompt("Please enter a reason for cancelling this meeting (optional):");
  if (reason === null) return; // User cancelled prompt
  
  const { data: meeting, error: fetchErr } = await db.from('meetings').select('*').eq('id', meetingId).single();
  if (fetchErr || !meeting) {
    showToast('Error finding meeting: ' + (fetchErr?.message || 'Not found'), 'error');
    return;
  }

  const oldStatus = meeting.status;
  
  // Update meeting status
  const { error: updateErr } = await db.from('meetings')
    .update({
      status: 'cancelled',
      cancelled_by: 'visitor',
      cancellation_reason: reason || 'Cancelled by visitor'
    })
    .eq('id', meetingId);
  
  if (updateErr) {
    showToast('Error cancelling meeting: ' + updateErr.message, 'error');
    return;
  }

  // If it was approved, reopen the slot
  if (oldStatus === 'approved') {
    try {
      await db.from('slots').update({ status: 'available' })
        .eq('date', meeting.date)
        .eq('start_time', meeting.start_time)
        .eq('status', 'booked');
    } catch (e) {
      console.warn('Reopen slot error:', e);
    }
  }

  // Log to activity log
  try {
    await db.from('activity_log').insert({
      action: 'cancelled',
      description: `${meeting.visitor_name} cancelled their meeting request`,
      meeting_id: meetingId,
      actor: 'visitor'
    });
  } catch (e) {
    console.warn('Log activity error:', e);
  }

  // Send email notifications
  const dateStr = formatDate(meeting.date);
  const timeStr = formatTimeRange(meeting.start_time, meeting.end_time);

  // Email to Owner
  const ownerSubject = `MyScheduler Action: Visitor Cancelled meeting with ${meeting.visitor_name}`;
  const ownerMsg = `
Hello Vyshnavi,

The meeting request from ${meeting.visitor_name} has been CANCELLED by the visitor.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (CANCELLED BY VISITOR)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${meeting.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}
Reason : ${reason || 'Cancelled by visitor'}
By     : visitor

— MyScheduler System
  `.trim();

  await sendSystemEmail({
    to: CONFIG.OWNER_EMAIL,
    subject: ownerSubject,
    message: ownerMsg
  });

  // Email to Visitor
  const visitorSubject = `MyScheduler: Meeting Cancelled`;
  const visitorMsg = `
Hello ${meeting.visitor_name},

This email confirms that your meeting request has been successfully CANCELLED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (CANCELLED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${meeting.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}
Reason : ${reason || 'Cancelled by visitor'}

If you would like to select another time slot, please visit the booking page again.

Booking Page: ${window.location.origin}/index.html

Thank you,
MyScheduler System
  `.trim();

  await sendSystemEmail({
    to: meeting.email,
    subject: visitorSubject,
    message: visitorMsg
  });

  showToast('Meeting cancelled successfully.', 'success');
  
  // Refresh visitor view
  const emailInput = document.getElementById('visitorEmail').value.trim();
  if (emailInput) {
    await loadPastRequests(emailInput);
  }
}

window.cancelMeetingByVisitor = cancelMeetingByVisitor;

