import { initFirebase, addTask as fbAddTask, updateTask as fbUpdateTask, deleteTask as fbDeleteTask, onTasksChange } from './firebase.js';
import { translateToEnglish } from './translate.js';
import { initSpeech, toggleMic, getIsListening, ensureMicPermission, speakText, speakSequence, listenOnce } from './speech.js';

// ── State ────────────────────────────────────────────────────────────────────
let tasks = [];
let currentFilter = 'all';
let reminderDateFilter = 'all';
let searchQuery = '';
let pendingDelete = null;
let firstSnapshotDone = false;

// ── DOM refs ─────────────────────────────────────────────────────────────────
const micBtn            = document.getElementById('micBtn');
const micLabel          = document.getElementById('micLabel');
const micSub            = document.getElementById('micSub');
const liveText          = document.getElementById('liveText');
const transcriptBox     = document.getElementById('transcriptBox');
const langSelect        = document.getElementById('langSelect');
const translateBtn      = document.getElementById('translateBtn');
const clearTranscriptBtn= document.getElementById('clearTranscriptBtn');
const translatedBox     = document.getElementById('translatedBox');
const translatedText    = document.getElementById('translatedText');
const reminderInput     = document.getElementById('reminderInput');
const reminderRecur     = document.getElementById('reminderRecur');
const editTranslatedBtn = document.getElementById('editTranslatedBtn');
const cancelTranslatedBtn=document.getElementById('cancelTranslatedBtn');
const copyTranslatedBtn = document.getElementById('copyTranslatedBtn');
const addTaskBtn        = document.getElementById('addTaskBtn');
const darkModeBtn       = document.getElementById('darkModeBtn');
const exportBtn         = document.getElementById('exportBtn');
const importBtn         = document.getElementById('importBtn');
const importFile        = document.getElementById('importFile');
const searchInput       = document.getElementById('searchInput');
const voiceCmdBtn       = document.getElementById('voiceCmdBtn');
const reminderBanner    = document.getElementById('reminderBanner');
const reminderBannerText= document.getElementById('reminderBannerText');
const reminderDismiss   = document.getElementById('reminderDismiss');
const reminderSnooze    = document.getElementById('reminderSnooze');
const undoToast         = document.getElementById('undoToast');
const undoToastText     = document.getElementById('undoToastText');
const undoBtn           = document.getElementById('undoBtn');
const taskList          = document.getElementById('taskList');
const emptyState        = document.getElementById('emptyState');
const tasksView         = document.getElementById('tasksView');
const reportView        = document.getElementById('reportView');
const reportRange       = document.getElementById('reportRange');
const reportSummary     = document.getElementById('reportSummary');
const reportGroups      = document.getElementById('reportGroups');
const reportEmpty       = document.getElementById('reportEmpty');
const translatingRow    = document.getElementById('translatingRow');
const installBtn        = document.getElementById('installBtn');
const installHelpBanner = document.getElementById('installHelpBanner');
const installHelpText   = document.getElementById('installHelpText');

// ── Init ─────────────────────────────────────────────────────────────────────
initSpeech({ micBtn, micLabel, micSub, liveText, transcriptBox, langSelect });

initFirebase((uid) => {
  // Auth ready — start listening for tasks
  onTasksChange((newTasks) => {
    tasks = newTasks;
    // First snapshot only (= app open): past-due reminders go to Pending.
    // Must NOT run on later snapshots or it silently swallows due reminders.
    if (!firstSnapshotDone) {
      firstSnapshotDone = true;
      const now = new Date();
      tasks.forEach(t => {
        if (!t.done && t.reminderAt && new Date(t.reminderAt) <= now && !t.forcedPending) {
          t.forcedPending = true;
          t.reminderFired = true;
          fbUpdateTask(t.id, { forcedPending: true, reminderFired: true });
        }
      });
    }
    checkReminders();
    render();
    cleanupDoneTasks();
    cleanupOldTasks();
  });
});

