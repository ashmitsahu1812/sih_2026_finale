const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// STUDIES
app.get('/api/studies', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM studies').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/studies/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { ethicsStatus } = req.body;
    const result = db.prepare('UPDATE studies SET ethicsStatus = ? WHERE id = ?').run(ethicsStatus, id);
    res.json({ updated: result.changes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AE RECORDS
app.get('/api/ae', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM ae_records ORDER BY reported DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ae', (req, res) => {
  try {
    const { study, subject, event, severity, meddra, reported, hours, status } = req.body;
    const result = db.prepare(
      `INSERT INTO ae_records (study, subject, event, severity, meddra, reported, hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(study, subject, event, severity, meddra, reported, hours, status);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AUDIT LOG
app.get('/api/audit', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/audit', (req, res) => {
  try {
    const { t, role, action } = req.body;
    const result = db.prepare('INSERT INTO audit_log (t, role, action) VALUES (?, ?, ?)').run(t, role, action);
    res.json({ id: result.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
