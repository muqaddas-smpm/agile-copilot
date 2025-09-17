const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync'); // CSV parser

const app = express();
// Use 3001 as default to avoid clashes
const PORT = process.env.PORT || 3001;

app.use(cors());

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure Multer to save to /uploads
const upload = multer({ dest: uploadsDir });

// Health check
app.get('/', (_req, res) => {
  res.send('✅ Agile Copilot Backend is running!');
});

/**
 * Upload + Analyze CSV
 * Expect: form-data with key "file"
 * Response: metrics + sample rows
 */
app.post('/upload-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    // Read CSV text
    const csvPath = req.file.path;
    const csvText = fs.readFileSync(csvPath, 'utf8');

    // Normalize CRLF -> LF for Windows CSVs
    const normalized = csvText.replace(/\r/g, '');

    // Parse CSV rows into objects using header columns
    const records = parse(normalized, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    // --- Compute Agile metrics ---

    const totalStories = records.length;

    const toLower = s => (s || '').toString().trim().toLowerCase();
    const isDone = r => toLower(r.status) === 'done';
    const isInProgress = r => toLower(r.status) === 'in progress';
    const isBlocked = r => toLower(r.status) === 'blocked';

    const completed = records.filter(isDone).length;
    const inProgress = records.filter(isInProgress).length;
    const blocked = records.filter(isBlocked).length;

    const toPoints = r => {
      const n = parseInt((r.story_points || '').toString().trim(), 10);
      return Number.isFinite(n) ? n : 0;
    };

    const totalPoints = records.reduce((sum, r) => sum + toPoints(r), 0);
    const completedPoints = records.filter(isDone).reduce((sum, r) => sum + toPoints(r), 0);

    // Workload per assignee
    const workload = {};
    for (const r of records) {
      const assignee = (r.assignee || 'Unassigned').toString().trim();
      workload[assignee] ??= { total: 0, open: 0, done: 0, pointsTotal: 0, pointsDone: 0 };
      workload[assignee].total += 1;
      workload[assignee].pointsTotal += toPoints(r);
      if (isDone(r)) {
        workload[assignee].done += 1;
        workload[assignee].pointsDone += toPoints(r);
      } else {
        workload[assignee].open += 1;
      }
    }

    // Labels tally (semi-colon or comma separated)
    const labelCounts = {};
    for (const r of records) {
      const raw = (r.labels || '').toString().trim();
      if (!raw) continue;
      const parts = raw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
      for (const tag of parts) {
        labelCounts[tag] = (labelCounts[tag] || 0) + 1;
      }
    }

    const metrics = {
      totalStories,
      completed,
      inProgress,
      blocked,
      totalPoints,
      completedPoints,
      velocity: `${completedPoints}/${totalPoints} SP`,
      workload,
      topLabels: Object.entries(labelCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count }))
    };

    return res.json({
      message: 'CSV analyzed successfully!',
      metrics,
      sample: records.slice(0, 5) // first few parsed rows
    });

  } catch (err) {
    console.error('Upload/analysis error:', err);
    return res.status(500).json({ error: 'Failed to process CSV.' });
  }
});
// ===== Day 8/9 — AI Standup Summarizer =====
app.post('/api/ai/standup', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(400).json({ error: 'Missing OPENAI_API_KEY in server environment.' });
    }

    const { notes = "", date = new Date().toISOString().slice(0,10) } = req.body || {};
    if (!notes || notes.trim().length < 10) {
      return res.status(400).json({ error: 'Please provide standup notes (min 10 chars).' });
    }

    // Keep prompts tight for lower cost and consistent structure
    const system = `You are an agile assistant. Parse free-form standup notes by multiple people.
Return a clean Markdown summary with sections:
1) Team Snapshot (Yesterday/Today/Blockers per person)
2) Blockers (severity 0-3) with brief reason
3) PM Follow-ups (actionable)
Be concise, bullet-style. Keep per-person sections short. Date: ${date}.`;

    const user = `Standup notes:\n${notes}`;

    // Use a light, inexpensive model
    const model = 'gpt-4o-mini';

    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 700, // cap output size
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    });

    const content = completion.choices?.[0]?.message?.content?.trim() || '';
    const usage = completion.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // Cost calc (gpt-4o-mini as of today)
    const INPUT_RATE = 0.60 / 1_000_000;   // $ per input token
    const OUTPUT_RATE = 2.40 / 1_000_000;  // $ per output token
    const input_cost  = usage.prompt_tokens    * INPUT_RATE;
    const output_cost = usage.completion_tokens * OUTPUT_RATE;
    const total_cost  = input_cost + output_cost;

    res.json({
      ok: true,
      model,
      date,
      md: content,
      usage,
      cost: {
        input_usd: +input_cost.toFixed(6),
        output_usd: +output_cost.toFixed(6),
        total_usd: +total_cost.toFixed(6)
      }
    });
  } catch (err) {
    console.error('AI summarize error:', err?.response?.data || err);
    res.status(500).json({ error: 'AI summarization failed. Check server logs.' });
  }
});


// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
