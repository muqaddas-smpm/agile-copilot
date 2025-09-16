// ---------- State ----------
let history = loadHistory(); // [{ id, filename, uploadedAt, metrics, reports }]
let current = null;

// ---------- Helpers ----------
function $(sel) { return document.querySelector(sel); }
function fmtDate(d) { const dt = (d instanceof Date) ? d : new Date(d); return dt.toLocaleString(); }
function download(filename, text) { const blob = new Blob([text], { type: "text/plain;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
function loadHistory() { try { return JSON.parse(localStorage.getItem("agc_history") || "[]"); } catch { return []; } }
function saveHistory() { localStorage.setItem("agc_history", JSON.stringify(history)); }
function clearAllUI() { $("#fileName").textContent = "—"; $("#uploadedAt").textContent = "—"; $("#execSummary").textContent = "(no report yet)"; $("#observations").textContent = "(no report yet)"; $("#metricsList").innerHTML = ""; $("#nextActions").innerHTML = ""; current = null; }

// ---------- Tabs ----------
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".tabpanel").forEach(p => p.classList.remove("active"));
    $("#tab-" + tab).classList.add("active");
  });
});

// ---------- CSV parsing with offline fallback ----------
function parseCsvText(text) {
  // Very simple fallback (no quoted commas). Good for basic CSVs.
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const headers = lines.shift().split(",").map(h => h.trim());
  return lines.map(line => {
    const cells = line.split(","); // naive split
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cells[i] ?? "").trim());
    return obj;
  });
}
function parseCsvFile(file, onDone, onError) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = reader.result || "";
    if (window.Papa) {
      Papa.parse(text, {
        header: true, skipEmptyLines: true,
        complete: res => onDone(res.data || []),
        error: err => onError(err || new Error("Papa parse error"))
      });
    } else {
      try { onDone(parseCsvText(text)); }
      catch (e) { onError(e); }
    }
  };
  reader.onerror = () => onError(reader.error || new Error("File read error"));
  reader.readAsText(file);
}

// ---------- Main handler ----------
function handleFile(file) {
  $("#fileName").textContent = file.name;
  const uploadedAt = new Date();
  $("#uploadedAt").textContent = fmtDate(uploadedAt);

  parseCsvFile(file, (data) => {
    const metrics = computeMetrics(data);
    const reports = buildReports(metrics, file.name);
    renderReports(metrics, reports);

    const entry = {
      id: (crypto?.randomUUID?.() || String(Date.now())),
      filename: file.name,
      uploadedAt: uploadedAt.toISOString(),
      metrics, reports
    };
    current = entry;
    history.unshift(entry);
    history = history.slice(0, 20);
    saveHistory();
    renderHistory();
  }, (err) => {
    alert("Failed to parse CSV: " + (err?.message || err));
  });
}

// ---------- Triggers (auto, plus optional button if present) ----------
$("#fileInput").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleFile(file);
});
const btnGen = $("#btnGenerate");
if (btnGen) {
  btnGen.addEventListener("click", () => {
    const file = $("#fileInput").files?.[0];
    if (!file) { alert("Pick a CSV first."); return; }
    handleFile(file);
  });
}

