// Agile Copilot — Day 8 (Standup Synthesizer)
// Full replacement for client/standup.js
// New: editable severity badges (cycles 0→1→2→3→0, stored locally),
// Export JSON, Print View. Still includes CSV import, Copy/Export MD,
// Export CSV, toast, shortcuts, history, smarter parsing.

"use strict";

// ===== Utilities =====
function $(sel){ return document.querySelector(sel); }
function fmtDateISO(d){ const x=(d instanceof Date)?d:new Date(d); return x.toISOString().slice(0,10); }
function prettyDate(d){ return new Date(d).toLocaleDateString(); }
function download(filename, text){
  const blob=new Blob([text],{type:"text/plain;charset=utf-8"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}
function showToast(msg="✅ Analyzed"){
  const t=$("#toast"); if(!t) return;
  t.textContent=msg; t.hidden=false;
  t.classList.add("show");
  setTimeout(()=>{ t.classList.remove("show"); t.hidden=true; }, 1600);
}
function nameSafe(s){ return String(s||"").replace(/[<>&]/g, "_"); }
function escapeHtml(s){ return String(s||"").replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }
function makeKey(name, text){ return (name||"").trim()+"||"+String(text||"").trim().toLowerCase(); }

// ===== History (localStorage) =====
const LS_KEY="agc_standup_history";
function loadHistory(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch{ return []; } }
function saveHistory(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); }
let history = loadHistory();

// ===== Severity overrides (localStorage) =====
const LS_OVR="agc_standup_sev_overrides";
function loadOverrides(){ try{ return JSON.parse(localStorage.getItem(LS_OVR)||"{}"); }catch{ return {}; } }
function saveOverrides(map){ localStorage.setItem(LS_OVR, JSON.stringify(map)); }
let overrides = loadOverrides();
function getSeverity(name, text){
  const key = makeKey(name, text);
  return Object.prototype.hasOwnProperty.call(overrides,key) ? overrides[key] : scoreSeverity(text);
}
function setSeverity(name, text, sev){
  const key = makeKey(name, text);
  overrides[key] = sev;
  saveOverrides(overrides);
}

// ===== Parsing =====
const PERSON_RE = /^([A-Z][A-Za-z0-9_. -]{0,40})\s*[:\-—]\s*(.*)$/i;
const TOKENS = {
  y: /(^|\b)(yesterday|y)\s*[:\-–]\s*/i,
  t: /(^|\b)(today|t)\s*[:\-–]\s*/i,
  b: /(^|\b)(blockers?|b)\s*[:\-–]\s*/i,
};

function splitTokens(str){
  const out = {};
  let s = " " + String(str||"");
  const idx = [];
  for(const key of ["y","t","b"]){
    const re = TOKENS[key];
    const m = re.exec(s);
    if(m) idx.push({key, pos: m.index, len: m[0].length});
  }
  if(!idx.length){ return {}; }
  idx.sort((a,b)=>a.pos-b.pos);
  for(let i=0;i<idx.length;i++){
    const cur = idx[i];
    const start = cur.pos + cur.len;
    const end = (i+1<idx.length) ? idx[i+1].pos : s.length;
    const val = s.slice(start,end).trim().replace(/^[;,\-–—]+/,"").trim();
    out[cur.key] = (out[cur.key] ? (out[cur.key] + "; " + val) : val);
  }
  return out;
}

function parseNotes(text){
  const lines = String(text||"").replace(/\r/g,"").split("\n");
  const people = {}; // name -> {y:[], t:[], b:[]}
  let current = null;

  const push = (name, key, val) => {
    if(!people[name]) people[name]={ y:[], t:[], b:[] };
    if(val && val.trim()) people[name][key].push(val.trim());
  };

  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;

    const m = PERSON_RE.exec(line);
    if(m){
      current = m[1].trim();
      const rest = m[2] || "";
      const parts = splitTokens(rest);
      if(parts.y) push(current, "y", parts.y);
      if(parts.t) push(current, "t", parts.t);
      if(parts.b) push(current, "b", parts.b);
      continue;
    }

    if(current){
      const cleaned = line.replace(/^[•*\-\u2022]+\s*/,"");
      const parts = splitTokens(cleaned);
      if(parts.y || parts.t || parts.b){
        if(parts.y) push(current, "y", parts.y);
        if(parts.t) push(current, "t", parts.t);
        if(parts.b) push(current, "b", parts.b);
      }else{
        if(/block|blocked|waiting|dependency|access|permission|review pending|qa\b|test\s*failure|flaky|stuck/i.test(line)) push(current,"b",line);
        else if(/^\b(add|fix|refactor|write|review|merge|deploy|test|investigate|document|pair|polish|design|plan)\b/i.test(line)) push(current,"t",line);
        else push(current,"y",line);
      }
    }
  }
  return people;
}