// ── Dark mode ─────────────────────────────────────────────────────────────────
const DARK_KEY = 'lucky-dark';
const savedDark = localStorage.getItem(DARK_KEY);
if (savedDark === '1') {
  document.body.classList.add('dark');
  document.documentElement.setAttribute('data-theme', 'dark');
} else if (savedDark === '0') {
  document.documentElement.setAttribute('data-theme', 'light');
}
// If no preference saved → CSS media query handles it automatically

darkModeBtn.addEventListener('click', () => {
  const isDark = !(document.body.classList.contains('dark') ||
    (document.documentElement.getAttribute('data-theme') !== 'light' &&
     window.matchMedia('(prefers-color-scheme: dark)').matches));
  document.body.classList.toggle('dark', isDark);
  localStorage.setItem(DARK_KEY, isDark ? '1' : '0');
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
});

// ── Mic ───────────────────────────────────────────────────────────────────────
micBtn.addEventListener('click', () => toggleMic());

// ── Translate ─────────────────────────────────────────────────────────────────
function showTranslatingIndicator(show) {
  translatingRow.innerHTML = show
    ? `<div class="translating"><div class="spinner"></div>Translating with AI...</div>`
    : '';
}

function showTranslateStatus(msg) {
  translatingRow.innerHTML = msg ? `<div class="translating">${msg}</div>` : '';
}

function setTranslatedEditable(editable) {
  if (editable) {
    translatedText.removeAttribute('readonly');
    translatedText.focus();
    editTranslatedBtn.textContent = 'Done';
  } else {
    translatedText.setAttribute('readonly', 'readonly');
    editTranslatedBtn.textContent = 'Edit';
  }
}

translateBtn.addEventListener('click', async () => {
  const text = transcriptBox.value.trim();
  if (!text) return;
  showTranslatingIndicator(true);
  const srcLang = (langSelect.value || 'te-IN').split('-')[0];
  const translated = await translateToEnglish(text, srcLang);
  showTranslatingIndicator(false);
  translatedText.value = translated.text;
  setTranslatedEditable(false);
  translatedBox.classList.remove('hidden');
  if (!reminderInput.value) {
    const guess = parseDateTimeFromText(translated.text);
    if (guess) reminderInput.value = guess;
  }
  if (!translated.ok) {
    showTranslateStatus('Translation failed — check your internet connection and tap Translate again.');
  } else {
    showTranslateStatus('');
  }
});

clearTranscriptBtn.addEventListener('click', () => {
  transcriptBox.value = '';
  translatedText.value = '';
  translatedBox.classList.add('hidden');
  setTranslatedEditable(false);
});

cancelTranslatedBtn.addEventListener('click', () => {
  transcriptBox.value = '';
  translatedText.value = '';
  reminderInput.value = '';
  if (reminderRecur) reminderRecur.value = 'none';
  translatedBox.classList.add('hidden');
  setTranslatedEditable(false);
  showTranslateStatus('');
});

editTranslatedBtn.addEventListener('click', () => {
  const isEditable = !translatedText.hasAttribute('readonly');
  setTranslatedEditable(!isEditable);
});

copyTranslatedBtn.addEventListener('click', async () => {
  const text = translatedText.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    translatedText.removeAttribute('readonly');
    translatedText.select();
    try { document.execCommand('copy'); } catch (e2) {}
    translatedText.setAttribute('readonly', 'readonly');
  }
  const original = copyTranslatedBtn.textContent;
  copyTranslatedBtn.textContent = 'Copied!';
  setTimeout(() => copyTranslatedBtn.textContent = original, 1200);
});

addTaskBtn.addEventListener('click', () => {
  const english = translatedText.value.trim();
  if (!english) return;
  const original = transcriptBox.value.trim();
  addTask(original, english, reminderInput.value, reminderRecur ? reminderRecur.value : 'none');
  transcriptBox.value = '';
  translatedText.value = '';
  reminderInput.value = '';
  if (reminderRecur) reminderRecur.value = 'none';
  translatedBox.classList.add('hidden');
  setTranslatedEditable(false);
});

// ── Search ────────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim().toLowerCase();
  render();
});

