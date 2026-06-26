'use client';
import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

export default function TrendGraph({ logs = [], statKey = '', statLabel = '' }) {
  const [showRaw, setShowRaw] = useState(true);
  const [showTrend, setShowTrend] = useState(true);

  const { data, avgValue } = useMemo(() => {
    if (logs.length === 0) return { data: [], avgValue: 0 };

    // Reverse logs to be chronological (oldest to newest)
    const reversed = [...logs].reverse();
    
    let sum = 0;
    const mapped = reversed.map((log, i) => {
      let val;
      // PRA is a combo stat (Points + Rebounds + Assists) — compute it from individual stats
      if (statKey === 'PRA') {
        val = (Number(log['PTS'] || log['pts'] || 0)) + (Number(log['REB'] || log['reb'] || 0)) + (Number(log['AST'] || log['ast'] || 0));
      } else {
        val = log[statKey] !== undefined ? log[statKey] : 
                  (log[statKey.toLowerCase()] !== undefined ? log[statKey.toLowerCase()] : log[statKey.toUpperCase()]);
      }
      
      const value = Number(val) || 0;
      sum += value;

      const rawDate = log.date || log.game_date || log.gameDate;
      let displayDate = 'N/A';
      if (rawDate) {
        try { displayDate = new Date(rawDate).toLocaleDateString(); if (displayDate === 'Invalid Date') displayDate = rawDate; } 
        catch (e) { displayDate = rawDate; }
      }

      return {
        game: i + 1,
        value,
        date: displayDate,
        opponent: log.opponentAbbr || log.opponent || 'N/A',
        isHome: log.isHome !== undefined ? log.isHome : null
      };
    });

    const average = sum / mapped.length;

    // Calculate 5-game rolling average
    const windowSize = 5;
    for (let i = 0; i < mapped.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const windowSlice = mapped.slice(start, i + 1);
      const rollingAvg = windowSlice.reduce((acc, d) => acc + d.value, 0) / windowSlice.length;
      mapped[i].trend = Number(rollingAvg.toFixed(1));
    }

    return { data: mapped, avgValue: Number(average.toFixed(1)) };
  }, [logs, statKey]);

  if (data.length === 0) return null;

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      return (
        <div style={{
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid var(--accent)',
          padding: '8px 12px',
          borderRadius: '8px',
          color: 'white',
          fontSize: '0.8rem',
          boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
          minWidth: '120px'
        }}>
          <div style={{ fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: '4px', marginBottom: '4px' }}>
            Game {point.game} <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', float: 'right' }}>{point.date}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>vs {point.opponent} {point.isHome !== null ? (point.isHome ? '(H)' : '(A)') : ''}</span>
            <strong style={{ color: 'var(--accent)', fontSize: '1.1rem', marginLeft: '10px' }}>{point.value}</strong>
          </div>
          {showTrend && (
             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '0.75rem', color: '#f59e0b' }}>
                <span>5-Game Trend:</span>
                <strong>{point.trend}</strong>
             </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
      {/* Toggles */}
      <div style={{ display: 'flex', gap: '15px', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '15px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
          <div style={{ width: '12px', height: '3px', background: 'var(--accent)' }}></div> Raw Game
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showTrend} onChange={(e) => setShowTrend(e.target.checked)} />
          <div style={{ width: '12px', height: '3px', background: '#f59e0b' }}></div> 5-Game Trend
        </label>
      </div>

      <div style={{ flex: 1, minHeight: 0, width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="game" tickFormatter={(v) => `G${v}`} stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={avgValue} stroke="#8b5cf6" strokeDasharray="5 5" label={{ position: 'top', value: `Avg: ${avgValue}`, fill: '#8b5cf6', fontSize: 10 }} />
            
            {showRaw && (
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="var(--accent)" 
                strokeWidth={3} 
                dot={{ r: 4, fill: 'var(--panel-bg)', stroke: 'var(--accent)', strokeWidth: 2 }} 
                activeDot={{ r: 6, fill: 'var(--accent)' }} 
                isAnimationActive={true}
              />
            )}
            {showTrend && (
              <Line 
                type="monotone" 
                dataKey="trend" 
                stroke="#f59e0b" 
                strokeWidth={2} 
                dot={false} 
                isAnimationActive={true}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
