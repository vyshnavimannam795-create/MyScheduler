// ============================================================
//  MyScheduler — Owner Dashboard Logic (owner.js)
// ============================================================

/* ── State ──────────────────────────────────────────────────── */
let allMeetings    = [];
let currentPage    = 1;
const PAGE_SIZE    = 6;
let selectedMeeting = null;
let selectedSlot   = null;
let dashAI, fullAI;
let realtimeChannel;

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  // Auth guard
  if (!isOwnerAuth()) {
    window.location.href = 'index.html';
    return;
  }

  applyTheme();
  initSupabase();

  // Live clock
  updateClock();
  setInterval(updateClock, 30000);

  // Nav switching
  document.querySelectorAll('.nav-link[data-view]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      showView(link.dataset.view);
    });
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', () => {
    setOwnerAuth(false);
    window.location.href = 'index.html';
  });

  // Load data
  await Promise.all([loadStats(), loadMeetings(), loadActivity()]);

  // Init AI panels
  dashAI = new AIAssistant({
    messagesEl: document.getElementById('dashAiMessages'),
    inputEl:    document.getElementById('dashAiInput'),
    sendBtn:    document.getElementById('dashAiSend'),
    chipsEl:    document.getElementById('dashAiChips'),
    type:       'owner',
  });

  fullAI = new AIAssistant({
    messagesEl: document.getElementById('fullAiMessages'),
    inputEl:    document.getElementById('fullAiInput'),
    sendBtn:    document.getElementById('fullAiSend'),
    chipsEl:    document.getElementById('fullAiChips'),
    type:       'owner',
  });

  document.getElementById('dashNewChat').addEventListener('click', () => dashAI.reset());
  document.getElementById('fullAiNewChat').addEventListener('click', () => fullAI.reset());

  // Search + filter (dashboard table)
  document.getElementById('searchInput').addEventListener('input', debounce(() => { currentPage = 1; renderTable(); }, 300));
  document.getElementById('statusFilter').addEventListener('change', () => { currentPage = 1; renderTable(); });

  // Search + filter (requests view)
  document.getElementById('reqSearch').addEventListener('input', debounce(() => renderFilteredTable('reqTableBody','reqPagInfo','reqPageBtns',
    document.getElementById('reqStatusFilter').value, document.getElementById('reqSearch').value), 300));
  document.getElementById('reqStatusFilter').addEventListener('change', () => renderFilteredTable('reqTableBody','reqPagInfo','reqPageBtns',
    document.getElementById('reqStatusFilter').value, document.getElementById('reqSearch').value));

  // Slot management (dashboard buttons)
  document.getElementById('btnAddSlot').addEventListener('click',    () => openModal('addSlotOverlay'));
  document.getElementById('btnEditSlot').addEventListener('click',   editSelectedSlot);
  document.getElementById('btnBlockSlot').addEventListener('click',  () => blockSelectedSlotDash());
  document.getElementById('btnDeleteSlot').addEventListener('click', () => deleteSelectedSlotDash());
  document.getElementById('btnReopenSlot').addEventListener('click', () => reopenSelectedSlotDash());
  document.getElementById('btnInitSlots').addEventListener('click',  initTodaySlots);
  document.getElementById('confirmAddSlot').addEventListener('click', confirmAddSlot);
  document.getElementById('modalSlotDate').value = getTodayStr();

  // Reschedule
  document.getElementById('btnSendReschedule').addEventListener('click', sendReschedule);
  document.getElementById('reschedDate').value = getTodayStr();

  // Settings
  document.getElementById('darkModeToggle').checked = localStorage.getItem('ms-theme') === 'dark';
  document.getElementById('darkModeToggle').addEventListener('change', () => {
    const t = toggleTheme();
    showToast(`Switched to ${t} mode`, 'info');
  });
  document.getElementById('settingName').value = CONFIG.OWNER_NAME;
  document.getElementById('saveNameBtn').addEventListener('click', saveName);
  document.getElementById('changePasscodeBtn').addEventListener('click', changePasscode);

  // Slot filter (slots view)
  document.getElementById('slotFilterDate').value = getTodayStr();
  document.getElementById('slotFilterDate').addEventListener('change', loadSlotsView);
  document.getElementById('slotFilterStatus').addEventListener('change', loadSlotsView);
  document.getElementById('newSlotDate').value = getTodayStr();

  // Action confirm buttons
  document.getElementById('confirmCancelBtn').addEventListener('click',   confirmCancel);
  document.getElementById('confirmApproveBtn').addEventListener('click',  confirmApprove);
  document.getElementById('confirmCompleteBtn').addEventListener('click', confirmComplete);

  // Clear Activity Log
  const clearBtn = document.getElementById('btnClearActivity');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to clear the entire activity log history?')) return;
      
      const { error } = await db.from('activity_log').delete().neq('actor', '');
      if (error) {
        showToast('Error clearing activity log: ' + error.message, 'error');
      } else {
        showToast('Activity log cleared successfully!', 'success');
        await loadActivity();
      }
    });
  }

  // Realtime
  subscribeRealtime();
});

/* ── CLOCK ──────────────────────────────────────────────────── */
function updateClock() {
  const el = document.getElementById('liveDateTime');
  if (el) el.textContent = getLiveDateTimeStr();
}

