import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, Legend, Cell } from 'recharts';

export default function Analytics({ studies, aeRecords }) {
  // Enrolment progress data
  const enrolmentData = studies.map(s => ({
    name: s.id,
    pct: Math.min(100, Math.round((s.enrolled / s.target) * 100)),
    enrolled: s.enrolled,
    target: s.target,
    fill: (s.enrolled / s.target) > 0.8 ? 'var(--green)' : (s.enrolled / s.target) > 0.4 ? 'var(--amber)' : 'var(--red)'
  }));

  // Mock trend data
  const trendData = [
    { month: 'Jan', 'AIIA-CT-01': 40, 'AIIA-CT-02': 0, 'AIIA-CT-03': 0 },
    { month: 'Mar', 'AIIA-CT-01': 70, 'AIIA-CT-02': 30, 'AIIA-CT-03': 10 },
    { month: 'May', 'AIIA-CT-01': 100, 'AIIA-CT-02': 80, 'AIIA-CT-03': 20 },
    { month: 'Jul', 'AIIA-CT-01': 120, 'AIIA-CT-02': 140, 'AIIA-CT-03': 40 },
    { month: 'Sep', 'AIIA-CT-01': 132, 'AIIA-CT-02': 171, 'AIIA-CT-03': 44 },
  ];

  // Protocol deviations
  const devData = studies.map(s => ({
    name: s.id,
    deviations: s.deviations,
    fill: s.deviations > 2 ? 'var(--amber)' : s.deviations > 0 ? 'var(--accent)' : 'var(--border)'
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{ background: 'var(--bg-card)', padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-hover)' }}>
          <p className="small" style={{margin: 0, fontWeight: 600}}>{label}</p>
          {payload.map((entry, index) => (
            <div key={index} style={{ color: entry.color || entry.fill, fontSize: '13px', marginTop: '4px' }}>
              {entry.name}: {entry.value}
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div>
      <div className="pagehead">
        <div><h2>Analytics &amp; Insights</h2><p>Enrolment trends, site performance, and safety metrics</p></div>
      </div>
      
      {/* Enrolment Progress Cards */}
      <div className="panel" style={{ background: 'var(--bg-card)' }}>
        <h3>Enrolment Progress</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', padding: '20px', justifyContent: 'space-around' }}>
          {enrolmentData.map(d => (
            <div key={d.name} style={{ textAlign: 'center', minWidth: '120px' }}>
              <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={8} data={[d]} startAngle={90} endAngle={-270}>
                    <RadialBar minAngle={15} background={{ fill: 'var(--bg)' }} clockWise dataKey="pct" cornerRadius={10} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '16px' }}>
                  {d.pct}%
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 600 }}>{d.name}</div>
                <div className="small">{d.enrolled}/{d.target}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
        
        {/* Trend Chart */}
        <div className="panel" style={{ marginBottom: 0 }}>
          <h3>Enrolment Trend (Monthly)</h3>
          <div style={{ height: '300px', padding: '20px 20px 20px 0' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} dx={-10} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="AIIA-CT-01" stroke="var(--green)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="AIIA-CT-02" stroke="var(--amber)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="AIIA-CT-03" stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Deviations Chart */}
        <div className="panel" style={{ marginBottom: 0 }}>
          <h3>Protocol Deviations by Study</h3>
          <div style={{ height: '300px', padding: '20px 20px 20px 0' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={devData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} dy={10} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} dx={-10} />
                <Tooltip cursor={{ fill: 'var(--bg-hover)' }} content={<CustomTooltip />} />
                <Bar dataKey="deviations" radius={[4, 4, 0, 0]}>
                  {devData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