// ===== Severity scoring (0–3) =====
function scoreSeverity(text){
  const t = String(text||"").toLowerCase();
  if(!t || /(^|\b)(no blocker|none|n\/a)(\b|$)/.test(t)) return 0;
  let score = 1;
  if(/blocked|waiting|dependency|review|qa\b|test failure|flaky|stuck|slow env|access|permission/.test(t)) score = Math.max(score,2);
  if(/prod|outage|p0|sev(\s*0|1|2|3)?|deadline|cannot proceed|broken|urgent|security|data loss|customer impact/.test(t)) score = Math.max(score,3);
  return score;
}
function severityBadge(sev, name, text){
  const key = makeKey(name, text);
  return `<span class="badge s${sev} editable" data-key="${encodeURIComponent(key)}" title="Click to set severity (0–3)">${sev}</span>`;
}

// ===== Renderers =====
function renderSnapshot(people){
  const root = $("#snapshot"); if(!root) return;
  root.innerHTML = "";
  const names = Object.keys(people);
  if(!names.length){ root.innerHTML = '<p class="hint">(no parsed items yet)</p>'; return; }

  const frag = document.createDocumentFragment();
  names.sort((a,b)=>a.localeCompare(b));
  for(const name of names){
    const p = people[name];
    const div = document.createElement("div");
    div.className = "card";
    const bl = (p.b||[]).map(b=>{
      const sev = getSeverity(name, b);
      return `<li>${severityBadge(sev, name, b)} ${escapeHtml(b)}</li>`;
    }).join("") || "<li>—</li>";
    div.innerHTML = `
      <h4>${nameSafe(name)}</h4>
      <div><strong>Yesterday</strong><ul>${(p.y||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")||"<li>—</li>"}</ul></div>
      <div><strong>Today</strong><ul>${(p.t||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("")||"<li>—</li>"}</ul></div>
      <div><strong>Blockers</strong><ul>${bl}</ul></div>
    `;
    frag.appendChild(div);
  }
  root.appendChild(frag);
}

function renderBlockers(people){
  const root = $("#blockers"); if(!root) return;
  root.innerHTML = "";
  const items = [];
  for(const [name,p] of Object.entries(people)){
    (p.b||[]).forEach(b => items.push({ name, text:b, sev: getSeverity(name,b) }));
  }
  if(!items.length){ root.innerHTML = '<p class="hint">(no blockers)</p>'; return; }
  items.sort((a,b)=>b.sev-a.sev);

  const list = document.createElement("ul");
  for(const it of items){
    const li = document.createElement("li");
    li.innerHTML = `${severityBadge(it.sev, it.name, it.text)} <em>${nameSafe(it.name)}</em>: ${escapeHtml(it.text)}`;
    list.appendChild(li);
  }
  root.appendChild(list);
}

