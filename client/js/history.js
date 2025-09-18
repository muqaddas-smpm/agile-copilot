// client/js/history.js
// Day 10: Save & view last N summaries using localStorage (no server needed)

(() => {
  const STORAGE_KEY = 'agileCopilotHistory';
  const MAX_ITEMS = 20;

  // --- Utilities ---
  const $ = (sel) => document.querySelector(sel);

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch { return fallback; }
  }

  function readHistory() {
    return safeParse(localStorage.getItem(STORAGE_KEY), []);
  }

  function writeHistory(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }

  function firstLine(text, max = 80) {
    const line = (text || '').split(/\r?\n/)[0].trim();
    return line.length > max ? line.slice(0, max - 1) + '…' : line || 'Untitled summary';
  }

  function getSummaryText() {
    if (typeof window.getSummaryText === 'function') {
      const t = window.getSummaryText();
      if (t && t.trim().length) return t.trim();
    }
    const selectors = [
      '#aiSummary', '#summary', '#summaryOutput', '#result', '#output', '.summary', 'textarea', 'pre'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const text = ('value' in el) ? el.value : el.textContent;
      if (text && text.trim().length) return text.trim();
    }
    return '';
  }

  function setSummaryText(text) {
    const targets = [
      'textarea#aiSummary', 'textarea#summary', 'textarea#summaryOutput', 'textarea#result',
      'textarea#output', 'textarea', '#aiSummary', '#summary', '#summaryOutput', '#result', '#output', '.summary', 'pre'
    ];
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if ('value' in el) {
        el.value = text;
      } else {
        el.textContent = text;
      }
      try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      return true;
    }
    alert('Could not place the text back into the page. (No suitable target found.)');
    return false;
  }

  function saveCurrentSummary(source = 'manual') {
    const text = getSummaryText();
    if (!text) {
      alert('No summary detected. Generate a summary first, then click Save.');
      return false;
    }
    const items = readHistory();

    // de-duplicate if identical to most recent
    if (items.length && items[0].body === text) {
      // already saved — just re-render to be safe
      renderHistory();
      return true;
    }

    const now = new Date();
    const entry = {
      id: Date.now(),
      dateISO: now.toISOString(),
      title: firstLine(text),
      body: text,
      source
    };

    items.unshift(entry);
    if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
    writeHistory(items);
    renderHistory();
    return true;
  }

  function deleteEntry(id) {
    const items = readHistory().filter(x => x.id !== id);
    writeHistory(items);
    renderHistory();
  }

  function clearAll() {
    if (!confirm('Clear all saved summaries?')) return;
    writeHistory([]);
    renderHistory();
  }

  function formatWhen(iso) {
    try {
      const d = new Date(iso);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } catch { return iso || ''; }
  }

  function renderHistory() {
    const list = $('#historyList');
    const empty = $('#historyEmpty');
    const count = $('#historyCount');
    if (!list) return;

    const items = readHistory();
    list.innerHTML = '';

    if (!items.length) {
      if (empty) empty.style.display = '';
      if (count) count.textContent = '0';
      return;
    }

    if (empty) empty.style.display = 'none';
    if (count) count.textContent = String(items.length);

    for (const entry of items) {
      const li = document.createElement('li');
      li.className = 'history-item';
      li.innerHTML = `
        <div class="history-header">
          <strong class="history-title">${escapeHtml(entry.title)}</strong>
          <span class="history-meta">${formatWhen(entry.dateISO)}</span>
        </div>
        <div class="history-actions">
          <button class="load" data-id="${entry.id}">Load</button>
          <button class="delete" data-id="${entry.id}">Delete</button>
        </div>
      `;
      list.appendChild(li);
    }

    list.querySelectorAll('button.load').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        const item = readHistory().find(x => x.id === id);
        if (item) setSummaryText(item.body);
      });
    });

    list.querySelectorAll('button.delete').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = Number(btn.getAttribute('data-id'));
        deleteEntry(id);
      });
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  // Wire up buttons + integrate with Download button if present
  document.addEventListener('DOMContentLoaded', () => {
    const saveBtn = $('#saveHistoryBtn');
    const clearBtn = $('#clearHistoryBtn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveCurrentSummary('save-button'));
    if (clearBtn) clearBtn.addEventListener('click', clearAll);

    // If the Day 9 button exists, auto-save when user downloads
    const downloadBtn = document.getElementById('downloadMdBtn');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => setTimeout(() => saveCurrentSummary('download-md'), 100));
    }

    renderHistory();
  });

  // Expose manual hook (optional)
  window.saveToHistory = saveCurrentSummary;
})();
