const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so frontend (client/index.html) can talk to backend
app.use(cors());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure Multer for file uploads to /uploads
const upload = multer({ dest: uploadsDir });

// Health check route
app.get('/', (_req, res) => {
  res.send('✅ Agile Copilot Backend is running!');
});

// CSV upload endpoint
app.post('/upload-csv', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Read uploaded CSV
    const csvPath = req.file.path;
    const csvData = fs.readFileSync(csvPath, 'utf8');

    // Return first 5 lines as preview
    const lines = csvData.split('\n').slice(0, 5);

    return res.json({
      message: 'CSV uploaded successfully!',
      originalName: req.file.originalname,
      storedAs: path.basename(csvPath),
      preview: lines
    });
  } catch (err) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: 'Failed to process CSV.' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