function renderFollowups(people){
  const root = $("#followups"); if(!root) return;
  root.innerHTML = "";
  const out = [];
  for(const [name,p] of Object.entries(people)){
    for(const b of (p.b||[])){
      const sev = getSeverity(name, b);
      const who = guessOwnerFromText(b) || name;
      const ask = sev>=3 ? "Escalate" : (sev===2 ? "Unblock" : "Check-in");
      out.push(`${ask} ${who} on: ${b}`);
    }
  }
  out.slice(0,10).forEach(x => {
    const li = document.createElement("li"); li.textContent = x; root.appendChild(li);
  });
}

function guessOwnerFromText(t){
  const m = /@?([A-Z][a-zA-Z0-9._-]{1,20})/.exec(t||"");
  return m ? m[1] : null;
}

// ===== Markdown export =====
function toMarkdown(dateISO, people){
  const names = Object.keys(people).sort((a,b)=>a.localeCompare(b));
  let md = `# Standup — ${prettyDate(dateISO)}\n\n`;
  for(const n of names){
    const p = people[n];
    md += `## ${n}\n`;
    md += `**Yesterday**\n${itemsToMd(p.y)}\n`;
    md += `**Today**\n${itemsToMd(p.t)}\n`;
    md += `**Blockers**\n${itemsToMd(p.b, true, n)}\n\n`;
  }
  const bl = [];
  for(const [name,p] of Object.entries(people)){
    (p.b||[]).forEach(b => bl.push({name, b, sev: getSeverity(name,b)}));
  }
  if(bl.length){
    md += `## Blockers (by severity)\n`;
    bl.sort((a,b)=>b.sev-a.sev).forEach(x => {
      md += `- [S${x.sev}] ${x.name}: ${x.b}\n`;
    });
    md += `\n`;
  }
  return md;
}
function itemsToMd(arr, withSev=false, nameForSev=null){
  if(!arr || !arr.length) return "- —\n";
  return arr.map(x => withSev ? `- [S${getSeverity(nameForSev,x)}] ${x}` : `- ${x}`).join("\n") + "\n";
}

// ===== CSV import (Slack-like) =====
function parseCsv(text){
  const lines = String(text||"").replace(/\r/g,"").split("\n").filter(l=>l.length>0);
  if(!lines.length) return { header: [], rows: [] };
  const header = splitCsvLine(lines[0]).map(h=>h.trim().toLowerCase());
  const rows = lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const obj = {};
    header.forEach((h,i)=> obj[h] = (cells[i] ?? "").trim());
    return obj;
  });
  return { header, rows };
}
function splitCsvLine(line){
  const out = [];
  let cur = "", inQ = false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch === '"' ){
      if(inQ && line[i+1] === '"'){ cur += '"'; i++; } else { inQ = !inQ; }
    }else if(ch === ',' && !inQ){
      out.push(cur); cur = "";
    }else{
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}
function importSlackCsvToNotes(csvText){
  const { header, rows } = parseCsv(csvText);
  if(!header.length || !rows.length) return "";

  const h = (name) => header.indexOf(name);
  const idxUser = [h("user"), h("username"), h("author")].find(i=>i>=0);
  const idxText = [h("text"), h("message"), h("body")].find(i=>i>=0);
  const idxTime = [h("date"), h("timestamp"), h("ts"), h("time")].find(i=>i>=0);

  const bucket = {}; // name -> inferred lines
  for(const r of rows){
    const user = (idxUser!=null ? r[header[idxUser]] : "Unknown") || "Unknown";
    const msg  = (idxText!=null ? r[header[idxText]] : "") || "";
    const ts   = (idxTime!=null ? r[header[idxTime]] : "");
    if(!bucket[user]) bucket[user] = [];
    let tag = "t";
    if(/block|blocked|waiting|dependency|access|permission|review pending|flaky|qa|failure/i.test(msg)) tag = "b";
    else if(/yesterday/i.test(msg)) tag = "y";
    const timeHint = ts ? ` (${ts})` : "";
    bucket[user].push(`${tag} - ${msg}${timeHint}`);
  }

  const lines = [];
  Object.keys(bucket).forEach(name=>{
    lines.push(`${name}: ${bucket[name].join("; ")}`);
  });
  return lines.join("\n");
}

