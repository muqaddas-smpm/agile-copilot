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
  const t=$("#toast"); t.textContent=msg; t.hidden=false;
  t.classList.add("show");
  setTimeout(()=>{ t.classList.remove("show"); t.hidden=true; }, 1600);
}

// ===== History (localStorage) =====
const LS_KEY="agc_standup_history";
function loadHistory(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)||"[]"); }catch{ return []; } }
function saveHistory(list){ localStorage.setItem(LS_KEY, JSON.stringify(list)); }
let history = loadHistory();

// ===== Parsing =====
const PERSON_RE = /^([A-Z][A-Za-z0-9_. -]{0,40})\s*[:\-—]\s*(.*)$/i;
const TOKENS = {
  y: /(^|\b)(yesterday|y)\s*[:\-–]\s*/i,
  t: /(^|\b)(today|t)\s*[:\-–]\s*/i,
  b: /(^|\b)(blockers?|b)\s*[:\-–]\s*/i,
};

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

    // person header like "Alice: ..."
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

    // list bullets or loose lines under current person
    if(current){
      const parts = splitTokens(line.replace(/^[•*\-\u2022]+\s*/,""));
      if(parts.y || parts.t || parts.b){
        if(parts.y) push(current, "y", parts.y);
        if(parts.t) push(current, "t", parts.t);
        if(parts.b) push(current, "b", parts.b);
      }else{
        // heuristics
        if(/block|blocked|waiting|dependency|review pending|qa|test\s*failure|flaky/i.test(line)) push(current,"b",line);
        else if(/^\b(add|fix|refactor|write|review|merge|deploy|test|investigate|document|pair|polish|design|plan)\b/i.test(line)) push(current,"t",line);
        else push(current,"y",line);
      }
    }
  }
  return people;
}

