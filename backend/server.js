const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { db, logAudit } = require('./database');

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
    const { ethicsStatus, role } = req.body;
    const result = db.prepare('UPDATE studies SET ethicsStatus = ? WHERE id = ?').run(ethicsStatus, id);
    if (result.changes > 0) {
      logAudit(new Date().toISOString(), role || 'System', `Updated ethics status to ${ethicsStatus} for study ${id}`);
    }
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
    const { study, subject, event, severity, meddra, namaste, icd11tm2, api_ref, reported, status, role } = req.body;
    const result = db.prepare(
      `INSERT INTO ae_records (study, subject, event, severity, meddra, namaste, icd11tm2, api_ref, reported, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(study, subject, event, severity, meddra, namaste, icd11tm2, api_ref, reported, status);
    
    logAudit(new Date().toISOString(), role || 'System', `Logged ${severity} event (${event}) for ${subject} in ${study}`);
    
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

app.get('/api/audit/verify', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM audit_log ORDER BY id ASC').all();
    let expectedLastHash = "0000000000000000000000000000000000000000000000000000000000000000";
    let isValid = true;
    let brokenAtId = null;

    for (const row of rows) {
      if (row.previousHash !== expectedLastHash) {
        isValid = false;
        brokenAtId = row.id;
        break;
      }
      const content = JSON.stringify({ t: row.t, role: row.role, action: row.action });
      const computedHash = crypto.createHash('sha256').update(row.previousHash + content).digest('hex');
      if (computedHash !== row.currentHash) {
        isValid = false;
        brokenAtId = row.id;
        break;
      }
      expectedLastHash = row.currentHash;
    }

    res.json({ valid: isValid, brokenAtId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Hidden endpoint for demo purposes to corrupt the database
app.post('/api/audit/corrupt', (req, res) => {
  try {
    // Pick the last record and change its action without updating the hash
    const lastRow = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 1').get();
    if (lastRow) {
      db.prepare('UPDATE audit_log SET action = ? WHERE id = ?').run(lastRow.action + ' (TAMPERED)', lastRow.id);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