// ===== History UI =====
function renderHistory(){
  const body = $("#historyBody"); if(!body) return;
  body.innerHTML = "";
  if(!history.length){ body.innerHTML = `<tr><td colspan="4" class="hint">No history yet</td></tr>`; return; }
  history.forEach((h, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${prettyDate(h.date)}</td>
      <td>${Object.keys(h.people||{}).length}</td>
      <td>
        <button class="btn" data-act="view" data-id="${h.id}">View</button>
        <button class="btn secondary" data-act="remove" data-id="${h.id}">Remove</button>
      </td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll("button").forEach(btn=>{
    const id = btn.getAttribute("data-id");
    const act = btn.getAttribute("data-act");
    btn.addEventListener("click", ()=>{
      if(act==="view"){
        const h = history.find(x=>x.id===id);
        if(!h) return;
        $("#notes").value = h.raw;
        $("#standupDate").value = fmtDateISO(h.date);
        display(h.people);
      } else if(act==="remove"){
        history = history.filter(x=>x.id!==id); saveHistory(history); renderHistory();
      }
    });
  });
}

// ===== Display & wiring for editable badges =====
function wireBadgeClicks(currentPeople){
  document.querySelectorAll(".badge.editable").forEach(badge=>{
    badge.addEventListener("click", ()=>{
      const key = decodeURIComponent(badge.dataset.key || "");
      if(!key) return;
      const [person, textLower] = key.split("||");
      // Find original text for exact display key (we stored lowercased in key)
      let originalText = null;
      const p = currentPeople[person];
      if(p && p.b){
        originalText = p.b.find(x => String(x).trim().toLowerCase() === textLower) ?? null;
      }
      const current = getSeverity(person, originalText ?? textLower);
      const next = (current + 1) % 4;
      setSeverity(person, originalText ?? textLower, next);
      // Re-render with updated severities
      display(currentPeople);
    });
  });
}

function display(people){
  renderSnapshot(people);
  renderBlockers(people);
  renderFollowups(people);
  wireBadgeClicks(people);
}

// ===== Print-friendly HTML =====
function toPrintableHtml(dateISO, people){
  const names = Object.keys(people).sort((a,b)=>a.localeCompare(b));
  const rows = names.map(n=>{
    const p = people[n];
    const y = (p.y||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("") || "<li>—</li>";
    const t = (p.t||[]).map(x=>`<li>${escapeHtml(x)}</li>`).join("") || "<li>—</li>";
    const b = (p.b||[]).map(x=>`<li>[S${getSeverity(n,x)}] ${escapeHtml(x)}</li>`).join("") || "<li>—</li>";
    return `
      <section class="block">
        <h2>${nameSafe(n)}</h2>
        <h3>Yesterday</h3><ul>${y}</ul>
        <h3>Today</h3><ul>${t}</ul>
        <h3>Blockers</h3><ul>${b}</ul>
      </section>`;
  }).join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Standup — ${prettyDate(dateISO)}</title>
<style>
  body{ font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; margin:24px; color:#111; }
  h1{ margin:0 0 16px; }
  h2{ margin:16px 0 6px; }
  h3{ margin:10px 0 4px; font-weight:600; }
  ul{ margin:0 0 8px 20px; }
  .block{ page-break-inside:avoid; margin-bottom:14px; padding-bottom:8px; border-bottom:1px solid #ddd; }
  @media print{
    a,button{ display:none !important; }
    body{ margin:12px; }
  }
</style>
</head>
<body>
  <h1>Standup — ${prettyDate(dateISO)}</h1>
  ${rows || "<p>No items.</p>"}
  <script>window.print()</script>
</body>
</html>`;
}

// ===== Wire up =====
(function init(){
  const dateEl = $("#standupDate");
  if(dateEl) dateEl.value = fmtDateISO(new Date());

  // Analyze
  const analyzeBtn = $("#btnAnalyze");
  if (analyzeBtn){
    analyzeBtn.addEventListener("click", ()=>{
      const raw = $("#notes").value;
      const date = ($("#standupDate")?.value) || fmtDateISO(new Date());
      const people = parseNotes(raw);
      display(people);
      const entry = { id: String(Date.now()), date, raw, people };
      history.unshift(entry); history = history.slice(0,50);
      saveHistory(history); renderHistory();
      showToast("✅ Analyzed");
    });
  }

  // Clear
  const clearBtn = $("#btnClear");
  if (clearBtn){
    clearBtn.addEventListener("click", ()=>{
      $("#notes").value = "";
      $("#snapshot").innerHTML = "";
      $("#blockers").innerHTML = "";
      $("#followups").innerHTML = "";
    });
  }

  // Export Markdown
  const exportMdBtn = $("#btnExportMd");
  if (exportMdBtn){
    exportMdBtn.addEventListener("click", ()=>{
      const date = ($("#standupDate")?.value) || fmtDateISO(new Date());
      const people = parseNotes($("#notes").value);
      const md = toMarkdown(date, people);
      download(`standup-${date}.md`, md);
      showToast("📄 Markdown exported");
    });
  }
// ===== AI Summarize (server-backed) =====
const aiBtn = $("#btnAISummarize");
if (aiBtn){
  aiBtn.addEventListener("click", async ()=>{
    const date = $("#standupDate").value || fmtDateISO(new Date());
    const notes = $("#notes").value.trim();
    if (notes.length < 10){ alert("Please paste standup notes first."); return; }

    // If you're opening standup.html as a file://, call localhost explicitly
    const API_BASE = (location.origin.startsWith("http")) ? "" : "http://localhost:3001";

    aiBtn.disabled = true;
    aiBtn.textContent = "Summarizing…";
    try {
      const resp = await fetch(`${API_BASE}/api/ai/standup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, notes })
      });
      if(!resp.ok){
        const err = await resp.json().catch(()=>({}));
        throw new Error(err.error || `Request failed (${resp.status})`);
      }
      const data = await resp.json();
      $("#aiMd").textContent = data.md || "(no content)";
      const u = data.usage || {};
      const c = data.cost || {};
      $("#aiUsage").textContent = `usage: in ${u.prompt_tokens||0}, out ${u.completion_tokens||0} (≈$${(c.total_usd||0).toFixed(4)})`;
      showToast("✨ AI summary ready");
    } catch (e){
      alert("AI summarize failed: " + (e?.message || e));
    } finally {
      aiBtn.disabled = false;
      aiBtn.textContent = "AI Summarize";
    }
  });
}

