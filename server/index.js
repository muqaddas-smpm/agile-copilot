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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
