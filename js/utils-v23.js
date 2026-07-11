// ============================================================
//  MyScheduler — Utility Functions
// ============================================================

/* ── Date / Time Helpers ──────────────────────────────────── */

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function getCurrentTimeStr() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12  = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · '
    + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatRelativeTime(ts) {
  if (!ts) return '';
  const now  = new Date();
  const date = new Date(ts);
  const diffMs   = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1)   return 'Just now';
  if (diffMins < 60)  return `${diffMins}m ago`;
  if (diffDays === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <  7)  return `${diffDays} days ago`;
  return formatDateShort(date.toISOString().split('T')[0]);
}

function isSlotPast(dateStr, endTime) {
  const today = getTodayStr();
  if (dateStr < today) return true;
  if (dateStr > today) return false;
  return endTime <= getCurrentTimeStr();
}

function getLiveDateTimeStr() {
  const now = new Date();
  const datePart = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const timePart = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${datePart} · ${timePart}`;
}

/* ── Security ─────────────────────────────────────────────── */

async function sha256(message) {
  const buf  = new TextEncoder().encode(message);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ── UI Helpers ───────────────────────────────────────────── */

function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

let _toastTimer;
function showToast(message, type = 'success') {
  const existing = document.querySelector('.toast');
  if (existing) { existing.remove(); clearTimeout(_toastTimer); }

  const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('show'));
  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Theme ────────────────────────────────────────────────── */

function applyTheme() {
  const theme = localStorage.getItem('ms-theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  return theme;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next    = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ms-theme', next);
  return next;
}

/* ── Status Pill HTML ─────────────────────────────────────── */

function statusPill(status, meeting) {
  if (meeting && meeting.new_date && status === 'pending') {
    return `<span class="badge badge-warning" style="background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe">Rescheduled</span>`;
  }
  const map = {
    pending:   'badge-warning',
    approved:  'badge-success',
    rejected:  'badge-danger',
    cancelled: 'badge-danger',
    completed: 'badge-info',
  };
  return `<span class="badge ${map[status] || 'badge-secondary'}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>`;
}

/* ── Avatar Color ─────────────────────────────────────────── */

const AVATAR_COLORS = ['#7c3aed','#4f46e5','#0891b2','#059669','#d97706','#dc2626','#7c3aed'];
function avatarColor(name) {
  let hash = 0;
  for (const ch of (name || '')) hash = ch.charCodeAt(0) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/* ── Generate Default Slots for a Date ───────────────────── */

function buildDefaultSlotsForDate(dateStr) {
  return CONFIG.DEFAULT_SLOT_TIMES.map(t => ({
    date:       dateStr,
    start_time: t.start + ':00',
    end_time:   t.end   + ':00',
    status:     'available',
  }));
}

/* ── Session Auth ─────────────────────────────────────────── */

function setOwnerAuth(val) {
  if (val) sessionStorage.setItem('ms_owner_auth', '1');
  else     sessionStorage.removeItem('ms_owner_auth');
}

function isOwnerAuth() {
  return sessionStorage.getItem('ms_owner_auth') === '1';
}

/* ── Email Notification System (Web3Forms) ────────────────── */
async function sendSystemEmail({ to, subject, message }) {
  try {
    // Determine which template ID to use
    const templateId = to === CONFIG.OWNER_EMAIL 
      ? CONFIG.EMAILJS_TEMPLATE_ID_OWNER 
      : CONFIG.EMAILJS_TEMPLATE_ID_VISITOR;

    if (CONFIG.EMAILJS_PUBLIC_KEY && CONFIG.EMAILJS_SERVICE_ID && templateId) {
      const body = {
        service_id: CONFIG.EMAILJS_SERVICE_ID,
        template_id: templateId,
        user_id: CONFIG.EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email: to,          // Recipient's email (can be owner's or visitor's!)
          subject:  subject,
          message:  message,
          from_name: 'MyScheduler'
        }
      };

      const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        console.log(`✅ Email sent via EmailJS to ${to}: ${subject}`);
        if (to !== CONFIG.OWNER_EMAIL) {
          showToast('Confirmation email sent to visitor successfully!', 'success');
        }
        return;
      } else {
        const errText = await res.text();
        console.warn('EmailJS sending failed:', errText);
      }
    }

    // Fallback if EmailJS is not configured or fails:
    // If the recipient is the visitor and we are in the owner dashboard, show the copy-paste modal helper
    if (to !== CONFIG.OWNER_EMAIL && isOwnerAuth()) {
      showEmailDraftModal(to, subject, message);
    } else if (to === CONFIG.OWNER_EMAIL) {
      console.warn('EmailJS key not configured — cannot notify owner: ' + subject);
      showToast('⚠️ Please paste your EmailJS keys into config.js to receive email notifications.', 'warning');
    }
  } catch (err) {
    console.error('Email send error:', err);
  }
}

function showEmailDraftModal(to, subject, message) {
  const existing = document.getElementById('emailDraftModal');
  if (existing) existing.remove();

  const modalHtml = `
    <div class="modal-overlay" id="emailDraftModal" style="display:flex;align-items:center;justify-content:center;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;backdrop-filter:blur(4px);">
      <div class="modal" style="width:100%;max-width:550px;background:var(--surface);border-radius:12px;border:1px solid var(--border);padding:24px;box-shadow:var(--shadow-lg);position:relative;">
        <button class="modal-close" onclick="document.getElementById('emailDraftModal').remove()" style="position:absolute;top:16px;right:16px;background:none;border:none;color:var(--text-muted);font-size:18px;cursor:pointer;padding:4px;">✕</button>
        <div class="modal-title" style="font-size:18px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px;">✉️ Send Email via MyScheduler</div>
        <p class="modal-subtitle" style="font-size:12.5px;color:var(--text-muted);margin-bottom:20px;">EmailJS is not configured. Copy the details below to send it or open it in your mail client:</p>
        
        <div class="form-group" style="margin-bottom:16px;">
          <label style="display:block;font-size:11.5px;font-weight:600;color:var(--clr-primary);margin-bottom:6px;">To (Visitor Email)</label>
          <div style="display:flex;gap:8px;">
            <input type="text" readonly value="${to}" class="input" style="flex:1;">
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${to.replace(/'/g, "\\'")}');showToast('Visitor email copied!','success')">Copy</button>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:16px;">
          <label style="display:block;font-size:11.5px;font-weight:600;color:var(--clr-primary);margin-bottom:6px;">Subject</label>
          <div style="display:flex;gap:8px;">
            <input type="text" readonly value="${subject.replace(/"/g, '&quot;')}" class="input" style="flex:1;">
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${subject.replace(/'/g, "\\'")}');showToast('Subject copied!','success')">Copy</button>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:20px;">
          <label style="display:block;font-size:11.5px;font-weight:600;color:var(--clr-primary);margin-bottom:6px;">Message Content</label>
          <textarea readonly class="input" style="width:100%;height:180px;font-family:monospace;font-size:11.5px;line-height:1.5;resize:none;">${message}</textarea>
        </div>

        <div style="display:flex;justify-content:flex-end;gap:12px;">
          <button class="btn btn-secondary" onclick="document.getElementById('emailDraftModal').remove()">Close</button>
          <button class="btn btn-secondary" onclick="window.location.href='mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}';document.getElementById('emailDraftModal').remove()">Open in Mail App</button>
          <button class="btn btn-primary" onclick="navigator.clipboard.writeText(\`${message.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);showToast('Message body copied!','success')">📋 Copy Body</button>
        </div>
      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = modalHtml;
  document.body.appendChild(container.firstElementChild);
}