// Copy AI Markdown
const copyAiBtn = $("#btnCopyAi");
if (copyAiBtn){
  copyAiBtn.addEventListener("click", async ()=>{
    const md = $("#aiMd").textContent || "";
    if(!md){ showToast("Nothing to copy"); return; }
    try {
      await navigator.clipboard.writeText(md);
      showToast("📋 AI Markdown copied");
    } catch {
      const ta = document.createElement("textarea"); ta.value = md; document.body.appendChild(ta);
      ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      showToast("📋 AI Markdown copied");
    }
  });
}


  // Copy Markdown
  const copyBtn = $("#btnCopyMd");
  if (copyBtn){
    copyBtn.addEventListener("click", async ()=>{
      const date = ($("#standupDate")?.value) || fmtDateISO(new Date());
      const people = parseNotes($("#notes").value);
      const md = toMarkdown(date, people);
      try {
        await navigator.clipboard.writeText(md);
        showToast("📋 Markdown copied");
      } catch {
        const ta = document.createElement("textarea");
        ta.value = md; document.body.appendChild(ta);
        ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
        showToast("📋 Markdown copied");
      }
    });
  }

  // Export CSV
  const exportCsvBtn = $("#btnExportCsv");
  if (exportCsvBtn){
    exportCsvBtn.addEventListener("click", ()=>{
      const date = ($("#standupDate")?.value) || fmtDateISO(new Date());
      const people = parseNotes($("#notes").value);
      const rows = [["name","yesterday","today","blockers","max_severity"]];
      for (const [name,p] of Object.entries(people)){
        const y = (p.y||[]).join(" | ");
        const t = (p.t||[]).join(" | ");
        const b = (p.b||[]).join(" | ");
        const maxSev = Math.max(0, ...(p.b||[]).map(x=>getSeverity(name,x)));
        rows.push([name,y,t,b,String(Number.isFinite(maxSev)?maxSev:0)]);
      }
      const csv = rows.map(r => r.map(v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g,'""')}"` : String(v)).join(",")).join("\n");
      download(`standup-${date}.csv`, csv);
      showToast("📄 CSV exported");
    });
  }

  // Export JSON
  const exportJsonBtn = $("#btnExportJson");
  if (exportJsonBtn){
    exportJsonBtn.addEventListener("click", ()=>{
      const date = ($("#standupDate")?.value) || fmtDateISO(new Date());
      const people = parseNotes($("#notes").value);
      const names = Object.keys(people).sort((a,b)=>a.localeCompare(b));
      const payload = {
        date,
        people: names.map(n=>{
          const p = people[n];
          return {
            name: n,
            yesterday: p.y || [],
            today: p.t || [],
            blockers: (p.b||[]).map(b=>({ text: b, severity: getSeverity(n,b) }))
          };
        }),
        overrides
      };
      download(`standup-${date}.json`, JSON.stringify(payload,null,2));
      showToast("🧾 JSON exported");
    });
  }

  // Print View
  const printBtn = $("#btnPrint");
  if (printBtn){
    printBtn.addEventListener("click", ()=>{
      const date = ($("#standupDate")?.value) || fmtDateISO(new Date());
      const people = parseNotes($("#notes").value);
      const html = toPrintableHtml(date, people);
      const w = window.open("", "_blank");
      if(!w) return alert("Popup blocked — allow popups to print.");
      w.document.open(); w.document.write(html); w.document.close();
    });
  }

  // CSV import (file input)
  const fileEl = $("#csvFile");
  const importCsvBtn = $("#btnImportCsv");
  if(importCsvBtn){
    importCsvBtn.addEventListener("click", async ()=>{
      if(!fileEl || !fileEl.files || !fileEl.files[0]){ alert("Choose a .csv file first."); return; }
      const text = await fileEl.files[0].text();
      const synth = importSlackCsvToNotes(text);
      if(synth){ $("#notes").value = synth; showToast("📥 CSV imported → ready to Analyze"); }
      else alert("Could not parse CSV.");
    });
  }

  // CSV import (drag & drop)
  const drop = $("#dropCsv");
  if(drop){
    ["dragenter","dragover"].forEach(ev=>{
      drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag"); });
    });
    ["dragleave","drop"].forEach(ev=>{
      drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove("drag"); });
    });
    drop.addEventListener("drop", async (e)=>{
      const f = e.dataTransfer.files[0];
      if(!f || !/\.csv$/i.test(f.name)) return;
      const text = await f.text();
      const synth = importSlackCsvToNotes(text);
      if(synth){ $("#notes").value = synth; showToast("📥 CSV imported → ready to Analyze"); }
      else alert("Could not parse CSV.");
    });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (e)=>{
    if (e.ctrlKey && e.key === "Enter"){ analyzeBtn?.click(); e.preventDefault(); }
    if (e.altKey && (e.key === "e" || e.key === "E")){ exportMdBtn?.click(); e.preventDefault(); }
    if (e.altKey && (e.key === "c" || e.key === "C")){ copyBtn?.click(); e.preventDefault(); }
    if (e.altKey && (e.key === "p" || e.key === "P")){ printBtn?.click(); e.preventDefault(); }
  });

  renderHistory();
})();