// ── Export / Import ───────────────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  const data = JSON.stringify(tasks, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lucky-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!Array.isArray(imported)) throw new Error('not an array');
      const existingIds = new Set(tasks.map(t => t.id));
      const merged = imported.filter(t => t && t.id && t.text && !existingIds.has(t.id));
      for (const t of merged) { await fbAddTask(t); }
      alert('Imported ' + merged.length + ' task(s).');
    } catch (err) {
      alert('Could not read that backup file. Make sure it is a Lucky export.');
    }
    importFile.value = '';
  };
  reader.readAsText(file);
});

// ── Date/time parsing ─────────────────────────────────────────────────────────
function toLocalInputValue(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDateTimeFromText(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  const now = new Date();
  let target = new Date(now);
  let dateMatched = false;

  const relMatch = lower.match(/\bin\s+(\d+)\s*(minute|min|hour|hr)s?\b/);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    target = new Date(now);
    if (relMatch[2].startsWith('min')) target.setMinutes(target.getMinutes() + amount);
    else target.setHours(target.getHours() + amount);
    return toLocalInputValue(target);
  }

  if (/\bday after tomorrow\b|\btattaruvata\b|\btaruvata roju\b/.test(lower)) {
    target.setDate(target.getDate() + 2); dateMatched = true;
  } else if (/\btomorrow\b|\brepu\b|\brēpu\b/.test(lower)) {
    target.setDate(target.getDate() + 1); dateMatched = true;
  } else if (/\btoday\b|\btonight\b|\bivala\b|\bippudu\b|\bnenu\b|\beeela\b/.test(lower)) {
    dateMatched = true;
  } else {
    const weekdays = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const wd = lower.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (wd) {
      const targetDay = weekdays.indexOf(wd[1]);
      let diff = (targetDay - now.getDay() + 7) % 7;
      if (diff === 0 || /\bnext\s+/.test(wd[0])) diff = diff === 0 ? 7 : diff;
      target.setDate(target.getDate() + diff);
      dateMatched = true;
    }
  }

  let hour = null, minute = 0;
  const timeMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    hour = parseInt(timeMatch[1], 10);
    minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    if (timeMatch[3] === 'pm' && hour < 12) hour += 12;
    if (timeMatch[3] === 'am' && hour === 12) hour = 0;
  } else {
    const time24 = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (time24) { hour = parseInt(time24[1], 10); minute = parseInt(time24[2], 10); }
    else if (/\bmorning\b|\budayam\b|\bsubhodayam\b/.test(lower)) { hour = 9; }
    else if (/\bafternoon\b|\bmadhyahnam\b|\bmitta\b/.test(lower)) { hour = 15; }
    else if (/\bevening\b|\bsayantram\b|\bsaayantram\b/.test(lower)) { hour = 18; }
    else if (/\bnight\b|\bratri\b|\braatri\b/.test(lower)) { hour = 21; }
  }

  if (!dateMatched && hour === null) return null;
  if (hour !== null) target.setHours(hour, minute, 0, 0);
  else target.setHours(9, 0, 0, 0);
  if (target <= now && !dateMatched) target.setDate(target.getDate() + 1);
  return toLocalInputValue(target);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (btn.dataset.tab === 'tasks') {
      tasksView.classList.remove('hidden');
      reportView.classList.add('hidden');
    } else {
      tasksView.classList.add('hidden');
      reportView.classList.remove('hidden');
      renderReport();
    }
  });
});

// ── Report ────────────────────────────────────────────────────────────────────
reportRange.addEventListener('change', renderReport);

