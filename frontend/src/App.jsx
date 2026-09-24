import { useState, useEffect } from 'react';
import './index.css';
import Analytics from './Analytics';

const ROLE_PERMS = {
  "Principal Investigator": {edit:false, addAE:false, allowedTabs: ['portfolio', 'analytics', 'pv', 'audit'], defaultTab: 'portfolio', note:"Study Oversight: Focus on trial health, enrollment vs target, open queries, and SAE overview."},
  "Study Coordinator": {edit:false, addAE:false, allowedTabs: ['portfolio'], defaultTab: 'portfolio', note:"Daily Operations: Focus on participant screening, data entry, and upcoming scheduled visits."},
  "Monitor": {edit:false, addAE:false, allowedTabs: ['portfolio', 'audit'], defaultTab: 'portfolio', note:"Site Monitoring: Focus on site activation, protocol deviations, data-quality, and overdue visits."},
  "Ethics Committee": {edit:true, addAE:false, allowedTabs: ['regulatory', 'pv'], defaultTab: 'regulatory', note:"Safety & Ethics Oversight: Focus on approvals, renewals, and SAE safety signals."},
  "Pharmacovigilance Staff": {edit:false, addAE:true, allowedTabs: ['pv', 'audit'], defaultTab: 'pv', note:"Safety Intelligence: Focus on NPvCC logging, dual-coding (NAMASTE/MedDRA), and regulatory clocks."},
  "Admin": {edit:true, addAE:true, allowedTabs: ['portfolio', 'analytics', 'regulatory', 'pv', 'audit'], defaultTab: 'portfolio', note:"Portfolio Command Center: Full cross-trial analytics, exception alerts, and user management."},
  "Regulator (read-only)": {edit:false, addAE:false, allowedTabs: ['portfolio', 'analytics', 'regulatory', 'pv', 'audit'], defaultTab: 'portfolio', note:"Regulatory Oversight: Immutable, read-only view of authorized study milestones and safety data."}
};

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function App() {
  const [role, setRole] = useState('Principal Investigator');
  const [tab, setTab] = useState('portfolio');
  const [studies, setStudies] = useState([]);
  const [aeRecords, setAeRecords] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [auditStatus, setAuditStatus] = useState(null); // null, 'checking', 'valid', 'invalid'

  const loadData = async () => {
    try {
      const [stRes, aeRes, auRes] = await Promise.all([
        fetch(`${API_URL}/studies`),
        fetch(`${API_URL}/ae`),
        fetch(`${API_URL}/audit`)
      ]);
      setStudies(await stRes.json());
      setAeRecords(await aeRes.json());
      setAuditLog(await auRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { loadData(); }, []);

  const logAudit = async (action) => {
    // Audit is now handled on the server side for ethics updates and AE logging
    // But we still load data after
    loadData();
  };

  const updateEthicsStatus = async (id, oldStatus, newStatus) => {
    await fetch(`${API_URL}/studies/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ethicsStatus: newStatus, role })
    });
    loadData();
  };

  const verifyAuditLog = async () => {
    setAuditStatus('checking');
    try {
      const res = await fetch(`${API_URL}/audit/verify`);
      const data = await res.json();
      setAuditStatus(data.valid ? 'valid' : 'invalid');
    } catch (e) {
      setAuditStatus('error');
    }
  };

  const corruptAuditLog = async () => {
    await fetch(`${API_URL}/audit/corrupt`, { method: 'POST' });
    loadData();
    setAuditStatus(null);
  };

  // Helper for real-time countdown (use current time instead of static date)
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000); // update every 10s
    return () => clearInterval(timer);
  }, []);

  const daysUntil = (dateStr) => {
    if(dateStr==="—") return null;
    return Math.round((new Date(dateStr) - now) / 86400000);
  };

  const active = studies.filter(s=>s.ctriStatus!=="Pre-registration").length;
  const totalTarget = studies.reduce((a,s)=>a+s.target,0);
  const totalEnrolled = studies.reduce((a,s)=>a+s.enrolled,0);
  const renewalsDue = studies.filter(s=>{const d=daysUntil(s.ethicsRenewal); return d!==null && d<=30;}).length;
  const overdueVisits = studies.filter(s=>{const d=daysUntil(s.nextVisit); return d!==null && d<0;}).length;
  const openAE = aeRecords.filter(r=>r.status==="Open").length;

  const tagFor = (status) => {
    const okWords=["Registered","Approved","Closed"], warnWords=["Amendment pending","Renewal due","Under review","Pre-registration"];
    if(okWords.includes(status)) return <span className="tag green">{status}</span>;
    if(warnWords.includes(status)) return <span className="tag amber">{status}</span>;
    return <span className="tag red">{status}</span>;
  };

  // Alerts logic
  let alerts = [];
  studies.forEach(s=>{
    const dRen = daysUntil(s.ethicsRenewal);
    if(dRen!==null && dRen<=30) alerts.push({sev:dRen<0?"red":"amber", text:`${s.id} — ethics renewal ${dRen<0?`overdue by ${-dRen}d`:`due in ${dRen}d`} (${s.ethicsRenewal})`});
    const dVis = daysUntil(s.nextVisit);
    if(dVis!==null && dVis<0) alerts.push({sev:"red", text:`${s.id} — monitoring visit overdue by ${-dVis} day(s)`});
    if(s.target>0 && s.enrolled/s.target < 0.4 && s.ctriStatus==="Registered") alerts.push({sev:"amber", text:`${s.id} — enrolment lag: ${s.enrolled}/${s.target} (${Math.round(100*s.enrolled/s.target)}%)`});
  });
  
  aeRecords.forEach(r=>{
    if(r.status==="Open"){
      const reportedAt = new Date(r.reported);
      const deadline = new Date(reportedAt.getTime() + (r.severity === "SAE" ? 24 : 168) * 3600000);
      const hoursLeft = (deadline - now) / 3600000;
      
      if(hoursLeft<0) alerts.push({sev:"red", text:`${r.study} — ${r.severity} "${r.event}" past reporting deadline`});
      else if(hoursLeft<24) alerts.push({sev:"amber", text:`${r.study} — ${r.severity} "${r.event}" reporting due in ${Math.round(hoursLeft)}h`});
    }
  });
  if(!alerts.length) alerts.push({sev:"amber", text:"No active alerts."});

  const handleAEForm = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const study = fd.get('study'), subj = fd.get('subject')||"S-0000", ev = fd.get('event')||"Unspecified event", sev = fd.get('severity');
    const meddra = fd.get('meddra')||"—";
    const namaste = fd.get('namaste')||"—";
    const icd11tm2 = fd.get('icd11tm2')||"—";
    const api_ref = fd.get('api_ref')||"—";
    
    const reported = now.toISOString(); // Use actual current time
    
    await fetch(`${API_URL}/ae`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ study, subject:subj, event:ev, severity:sev, meddra, namaste, icd11tm2, api_ref, reported, status:"Open", role })
    });
    loadData();
    e.target.reset(); // clear form
  };

  const perms = ROLE_PERMS[role];

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo-icon">P</div>
          <div className="brand-text">
            <h1>PRAMANA</h1>
            <span className="mark">AIIA CTMS · SIH 2026 CONCEPT DEMO</span>
          </div>
        </div>
        
        <nav className="nav">
          {perms.allowedTabs.includes('portfolio') && <button className={tab==='portfolio'?'active':''} onClick={()=>setTab('portfolio')}>Portfolio &amp; KPIs</button>}
          {perms.allowedTabs.includes('analytics') && <button className={tab==='analytics'?'active':''} onClick={()=>setTab('analytics')}>Analytics</button>}
          {perms.allowedTabs.includes('regulatory') && <button className={tab==='regulatory'?'active':''} onClick={()=>setTab('regulatory')}>Regulatory &amp; Ethics</button>}
          {perms.allowedTabs.includes('pv') && <button className={tab==='pv'?'active':''} onClick={()=>setTab('pv')}>Pharmacovigilance</button>}
          {perms.allowedTabs.includes('audit') && <button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}>Audit Trail</button>}
        </nav>

        <div className="topbar-right">
          <span className="synthetic-badge">ALL DATA SYNTHETIC — NOT REAL TRIALS</span>
        </div>
      </header>

      <div className="subheader">
        <div className="role-block">
          <label>ROLE IN SESSION:</label>
          <select value={role} onChange={e => { 
            const newRole = e.target.value;
            setRole(newRole);
            setTab(ROLE_PERMS[newRole].defaultTab);
          }}>
            {Object.keys(ROLE_PERMS).map(r => <option key={r}>{r}</option>)}
          </select>
          <span className="perm-note">{perms.note}</span>
        </div>
        
        <div className="subheader-actions">
           {tab === 'audit' && <button onClick={verifyAuditLog} className="cta">Verify Integrity</button>}
        </div>
      </div>

      <main>
        {perms.allowedTabs.includes('portfolio') && (
        <section className={`section ${tab==='portfolio'?'active':''}`}>
          <div className="pagehead">
            <div><h2>Portfolio &amp; KPI Layer</h2><p>Stage 1 MVP — real-time view replacing spreadsheet tracking</p></div>
          </div>
          <div className="kpis">
            <div className="kpi"><div className="lbl">SITES ACTIVE</div><div className="num" style={{color: 'var(--text)'}}>{active} / {studies.length}</div><div className="kpi-sub">studies running</div></div>
            <div className="kpi"><div className="lbl">ENROLMENT</div><div className="num" style={{color: 'var(--green)'}}>{totalEnrolled} / {totalTarget}</div><div className="kpi-sub">{Math.round(totalEnrolled/totalTarget*100)}% of target</div></div>
            <div className={`kpi ${renewalsDue?'warn':'ok'}`}><div className="lbl">RENEWALS DUE</div><div className="num">{renewalsDue}</div><div className="kpi-sub">≤30d to expiry</div></div>
            <div className={`kpi ${overdueVisits?'warn':'ok'}`}><div className="lbl">OVERDUE VISITS</div><div className="num">{overdueVisits}</div><div className="kpi-sub">monitoring delayed</div></div>
            <div className={`kpi ${openAE?'warn':'ok'}`}><div className="lbl">SAFETY EVENTS</div><div className="num" style={{color: openAE ? 'var(--alert-orange)' : 'var(--green)'}}>{openAE}</div><div className="kpi-sub">open cases</div></div>
          </div>
          
          {alerts.length > 0 && (
            <div className="alert-banner">
              <div className="alert-icon">!</div>
              <div className="alert-content">
                <strong>Attention Required</strong>
                {alerts.map((a, i) => (
                  <div key={i}>{a.text}</div>
                ))}
              </div>
            </div>
          )}

          <div className="panel" style={{border: 'none', boxShadow: 'none'}}>
            <div className="overflow-x">
              <table className="styled-table">
                <thead><tr><th>SITE / STUDY</th><th>CTRI</th><th>ETHICS</th><th>ENROLLED</th><th>PROGRESS</th><th>DEVIATIONS</th><th>MONITORING</th></tr></thead>
                <tbody>
                  {studies.map(s => {
                    const pct = Math.min(100, Math.round(100*s.enrolled/s.target));
                    return (
                      <tr key={s.id}>
                        <td><b>{s.id}</b><br/><span className="small">{s.title}</span></td>
                        <td><span className="small" style={{fontFamily:'var(--mono)'}}>{s.ctri}</span></td>
                        <td>{tagFor(s.ethicsStatus)}</td>
                        <td style={{textAlign: 'center'}}>{s.enrolled}</td>
                        <td style={{width: '200px'}}>
                          <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                            <div className="bar"><i style={{width:`${pct}%`, background: pct < 50 ? 'var(--alert-orange)' : 'var(--green)'}}></i></div>
                            <span className="small">{pct}%</span>
                          </div>
                        </td>
                        <td style={{textAlign: 'center'}}>{s.deviations}</td>
                        <td className="small">Next: {s.nextVisit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        )}

        {perms.allowedTabs.includes('analytics') && (
        <section className={`section ${tab==='analytics'?'active':''}`}>
          <Analytics studies={studies} aeRecords={aeRecords} />
        </section>
        )}

        {perms.allowedTabs.includes('regulatory') && (
        <section className={`section ${tab==='regulatory'?'active':''}`}>
          <div className="pagehead">
            <div><h2>Regulatory &amp; Ethics Tracker</h2><p>CTRI registration and IEC approval milestones — NDCT Rules 2019</p></div>
          </div>
          <div className="panel" style={{border: 'none', boxShadow: 'none'}}>
            <div className="overflow-x">
              <table className="styled-table">
                <thead><tr><th>STUDY</th><th>CTRI STATUS</th><th>ETHICS STATUS</th><th>ETHICS RENEWAL</th><th>ACTION</th></tr></thead>
                <tbody>
                  {studies.map(s => (
                    <tr key={s.id}>
                      <td><b>{s.id}</b><br/><span className="small">{s.title}</span></td>
                      <td>{tagFor(s.ctriStatus)}</td>
                      <td>{tagFor(s.ethicsStatus)}</td>
                      <td className="small">{s.ethicsRenewal}</td>
                      <td>
                        {perms.edit ? (
                          <select className="table-select" value={s.ethicsStatus} onChange={(e) => updateEthicsStatus(s.id, s.ethicsStatus, e.target.value)}>
                            <option>Approved</option>
                            <option>Renewal due</option>
                            <option>Under review</option>
                          </select>
                        ) : <span className="small">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        )}

        {perms.allowedTabs.includes('pv') && (
        <section className={`section ${tab==='pv'?'active':''}`}>
          <div className="pagehead">
            <div><h2>Pharmacovigilance Module</h2><p>NPvCC — AE/SAE intake, Dual Coding, and Regulatory Clock Countdown</p></div>
          </div>
          <div className="panel">
            <h3>Report a new event (Dual-Coding Enabled)</h3>
            <p className="small" style={{marginBottom:'16px', opacity: 0.7}}>
              Supports standard regulatory reporting alongside traditional Ayurveda specific terminology.
            </p>
            {!perms.addAE ? (
              <div className="locked">Only Pharmacovigilance Staff or Admin can log new AE/SAE events. Switch role above to try it.</div>
            ) : (
              <form onSubmit={handleAEForm}>
                <div className="formgrid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div><label>Study</label><select name="study">{studies.map(s=><option key={s.id}>{s.id}</option>)}</select></div>
                  <div><label>Subject ID</label><input name="subject" placeholder="S-0201" /></div>
                  <div><label>Event term</label><input name="event" placeholder="e.g. nausea" /></div>
                  
                  <div><label>Severity</label><select name="severity"><option>AE</option><option value="SAE">SAE (Starts 24h Clock)</option></select></div>
                  
                  <div style={{gridColumn: '1 / -1', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border)'}}>
                    <b className="small">Intervention & Event Coding</b>
                  </div>
                  <div><label>NAMASTE Code (Ayush)</label><input name="namaste" placeholder="e.g. NM-501" /></div>
                  <div><label>WHO ICD-11 TM2 Code</label><input name="icd11tm2" placeholder="e.g. TM2-45A" /></div>
                  <div><label>MedDRA Code (Global)</label><input name="meddra" placeholder="10028813" /></div>
                  <div><label>API Reference (Formulation)</label><input name="api_ref" placeholder="API-VOL1-45" /></div>
                  
                </div>
                <div style={{padding:'16px 18px'}}><button type="submit" className="cta">Log event &amp; Start Clock</button></div>
              </form>
            )}
          </div>
          <div className="panel" style={{border: 'none', boxShadow: 'none'}}>
            <div className="overflow-x">
              <table className="styled-table">
                <thead><tr><th>STUDY</th><th>EVENT / CODING</th><th>SEVERITY</th><th>REPORTED</th><th>DEADLINE</th><th>STATUS</th></tr></thead>
                <tbody>
                  {aeRecords.map((r,i) => {
                    const reportedAt = new Date(r.reported);
                    // Standard AE gets 168h (7 days), SAE gets 24h
                    const hoursAllowed = r.severity === "SAE" ? 24 : 168;
                    const deadline = new Date(reportedAt.getTime() + (hoursAllowed * 3600000));
                    
                    const msLeft = deadline - now;
                    const hoursLeft = Math.floor(msLeft / 3600000);
                    const minsLeft = Math.floor((msLeft % 3600000) / 60000);
                    
                    const dlLabel = r.status==="Closed" ? "closed" : (
                      msLeft < 0 ? `overdue ${-hoursLeft}h` : `${hoursLeft}h ${minsLeft}m left`
                    );
                    const dlCls = r.status==="Closed" ? "" : (msLeft<0 ? "red" : msLeft<24*3600000 ? "amber" : "green");
                    
                    return (
                      <tr key={i}>
                        <td>{r.study}<br/><span className="small">{r.subject}</span></td>
                        <td>
                          <b>{r.event}</b><br/>
                          <span className="small" style={{fontFamily:'var(--mono)'}}>
                            NAMASTE: {r.namaste || '—'} | TM2: {r.icd11tm2 || '—'} | MedDRA: {r.meddra || '—'}
                          </span>
                        </td>
                        <td>{r.severity==="SAE"?<span className="tag red">SAE</span>:<span className="tag amber">AE</span>}</td>
                        <td className="small">{r.reported.replace('T',' ').substring(0, 16)}</td>
                        <td className={`deadline ${dlCls}`}>
                           {r.severity==="SAE" && r.status==="Open" && <span style={{display:'inline-block', width:'8px', height:'8px', background:'red', borderRadius:'50%', marginRight:'6px', animation:'pulse 1.5s infinite'}}></span>}
                           <b>{dlLabel}</b>
                        </td>
                        <td>{tagFor(r.status)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        )}

        {perms.allowedTabs.includes('audit') && (
        <section className={`section ${tab==='audit'?'active':''}`}>
          <div className="pagehead">
            <div><h2>Audit Trail</h2><p>Immutable, time-stamped log — ALCOA+ aligned with SHA-256 Hash Chaining</p></div>
          </div>
          
          {auditStatus && (
            <div className={`audit-status ${auditStatus}`}>
              <div>
                <b>{auditStatus === 'valid' ? '✅ Blockchain Integrity Verified' : auditStatus === 'invalid' ? '❌ TAMPERING DETECTED' : '⏳ Checking Hashes...'}</b>
                <p className="small" style={{margin: '4px 0 0', opacity: 0.8}}>
                  {auditStatus === 'valid' ? 'All records are cryptographically secured and sequential.' : auditStatus === 'invalid' ? 'Hash chain broken! A record was modified after it was appended.' : 'Recalculating SHA-256 hashes...'}
                </p>
              </div>
              {auditStatus === 'valid' && (
                <button onClick={corruptAuditLog} className="tamper-btn">Simulate Tampering (Demo)</button>
              )}
            </div>
          )}

          <div className="panel" style={{border: 'none', boxShadow: 'none'}}>
            <div>
              {!auditLog.length ? (
                <div className="locked">No actions recorded yet.</div>
              ) : (
                <div className="overflow-x">
                <table className="styled-table">
                  <thead>
                    <tr>
                      <th>TIME</th>
                      <th>ROLE</th>
                      <th>ACTION</th>
                      <th>HASH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((a, i) => (
                      <tr key={i}>
                        <td className="small" style={{whiteSpace: 'nowrap'}}>{a.t.replace('T', ' ').substring(0, 16)}</td>
                        <td><b>{a.role}</b></td>
                        <td>{a.action}</td>
                        <td style={{fontFamily: 'var(--mono)', fontSize: '11px', opacity: 0.5, maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis'}} title={a.currentHash}>
                          {a.currentHash}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>
          </div>
        </section>
        )}
      </main>

    </div>
  );
}

export default App;
