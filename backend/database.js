const Database = require('better-sqlite3');
const db = new Database('./database.sqlite');

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
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
    reported TEXT,
    hours INTEGER,
    status TEXT
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    t TEXT,
    role TEXT,
    action TEXT
  );
`);

// Seed studies if empty
const studyCount = db.prepare('SELECT COUNT(*) AS count FROM studies').get();
if (studyCount.count === 0) {
  const insertStudy = db.prepare(
    `INSERT INTO studies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const seedStudies = [
    ["AIIA-CT-01", "Ashwagandha extract in generalized anxiety", "AIIA, New Delhi", "CTRI/2025/03/061234", "Registered", "Approved", "2026-10-14", 180, 132, 2, "2026-08-20", "2026-09-27"],
    ["AIIA-CT-02", "Guggulu formulation in dyslipidaemia (multi-centre)", "AIIA + 3 sites", "CTRI/2024/11/059870", "Amendment pending", "Approved", "2026-09-30", 300, 171, 5, "2026-07-30", "2026-09-24"],
    ["AIIA-CT-03", "Panchakarma protocol in chronic low back pain", "AIIA, New Delhi", "CTRI/2026/01/062210", "Registered", "Renewal due", "2026-10-05", 120, 44, 1, "2026-09-01", "2026-10-15"],
    ["AIIA-CT-04", "Observational study — Rasayana in post-COVID fatigue", "AIIA, New Delhi", "Not yet submitted", "Pre-registration", "Under review", "—", 250, 0, 0, "—", "—"],
    ["AIIA-CT-05", "Triphala in metabolic syndrome (pilot)", "AIIA, New Delhi", "CTRI/2025/06/063441", "Registered", "Approved", "2027-02-11", 60, 58, 0, "2026-09-10", "2026-10-10"]
  ];
  const insertMany = db.transaction((rows) => {
    for (const row of rows) insertStudy.run(row);
  });
  insertMany(seedStudies);
}

// Seed AE records if empty
const aeCount = db.prepare('SELECT COUNT(*) AS count FROM ae_records').get();
if (aeCount.count === 0) {
  const insertAE = db.prepare(
    `INSERT INTO ae_records (study, subject, event, severity, meddra, reported, hours, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  insertAE.run("AIIA-CT-02", "S-0142", "Elevated liver enzymes", "SAE", "10024690", "2026-09-20T09:10", 24, "Open");
  insertAE.run("AIIA-CT-01", "S-0033", "Mild headache", "AE", "10019211", "2026-09-18T14:00", 168, "Closed");
}

module.exports = db;