function renderReport() {
  const days = parseInt(reportRange.value, 10);
  const cutoff = days > 0 ? new Date(Date.now() - days * 86400000) : null;
  const filtered = tasks.filter(t => !cutoff || new Date(t.createdAt) >= cutoff);

  const total = filtered.length;
  const done = filtered.filter(t => t.done).length;
  const withReminder = filtered.filter(t => t.reminderAt).length;
  reportSummary.innerHTML = `
    <div class="summary-card"><div class="summary-num">${total}</div><div class="summary-label">Total</div></div>
    <div class="summary-card"><div class="summary-num">${done}</div><div class="summary-label">Done</div></div>
    <div class="summary-card"><div class="summary-num">${total - done}</div><div class="summary-label">Pending</div></div>
    <div class="summary-card"><div class="summary-num">${withReminder}</div><div class="summary-label">Reminders</div></div>
  `;
  reportEmpty.classList.toggle('hidden', filtered.length > 0);

  const groups = {};
  filtered.forEach(t => {
    const dateKey = new Date(t.createdAt).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(t);
  });

  reportGroups.innerHTML = '';
  Object.keys(groups)
    .sort((a,b) => new Date(groups[b][0].createdAt) - new Date(groups[a][0].createdAt))
    .forEach(dateKey => {
      const items = groups[dateKey].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      const doneCount = items.filter(t => t.done).length;
      const div = document.createElement('div');
      div.className = 'day-group';
      div.innerHTML = `
        <div class="day-heading"><span>${dateKey}</span><span class="count">${doneCount}/${items.length} done</span></div>
        ${items.map(t => `
          <div class="report-item ${t.done ? 'done' : ''}">
            <span class="t-text">${escapeHtml(t.text)}${t.reminderAt ? ' ⏰' : ''}</span>
            <span class="t-time">${new Date(t.createdAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'})}</span>
            <button class="report-delete-btn" data-id="${t.id}" aria-label="Delete task">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
            </button>
          </div>
        `).join('')}
      `;
      reportGroups.appendChild(div);
    });
}

reportGroups.addEventListener('click', (e) => {
  const btn = e.target.closest('.report-delete-btn');
  if (!btn) return;
  const id = btn.dataset.id;
  if (!id) return;
  deleteTaskWithUndo(id);
  renderReport();
});

document.getElementById('printReportBtn').addEventListener('click', () => window.print());
document.getElementById('copyReportBtn').addEventListener('click', async () => {
  const days = parseInt(reportRange.value, 10);
  const cutoff = days > 0 ? new Date(Date.now() - days * 86400000) : null;
  const filtered = tasks.filter(t => !cutoff || new Date(t.createdAt) >= cutoff);
  const groups = {};
  filtered.forEach(t => {
    const dateKey = new Date(t.createdAt).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' });
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(t);
  });
  let out = 'Lucky Report\n\n';
  Object.keys(groups)
    .sort((a,b) => new Date(groups[b][0].createdAt) - new Date(groups[a][0].createdAt))
    .forEach(dateKey => {
      out += `${dateKey}\n`;
      groups[dateKey]
        .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))
        .forEach(t => {
          const time = new Date(t.createdAt).toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'});
          out += `  [${t.done ? 'x' : ' '}] ${time} - ${t.text}\n`;
        });
      out += '\n';
    });
  const btn = document.getElementById('copyReportBtn');
  try {
    await navigator.clipboard.writeText(out);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = original, 1500);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = out; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); btn.textContent = 'Copied!'; setTimeout(()=>btn.textContent='Copy',1500); }
    catch (e2) { alert(out); }
    document.body.removeChild(ta);
  }
});

// ── Task Operations ───────────────────────────────────────────────────────────
function addTask(original, english, reminderVal, recurrence) {
  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    original: original,
    text: english,
    createdAt: new Date().toISOString(),
    reminderAt: reminderVal ? new Date(reminderVal).toISOString() : null,
    reminderFired: false,
    recurrence: (reminderVal && recurrence) ? recurrence : 'none',
    forcedPending: false,
    done: false,
    doneAt: null
  };
  fbAddTask(task); // onSnapshot will update tasks[] automatically
}

function toggleDone(id) {
  const t = tasks.find(t => t.id === id);
  if (!t) return;
  if (!t.done) {
    fbUpdateTask(id, { done: true, doneAt: new Date().toISOString() });
  } else {
    fbUpdateTask(id, { done: false, doneAt: null });
  }
}

function markDoneNow(id) {
  fbDeleteTask(id);
}

function forcePending(id) {
  fbUpdateTask(id, { forcedPending: true });
}

