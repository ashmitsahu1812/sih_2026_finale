const express = require('express');
const cors = require('cors');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// STUDIES
app.get('/api/studies', (req, res) => {
  db.all("SELECT * FROM studies", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.put('/api/studies/:id', (req, res) => {
  const { id } = req.params;
  const { ethicsStatus } = req.body;
  db.run("UPDATE studies SET ethicsStatus = ? WHERE id = ?", [ethicsStatus, id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ updated: this.changes });
  });
});

// AE RECORDS
app.get('/api/ae', (req, res) => {
  db.all("SELECT * FROM ae_records ORDER BY reported DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/ae', (req, res) => {
  const { study, subject, event, severity, meddra, reported, hours, status } = req.body;
  db.run(`INSERT INTO ae_records (study, subject, event, severity, meddra, reported, hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, 
    [study, subject, event, severity, meddra, reported, hours, status], 
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    });
});

// AUDIT LOG
app.get('/api/audit', (req, res) => {
  db.all("SELECT * FROM audit_log ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/audit', (req, res) => {
  const { t, role, action } = req.body;
  db.run(`INSERT INTO audit_log (t, role, action) VALUES (?, ?, ?)`, [t, role, action], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
