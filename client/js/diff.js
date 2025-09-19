// client/js/diff.js
// Day 13: Compare two History items (Added / Removed / Common)

(function () {
  const STORAGE_KEY = 'agileCopilotHistory';
  const $ = (s) => document.querySelector(s);

  function readHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function firstLine(text, max = 80) {
    const line = String(text || '').split(/\r?\n/)[0].trim();
    return line.length > max ? line.slice(0, max - 1) + '…' : (line || 'Untitled');
  }

  function optLabel(item) {
    const d = item.dateISO ? new Date(item.dateISO) : null;
    const yyyy = d ? d.getFullYear() : '';
    const mm   = d ? String(d.getMonth() + 1).padStart(2, '0') : '';
    const dd   = d ? String(d.getDate()).padStart(2, '0') : '';
    const when = d ? `${yyyy}-${mm}-${dd}` : '';
    const title = item.title || firstLine(item.body || '');
    return when ? `${when} — ${title}` : title;
  }

  function populateSelects() {
    const items = readHistory();
    const selA = $('#diffA');
    const selB = $('#diffB');
    if (!selA || !selB) return;

    const optionsHtml = items.map(i =>
      `<option value="${i.id}">${escapeHtml(optLabel(i))}</option>`
    ).join('');

    selA.innerHTML = optionsHtml;
    selB.innerHTML = optionsHtml;

    // Preselect latest two different items if available
    if (items.length >= 1) selA.value = String(items[0].id);
    if (items.length >= 2) selB.value = String(items[1].id);
  }

  function getItemById(id) {
    const items = readHistory();
    const n = Number(id);
    return items.find(x => x.id === n) || null;
  }

  function normalizeLines(text) {
    return String(text || '')
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function computeDiff(aText, bText) {
    const A = normalizeLines(aText);
    const B = normalizeLines(bText);

    const setA = new Set(A);
    const setB = new Set(B);

    const added = [];
    const removed = [];
    const common = [];

    // Lines in B but not in A
    for (const line of setB) {
      if (!setA.has(line)) added.push(line);
    }
    // Lines in A but not in B
    for (const line of setA) {
      if (!setB.has(line)) removed.push(line);
    }
    // Intersection (keep original order as best-effort)
    for (const line of B) {
      if (setA.has(line) && !common.includes(line)) common.push(line);
    }

    return { added, removed, common };
  }

  function renderDiff(outEl, diff) {
    if (!outEl) return;
    const parts = [];

    function section(title, arr) {
      parts.push(`## ${title}`);
      if (!arr || !arr.length) {
        parts.push('- (none)');
      } else {
        for (const l of arr) parts.push(`- ${l}`);
      }
      parts.push(''); // blank line
    }

    section('Added (in B, not in A)', diff.added);
    section('Removed (in A, not in B)', diff.removed);
    section('Common (both A and B)', diff.common);

    outEl.textContent = parts.join('\r\n');
    try { outEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
  }

  function setSummaryText(text) {
    const targets = [
      'textarea#aiSummary','textarea#summary','textarea#summaryOutput','textarea#result',
      'textarea#output','textarea','.summary','#aiSummary','#summary','#summaryOutput','#result','#output','pre'
    ];
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if ('value' in el) el.value = text;
      else el.textContent = text;
      try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
      return true;
    }
    return false;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;');
  }

  function doCompare() {
    const idA = $('#diffA')?.value;
    const idB = $('#diffB')?.value;
    const out = $('#diffOutput');
    if (!idA || !idB || !out) return;

    const a = getItemById(idA);
    const b = getItemById(idB);
    if (!a || !b) {
      out.textContent = 'Could not find selected items.';
      return;
    }

    const diff = computeDiff(a.body || '', b.body || '');
    renderDiff(out, diff);
  }

  function loadIntoPage(which) {
    const select = which === 'A' ? $('#diffA') : $('#diffB');
    const item = select ? getItemById(select.value) : null;
    if (!item) return;
    setSummaryText(item.body || '');
  }

  document.addEventListener('DOMContentLoaded', () => {
    populateSelects();

    $('#diffCompareBtn')?.addEventListener('click', doCompare);
    $('#diffLoadABtn')?.addEventListener('click', () => loadIntoPage('A'));
    $('#diffLoadBBtn')?.addEventListener('click', () => loadIntoPage('B'));

    // Re-populate after a small delay in case History just updated
    setTimeout(populateSelects, 300);
  });
})();