function deleteTaskWithUndo(id) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return;
  const removed = tasks[idx];
  if (pendingDelete) clearTimeout(pendingDelete.timeoutId);
  pendingDelete = { task: removed };
  undoToastText.textContent = 'Task deleted';
  undoToast.classList.add('show');
  fbDeleteTask(id);
  pendingDelete.timeoutId = setTimeout(() => {
    undoToast.classList.remove('show');
    pendingDelete = null;
  }, 5000);
}

undoBtn.addEventListener('click', () => {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timeoutId);
  fbAddTask(pendingDelete.task);
  pendingDelete = null;
  undoToast.classList.remove('show');
});

function setReminder(id, value, recurrence) {
  if (value) {
    fbUpdateTask(id, {
      reminderAt: new Date(value).toISOString(),
      reminderFired: false,
      recurrence: recurrence || 'none',
      forcedPending: false
    });
  }
}

function toggleReminderPicker(id) {
  const el = document.getElementById('picker-' + id);
  if (el) el.classList.toggle('show');
}

// ── Render ────────────────────────────────────────────────────────────────────
function dateBucket(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'tomorrow';
  if (diffDays === -1) return 'yesterday';
  return 'other';
}

function formatTime(iso) {
  const d = new Date(iso);
  const time = d.toLocaleString(undefined, { hour:'2-digit', minute:'2-digit' });
  const bucket = dateBucket(iso);
  if (bucket === 'today') return `Today, ${time}`;
  if (bucket === 'yesterday') return `Yesterday, ${time}`;
  if (bucket === 'tomorrow') return `Tomorrow, ${time}`;
  return d.toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function render() {
  const now = new Date();
  let filtered = tasks;

  if (currentFilter === 'all') {
    filtered = tasks.filter(t =>
      t.done || t.forcedPending || !t.reminderAt || new Date(t.reminderAt) <= now
    );
  }
  if (currentFilter === 'pending') {
    filtered = tasks.filter(t =>
      !t.done && (t.forcedPending || !t.reminderAt || new Date(t.reminderAt) <= now)
    );
  }
  if (currentFilter === 'done') filtered = tasks.filter(t => t.done);
  if (currentFilter === 'reminders') {
    filtered = tasks.filter(t => !t.done && !t.forcedPending && t.reminderAt && new Date(t.reminderAt) > now);
    if (reminderDateFilter !== 'all') {
      filtered = filtered.filter(t => dateBucket(t.reminderAt) === reminderDateFilter);
    }
    filtered = filtered.slice().sort((a, b) => new Date(a.reminderAt) - new Date(b.reminderAt));
  }

  if (searchQuery) {
    filtered = filtered.filter(t =>
      t.text.toLowerCase().includes(searchQuery) ||
      (t.original || '').toLowerCase().includes(searchQuery)
    );
  }

  taskList.innerHTML = '';
  emptyState.classList.toggle('hidden', filtered.length > 0);

  filtered.forEach(t => {
    const div = document.createElement('div');
    div.className = 'task' + (t.done ? ' done' : '');

    const reminderPast = t.reminderAt && new Date(t.reminderAt) < now;
    const reminderTag = t.reminderAt
      ? `<span class="tag reminder${reminderPast ? ' past' : ''}">${reminderPast ? '✓ ' : '⏰ '}${formatTime(t.reminderAt)}</span>`
      : '';
    const recurTag = (t.recurrence && t.recurrence !== 'none')
      ? `<span class="tag recur">🔁 ${t.recurrence}</span>`
      : '';

    const chipButtons = currentFilter === 'reminders'
      ? `<div class="task-chip-row">
          <button class="btn-chip" data-id="${t.id}" data-action="force-pending">Pending</button>
          <button class="btn-chip btn-chip-done" data-id="${t.id}" data-action="mark-done">Done</button>
         </div>`
      : currentFilter === 'pending'
      ? `<div class="task-chip-row">
          <button class="btn-chip" data-id="${t.id}" data-action="remind">Reminder</button>
          <button class="btn-chip btn-chip-done" data-id="${t.id}" data-action="mark-done">Done</button>
         </div>`
      : '';

    const iconButtons = `
      <div class="task-icon-row">
        <button class="icon-btn" data-id="${t.id}" data-action="remind" aria-label="Set reminder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        </button>
        ${t.reminderAt ? `
        <button class="icon-btn" data-id="${t.id}" data-action="speak" aria-label="Read aloud">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>
        </button>` : ''}
        <button class="icon-btn" data-id="${t.id}" data-action="delete" aria-label="Delete">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
        </button>
      </div>
    `;

    div.innerHTML = `
      <button class="check ${t.done ? 'checked' : ''}" aria-label="Mark done" data-id="${t.id}" data-action="toggle">
        ${t.done ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' : ''}
      </button>
      <div class="task-body">
        <div class="task-text">${escapeHtml(t.text)}</div>
        ${t.original !== t.text ? `<div class="task-original">Original: ${escapeHtml(t.original)}</div>` : ''}
        <div class="task-meta">
          <span class="task-time">${formatTime(t.createdAt)}</span>
          ${reminderTag}
          ${recurTag}
        </div>
        <div class="remind-picker" id="picker-${t.id}">
          <input type="datetime-local" id="input-${t.id}">
          <select id="recur-${t.id}">
            <option value="none" ${(!t.recurrence || t.recurrence === 'none') ? 'selected' : ''}>No repeat</option>
            <option value="daily" ${t.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${t.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
          </select>
          <button data-id="${t.id}" data-action="save-reminder">Set</button>
        </div>
      </div>
      <div class="task-actions">
        ${chipButtons}
        ${iconButtons}
      </div>
    `;
    taskList.appendChild(div);
  });

  if (!reportView.classList.contains('hidden')) renderReport();
}

taskList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'toggle') toggleDone(id);
  if (action === 'delete') deleteTaskWithUndo(id);
  if (action === 'remind') toggleReminderPicker(id);
  if (action === 'force-pending') forcePending(id);
  if (action === 'mark-done') markDoneNow(id);
  if (action === 'save-reminder') {
    const input = document.getElementById('input-' + id);
    const recurSel = document.getElementById('recur-' + id);
    if (input && input.value) setReminder(id, input.value, recurSel ? recurSel.value : 'none');
  }
  if (action === 'speak') {
    const t = tasks.find(x => x.id === id);
    if (t) speakText(t.text);
  }
});

