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
    const t = new Date().toISOString().slice(0,16).replace('T',' ');
    await fetch(`${API_URL}/audit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t, role, action })
    });
    loadData();
  };

  const updateEthicsStatus = async (id, oldStatus, newStatus) => {
    await fetch(`${API_URL}/studies/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ethicsStatus: newStatus })
    });
    await logAudit(`Updated ${id} ethics status: ${oldStatus} → ${newStatus}`);
  };

  const daysUntil = (dateStr) => {
    if(dateStr==="—") return null;
    return Math.round((new Date(dateStr) - new Date("2026-09-23")) / 86400000);
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
      const dl = new Date(r.reported); dl.setHours(dl.getHours()+r.hours);
      const hoursLeft = (dl - new Date("2026-09-23T12:00")) / 3600000;
      if(hoursLeft<0) alerts.push({sev:"red", text:`${r.study} — ${r.severity} "${r.event}" past reporting deadline`});
      else if(hoursLeft<24) alerts.push({sev:"amber", text:`${r.study} — ${r.severity} "${r.event}" reporting due in ${Math.round(hoursLeft)}h`});
    }
  });
  if(!alerts.length) alerts.push({sev:"amber", text:"No active alerts."});

  const handleAEForm = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const study = fd.get('study'), subj = fd.get('subject')||"S-0000", ev = fd.get('event')||"Unspecified event", sev = fd.get('severity'), code = fd.get('meddra')||"—";
    const reported = new Date().toISOString().slice(0,16);
    const hours = sev==="SAE"?24:168;
    await fetch(`${API_URL}/ae`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ study, subject:subj, event:ev, severity:sev, meddra:code, reported, hours, status:"Open" })
    });
    await logAudit(`Logged ${sev} "${ev}" for ${study} (${subj}) — regulatory clock started`);
    loadData();
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
          <select value={role} onChange={e => { setRole(e.target.value); logAudit(`Switched active view to ${e.target.value}`); }}>
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
            <div><h2>Pharmacovigilance Module</h2><p>NPvCC — AE/SAE intake, MedDRA coding, regulatory-clock countdown</p></div>
          </div>
          <div className="panel">
            <h3>Report a new event</h3>
            {!perms.addAE ? (
              <div className="locked">Only Pharmacovigilance Staff or Admin can log new AE/SAE events. Switch role above to try it.</div>
            ) : (
              <form onSubmit={handleAEForm}>
                <div className="formgrid">
                  <div><label>Study</label><select name="study">{studies.map(s=><option key={s.id}>{s.id}</option>)}</select></div>
                  <div><label>Subject ID</label><input name="subject" placeholder="S-0201" /></div>
                  <div><label>Event term</label><input name="event" placeholder="e.g. nausea" /></div>
                  <div><label>Severity</label><select name="severity"><option>AE</option><option>SAE</option></select></div>
                  <div><label>MedDRA code</label><input name="meddra" placeholder="10028813" /></div>
                </div>
                <div style={{padding:'0 18px 16px'}}><button type="submit" className="cta">Log event</button></div>
              </form>
            )}
          </div>
          <div className="panel">
            <h3>AE / SAE register</h3>
            <div className="overflow-x">
              <table>
                <thead><tr><th>Study</th><th>Event</th><th>Severity</th><th>MedDRA</th><th>Reported</th><th>Deadline</th><th>Status</th></tr></thead>
                <tbody>
                  {aeRecords.map((r,i) => {
                    const dl = new Date(r.reported); dl.setHours(dl.getHours()+r.hours);
                    const hoursLeft = Math.round((dl - new Date("2026-09-23T12:00"))/3600000);
                    const dlLabel = r.status==="Closed" ? "closed" : (hoursLeft<0? `overdue ${-hoursLeft}h` : `${hoursLeft}h left`);
                    const dlCls = r.status==="Closed" ? "" : (hoursLeft<0?"red":hoursLeft<24?"amber":"");
                    return (
                      <tr key={i}>
                        <td>{r.study}</td><td>{r.event}<br/><span className="small">{r.subject}</span></td>
                        <td>{r.severity==="SAE"?<span className="tag red">SAE</span>:<span className="tag amber">AE</span>}</td>
                        <td className="small" style={{fontFamily:'var(--font-mono)'}}>{r.meddra}</td>
                        <td className="small">{r.reported.replace('T',' ')}</td>
                        <td className={`deadline ${dlCls}`}>{dlLabel}</td>
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
          <div className="pagehead">
            <div><h2>Audit Trail</h2><p>Immutable, time-stamped log — ALCOA+ aligned</p></div>
          </div>
          <div className="panel">
            <div>
              {!auditLog.length ? (
                <div className="locked">No actions recorded yet.</div>
              ) : (
                auditLog.map((a, i) => (
                  <div key={i} className="audit-item"><span className="t">{a.t}</span><span><b>{a.role}</b> — {a.action}</span></div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
