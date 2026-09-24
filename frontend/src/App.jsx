import { useState, useEffect } from 'react';
import './index.css';

const ROLE_PERMS = {
  "Principal Investigator": {edit:false, addAE:false, note:"Read/drill-down access to own studies. Cannot alter regulatory status or file AE reports directly."},
  "Study Coordinator": {edit:false, addAE:false, note:"Enrolment and deviation data entry (view-only in this prototype)."},
  "Monitor": {edit:false, addAE:false, note:"Monitoring-visit tracking access. Read-only on regulatory status."},
  "Ethics Committee": {edit:true, addAE:false, note:"Can update CTRI / ethics milestone status."},
  "Pharmacovigilance Staff": {edit:false, addAE:true, note:"Can log new AE/SAE events into the NPvCC register."},
  "Admin": {edit:true, addAE:true, note:"Full access — regulatory updates, AE intake, audit trail."},
  "Regulator (read-only)": {edit:false, addAE:false, note:"Full visibility, no write access — per RBAC design."}
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
      <aside className="sidebar">
        <div className="brand">
          <span className="mark">MINISTRY OF AYUSH · AIIA</span>
          <h1>Clinical Trials Dashboard</h1>
        </div>
        <div className="role-block">
          <label>Viewing as</label>
          <select value={role} onChange={e => { setRole(e.target.value); }}>
            {Object.keys(ROLE_PERMS).map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <nav className="nav">
          <button className={tab==='portfolio'?'active':''} onClick={()=>setTab('portfolio')}>Portfolio &amp; KPIs</button>
          <button className={tab==='regulatory'?'active':''} onClick={()=>setTab('regulatory')}>Regulatory &amp; Ethics</button>
          <button className={tab==='pv'?'active':''} onClick={()=>setTab('pv')}>Pharmacovigilance</button>
          <button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}>Audit Trail</button>
        </nav>
        <div className="perm-note">
          <b>{role}</b><br/>{perms.note}
        </div>
      </aside>

      <main>
        <section className={`section ${tab==='portfolio'?'active':''}`}>
          <div className="pagehead">
            <div><h2>Portfolio &amp; KPI Layer</h2><p>Stage 1 MVP — real-time view replacing spreadsheet tracking</p></div>
          </div>
          <div className="kpis">
            <div className="kpi"><div className="num">{active}</div><div className="lbl">Active studies</div></div>
            <div className="kpi"><div className="num">{totalEnrolled}/{totalTarget}</div><div className="lbl">Enrolment vs. target</div></div>
            <div className={`kpi ${renewalsDue?'warn':'ok'}`}><div className="num">{renewalsDue}</div><div className="lbl">CTRI/ethics renewals due ≤30d</div></div>
            <div className={`kpi ${overdueVisits?'warn':'ok'}`}><div className="num">{overdueVisits}</div><div className="lbl">Overdue monitoring visits</div></div>
            <div className={`kpi ${openAE?'warn':'ok'}`}><div className="num">{openAE}</div><div className="lbl">Open AE/SAE cases</div></div>
          </div>
          
          <div className="panel">
            <h3>Alerts</h3>
            <div>
              {alerts.map((a, i) => (
                <div key={i} className="alert-row">
                  <span className={`dot ${a.sev}`}></span><span>{a.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <h3>Study Portfolio</h3>
            <div className="overflow-x">
              <table>
                <thead><tr><th>Study</th><th>CTRI</th><th>Ethics</th><th>Enrolment</th><th>Deviations</th><th>Monitoring</th></tr></thead>
                <tbody>
                  {studies.map(s => {
                    const pct = Math.min(100, Math.round(100*s.enrolled/s.target));
                    return (
                      <tr key={s.id}>
                        <td><b>{s.id}</b><br/><span className="small">{s.title}</span></td>
                        <td><span className="small" style={{fontFamily:'var(--font-mono)'}}>{s.ctri}</span></td>
                        <td>{tagFor(s.ethicsStatus)}</td>
                        <td>{s.enrolled}/{s.target}<div className="bar"><i style={{width:`${pct}%`}}></i></div></td>
                        <td>{s.deviations}</td>
                        <td className="small">Next: {s.nextVisit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className={`section ${tab==='regulatory'?'active':''}`}>
          <div className="pagehead">
            <div><h2>Regulatory &amp; Ethics Tracker</h2><p>CTRI registration and IEC approval milestones — NDCT Rules 2019</p></div>
          </div>
          <div className="panel">
            <h3>Milestones</h3>
            <div className="overflow-x">
              <table>
                <thead><tr><th>Study</th><th>CTRI status</th><th>Ethics status</th><th>Ethics renewal</th><th>Update</th></tr></thead>
                <tbody>
                  {studies.map(s => (
                    <tr key={s.id}>
                      <td><b>{s.id}</b><br/><span className="small">{s.title}</span></td>
                      <td>{tagFor(s.ctriStatus)}</td>
                      <td>{tagFor(s.ethicsStatus)}</td>
                      <td className="small">{s.ethicsRenewal}</td>
                      <td>
                        {perms.edit ? (
                          <select value={s.ethicsStatus} onChange={(e) => updateEthicsStatus(s.id, s.ethicsStatus, e.target.value)}>
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

        <section className={`section ${tab==='pv'?'active':''}`}>
          <div className="pagehead">
            <div><h2>Pharmacovigilance Module</h2><p>NPvCC — AE/SAE intake, Dual Coding, and Regulatory Clock Countdown</p></div>
          </div>
          <div className="panel" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h3>Report a new event (Dual-Coding Enabled)</h3>
            <p style={{fontSize:'13px', color:'#475569', marginBottom:'16px'}}>
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
                  
                  <div style={{gridColumn: '1 / -1', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #cbd5e1'}}>
                    <b style={{fontSize: '13px', color: '#334155'}}>Intervention & Event Coding</b>
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
          <div className="panel">
            <h3>AE / SAE register</h3>
            <div className="overflow-x">
              <table>
                <thead><tr><th>Study</th><th>Event / Coding</th><th>Severity</th><th>Reported</th><th>Deadline</th><th>Status</th></tr></thead>
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
                          <span className="small" style={{fontFamily:'var(--font-mono)', color: '#64748b'}}>
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

        <section className={`section ${tab==='audit'?'active':''}`}>
          <div className="pagehead" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div><h2>Audit Trail</h2><p>Immutable, time-stamped log — ALCOA+ aligned with SHA-256 Hash Chaining</p></div>
            <button onClick={verifyAuditLog} className="cta" style={{background:'#0f172a'}}>Verify Integrity</button>
          </div>
          
          {auditStatus && (
            <div style={{
              margin: '0 0 20px 0', padding: '16px', borderRadius: '8px',
              background: auditStatus === 'valid' ? '#dcfce7' : auditStatus === 'invalid' ? '#fee2e2' : '#f1f5f9',
              border: `1px solid ${auditStatus === 'valid' ? '#22c55e' : auditStatus === 'invalid' ? '#ef4444' : '#cbd5e1'}`,
              color: auditStatus === 'valid' ? '#166534' : auditStatus === 'invalid' ? '#991b1b' : '#334155',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div>
                <b>{auditStatus === 'valid' ? '✅ Blockchain Integrity Verified' : auditStatus === 'invalid' ? '❌ TAMPERING DETECTED' : '⏳ Checking Hashes...'}</b>
                <p style={{margin: '4px 0 0', fontSize: '13px'}}>
                  {auditStatus === 'valid' ? 'All records are cryptographically secured and sequential.' : auditStatus === 'invalid' ? 'Hash chain broken! A record was modified after it was appended.' : 'Recalculating SHA-256 hashes...'}
                </p>
              </div>
              {auditStatus === 'valid' && (
                <button onClick={corruptAuditLog} style={{padding:'6px 12px', fontSize:'12px', border:'1px solid #991b1b', color:'#991b1b', background:'white', borderRadius:'4px', cursor:'pointer'}}>Simulate Tampering (Demo)</button>
              )}
            </div>
          )}

          <div className="panel">
            <div>
              {!auditLog.length ? (
                <div className="locked">No actions recorded yet.</div>
              ) : (
                <table style={{width: '100%', fontSize: '13px', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{textAlign: 'left', borderBottom: '1px solid #cbd5e1', color: '#64748b'}}>
                      <th style={{padding: '8px 0'}}>Time</th>
                      <th>Role</th>
                      <th>Action</th>
                      <th>Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((a, i) => (
                      <tr key={i} style={{borderBottom: '1px solid #e2e8f0'}}>
                        <td style={{padding: '8px 0', color: '#64748b', whiteSpace: 'nowrap'}}>{a.t.replace('T', ' ').substring(0, 16)}</td>
                        <td><b>{a.role}</b></td>
                        <td>{a.action}</td>
                        <td style={{fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis'}} title={a.currentHash}>
                          {a.currentHash}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </main>
      
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.5); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

export default App;