// ── Filters ───────────────────────────────────────────────────────────────────
document.querySelectorAll('.filters button[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filters button[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render();
  });
});

document.querySelectorAll('#reminderDateFilters button[data-rfilter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#reminderDateFilters button[data-rfilter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    reminderDateFilter = btn.dataset.rfilter;
    currentFilter = (reminderDateFilter === 'all') ? 'all' : 'reminders';
    document.querySelectorAll('.filters button[data-filter]').forEach(b => b.classList.remove('active'));
    document.querySelector(`.filters button[data-filter="${currentFilter}"]`).classList.add('active');
    render();
  });
});

// ── Reminders ─────────────────────────────────────────────────────────────────
function checkReminders() {
  const now = new Date();
  tasks.forEach(t => {
    if (t.reminderAt && !t.reminderFired && new Date(t.reminderAt) <= now) {
      if (t.recurrence === 'daily' || t.recurrence === 'weekly') {
        const next = new Date(t.reminderAt);
        next.setDate(next.getDate() + (t.recurrence === 'daily' ? 1 : 7));
        fbUpdateTask(t.id, {
          reminderAt: next.toISOString(),
          reminderFired: false,
          forcedPending: true
        });
      } else {
        fbUpdateTask(t.id, { reminderFired: true, forcedPending: true });
      }
      showReminderBanner(t.text, t.id);
      if ('Notification' in window) {
        if (Notification.permission === 'granted') {
          new Notification('Lucky reminder', { body: t.text });
        } else if (Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }
    }
  });
}

function showReminderBanner(text, taskId) {
  reminderBannerText.textContent = '⏰ ' + text;
  reminderBanner.dataset.taskId = taskId || '';
  reminderBanner.classList.add('show');
}

reminderDismiss.addEventListener('click', () => reminderBanner.classList.remove('show'));
reminderSnooze.addEventListener('click', () => {
  const id = reminderBanner.dataset.taskId;
  const t = tasks.find(x => x.id === id);
  if (t) {
    fbUpdateTask(id, {
      reminderAt: new Date(Date.now() + 10 * 60000).toISOString(),
      reminderFired: false
    });
  }
  reminderBanner.classList.remove('show');
});

// ── Cleanup ───────────────────────────────────────────────────────────────────
function cleanupDoneTasks() {
  const now = Date.now();
  tasks.forEach(t => {
    if (t.done && t.doneAt && (now - new Date(t.doneAt).getTime()) >= 24 * 60 * 60 * 1000) {
      fbDeleteTask(t.id);
    }
  });
}

function cleanupOldTasks() {
  const now = Date.now();
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  tasks.forEach(t => {
    if ((now - new Date(t.createdAt).getTime()) >= THIRTY_DAYS) {
      fbDeleteTask(t.id);
    }
  });
}

setInterval(() => { checkReminders(); cleanupDoneTasks(); cleanupOldTasks(); }, 20000);

// ── Voice Commands ────────────────────────────────────────────────────────────
let cmdIsListening = false;

function setCmdBtnState(listening) {
  cmdIsListening = listening;
  voiceCmdBtn.textContent = listening ? '🔴 Listening...' : '🎙 Hey Lucky';
  voiceCmdBtn.classList.toggle('cmd-listening', listening);
}

voiceCmdBtn.addEventListener('click', async () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Voice commands need Chrome or Edge browser.'); return; }
  if (cmdIsListening) return;
  const granted = await ensureMicPermission();
  if (!granted) return;
  setCmdBtnState(true);
  listenOnce(
    (said) => { setCmdBtnState(false); handleVoiceCommand(said); },
    () => { setCmdBtnState(false); speakText("I didn't catch that. Please try again."); },
    8000
  );
});