function splitTokens(str){
  const out = {};
  let s = " " + str;
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

// ===== Severity scoring (0–3) =====
function scoreSeverity(text){
  const t = String(text||"").toLowerCase();
  if(!t || /(^|\b)(no blocker|none|n\/a)(\b|$)/.test(t)) return 0;
  let score = 1;
  if(/blocked|waiting|dependency|review|qa\b|test failure|flaky|stuck|slow env|access|permission/.test(t)) score = Math.max(score,2);
  if(/prod|outage|p0|sev(\s*0|1|2|3)?|deadline|cannot proceed|broken|urgent|security|data loss|customer impact/.test(t)) score = Math.max(score,3);
  return score;
}
function severityBadge(sev){
  return `<span class="badge s${sev}">${sev}</span>`;
}

// ===== Render =====
function renderSnapshot(people){
  const root = $("#snapshot"); root.innerHTML = "";
  const names = Object.keys(people);
  if(!names.length){ root.innerHTML = '<p class="hint">(no parsed items yet)</p>'; return; }

  const frag = document.createDocumentFragment();
  names.sort((a,b)=>a.localeCompare(b));
  for(const name of names){
    const p = people[name];
    const div = document.createElement("div");
    div.className = "card";
    const bl = (p.b||[]).map(x=>{
      const sev = scoreSeverity(x);
      return `<li>${severityBadge(sev)} ${escapeHtml(x)}</li>`;
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
  const root = $("#blockers"); root.innerHTML = "";
  const items = [];
  for(const [name,p] of Object.entries(people)){
    (p.b||[]).forEach(b => items.push({ name, text:b, sev: scoreSeverity(b) }));
  }
  if(!items.length){ root.innerHTML = '<p class="hint">(no blockers)</p>'; return; }
  items.sort((a,b)=>b.sev-a.sev);

  const list = document.createElement("ul");
  for(const it of items){
    const li = document.createElement("li");
    li.innerHTML = `${severityBadge(it.sev)} <em>${nameSafe(it.name)}</em>: ${escapeHtml(it.text)}`;
    list.appendChild(li);
  }
  root.appendChild(list);
}

function nameSafe(s){ return s.replace(/[<>&]/g, "_"); }
function escapeHtml(s){ return s.replace(/[&<>]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[ch])); }

function renderFollowups(people){
  const root = $("#followups"); root.innerHTML = "";
  const out = [];
  for(const [name,p] of Object.entries(people)){
    for(const b of (p.b||[])){
      const sev = scoreSeverity(b);
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
    md += `**Blockers**\n${itemsToMd(p.b, true)}\n\n`;
  }
  // blockers summary
  const bl = [];
  for(const [name,p] of Object.entries(people)){
    (p.b||[]).forEach(b => bl.push({name, b, sev: scoreSeverity(b)}));
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
function itemsToMd(arr, withSev=false){
  if(!arr || !arr.length) return "- —\n";
  return arr.map(x => {
    if(withSev){ return `- [S${scoreSeverity(x)}] ${x}`; }
    return `- ${x}`;
  }).join("\n") + "\n";
}

// ===== CSV import (Slack-like) =====
function parseCsv(text){
  const lines = text.replace(/\r/g,"").split("\n").filter(Boolean);
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
  // basic CSV with quotes support
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

  // map common header names
  const h = (name) => header.indexOf(name);
  const idxUser = [h("user"), h("username"), h("author")].find(i=>i>=0);
  const idxText = [h("text"), h("message"), h("body")].find(i=>i>=0);
  const idxTime = [h("date"), h("timestamp"), h("ts"), h("time")].find(i=>i>=0);

  const bucket = {}; // name -> array of inferred items as text lines
  for(const r of rows){
    const user = (idxUser!=null ? r[header[idxUser]] : "Unknown") || "Unknown";
    const msg  = (idxText!=null ? r[header[idxText]] : "") || "";
    const ts   = (idxTime!=null ? r[header[idxTime]] : "");
    if(!bucket[user]) bucket[user] = [];
    // classify message to y/t/b
    let tag = "t";
    if(/block|blocked|waiting|dependency|access|permission|review pending|flaky|qa|failure/i.test(msg)) tag = "b";
    else if(/yesterday/i.test(msg)) tag = "y";
    const timeHint = ts ? ` (${ts})` : "";
    bucket[user].push(`${tag} - ${msg}${timeHint}`);
  }

  // synthesize note text that our parser understands
  const lines = [];
  Object.keys(bucket).forEach(name=>{
    lines.push(`${name}: ${bucket[name].join("; ")}`);
  });
  return lines.join("\n");
}

// ===== History UI =====
function renderHistory(){
  const body = $("#historyBody"); body.innerHTML = "";
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

// ===== Display =====
function display(people){
  renderSnapshot(people);
  renderBlockers(people);
  renderFollowups(people);
}

// ===== Wire up =====
(function init(){
  $("#standupDate").value = fmtDateISO(new Date());

  $("#btnAnalyze").addEventListener("click", ()=>{
    const raw = $("#notes").value;
    const date = $("#standupDate").value || fmtDateISO(new Date());
    const people = parseNotes(raw);
    display(people);
    const entry = { id: String(Date.now()), date, raw, people };
    history.unshift(entry); history = history.slice(0,50);
    saveHistory(history); renderHistory();
    showToast("✅ Analyzed");
  });

  $("#btnClear").addEventListener("click", ()=>{
    $("#notes").value = "";
    $("#snapshot").innerHTML = "";
    $("#blockers").innerHTML = "";
    $("#followups").innerHTML = "";
  });

  $("#btnExportMd").addEventListener("click", ()=>{
    const date = $("#standupDate").value || fmtDateISO(new Date());
    const people = parseNotes($("#notes").value);
    const md = toMarkdown(date, people);
    download(`standup-${date}.md`, md);
  });

  // CSV import
  const fileEl = $("#csvFile");
  const drop = $("#dropCsv");
  $("#btnImportCsv").addEventListener("click", async ()=>{
    if(!fileEl.files || !fileEl.files[0]){ alert("Choose a .csv file first."); return; }
    const text = await fileEl.files[0].text();
    const synth = importSlackCsvToNotes(text);
    if(synth){ $("#notes").value = synth; showToast("📥 CSV imported → ready to Analyze"); }
    else alert("Could not parse CSV.");
  });
  ;["dragenter","dragover"].forEach(ev=>{
    drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add("drag"); });
  });
  ;["dragleave","drop"].forEach(ev=>{
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

  renderHistory();
})();
