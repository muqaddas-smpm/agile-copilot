'use strict';

// ===== Imports & Config =====
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { parse } = require('csv-parse/sync');
require('dotenv').config();

const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const PORT = process.env.PORT || 3003;

// Interpret SAFE_MODE robustly: only these count as "true"
const isTruthy = (v) => ['1','true','yes','on'].includes(String(v || '').trim().toLowerCase());
const SAFE_MODE = isTruthy(process.env.SAFE_MODE);

// Use OpenAI only when key exists AND not in safe mode
const useOpenAI = () => !!process.env.OPENAI_API_KEY && !SAFE_MODE;

// ===== Middleware =====
app.use(cors());
app.use(express.json({ limit: '2mb' }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB
});

// ===== Helpers =====
const normKey = (s) => String(s || '').replace(/^\uFEFF/, '').trim().toLowerCase();
const pick = (obj, key) => {
  const want = normKey(key);
  const entry = Object.entries(obj || {}).find(([k]) => normKey(k) === want);
  return entry ? (entry[1] ?? '') : '';
};


// ===== Offline Summaries =====
function offlineStandupSummary(rows, notes = '') {
  const blockedRegex = /(block|stuck|issue|risk|error|bug|waiting|dependency|cannot|can't|delayed|delay)/i;
  const y = [], t = [], b = [];
  rows.forEach(r => {
    const who = pick(r, 'name') || pick(r, 'member') || pick(r, 'person') || 'Someone';
    const yy = (pick(r, 'yesterday') || pick(r, 'done') || '').trim();
    const tt = (pick(r, 'today') || pick(r, 'doing') || '').trim();
    const bb = (pick(r, 'blockers') || pick(r, 'risks') || pick(r, 'issues') || '').trim();
    if (yy) y.push(`- **${who}**: ${yy}`);
    if (tt) t.push(`- **${who}**: ${tt}`);
    if (bb && blockedRegex.test(bb)) b.push(`- **${who}**: ${bb}`);
  });
  const risks = b.length
    ? `- Potential schedule risk due to blockers on ${b.length} member(s).`
    : `- No explicit blockers detected.`;
  const actions = b.length
    ? `- Triage blockers 1:1 and create Jira tickets as needed.\n- Escalate external dependencies.`
    : `- Proceed as planned; validate dependencies; keep scope tight.`;
  const extra = notes?.trim() ? `\n> **Notes:** ${notes.trim()}\n` : '';
  return [
    `## Standup Summary (Offline)`,
    extra,
    `### Yesterday Highlights`, y.length ? y.join('\n') : '- (none provided)',
    `\n### Today Focus`, t.length ? t.join('\n') : '- (none provided)',
    `\n### Blockers`, b.length ? b.join('\n') : '- (none reported)',
    `\n### Risks`, risks,
    `\n### Action Items`, actions
  ].join('\n');
}

function offlineRetroSummary(rows, notes = '') {
  const good = [], bad = [], ideas = [], actions = [];
  rows.forEach(r => {
    const who = pick(r, 'who') || pick(r, 'name') || 'Someone';
    const gw = pick(r, 'went_well') || pick(r, 'wentwell') || pick(r, 'good') || pick(r, 'kudos');
    const bw = pick(r, 'didnt_go_well') || pick(r, 'not_well') || pick(r, 'bad') || pick(r, 'improve');
    const id = pick(r, 'ideas') || pick(r, 'experiments');
    const ac = pick(r, 'action') || pick(r, 'action_items') || pick(r, 'next_steps');
    if (gw?.trim()) good.push(`- **${who}**: ${gw.trim()}`);
    if (bw?.trim()) bad.push(`- **${who}**: ${bw.trim()}`);
    if (id?.trim()) ideas.push(`- **${who}**: ${id.trim()}`);
    if (ac?.trim()) actions.push(`- **${who}**: ${ac.trim()}`);
  });
  const themes = [];
  if (bad.length && /test|qa|flake|bug/i.test(bad.join(' '))) themes.push('- Stabilize tests/QA before next sprint.');
  if (bad.length && /handoff|dependency|waiting|blocked/i.test(bad.join(' '))) themes.push('- Improve cross-team handoffs & dependency planning.');
  if (!themes.length) themes.push('- Maintain wins and keep cycle time low.');
  const extra = notes?.trim() ? `\n> **Notes:** ${notes.trim()}\n` : '';
  return [
    `## Sprint Retrospective (Offline)`,
    extra,
    `### What went well`, good.length ? good.join('\n') : '- (none captured)',
    `\n### What didn’t go well`, bad.length ? bad.join('\n') : '- (none captured)',
    `\n### Ideas / Experiments`, ideas.length ? ideas.join('\n') : '- (none proposed)',
    `\n### Action Items`, actions.length ? actions.join('\n') : '- (none yet)',
    `\n### Themes / Recommendations`, themes.join('\n')
  ].join('\n');
}

// ===== Parse rows from CSV or JSON =====
function readRowsFromReq(req) {
  let rows = [];
  if (req.file) {
    const text = req.file.buffer.toString('utf8');
    rows = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  } else if (req.body.rowsJson !== undefined) {
    const val = req.body.rowsJson;
    if (Array.isArray(val)) {
      rows = val; // e.g. when sent as application/json body
    } else if (typeof val === 'string') {
      const parsed = JSON.parse(val); // sent as multipart text field
      if (!Array.isArray(parsed)) throw new Error('rowsJson must be an array');
      rows = parsed;
    } else {
      throw new Error('rowsJson must be an array, or a JSON string of an array');
    }
  }
  return rows;
}

// ===== Diagnostics =====
app.get('/diag', (req, res) => {
  res.json({
    port: Number(PORT),
    hasKey: !!process.env.OPENAI_API_KEY,
    safeMode: SAFE_MODE,
    modelDefault: process.env.MODEL || 'gpt-4o-mini',
    mode: useOpenAI() ? 'openai' : 'offline'
  });
});

app.post('/diag/test', async (req, res) => {
  if (!useOpenAI()) {
    return res.status(401).json({ ok:false, code:401, detail:'No API key or SAFE_MODE is enabled.' });
  }
  try {
    const it = await openai.models.list();
    const first = it?.data?.[0]?.id || 'ok';
    return res.json({ ok:true, detail:`Key accepted. Example model: ${first}` });
  } catch (err) {
    return res.status(401).json({ ok:false, code:401, detail:String(err?.message || err) });
  }
});

// ===== Standup Endpoint =====
app.post('/api/standup/summarize', upload.single('csv'), async (req, res) => {
  try {
    const notes = req.body.notes || '';
    const rows = readRowsFromReq(req);
    if (!rows.length) return res.status(400).json({ ok:false, error:'No rows (upload CSV or provide rowsJson).' });

    if (useOpenAI()) {
      try {
        const sys = `You are a senior Scrum Master. Return concise markdown sections: Yesterday Highlights, Today Focus, Blockers, Risks, Action Items.`;
        const usr = `Standup rows (JSON): ${JSON.stringify(rows)}\nNotes: ${notes}`;
        const resp = await openai.chat.completions.create({
          model: process.env.MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [{ role:'system', content:sys }, { role:'user', content:usr }]
        });
        return res.json({ ok:true, mode:'openai', summary: resp?.choices?.[0]?.message?.content || '' });
      } catch (e) {
        console.warn('OpenAI failed, falling back to offline:', e?.message || e);
        return res.json({ ok:true, mode:'offline', summary: offlineStandupSummary(rows, notes) });
      }
    }

    // Pure offline
    return res.json({ ok:true, mode:'offline', summary: offlineStandupSummary(rows, notes) });
  } catch (e) {
    return res.status(500).json({ ok:false, error:'Failed to summarize', detail:String(e?.message||e) });
  }
});

// ===== Retrospective Endpoint =====
app.post('/api/retro/generate', upload.single('csv'), async (req, res) => {
  try {
    const notes = req.body.notes || '';
    const rows = readRowsFromReq(req);
    if (!rows.length) return res.status(400).json({ ok:false, error:'No rows (upload CSV or provide rowsJson).' });

    if (useOpenAI()) {
      try {
        const sys = `You are a seasoned Agile coach. Produce a sprint retrospective in markdown with sections: What went well, What didn’t go well, Ideas/Experiments, Action Items, Themes/Recommendations. Keep it actionable.`;
        const usr = `Retro inputs (JSON): ${JSON.stringify(rows)}\nNotes: ${notes}`;
        const resp = await openai.chat.completions.create({
          model: process.env.MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          messages: [{ role:'system', content:sys }, { role:'user', content:usr }]
        });
        return res.json({ ok:true, mode:'openai', summary: resp?.choices?.[0]?.message?.content || '' });
      } catch (e) {
        console.warn('OpenAI failed, falling back to offline:', e?.message || e);
        return res.json({ ok:true, mode:'offline', summary: offlineRetroSummary(rows, notes) });
      }
    }

    // Pure offline
    return res.json({ ok:true, mode:'offline', summary: offlineRetroSummary(rows, notes) });
  } catch (e) {
    return res.status(500).json({ ok:false, error:'Failed to generate retro', detail:String(e?.message||e) });
  }
});

// ===== Static files & Start =====
app.use(express.static(path.join(__dirname, '..', 'client')));
app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