/* ── NAV VIEWS ──────────────────────────────────────────────── */
function showView(viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');

  const link = document.querySelector(`.nav-link[data-view="${viewName}"]`);
  if (link) link.classList.add('active');

  // View-specific init
  if (viewName === 'requests')  renderFilteredTable('reqTableBody', 'reqPagInfo', 'reqPageBtns', '', '');
  if (viewName === 'approved')  renderFilteredTable('approvedBody', null, null, 'approved', '');
  if (viewName === 'completed') renderFilteredTable('completedBody', null, null, 'completed', '');
  if (viewName === 'cancelled') renderFilteredTable('cancelledBody', null, null, 'cancelled', '');
  if (viewName === 'past')      renderPastMeetings();
  if (viewName === 'reports')   renderReports();
  if (viewName === 'slots')     loadSlotsView();
}

/* ── LOAD STATS ─────────────────────────────────────────────── */
async function loadStats() {
  const { data } = await db.from('meetings').select('status');
  const m = data || [];
  const counts = {
    total:     m.length,
    pending:   m.filter(x => x.status === 'pending').length,
    approved:  m.filter(x => x.status === 'approved').length,
    rejected:  m.filter(x => x.status === 'rejected').length,
    cancelled: m.filter(x => x.status === 'cancelled').length,
    completed: m.filter(x => x.status === 'completed').length,
  };
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setEl('st-total',     counts.total);
  setEl('st-pending',   counts.pending);
  setEl('st-approved',  counts.approved);
  setEl('st-rejected',  counts.rejected);
  setEl('st-cancelled', counts.cancelled);
  setEl('st-completed', counts.completed);
}

/* ── LOAD MEETINGS ──────────────────────────────────────────── */
async function loadMeetings() {
  const { data, error } = await db.from('meetings').select('*').order('requested_at', { ascending: false });
  if (!error) {
    allMeetings = data || [];
    renderTable(); // Refresh dashboard table
    
    // Refresh the table of whichever sidebar sub-view is currently active
    const activeLink = document.querySelector('.nav-link.active');
    if (activeLink) {
      const activeView = activeLink.dataset.view;
      if (activeView === 'requests') {
        renderFilteredTable('reqTableBody', 'reqPagInfo', 'reqPageBtns', 
          document.getElementById('reqStatusFilter').value, document.getElementById('reqSearch').value);
      } else if (activeView === 'approved') {
        renderFilteredTable('approvedBody', null, null, 'approved', '');
      } else if (activeView === 'completed') {
        renderFilteredTable('completedBody', null, null, 'completed', '');
      } else if (activeView === 'cancelled') {
        renderFilteredTable('cancelledBody', null, null, 'cancelled', '');
      }
    }
  }
}

/* ── RENDER DASHBOARD TABLE ─────────────────────────────────── */
function renderTable() {
  const filter = document.getElementById('statusFilter').value;
  const search = document.getElementById('searchInput').value.toLowerCase();
  renderFilteredTable('meetingsBody', 'paginationInfo', 'pageButtons', filter, search, true);
}