// ---------- Metrics & Reports ----------
function computeMetrics(rows) {
  const count = rows.length;
  const columns = count ? Object.keys(rows[0]) : [];

  // Map headers to lowercase for flexible detection
  const lowerMap = {};
  columns.forEach(k => lowerMap[k.toLowerCase()] = k);

  // Best-effort header guesses
  const findKey = (needle) => {
    if (lowerMap[needle]) return lowerMap[needle];
    const k = Object.keys(lowerMap).find(x => x.includes(needle));
    return k ? lowerMap[k] : null;
  };
  const statusKey = findKey("status");
  const pointsKey = findKey("points") || findKey("point");

  // Counts & sums
  let emptyCells = 0;
  let totalPoints = 0;
  let completedPoints = 0;
  const statusCounts = {};

  rows.forEach(r => {
    columns.forEach(c => { if (!String(r[c] ?? "").trim()) emptyCells++; });

    // points
    if (pointsKey) {
      const n = Number(String(r[pointsKey]).replace(/[^\d.-]/g, "")) || 0;
      totalPoints += n;
      // completed if status looks like "done"/"complete"
      if (statusKey) {
        const s = String(r[statusKey] || "").toLowerCase();
        if (/(done|complete|closed)/.test(s)) completedPoints += n;
      }
    }

    // status counts
    if (statusKey) {
      const s = String(r[statusKey] || "Unknown").trim();
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
  });

  return {
    rows: count,
    columns: columns.length,
    emptyCells,
    columnsList: columns,
    statusKey, pointsKey,
    totalPoints, completedPoints,
    statusCounts
  };
}

function buildReports(metrics, filename) {
  const execSummary = `Processed "${filename}" with ${metrics.rows} rows and ${metrics.columns} columns. Detected ${metrics.emptyCells} empty cell(s).`;
  const observations = metrics.emptyCells > 0 ? "Some data is incomplete. Consider cleaning missing values for reliable metrics." : "Data looks complete. You can proceed with planning and reporting.";
  const nextActions = [
    "Confirm CSV headers match your expected schema.",
    "Fill missing values (e.g., assignee, status) and re-upload.",
    "Regenerate stakeholder update after cleanup."
  ];
  return { execSummary, observations, nextActions };
}

function renderReports(metrics, reports) {
  $("#execSummary").textContent = reports.execSummary;
  $("#observations").textContent = reports.observations;

  const m = $("#metricsList");
  m.innerHTML = "";
  const add = (k, v) => { const li = document.createElement("li"); li.textContent = `${k}: ${v}`; m.appendChild(li); };
  add("Rows", metrics.rows);
  add("Columns", metrics.columns);
  add("Empty Cells", metrics.emptyCells);
  if (metrics.columnsList?.length) add("Headers", metrics.columnsList.join(", "));

  const na = $("#nextActions");
  na.innerHTML = "";
  for (const item of (reports.nextActions || [])) {
    const li = document.createElement("li");
    li.textContent = item;
    na.appendChild(li);
  }

  // draw charts after rendering cards
  drawCharts(metrics);
}

// ---------- Charts ----------
let _velocityChart, _statusChart;

function drawCharts(metrics) {
  // Skip if Chart.js not loaded
  if (typeof Chart === "undefined") return;

  // Clean old charts if any
  if (_velocityChart) { _velocityChart.destroy(); _velocityChart = null; }
  if (_statusChart)  { _statusChart.destroy();  _statusChart  = null; }

  // Velocity (Completed vs Remaining points)
  const remaining = Math.max(0, (metrics.totalPoints || 0) - (metrics.completedPoints || 0));
  const vctx = document.getElementById("velocityChart");
  if (vctx) {
    _velocityChart = new Chart(vctx, {
      type: "doughnut",
      data: {
        labels: ["Completed", "Remaining"],
        datasets: [{ data: [metrics.completedPoints || 0, remaining] }]
      },
      options: { plugins: { legend: { position: "bottom" } } }
    });
    const hint = document.getElementById("velocityHint");
    if (hint) {
      if (!metrics.pointsKey) {
        hint.textContent = "No points column found. Add a 'Points' column to enable velocity.";
      } else {
        hint.textContent = `Completed ${metrics.completedPoints || 0} / ${metrics.totalPoints || 0} points`;
      }
    }
  }

  // Points by Status (story counts)
  const sctx = document.getElementById("statusChart");
  if (sctx && metrics.statusCounts && Object.keys(metrics.statusCounts).length) {
    const labels = Object.keys(metrics.statusCounts);
    const data = labels.map(k => metrics.statusCounts[k]);
    _statusChart = new Chart(sctx, {
      type: "bar",
      data: { labels, datasets: [{ label: "Stories", data }] },
      options: {
        plugins: { legend: { display: false } },
        scales: { x: { ticks: { autoSkip: false } }, y: { beginAtZero: true, precision: 0 } }
      }
    });
  }
}

// ---------- History ----------
function renderHistory() {
  const tbody = $("#historyTableBody");
  tbody.innerHTML = "";
  history.forEach((h, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td>${h.filename}</td>
      <td>${fmtDate(h.uploadedAt)}</td>
      <td>${h.metrics?.rows ?? "—"}</td>
      <td>
        <button data-action="view" data-id="${h.id}" class="btn">View</button>
        <button data-action="remove" data-id="${h.id}" class="btn secondary">Remove</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("button").forEach(btn => {
    const id = btn.dataset.id;
    const action = btn.dataset.action;
    btn.addEventListener("click", () => {
      if (action === "view") {
        const entry = history.find(x => x.id === id);
        if (!entry) return;
        $("#fileName").textContent = entry.filename;
        $("#uploadedAt").textContent = fmtDate(entry.uploadedAt);
        current = entry;
        renderReports(entry.metrics, entry.reports);
        document.querySelector('[data-tab="reports"]').click();
      }
      if (action === "remove") {
        history = history.filter(x => x.id !== id);
        saveHistory(); renderHistory();
      }
    });
  });
}

// ---------- Clear & Export ----------
$("#btnClearAll").addEventListener("click", () => {
  if (!confirm("Clear current view and history? (This only affects your browser storage)")) return;
  localStorage.removeItem("agc_history");
  history = [];
  clearAllUI();
  renderHistory();
});

$("#btnExportMd").addEventListener("click", () => {
  if (!current) { alert("No current report to export. Upload a CSV first or View one from History."); return; }
  const { filename, uploadedAt, metrics, reports } = current;
  const md =
`# Sprint Report (Safe Mode)

**File:** ${filename}  
**Uploaded:** ${fmtDate(uploadedAt)}

## Executive Summary
${reports.execSummary}

## Metrics
- Rows: ${metrics.rows}
- Columns: ${metrics.columns}
- Empty Cells: ${metrics.emptyCells}
${metrics.columnsList?.length ? "- Headers: " + metrics.columnsList.join(", ") : ""}

## Observations
${reports.observations}

## Recommended Next Actions
${(reports.nextActions || []).map(x => `- ${x}`).join("\n")}
`;
  download(`report-${Date.now()}.md`, md);
});

// ---------- First render ----------
renderHistory();
clearAllUI();
