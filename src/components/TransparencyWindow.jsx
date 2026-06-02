"use client";

import React, { useState, useEffect } from 'react';
import { Activity, Target, XCircle, CheckCircle2, Search } from 'lucide-react';

export default function TransparencyWindow() {
   const [historyData, setHistoryData] = useState(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState('');
   const [selectedDate, setSelectedDate] = useState('');
   const [search, setSearch] = useState('');

   useEffect(() => {
      fetch('/api/memory/history')
         .then(res => res.json())
         .then(data => {
            if (data.error) throw new Error(data.error);
            setHistoryData(data);
            
            // Set default date to most recent
            if (data.predictions) {
               const dates = Object.keys(data.predictions).sort((a,b) => new Date(b) - new Date(a));
               if (dates.length > 0) setSelectedDate(dates[0]);
            }
            setLoading(false);
         })
         .catch(err => {
            setError(err.message);
            setLoading(false);
         });
   }, []);

   if (loading) return <div style={{padding: '40px', textAlign: 'center', color: 'var(--text-muted)'}}><Activity className="spinner" style={{margin:'0 auto', display:'block', marginBottom:'10px'}} size={32}/> Booting Ghhost Memory Vault...</div>;
   if (error) return <div style={{padding: '40px', textAlign: 'center', color: '#ef4444'}}>Error loading memory: {error}</div>;

   const dates = Object.keys(historyData?.predictions || {}).sort((a,b) => new Date(b) - new Date(a));
   
   // Collect predictions for the selected date
   let displayPredictions = [];
   if (selectedDate && historyData.predictions[selectedDate]) {
      const dayData = historyData.predictions[selectedDate];
      if (dayData.NBA) displayPredictions = [...displayPredictions, ...dayData.NBA.flatMap(p => p.evaluations.map(e => ({...e, player: p.playerName, opponent: p.opponentAbbr, sport: 'NBA'})))];
      if (dayData.MLB) displayPredictions = [...displayPredictions, ...dayData.MLB.flatMap(p => p.evaluations.map(e => ({...e, player: p.playerName, opponent: p.opponentAbbr, sport: 'MLB'})))];
   }

   if (search) {
      displayPredictions = displayPredictions.filter(p => p.player.toLowerCase().includes(search.toLowerCase()) || p.opponent.toLowerCase().includes(search.toLowerCase()));
   }

   // Calculate daily accuracy
   const graded = displayPredictions.filter(p => p.graded);
   const hits = graded.filter(p => p.hit).length;
   const accuracy = graded.length > 0 ? ((hits / graded.length) * 100).toFixed(1) : 0;

   // Global accuracy
   let globalTotal = 0;
   let globalHits = 0;
   Object.values(historyData?.playerHistory || {}).forEach(catObj => {
      Object.values(catObj).forEach(h => {
         if (h.total) {
            globalTotal += h.total;
            globalHits += h.hits;
         }
      });
   });
   const globalAccuracy = globalTotal > 0 ? ((globalHits / globalTotal) * 100).toFixed(1) : 0;

   return (
      <div style={{ background: 'var(--bg-dark)', minHeight: '100%', padding: '20px', borderRadius: '16px', border: '1px solid var(--panel-border)' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '20px', marginBottom: '30px' }}>
            <div>
               <h2 style={{ fontSize: '2rem', margin: 0, color: '#f472b6', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  👻 Ghhost Transparency Window
               </h2>
               <p style={{ color: 'var(--text-muted)', margin: '5px 0 0' }}>The Autopsy Engine's historical log of predictions and evolutions.</p>
            </div>
            
            <div style={{ display: 'flex', gap: '20px', background: 'rgba(0,0,0,0.3)', padding: '15px 25px', borderRadius: '12px', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
               <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Selected Date Hits</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: accuracy >= 60 ? '#22c55e' : (accuracy > 0 ? '#ef4444' : 'white') }}>{accuracy}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{hits} / {graded.length} Graded</div>
               </div>
               <div style={{ width: '1px', background: 'var(--panel-border)' }}></div>
               <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>All-Time Engine Hit Rate</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: globalAccuracy >= 60 ? '#22c55e' : '#f59e0b' }}>{globalAccuracy}%</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Goal: All Green</div>
               </div>
            </div>
         </div>

         <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <select 
               className="dropdown-glass" 
               value={selectedDate} 
               onChange={(e) => setSelectedDate(e.target.value)}
               style={{ padding: '10px 15px', fontSize: '1rem', flex: 1, minWidth: '200px' }}
            >
               {dates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            
            <div style={{ position: 'relative', flex: 2, minWidth: '250px' }}>
               <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--text-muted)' }} />
               <input 
                  type="text" 
                  className="input-glass" 
                  placeholder="Filter by Player or Opponent..." 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: '40px', width: '100%', padding: '10px 15px' }}
               />
            </div>
         </div>

         {displayPredictions.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
               No predictions logged for this date.
            </div>
         ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
               {displayPredictions.map((pred, i) => {
                  const isHit = pred.hit;
                  const isPending = !pred.graded;
                  const isVoid = pred.contextNote === 'DNP / No Game Played';
                  const isMiss = pred.graded && !pred.hit && !isVoid;
                  
                  let cardColor = 'rgba(255,255,255,0.05)';
                  let borderColor = 'var(--panel-border)';
                  let icon = null;
                  
                  if (isHit) {
                     cardColor = 'rgba(34, 197, 94, 0.08)';
                     borderColor = '#22c55e';
                     icon = <CheckCircle2 size={24} color="#22c55e" />;
                  } else if (isMiss) {
                     cardColor = 'rgba(239, 68, 68, 0.08)';
                     borderColor = '#ef4444';
                     icon = <XCircle size={24} color="#ef4444" />;
                  } else if (isVoid) {
                     cardColor = 'rgba(255, 255, 255, 0.02)';
                     borderColor = '#71717a';
                  }

                  return (
                     <div key={i} style={{
                        background: cardColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '12px',
                        padding: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        position: 'relative'
                     }}>
                        <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                           {icon}
                           {isPending && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '2px 8px', border: '1px solid var(--panel-border)', borderRadius: '10px' }}>PENDING</span>}
                        </div>
                        
                        <div style={{ marginBottom: '10px', paddingRight: '30px' }}>
                           <h4 style={{ margin: 0, fontSize: '1.1rem', color: 'white' }}>{pred.player}</h4>
                           <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>vs {pred.opponent} ({pred.sport})</div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '10px' }}>
                           <span style={{ fontSize: '1.8rem', fontWeight: 900, color: 'white' }}>{pred.target}</span>
                           <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>{pred.category}</span>
                           <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: pred.call === 'OVER' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)', color: pred.call === 'OVER' ? '#4ade80' : '#f87171', marginLeft: 'auto' }}>
                              {pred.call}
                           </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.3)', padding: '8px 12px', borderRadius: '8px' }}>
                           <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Actual Result:</span>
                           <span style={{ fontSize: '1.2rem', fontWeight: 800, color: isHit ? '#22c55e' : (isMiss ? '#ef4444' : 'white') }}>
                              {isPending ? '-' : pred.actualResult}
                           </span>
                        </div>

                        {isMiss && pred.contextNote && (
                           <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#f472b6', background: 'rgba(236, 72, 153, 0.1)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(236, 72, 153, 0.2)' }}>
                              <strong>Autopsy Note:</strong> {pred.contextNote}
                           </div>
                        )}
                        {isHit && pred.contextNote && (
                           <div style={{ marginTop: '10px', fontSize: '0.8rem', color: '#4ade80', background: 'rgba(34, 197, 94, 0.1)', padding: '8px', borderRadius: '6px', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                              <strong>Autopsy Note:</strong> {pred.contextNote}
                           </div>
                        )}
                     </div>
                  );
               })}
            </div>
         )}
      </div>
   );
}