function renderFilteredTable(bodyId, infoId, pageId, filterStatus, search, paginate = false) {
  let rows = allMeetings;

  if (filterStatus) rows = rows.filter(m => m.status === filterStatus);
  if (search)       rows = rows.filter(m =>
    m.visitor_name.toLowerCase().includes(search) ||
    m.email.toLowerCase().includes(search) ||
    m.meeting_title.toLowerCase().includes(search)
  );

  const total = rows.length;
  let paged = rows;

  if (paginate) {
    const start = (currentPage - 1) * PAGE_SIZE;
    paged = rows.slice(start, start + PAGE_SIZE);
    if (infoId) {
      const infoEl = document.getElementById(infoId);
      if (infoEl) {
        const from = total ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
        const to   = Math.min(currentPage * PAGE_SIZE, total);
        infoEl.textContent = `Showing ${from} to ${to} of ${total} entries`;
      }
    }
    renderPageButtons(pageId, Math.ceil(total / PAGE_SIZE));
  } else if (infoId) {
    const infoEl = document.getElementById(infoId);
    if (infoEl) infoEl.textContent = `Showing ${total} entries`;
  }

  const tbody = document.getElementById(bodyId);
  if (!tbody) return;

  if (paged.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📭</div>No meetings found</div></td></tr>`;
    return;
  }

  tbody.innerHTML = paged.map(m => {
    const isSelected = selectedMeeting?.id === m.id;
    const actions = buildRowActions(m);
    return `
      <tr class="${isSelected ? 'selected' : ''}" onclick="selectMeetingRow('${m.id}')">
        <td class="td-name">${escapeHtml(m.visitor_name)}</td>
        <td class="td-email">${escapeHtml(m.email)}</td>
        <td>${escapeHtml(m.meeting_title)}</td>
        <td class="td-date">${formatDateShort(m.date)}</td>
        <td>${formatTimeRange(m.start_time, m.end_time)}</td>
        <td>${statusPill(m.status, m)}</td>
        <td><div class="action-group" onclick="event.stopPropagation()">${actions}</div></td>
      </tr>`;
  }).join('');
}

function buildRowActions(m) {
  const id = m.id;
  if (m.status === 'pending' && m.new_date) {
    return `
      <span class="text-xs text-muted" style="margin-right:6px">Reschedule Sent</span>
      <button class="btn btn-secondary btn-sm" onclick="showCancelInput('${id}')">Cancel</button>
      <button class="btn btn-outline btn-sm"   onclick="selectMeetingRow('${id}')">View</button>`;
  }
  if (m.status === 'pending') {
    return `
      <button class="btn btn-success btn-sm" onclick="quickApprove('${id}')">Approve</button>
      <button class="btn btn-danger btn-sm"  onclick="quickReject('${id}')">Reject</button>
      <button class="btn btn-info btn-sm"    onclick="quickReschedule('${id}')">Reschedule</button>
      <button class="btn btn-secondary btn-sm" onclick="showCancelInput('${id}')">Cancel</button>`;
  }
  if (m.status === 'approved') {
    return `
      <button class="btn btn-secondary btn-sm" onclick="showCancelInput('${id}')">Cancel</button>
      <button class="btn btn-primary btn-sm"   onclick="selectMeetingRow('${id}');showCompleteInput()">Mark Completed</button>
      <button class="btn btn-outline btn-sm"   onclick="selectMeetingRow('${id}')">View</button>`;
  }
  if (m.status === 'completed' || m.status === 'rejected' || m.status === 'cancelled') {
    return `
      <button class="btn btn-solid-danger btn-sm" onclick="deleteMeeting('${id}')">🗑 Delete</button>
      <button class="btn btn-outline btn-sm"      onclick="selectMeetingRow('${id}')">View</button>`;
  }
  return `<button class="btn btn-outline btn-sm" onclick="selectMeetingRow('${id}')">View</button>`;
}

/* ── PAGE BUTTONS ───────────────────────────────────────────── */
function renderPageButtons(pageId, totalPages) {
  const el = document.getElementById(pageId);
  if (!el) return;
  let html = `<button class="page-btn" ${currentPage===1?'disabled':''} onclick="goPage(${currentPage-1})">‹</button>`;
  for (let i = 1; i <= Math.min(totalPages, 7); i++) {
    html += `<button class="page-btn ${i===currentPage?'active':''}" onclick="goPage(${i})">${i}</button>`;
  }
  html += `<button class="page-btn" ${currentPage>=totalPages?'disabled':''} onclick="goPage(${currentPage+1})">›</button>`;
  el.innerHTML = html;
}

function goPage(n) {
  currentPage = n;
  renderTable();
}

/* ── SELECT MEETING ─────────────────────────────────────────── */
function selectMeetingRow(id) {
  selectedMeeting = allMeetings.find(m => m.id === id);
  if (!selectedMeeting) return;
  renderTable();
  renderSelectedMeeting(selectedMeeting);
  document.getElementById('selectedMeetingCard').classList.remove('hidden');
  document.getElementById('selectedMeetingCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Render previous requests from the same user
  const otherMeetings = allMeetings.filter(x => x.email === selectedMeeting.email && x.id !== selectedMeeting.id);
  const prevCard = document.getElementById('userPreviousRequestsCard');
  const prevList = document.getElementById('userPreviousRequestsList');
  if (prevCard && prevList) {
    if (otherMeetings.length === 0) {
      prevList.innerHTML = `<p class="text-xs text-muted" style="text-align:center;padding:8px 0">No previous requests found for this user.</p>`;
    } else {
      prevList.innerHTML = otherMeetings.map(x => {
        const dateStr = formatDateShort(x.date);
        const timeStr = formatTimeRange(x.start_time, x.end_time);
        return `
          <div style="background:var(--surface-2);border:1px solid var(--border);padding:10px 12px;border-radius:6px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700;color:var(--text)">${escapeHtml(x.meeting_title)}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">📅 ${dateStr} at ${timeStr}</div>
            </div>
            <div>
              ${statusPill(x.status, x)}
            </div>
          </div>`;
      }).join('');
    }
    prevCard.classList.remove('hidden');
  }
}

function clearSelectedMeeting() {
  selectedMeeting = null;
  document.getElementById('selectedMeetingCard').classList.add('hidden');
  const prevCard = document.getElementById('userPreviousRequestsCard');
  if (prevCard) prevCard.classList.add('hidden');
  hideCancelInput();
  hideApproveInput();
  hideCompleteInput();
  renderTable();
}

function renderSelectedMeeting(m) {
  hideCancelInput(); hideApproveInput(); hideCompleteInput();

  const color = avatarColor(m.visitor_name);
  document.getElementById('selectedAvatar').textContent  = getInitials(m.visitor_name);
  document.getElementById('selectedAvatar').style.background = color;
  document.getElementById('selectedName').textContent    = m.visitor_name;
  document.getElementById('selectedEmail').textContent   = m.email;
  document.getElementById('selectedPhone').textContent   = m.phone || 'N/A';
  document.getElementById('selectedTitle').textContent   = m.meeting_title;
  document.getElementById('selectedDateTime').textContent = `${formatDate(m.date)}  ${formatTimeRange(m.start_time, m.end_time)}`;
  document.getElementById('selectedDesc').textContent    = m.description;
  document.getElementById('selectedMessage').textContent = m.visitor_message || m.description;
  document.getElementById('selectedRequestedAt').textContent = 'Requested on: ' + formatDateTime(m.requested_at);
  document.getElementById('selectedStatus').innerHTML    = statusPill(m.status, m);

  // Show/hide owner remarks
  const remarksDisplay = document.getElementById('ownerRemarksDisplay');
  if (m.owner_remarks) {
    remarksDisplay.classList.remove('hidden');
    document.getElementById('selectedOwnerRemarks').textContent = m.owner_remarks;
  } else {
    remarksDisplay.classList.add('hidden');
  }

  // Show/hide cancel reason
  const cancelDisplay = document.getElementById('cancelReasonDisplay');
  if (m.cancellation_reason) {
    cancelDisplay.classList.remove('hidden');
    document.getElementById('selectedCancelReason').textContent = m.cancellation_reason;
  } else {
    cancelDisplay.classList.add('hidden');
  }

  // Owner action buttons
  const box = document.getElementById('ownerActionButtons');
  if (m.status === 'pending' && m.new_date) {
    box.innerHTML = `
      <button class="btn btn-warning w-full mb-2" onclick="showCancelInput('${m.id}')">⊘ Cancel Meeting</button>
      <p class="text-sm text-muted mt-2" style="font-style:italic">Waiting for visitor response to reschedule suggestion to ${formatDateShort(m.new_date)} at ${formatTimeRange(m.new_start_time, m.new_end_time)}.</p>`;
  } else if (m.status === 'pending') {
    box.innerHTML = `
      <button class="btn btn-solid-success w-full mb-2" onclick="showApproveInput()">✓ Approve Meeting</button>
      <button class="btn btn-solid-danger  w-full mb-2" onclick="quickReject('${m.id}')">✕ Reject Meeting</button>
      <button class="btn btn-info w-full mb-2"          onclick="scrollToReschedule()">🔄 Suggest Reschedule</button>
      <button class="btn btn-warning w-full"             onclick="showCancelInput('${m.id}')">⊘ Cancel Meeting</button>`;
  } else if (m.status === 'approved') {
    box.innerHTML = `
      <button class="btn btn-warning w-full mb-2"  onclick="showCancelInput('${m.id}')">⊘ Cancel Meeting</button>
      <button class="btn btn-primary w-full mb-2"  onclick="showCompleteInput()">🏁 Mark as Completed</button>
      <button class="btn btn-info w-full"           onclick="scrollToReschedule()">🔄 Suggest Reschedule</button>`;
  } else if (m.status === 'completed' || m.status === 'rejected' || m.status === 'cancelled') {
    box.innerHTML = `
      <button class="btn btn-solid-danger w-full" onclick="deleteMeeting('${m.id}')">🗑 Delete Request</button>
      <p class="text-xs text-muted mt-2" style="font-style:italic;text-align:center">This request is finalized (${m.status}). You can delete it from the system.</p>`;
  } else {
    box.innerHTML = `<p class="text-sm text-muted">No actions available for ${m.status} meetings.</p>`;
  }
}

/* ── QUICK ACTIONS ──────────────────────────────────────────── */
async function quickApprove(id) {
  await updateMeetingStatus(id, 'approved', { owner_remarks: '' });
  showToast('Meeting approved!', 'success');
  logActivity('approved', allMeetings.find(m=>m.id===id)?.visitor_name + ' meeting approved', id);
}

async function quickReject(id) {
  await updateMeetingStatus(id, 'rejected');
  showToast('Meeting rejected.', 'warning');
  logActivity('rejected', allMeetings.find(m=>m.id===id)?.visitor_name + ' meeting rejected', id);
}

async function quickReschedule(id) {
  selectedMeeting = allMeetings.find(m=>m.id===id);
  renderTable();
  renderSelectedMeeting(selectedMeeting);
  document.getElementById('selectedMeetingCard').classList.remove('hidden');
  scrollToReschedule();
}

function scrollToReschedule() {
  const el = document.querySelector('#view-dashboard .dash-bottom-row .card:nth-child(2)');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ── CANCEL ─────────────────────────────────────────────────── */
function showCancelInput(id) {
  if (id) selectedMeeting = allMeetings.find(m => m.id === id);
  if (!selectedMeeting) return;
  renderSelectedMeeting(selectedMeeting);
  document.getElementById('selectedMeetingCard').classList.remove('hidden');
  document.getElementById('cancelReasonInput').classList.remove('hidden');
  document.getElementById('cancelReasonText').value = '';
  document.getElementById('cancelReasonText').focus();
  document.getElementById('cancelReasonInput').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function hideCancelInput() {
  document.getElementById('cancelReasonInput').classList.add('hidden');
}

async function confirmCancel() {
  if (!selectedMeeting) return;
  const reason = document.getElementById('cancelReasonText').value.trim();
  if (!reason) { showToast('Please provide a reason for cancellation.', 'warning'); return; }

  await updateMeetingStatus(selectedMeeting.id, 'cancelled', {
    cancellation_reason: reason,
    cancelled_by: 'owner'
  });

  // Free up the slot if it was booked
  try {
    await db.from('slots').update({ status: 'available' })
      .eq('date', selectedMeeting.date)
      .eq('start_time', selectedMeeting.start_time)
      .eq('status', 'booked');
  } catch (e) {
    console.warn('Slot update err:', e);
  }

  logActivity('cancelled', selectedMeeting.visitor_name + ' meeting cancelled', selectedMeeting.id);
  showToast('Meeting cancelled.', 'info');
  hideCancelInput();
}

/* ── APPROVE ─────────────────────────────────────────────────── */
function showApproveInput() {
  document.getElementById('approveRemarksInput').classList.remove('hidden');
  document.getElementById('approveRemarksText').value = '';
  document.getElementById('approveRemarksText').focus();
}

function hideApproveInput() {
  document.getElementById('approveRemarksInput').classList.add('hidden');
}

async function confirmApprove() {
  if (!selectedMeeting) return;
  const remarks = document.getElementById('approveRemarksText').value.trim();
  await updateMeetingStatus(selectedMeeting.id, 'approved', { owner_remarks: remarks });

  // Mark slot as booked
  try {
    await db.from('slots').update({ status: 'booked' })
      .eq('date', selectedMeeting.date)
      .eq('start_time', selectedMeeting.start_time)
      .eq('status', 'available');
  } catch (e) {
    console.warn('Slot update err:', e);
  }

  logActivity('approved', selectedMeeting.visitor_name + ' meeting approved', selectedMeeting.id);
  showToast('Meeting approved!', 'success');
  hideApproveInput();
}

/* ── COMPLETE ────────────────────────────────────────────────── */
function showCompleteInput() {
  if (!selectedMeeting) return;
  document.getElementById('completeInput').classList.remove('hidden');
  document.getElementById('completeMinutes').value  = '';
  document.getElementById('completeActions').value  = '';
  document.getElementById('completeRemarks').value  = '';
  document.getElementById('completeFollowup').value = '';
  document.getElementById('completeInput').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function hideCompleteInput() {
  document.getElementById('completeInput').classList.add('hidden');
}

async function confirmComplete() {
  if (!selectedMeeting) return;
  const data = {
    meeting_minutes: document.getElementById('completeMinutes').value.trim(),
    action_items:    document.getElementById('completeActions').value.trim(),
    owner_remarks:   document.getElementById('completeRemarks').value.trim(),
    follow_up_date:  document.getElementById('completeFollowup').value || null,
  };
  await updateMeetingStatus(selectedMeeting.id, 'completed', data);
  logActivity('completed', selectedMeeting.visitor_name + ' meeting completed', selectedMeeting.id);
  showToast('Meeting marked as completed!', 'success');
  hideCompleteInput();
}

/* ── RESCHEDULE ─────────────────────────────────────────────── */
async function sendReschedule() {
  if (!selectedMeeting) {
    showToast('Please select a meeting first.', 'warning');
    return;
  }
  const newDate  = document.getElementById('reschedDate').value;
  const newStart = document.getElementById('reschedStart').value;
  const newEnd   = document.getElementById('reschedEnd').value;
  const reason   = document.getElementById('reschedReason').value.trim();

  if (!newDate || !newStart || !newEnd) {
    showToast('Please fill in new date and time.', 'warning');
    return;
  }

  await updateMeetingStatus(selectedMeeting.id, 'pending', {
    new_date:       newDate,
    new_start_time: newStart + ':00',
    new_end_time:   newEnd   + ':00',
    reschedule_reason: reason,
  });

  logActivity('rescheduled', selectedMeeting.visitor_name + ' meeting rescheduled', selectedMeeting.id);
  showToast('Reschedule suggestion sent!', 'success');
  document.getElementById('reschedDate').value  = getTodayStr();
  document.getElementById('reschedStart').value = '';
  document.getElementById('reschedEnd').value   = '';
  document.getElementById('reschedReason').value = '';
}

/* ── UPDATE MEETING STATUS ───────────────────────────────────── */
async function updateMeetingStatus(id, status, extra = {}) {
  const oldMeeting = allMeetings.find(m => m.id === id);

  const { error } = await db.from('meetings').update({ status, ...extra }).eq('id', id);
  if (error) { showToast('Error updating meeting: ' + error.message, 'error'); console.error(error); return; }
  await loadMeetings();
  await loadStats();

  const newMeeting = allMeetings.find(m => m.id === id);
  if (oldMeeting && newMeeting) {
    await sendActionEmails(oldMeeting, newMeeting, status);
  }

  if (selectedMeeting?.id === id) {
    selectedMeeting = allMeetings.find(m => m.id === id);
    if (selectedMeeting) renderSelectedMeeting(selectedMeeting);
  }
}

/* ── DELETE MEETING ─────────────────────────────────────────── */
async function deleteMeeting(id) {
  const m = allMeetings.find(x => x.id === id);
  if (!m) return;
  
  if (confirm(`Are you sure you want to delete the meeting request from ${m.visitor_name}?`)) {
    const { error } = await db.from('meetings').delete().eq('id', id);
    if (error) {
      showToast('Error deleting request: ' + error.message, 'error');
      return;
    }
    
    await logActivity('cancelled', `Deleted meeting request from ${m.visitor_name}`, null);
    showToast('Meeting request deleted.', 'info');
    
    if (selectedMeeting?.id === id) {
      clearSelectedMeeting();
    }
    
    await loadMeetings();
    await loadStats();
  }
}
window.deleteMeeting = deleteMeeting;

/* ── ACTION EMAILS SYSTEM ────────────────────────────────────── */
async function sendActionEmails(oldM, newM, status) {
  let actionType = ''; // 'approved' | 'rejected' | 'rescheduled' | 'cancelled' | 'completed'

  if (newM.new_date && newM.new_date !== oldM.new_date) {
    actionType = 'rescheduled';
  } else if (status === 'approved') {
    actionType = 'approved';
  } else if (status === 'rejected') {
    actionType = 'rejected';
  } else if (status === 'cancelled') {
    actionType = 'cancelled';
  } else if (status === 'completed') {
    actionType = 'completed';
  }

  if (!actionType) return;

  const dateStr = formatDate(newM.date);
  const timeStr = formatTimeRange(newM.start_time, newM.end_time);

  // --- Emails for Owner ---
  let ownerMsg = '';
  let ownerSubject = '';

  if (actionType === 'approved') {
    ownerSubject = `MyScheduler Action: Approved meeting with ${newM.visitor_name}`;
    ownerMsg = `
Hello Vyshnavi,

You have APPROVED the meeting request from ${newM.visitor_name}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (APPROVED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${newM.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}
Remarks: ${newM.owner_remarks || '(None)'}

— MyScheduler System
    `.trim();
  } else if (actionType === 'rejected') {
    ownerSubject = `MyScheduler Action: Rejected meeting with ${newM.visitor_name}`;
    ownerMsg = `
Hello Vyshnavi,

You have REJECTED the meeting request from ${newM.visitor_name}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (REJECTED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${newM.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}

— MyScheduler System
    `.trim();
  } else if (actionType === 'rescheduled') {
    const newDateStr = formatDate(newM.new_date);
    const newTimeStr = formatTimeRange(newM.new_start_time, newM.new_end_time);
    ownerSubject = `MyScheduler Action: Suggested Reschedule for ${newM.visitor_name}`;
    ownerMsg = `
Hello Vyshnavi,

You have SUGGESTED A RESCHEDULE for the meeting request from ${newM.visitor_name}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESCHEDULE SUGGESTION DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title       : ${newM.meeting_title}
Original    : ${dateStr} at ${timeStr}
Proposed New: ${newDateStr} at ${newTimeStr}
Reason      : ${newM.reschedule_reason || '(None)'}

— MyScheduler System
    `.trim();
  } else if (actionType === 'cancelled') {
    ownerSubject = `MyScheduler Action: Cancelled meeting with ${newM.visitor_name}`;
    ownerMsg = `
Hello Vyshnavi,

The meeting with ${newM.visitor_name} has been CANCELLED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (CANCELLED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${newM.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}
Reason : ${newM.cancellation_reason || '(None)'}
By     : ${newM.cancelled_by || 'owner'}

— MyScheduler System
    `.trim();
  }

  if (ownerSubject && ownerMsg) {
    await sendSystemEmail({
      to: CONFIG.OWNER_EMAIL,
      subject: ownerSubject,
      message: ownerMsg
    });
  }

  // --- Emails for Visitor/User ---
  let visitorMsg = '';
  let visitorSubject = '';

  if (actionType === 'approved') {
    visitorSubject = `MyScheduler: Meeting Approved!`;
    visitorMsg = `
Hello ${newM.visitor_name},

Great news! Vyshnavi Mannam has APPROVED your meeting request.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (CONFIRMED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${newM.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}
Remarks: ${newM.owner_remarks || 'None'}

Looking forward to meeting you.

Thank you,
MyScheduler System
    `.trim();
  } else if (actionType === 'rejected') {
    visitorSubject = `MyScheduler: Meeting Request Update`;
    visitorMsg = `
Hello ${newM.visitor_name},

Vyshnavi Mannam has REJECTED your meeting request.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (REJECTED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${newM.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}

If you would like to select another time slot, please visit the booking page again or contact the owner directly.

Booking Page: ${window.location.origin}/index.html

Thank you,
MyScheduler System
    `.trim();
  } else if (actionType === 'rescheduled') {
    const newDateStr = formatDate(newM.new_date);
    const newTimeStr = formatTimeRange(newM.new_start_time, newM.new_end_time);
    visitorSubject = `MyScheduler: Reschedule Suggested for Your Meeting`;
    visitorMsg = `
Hello ${newM.visitor_name},

Vyshnavi Mannam has suggested a RESCHEDULE for your meeting request.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROPOSED DATE & TIME
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title       : ${newM.meeting_title}
Proposed New: ${newDateStr} at ${newTimeStr}
Reason      : ${newM.reschedule_reason || 'None'}

Please contact the owner if you have any questions or to confirm this proposal.

Thank you,
MyScheduler System
    `.trim();
  } else if (actionType === 'cancelled') {
    visitorSubject = `MyScheduler: Meeting Cancelled`;
    visitorMsg = `
Hello ${newM.visitor_name},

Please note that your meeting with Vyshnavi Mannam has been CANCELLED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS (CANCELLED)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title  : ${newM.meeting_title}
Date   : ${dateStr}
Time   : ${timeStr}
Reason : ${newM.cancellation_reason || 'None'}

Please contact the owner for the reason or any query. You may also select another time slot on the booking page if needed.

Booking Page: ${window.location.origin}/index.html

Thank you,
MyScheduler System
    `.trim();
  }

  if (visitorSubject && visitorMsg) {
    await sendSystemEmail({
      to: newM.email,
      subject: visitorSubject,
      message: visitorMsg
    });
  }
}

/* ── ACTIVITY LOG ────────────────────────────────────────────── */
async function logActivity(action, description, meetingId = null) {
  const { error } = await db.from('activity_log').insert({ action, description, meeting_id: meetingId, actor: 'owner' });
  if (error) console.error('Activity log error:', error);
  await loadActivity();
}

async function loadActivity() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from('activity_log')
    .select('*')
    .gte('created_at', oneDayAgo)
    .order('created_at', { ascending: false });
  if (error) { console.error('Load activity error:', error); return; }
  const el = document.getElementById('activityList');
  if (!el) return;
  if (!data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>No activity yet</div>`;
    return;
  }
  const iconMap = {
    requested:    '📅',
    approved:     '✅',
    rejected:     '❌',
    cancelled:    '🚫',
    completed:    '🏁',
    rescheduled:  '🔄',
  };
  const bgMap = {
    requested:   '#eff6ff',
    approved:    '#ecfdf5',
    rejected:    '#fef2f2',
    cancelled:   '#fef2f2',
    completed:   '#f5f3ff',
    rescheduled: '#fffbeb',
  };
  el.innerHTML = data.map(a => `
    <div class="activity-item">
      <div class="activity-icon" style="background:${bgMap[a.action]||'#f3f4f6'}">${iconMap[a.action]||'ℹ️'}</div>
      <div class="activity-text">${escapeHtml(a.description)}</div>
      <div class="activity-time">${formatRelativeTime(a.created_at)}</div>
    </div>`).join('');
}

/* ── SLOT MANAGEMENT (dashboard) ────────────────────────────── */
async function initTodaySlots() {
  const today = getTodayStr();
  const slots = buildDefaultSlotsForDate(today);
  const { error } = await db.from('slots').upsert(slots, { onConflict: 'date,start_time,end_time' });
  if (error) { showToast('Error creating slots: ' + error.message, 'error'); return; }
  showToast(`Default slots created for today!`, 'success');
}

function openModal(id)  { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

async function confirmAddSlot() {
  const date  = document.getElementById('modalSlotDate').value;
  const start = document.getElementById('modalSlotStart').value;
  const end   = document.getElementById('modalSlotEnd').value;
  if (!date || !start || !end) { showToast('All fields required.', 'warning'); return; }
  const { error } = await db.from('slots').insert({ date, start_time: start+':00', end_time: end+':00', status: 'available' });
  if (error) { showToast('Error adding slot: ' + error.message, 'error'); return; }
  showToast('Slot added!', 'success');
  closeModal('addSlotOverlay');
}

function editSelectedSlot()      { showToast('Select a slot from Slots Management view to edit.', 'info'); }
function blockSelectedSlotDash() { showToast('Go to Slots Management to block a slot.', 'info'); }
function deleteSelectedSlotDash(){ showToast('Go to Slots Management to delete a slot.', 'info'); }
function reopenSelectedSlotDash(){ showToast('Go to Slots Management to reopen a slot.', 'info'); }

/* ── SLOT MANAGEMENT VIEW ───────────────────────────────────── */
async function loadSlotsView() {
  const date   = document.getElementById('slotFilterDate').value;
  const status = document.getElementById('slotFilterStatus').value;
  let query = db.from('slots').select('*').order('start_time');
  if (date)   query = query.eq('date', date);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  const el = document.getElementById('slotManageList');
  if (!el) return;
  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div>No slots found</div>`;
    return;
  }
  el.innerHTML = data.map(s => {
    const isSelected = selectedSlot?.id === s.id;
    const color = s.status === 'available' ? 'badge-success' : s.status === 'booked' ? 'badge-warning' : 'badge-danger';
    return `
      <div class="slot-manage-item ${isSelected?'selected':''}" onclick="selectSlotItem('${s.id}','${s.date}','${s.start_time}','${s.end_time}','${s.status}')">
        <span>${formatDate(s.date)} &nbsp; ${formatTimeRange(s.start_time, s.end_time)}</span>
        <span class="badge ${color}">${s.status}</span>
      </div>`;
  }).join('');
}

function selectSlotItem(id, date, start, end, status) {
  selectedSlot = { id, date, start_time: start, end_time: end, status };
  document.getElementById('selectedSlotInfo').innerHTML =
    `Selected: <strong>${formatDate(date)} ${formatTimeRange(start,end)}</strong> (${status})`;
  document.getElementById('newSlotDate').value  = date;
  document.getElementById('newSlotStart').value = start.slice(0,5);
  document.getElementById('newSlotEnd').value   = end.slice(0,5);
  loadSlotsView();
}

async function addSlotFromView() {
  const date  = document.getElementById('newSlotDate').value;
  const start = document.getElementById('newSlotStart').value;
  const end   = document.getElementById('newSlotEnd').value;
  if (!date || !start || !end) { showToast('All fields required.', 'warning'); return; }
  const { error } = await db.from('slots').insert({ date, start_time: start+':00', end_time: end+':00', status: 'available' });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Slot added!', 'success');
  loadSlotsView();
}

async function blockSelectedSlot() {
  if (!selectedSlot) { showToast('Select a slot first.', 'warning'); return; }
  await db.from('slots').update({ status: 'blocked' }).eq('id', selectedSlot.id);
  showToast('Slot blocked.', 'warning');
  selectedSlot = null;
  loadSlotsView();
}

async function reopenSelectedSlot() {
  if (!selectedSlot) { showToast('Select a slot first.', 'warning'); return; }
  await db.from('slots').update({ status: 'available' }).eq('id', selectedSlot.id);
  showToast('Slot reopened!', 'success');
  selectedSlot = null;
  loadSlotsView();
}

async function deleteSelectedSlot() {
  if (!selectedSlot) { showToast('Select a slot first.', 'warning'); return; }
  if (!confirm('Delete this slot?')) return;
  await db.from('slots').delete().eq('id', selectedSlot.id);
  showToast('Slot deleted.', 'info');
  selectedSlot = null;
  loadSlotsView();
}

async function initSlotsForDate() {
  const date = document.getElementById('newSlotDate').value || getTodayStr();
  const slots = buildDefaultSlotsForDate(date);
  const { error } = await db.from('slots').upsert(slots, { onConflict: 'date,start_time,end_time' });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`Default slots created for ${formatDate(date)}`, 'success');
  loadSlotsView();
}

/* ── FILTERED VIEWS ─────────────────────────────────────────── */
function renderPastMeetings() {
  const today = getTodayStr();
  const rows  = allMeetings.filter(m => m.date < today);
  renderRows('pastBody', rows);
}

function renderReports() {
  const m = allMeetings;
  const counts = {
    total:     m.length,
    pending:   m.filter(x => x.status === 'pending').length,
    approved:  m.filter(x => x.status === 'approved').length,
    rejected:  m.filter(x => x.status === 'rejected').length,
    cancelled: m.filter(x => x.status === 'cancelled').length,
    completed: m.filter(x => x.status === 'completed').length,
  };
  const rs = document.getElementById('reportStats');
  if (rs) rs.innerHTML = `
    <div class="stat-card"><div class="stat-icon" style="background:#eff6ff">👥</div><div><div class="stat-number">${counts.total}</div><div class="stat-label">Total</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#fffbeb">⏳</div><div><div class="stat-number">${counts.pending}</div><div class="stat-label">Pending</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#ecfdf5">✅</div><div><div class="stat-number">${counts.approved}</div><div class="stat-label">Approved</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#fef2f2">🚫</div><div><div class="stat-number">${counts.rejected}</div><div class="stat-label">Rejected</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#fef2f2">❌</div><div><div class="stat-number">${counts.cancelled}</div><div class="stat-label">Cancelled</div></div></div>
    <div class="stat-card"><div class="stat-icon" style="background:#f5f3ff">🏁</div><div><div class="stat-number">${counts.completed}</div><div class="stat-label">Completed</div></div></div>`;

  const rb = document.getElementById('reportBreakdown');
  if (rb && counts.total > 0) {
    const bar = (count, total, color) => {
      const pct = ((count / total) * 100).toFixed(1);
      return `<div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span>${color.label}</span><span>${count} (${pct}%)</span></div>
        <div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color.bg};border-radius:4px;transition:.6s ease"></div>
        </div></div>`;
    };
    rb.innerHTML =
      bar(counts.pending,   counts.total, {label:'Pending',   bg:'#f59e0b'}) +
      bar(counts.approved,  counts.total, {label:'Approved',  bg:'#10b981'}) +
      bar(counts.rejected,  counts.total, {label:'Rejected',  bg:'#ef4444'}) +
      bar(counts.cancelled, counts.total, {label:'Cancelled', bg:'#f97316'}) +
      bar(counts.completed, counts.total, {label:'Completed', bg:'#7c3aed'});
  } else if (rb) {
    rb.innerHTML = '<div class="empty-state">No meeting data yet.</div>';
  }
}

function renderRows(bodyId, rows) {
  const tbody = document.getElementById(bodyId);
  if (!tbody) return;
  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">📭</div>No meetings found</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(m => `
    <tr onclick="selectMeetingRow('${m.id}');showView('dashboard')">
      <td class="td-name">${escapeHtml(m.visitor_name)}</td>
      <td class="td-email">${escapeHtml(m.email)}</td>
      <td>${escapeHtml(m.meeting_title)}</td>
      <td>${formatDateShort(m.date)}</td>
      <td>${formatTimeRange(m.start_time, m.end_time)}</td>
      <td>${statusPill(m.status, m)}</td>
      <td><div class="action-group" onclick="event.stopPropagation()">${buildRowActions(m)}</div></td>
    </tr>`).join('');
}

/* ── SETTINGS ───────────────────────────────────────────────── */
async function saveName() {
  const name = document.getElementById('settingName').value.trim();
  if (!name) { showToast('Name cannot be empty.', 'warning'); return; }
  try {
    await db.from('settings').upsert({ key: 'owner_name', value: name });
  } catch (e) {
    console.warn('Settings upsert err:', e);
  }
  document.getElementById('sidebarName').textContent = name;
  document.getElementById('sidebarAvatar').textContent = getInitials(name);
  showToast('Display name updated!', 'success');
}

async function changePasscode() {
  const current = document.getElementById('currentPw').value;
  const newPw   = document.getElementById('newPw').value;
  const confirm = document.getElementById('confirmPw').value;

  if (!current || !newPw) { showToast('All fields are required.', 'warning'); return; }
  if (newPw !== confirm)  { showToast('New passcodes do not match.', 'error'); return; }
  if (newPw.length < 6)   { showToast('Passcode must be at least 6 characters.', 'warning'); return; }

  const currentHash = await sha256(current);
  const { data } = await db.from('settings').select('value').eq('key','owner_passcode_hash').single();
  if (!data || data.value !== currentHash) {
    showToast('Current passcode is incorrect.', 'error');
    return;
  }
  const newHash = await sha256(newPw);
  await db.from('settings').update({ value: newHash }).eq('key','owner_passcode_hash');
  showToast('Passcode changed successfully!', 'success');
  document.getElementById('currentPw').value = '';
  document.getElementById('newPw').value      = '';
  document.getElementById('confirmPw').value  = '';
}

/* ── REALTIME ───────────────────────────────────────────────── */
function subscribeRealtime() {
  realtimeChannel = db.channel('owner-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'meetings' }, async () => {
      await loadMeetings();
      await loadStats();
      await loadActivity();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, () => loadActivity())
    .subscribe();
}
