const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');
const crypto = require('crypto');

db.pragma('journal_mode = WAL');

// Drop tables for a clean slate to add new columns (demo environment)
db.exec(`
  DROP TABLE IF EXISTS studies;
  DROP TABLE IF EXISTS ae_records;
  DROP TABLE IF EXISTS audit_log;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS studies (
    id TEXT PRIMARY KEY,
    title TEXT,
    site TEXT,
    ctri TEXT,
    ctriStatus TEXT,
    ethicsStatus TEXT,
    ethicsRenewal TEXT,
    target INTEGER,
    enrolled INTEGER,
    deviations INTEGER,
    lastVisit TEXT,
    nextVisit TEXT
  );

  CREATE TABLE IF NOT EXISTS ae_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    study TEXT,
    subject TEXT,
    event TEXT,
    severity TEXT,
    meddra TEXT,
    namaste TEXT,
    icd11tm2 TEXT,
    api_ref TEXT,
    reported TEXT,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    t TEXT,
    role TEXT,
    action TEXT,
    previousHash TEXT,
    currentHash TEXT
  );
`);

// Seed studies
const insertStudy = db.prepare(
  `INSERT INTO studies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const seedStudies = [
  ["AIIA-CT-01", "Ashwagandha extract in generalized anxiety", "AIIA, New Delhi", "CTRI/2025/03/061234", "Registered", "Approved", "2026-10-14", 180, 132, 2, "2026-08-20", "2026-09-27"],
  ["AIIA-CT-02", "Guggulu formulation in dyslipidaemia (multi-centre)", "AIIA + 3 sites", "CTRI/2024/11/059870", "Amendment pending", "Approved", "2026-09-30", 300, 171, 5, "2026-07-30", "2026-09-24"]
];
for (const row of seedStudies) insertStudy.run(row);

// Seed Audit Log with Hash Chain
const insertAudit = db.prepare(
  'INSERT INTO audit_log (t, role, action, previousHash, currentHash) VALUES (?, ?, ?, ?, ?)'
);

let lastHash = "0000000000000000000000000000000000000000000000000000000000000000"; // Genesis hash

const logAudit = (t, role, action) => {
  const content = JSON.stringify({ t, role, action });
  const currentHash = crypto.createHash('sha256').update(lastHash + content).digest('hex');
  insertAudit.run(t, role, action, lastHash, currentHash);
  lastHash = currentHash;
};

logAudit("2026-09-24T08:00", "System", "System initialized and genesis block created.");
logAudit("2026-09-24T08:15", "Principal Investigator", "Created study AIIA-CT-01.");

// Seed AE records
const insertAE = db.prepare(
  `INSERT INTO ae_records (study, subject, event, severity, meddra, namaste, icd11tm2, api_ref, reported, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);

// We will use an ISO date for yesterday to simulate an SAE countdown
const yesterday = new Date();
yesterday.setHours(yesterday.getHours() - 10); // 10 hours ago

insertAE.run("AIIA-CT-02", "S-0142", "Elevated liver enzymes", "SAE", "10024690", "NM-234", "TM2-45A", "API-VOL2-110", yesterday.toISOString(), "Open");

module.exports = { db, logAudit };
