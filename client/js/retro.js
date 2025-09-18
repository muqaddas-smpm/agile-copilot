// client/js/retro.js
// Day 11: Offline Retrospective from History (no API needed)

(() => {
  const STORAGE_KEY = 'agileCopilotHistory';

  // --- Helpers ---
  const $ = (sel) => document.querySelector(sel);
  const now = () => new Date();

  function readHistory() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }

  function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function getRange(days) {
    const end = now();
    const start = new Date(end.getTime() - (days * 24 * 60 * 60 * 1000));
    return { start, end };
  }

  function pickHistory(days) {
    const { start, end } = getRange(days);
    const items = readHistory()
      .filter(x => {
        const t = new Date(x.dateISO || 0);
        return t >= start && t <= end;
      })
      .sort((a, b) => new Date(a.dateISO) - new Date(b.dateISO));
    return { items, start, end };
  }

  function parsePastedNotes(raw) {
    // Accepts any text; split into lines and pull simple signals
    const lines = String(raw || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    return lines;
  }

  function gatherSignals(historyItems, pastedLines) {
    const highlights = [];
    const blockers = [];
    const risks = [];
    const todos = [];

    const pushIf = (arr, line, cond) => { if (cond && !arr.includes(line)) arr.push(line); };

    // From history: use first line as a highlight
    for (const it of historyItems) {
      const first = (it.body || '').split(/\r?\n/)[0].trim();
      if (first) highlights.push(first);
      // quick scan for blockers/risks keywords
      scanLineSet((it.body || '').split(/\r?\n/), blockers, risks, todos);
    }

    // From pasted notes
    scanLineSet(pastedLines, blockers, risks, todos);
    // Also look for typical "y / t / b" shorthand
    for (const l of pastedLines) {
      const low = l.toLowerCase();
      pushIf(highlights, l, /^y\b|(^|\s)done\b|completed|shipped/.test(low));
    }

    // Simple de-dupe
    const uniq = a => Array.from(new Set(a.map(x => x.trim()))).filter(Boolean);

    return {
      highlights: uniq(highlights).slice(0, 50),
      blockers: uniq(blockers).slice(0, 50),
      risks: uniq(risks).slice(0, 50),
      todos: uniq(todos).slice(0, 50),
    };
  }

  function scanLineSet(lines, blockers, risks, todos) {
    const blockerWords = /(blocker|blocked|stuck|waiting|failed|error|bug|issue|dependency|approval)/i;
    const riskWords = /(risk|slip|delay|unknown|outage|fragile|brittle|single point)/i;
    const todoWords = /(todo|follow up|follow-up|next|action|fix|investigate|document|schedule|meet|create|update)/i;

    for (const l of lines) {
      if (!l) continue;
      if (blockerWords.test(l)) blockers.push(cleanBullet(l));
      if (riskWords.test(l)) risks.push(cleanBullet(l));
      if (todoWords.test(l)) todos.push(cleanBullet(l));
    }
  }

  function cleanBullet(s) {
    return s.replace(/^[-*•]\s*/, '').trim();
  }

  function topThemes(historyItems, pastedLines, k = 5) {
    const text = [
      ...historyItems.map(x => x.body || ''),
      ...(pastedLines || []).join('\n')
    ].join('\n').toLowerCase();

    const stop = new Set(['the','a','and','to','of','in','for','on','is','are','was','were','it','this','that','with','as','by','an','at','or','from','be','have','has','had','will','we','our','i','you','they','them','he','she','but','if','so','not','no','yes','do','did','done','today','yesterday','blocker','risk','issue','todo']);
    const counts = {};
    for (const w of text.split(/[^a-z0-9]+/)) {
      if (!w || stop.has(w) || w.length < 3) continue;
      counts[w] = (counts[w] || 0) + 1;
    }
    const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,k).map(([w,c])=>`${w} (${c})`);
    return sorted;
  }

  function buildMarkdown({items, start, end}, pastedLines, signals) {
    const startStr = formatDate(start);
    const endStr = formatDate(end);
    const today = formatDate(now());

    const srcList = items.map(i => {
      const when = i.dateISO ? formatDate(new Date(i.dateISO)) : '';
      const title = (i.title || (i.body || '').split(/\r?\n/)[0] || 'Untitled').trim();
      return `- ${when} — ${title}`;
    }).join('\n');

    const themes = topThemes(items, pastedLines, 5);

    const md = [
      `# Weekly Retrospective — ${startStr} → ${endStr}`,
      '',
      '---',
      '',
      '## Highlights',
      ...(signals.highlights.length ? signals.highlights.map(x=>`- ${x}`) : ['- (none detected)']),
      '',
      '## Blockers',
      ...(signals.blockers.length ? signals.blockers.map(x=>`- ${x}`) : ['- (none detected)']),
      '',
      '## Risks',
      ...(signals.risks.length ? signals.risks.map(x=>`- ${x}`) : ['- (none detected)']),
      '',
      '## Suggested Action Items',
      ...(suggestActions(signals).length ? suggestActions(signals).map(x=>`- ${x}`) : ['- Review blockers and assign owners.']),
      '',
      '## Themes (auto-detected)',
      ...(themes.length ? themes.map(x=>`- ${x}`) : ['- (no clear themes)']),
      '',
      '## Sources (from History)',
      srcList || '- (no history items in range)',
      '',
      `*Generated locally on ${today}*`
    ].join('\r\n');

    return md;
  }

  function suggestActions(signals) {
    const actions = [];
    for (const b of signals.blockers.slice(0, 5)) actions.push(`Unblock: ${b} — assign owner & due date.`);
    for (const r of signals.risks.slice(0, 5)) actions.push(`Mitigate risk: ${r} — add to RAID log & define trigger.`);
    if (!actions.length && signals.highlights.length) actions.push('Document highlights in Confluence and share wins in the next standup.');
    return actions;
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // Try to save via Day 10 history if available
  function saveViaHistory(md) {
    // Place MD into a temporary hidden textarea so Day 10 logic can find it
    let tmp = $('#retroHidden');
    if (!tmp) {
      tmp = document.createElement('textarea');
      tmp.id = 'retroHidden';
      tmp.style.position = 'absolute';
      tmp.style.left = '-9999px';
      document.body.appendChild(tmp);
    }
    tmp.value = md;

    if (typeof window.saveToHistory === 'function') {
      window.saveToHistory('retro-gen');
      return true;
    }
    return false;
  }

  // --- Wire up UI ---
  document.addEventListener('DOMContentLoaded', () => {
    const daysInput = $('#retroDays');
    const notesInput = $('#retroNotes');
    const output = $('#retroOutput');
    const buildBtn = $('#buildRetroBtn');
    const downloadBtn = $('#downloadRetroBtn');
    const saveBtn = $('#saveRetroBtn');

    const ensure = (el, msg) => { if (!el) alert(`Missing element: ${msg}`); return !!el; };
    if (!ensure(daysInput,'#retroDays') || !ensure(output,'#retroOutput') || !ensure(buildBtn,'#buildRetroBtn')) return;

    buildBtn.addEventListener('click', () => {
      const days = Math.max(3, Math.min(30, Number(daysInput.value) || 7));
      const { items, start, end } = pickHistory(days);
      const pastedLines = parsePastedNotes(notesInput ? notesInput.value : '');
      const signals = gatherSignals(items, pastedLines);
      const md = buildMarkdown({items, start, end}, pastedLines, signals);
      output.textContent = md;
      // auto-scroll
      try { output.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {}
    });

    downloadBtn?.addEventListener('click', () => {
      const date = new Date();
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const text = output.textContent || '';
      if (!text.trim()) { alert('Build the retrospective first.'); return; }
      downloadText(`retro-${yyyy}-${mm}-${dd}.md`, text);
    });

    saveBtn?.addEventListener('click', () => {
      const text = output.textContent || '';
      if (!text.trim()) { alert('Build the retrospective first.'); return; }
      const ok = saveViaHistory(text);
      alert(ok ? 'Retrospective saved to History.' : 'Could not access History. (Day 10 script missing?)');
    });
  });
})();