function askReReadAndListen(readFn) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  setTimeout(() => {
    if (!SR) return;
    listenOnce(
      (ans) => {
        const lower = ans.toLowerCase();
        const isYes = /\b(yes|yeah|yep|haa|ha|aavunu|avunu|sure|again|repeat|cheppandi|malli)\b/.test(lower);
        if (isYes) { readFn(); } else { speakText('Ok, thank you!'); }
      },
      () => speakText('Ok, thank you!'),
      6000
    );
  }, 800);
}

function handleVoiceCommand(said) {
  const lower = said.toLowerCase().trim();

  const isReadReminders =
    /lucky.{0,10}reminders?/.test(lower) ||
    /lucky.{0,10}tasks?/.test(lower) ||
    /hey lucky/.test(lower) ||
    /read (my |today.?s |todays )?reminders?/.test(lower) ||
    /reminders? (cheppandi|cheppu|yemi|em|unnayyo|naadu|ee roju|today|ippudu)/.test(lower) ||
    /ee roju reminders?/.test(lower) ||
    /reminders? batao/.test(lower) ||
    /aaj ke reminders?/.test(lower) ||
    /what (are )?(my |today.?s )?reminders?/.test(lower) ||
    /reminders? read/.test(lower);

  if (isReadReminders) { readTodaysReminders(); return; }

  const addMatch = lower.match(/^(add task|task add)[:\s]+(.+)/);
  if (addMatch) {
    const txt = addMatch[2];
    addTask(txt, txt, null, 'none');
    speakText('Task added: ' + txt);
    return;
  }

  const doneMatch = lower.match(/^mark done[:\s]+(.+)/);
  if (doneMatch) {
    const t = tasks.find(t => !t.done && t.text.toLowerCase().includes(doneMatch[1]));
    if (t) { markDoneNow(t.id); speakText('Marked done: ' + t.text); }
    else speakText('Could not find a task matching ' + doneMatch[1]);
    return;
  }

  const delMatch = lower.match(/^delete[:\s]+(.+)/);
  if (delMatch) {
    const t = tasks.find(t => t.text.toLowerCase().includes(delMatch[1]));
    if (t) { deleteTaskWithUndo(t.id); speakText('Deleted: ' + t.text); }
    else speakText('Could not find a task matching ' + delMatch[1]);
    return;
  }

  speakText("Sorry, I didn't understand that. Try saying: Hey Lucky reminders, or add task followed by your task.");
}

function readTodaysReminders() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const todayReminders = tasks
    .filter(t => !t.done && t.reminderAt)
    .filter(t => { const d = new Date(t.reminderAt); return d >= startOfToday && d <= endOfToday; })
    .sort((a, b) => new Date(a.reminderAt) - new Date(b.reminderAt));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  if (!todayReminders.length) {
    const anyUpcoming = tasks.filter(t => !t.done && t.reminderAt && new Date(t.reminderAt) > now);
    if (!anyUpcoming.length) {
      speakText(`${greeting}! This is Lucky. You have no reminders for today. Have a great day!`);
    } else {
      const next = anyUpcoming.sort((a,b) => new Date(a.reminderAt)-new Date(b.reminderAt))[0];
      const nextDate = new Date(next.reminderAt).toLocaleDateString('en-IN',{weekday:'long',month:'long',day:'numeric'});
      const nextTime = new Date(next.reminderAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
      speakText(`${greeting}! This is Lucky. No reminders for today. Your next reminder is on ${nextDate} at ${nextTime}: ${next.text}`);
    }
    return;
  }

  const sentences = [];
  sentences.push(`${greeting}! This is Lucky. You have ${todayReminders.length} reminder${todayReminders.length===1?'':'s'} for today.`);
  todayReminders.forEach((t, i) => {
    const timeStr = new Date(t.reminderAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    const isPast = new Date(t.reminderAt) < now;
    sentences.push(`Reminder ${i+1}: ${t.text}, ${isPast ? 'was at' : 'at'} ${timeStr}.`);
  });
  sentences.push('That is all for today.');

  speakSequence(sentences, () => {
    speakText('Should I read them again?', () => { askReReadAndListen(readTodaysReminders); });
  });
}

// ── PWA Launch Screen ─────────────────────────────────────────────────────────
const launchScreen = document.getElementById('launchScreen');
const launchMicBtn = document.getElementById('launchMicBtn');
const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function dismissLaunchScreen() {
  launchScreen.classList.add('hide');
  setTimeout(() => launchScreen.classList.add('hidden'), 420);
}

if (isPWA) {
  launchScreen.classList.remove('hidden');
  launchMicBtn.addEventListener('click', () => {
    dismissLaunchScreen();
    setTimeout(() => toggleMic(), 200);
  });
  launchScreen.addEventListener('click', (e) => {
    if (e.target !== launchMicBtn && !launchMicBtn.contains(e.target)) dismissLaunchScreen();
  });
}

// ── PWA Install ───────────────────────────────────────────────────────────────
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
const ua = navigator.userAgent.toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua);
const isAndroid = /android/.test(ua);

function installStepsText() {
  if (isIOS) return 'Tap the Share icon (square with an arrow, at the bottom of Safari), then "Add to Home Screen".';
  if (isAndroid) return 'Tap the ⋮ menu (top-right of Chrome), then "Install app" or "Add to Home screen".';
  return 'Look for the install icon at the right of your browser\'s address bar, or open the browser menu and choose "Install Lucky".';
}

if (!isStandalone) { installBtn.classList.remove('hidden'); }

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });

installBtn.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
    return;
  }
  installHelpText.textContent = installStepsText();
  installHelpBanner.classList.add('show');
});

window.addEventListener('appinstalled', () => {
  installBtn.classList.add('hidden');
  installHelpBanner.classList.remove('show');
});

document.getElementById('installHelpDismiss').addEventListener('click', () => {
  installHelpBanner.classList.remove('show');
});

if (isIOS && !isStandalone) {
  installHelpText.textContent = installStepsText();
  installHelpBanner.classList.add('show');
}
