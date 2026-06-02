"use client";

import React, { useState, useEffect } from 'react';
import TrendGraph from '@/components/TrendGraph';
import { usePro } from '@/context/ProContext';

export default function LabPage() {
  const { isPro } = usePro();
  
  const [playersList, setPlayersList] = useState([]);
  
  // Default Featured Matchup
  const [playerAId, setPlayerAId] = useState('2544'); // LeBron James
  const [playerAName, setPlayerAName] = useState('LeBron James');
  
  const [playerBId, setPlayerBId] = useState('201142'); // Kevin Durant
  const [playerBName, setPlayerBName] = useState('Kevin Durant');

  const [statsA, setStatsA] = useState(null);
  const [statsB, setStatsB] = useState(null);
  
  const [loadingA, setLoadingA] = useState(true);
  const [loadingB, setLoadingB] = useState(true);

  const [statFilter, setStatFilter] = useState('PTS');
  
  const [searchQueryA, setSearchQueryA] = useState('');
  const [searchQueryB, setSearchQueryB] = useState('');
  const [showDropdownA, setShowDropdownA] = useState(false);
  const [showDropdownB, setShowDropdownB] = useState(false);

  useEffect(() => {
    fetch('/api/nba/players')
      .then(res => res.json())
      .then(data => {
         if (!data.error) setPlayersList(data);
      });
  }, []);

  useEffect(() => {
    if (!playerAId) return;
    setLoadingA(true);
    fetch(`/api/nba/playerStats?playerId=${playerAId}`)
      .then(res => res.json())
      .then(data => {
         if(!data.error) setStatsA(data.gameLogs);
         setLoadingA(false);
      });
  }, [playerAId]);

  useEffect(() => {
    if (!playerBId) return;
    setLoadingB(true);
    fetch(`/api/nba/playerStats?playerId=${playerBId}`)
      .then(res => res.json())
      .then(data => {
         if(!data.error) setStatsB(data.gameLogs);
         setLoadingB(false);
      });
  }, [playerBId]);

  const handleSearchFocus = (side) => {
    if (!isPro) {
       alert("🔒 Custom Lab Comparisons are exclusively for Ghhost Pro members. Upgrade to unlock!");
       return;
    }
    if (side === 'A') setShowDropdownA(true);
    if (side === 'B') setShowDropdownB(true);
  };

  const selectPlayer = (side, p) => {
    if (side === 'A') {
       setPlayerAId(p.id);
       setPlayerAName(p.name);
       setShowDropdownA(false);
       setSearchQueryA('');
    } else {
       setPlayerBId(p.id);
       setPlayerBName(p.name);
       setShowDropdownB(false);
       setSearchQueryB('');
    }
  };

  const calcAvg = (logs, stat) => {
     if(!logs || logs.length === 0) return 0;
     const sum = logs.reduce((acc, l) => acc + (l[stat] || 0), 0);
     return (sum / logs.length).toFixed(1);
  };

  return (
    <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
       
       <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#a855f7', margin: 0 }}>🧪 The Lab</h2>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Side-by-side analytical comparison matrix.</p>
          {!isPro && (
             <div style={{ background: 'rgba(168, 85, 247, 0.1)', border: '1px dashed #a855f7', padding: '10px', borderRadius: '8px', display: 'inline-block', marginTop: '10px', color: '#d8b4fe', fontSize: '0.85rem' }}>
                Currently viewing <strong>Featured Matchup</strong>. Unlock PRO to customize.
             </div>
          )}
       </div>

       {/* SEARCH CONTROLS */}
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', position: 'relative', zIndex: 50 }}>
          
          {/* Player A Search */}
          <div style={{ position: 'relative' }}>
             <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Subject Alpha</label>
             <input 
                type="text" 
                placeholder={playerAName}
                value={searchQueryA}
                onFocus={() => handleSearchFocus('A')}
                onChange={(e) => setSearchQueryA(e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'white', opacity: isPro ? 1 : 0.6 }}
                readOnly={!isPro}
             />
             {showDropdownA && isPro && searchQueryA.length > 1 && (
                <div className="glass-panel" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', marginTop: '5px', zIndex: 100 }}>
                   {playersList.filter(p => p.name.toLowerCase().includes(searchQueryA.toLowerCase())).slice(0, 5).map(p => (
                      <div key={p.id} onClick={() => selectPlayer('A', p)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}>
                         {p.name}
                      </div>
                   ))}
                </div>
             )}
          </div>

          {/* Player B Search */}
          <div style={{ position: 'relative' }}>
             <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Subject Beta</label>
             <input 
                type="text" 
                placeholder={playerBName}
                value={searchQueryB}
                onFocus={() => handleSearchFocus('B')}
                onChange={(e) => setSearchQueryB(e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '8px', color: 'white', opacity: isPro ? 1 : 0.6 }}
                readOnly={!isPro}
             />
             {showDropdownB && isPro && searchQueryB.length > 1 && (
                <div className="glass-panel" style={{ position: 'absolute', top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', marginTop: '5px', zIndex: 100 }}>
                   {playersList.filter(p => p.name.toLowerCase().includes(searchQueryB.toLowerCase())).slice(0, 5).map(p => (
                      <div key={p.id} onClick={() => selectPlayer('B', p)} style={{ padding: '10px', cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}>
                         {p.name}
                      </div>
                   ))}
                </div>
             )}
          </div>
       </div>

       {/* GLOBAL FILTER */}
       <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0' }}>
          <select 
             className="dropdown-glass" 
             value={statFilter} 
             onChange={(e) => setStatFilter(e.target.value)}
             style={{ padding: '8px 20px', fontSize: '1.1rem', background: 'rgba(168, 85, 247, 0.1)', border: '1px solid #a855f7', color: 'white' }}
          >
             {['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
       </div>

       {/* COMPARISON MATRIX */}
       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          
          {/* Player A Stats */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '500px' }}>
             <h3 style={{ textAlign: 'center', margin: '0 0 10px 0' }}>{playerAName}</h3>
             {loadingA ? <div style={{flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>Loading...</div> : (
                <>
                   <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg {statFilter}</span>
                      <div style={{ fontSize: '3rem', fontWeight: 900, color: '#a855f7', lineHeight: '1' }}>{calcAvg(statsA, statFilter === '3PM' ? 'FG3M' : statFilter)}</div>
                   </div>
                   <div style={{ flex: 1, position: 'relative' }}>
                      <TrendGraph logs={statsA} statKey={statFilter === '3PM' ? 'FG3M' : statFilter} />
                   </div>
                </>
             )}
          </div>

          {/* Player B Stats */}
          <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '500px' }}>
             <h3 style={{ textAlign: 'center', margin: '0 0 10px 0' }}>{playerBName}</h3>
             {loadingB ? <div style={{flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center'}}>Loading...</div> : (
                <>
                   <div style={{ textAlign: 'center', marginBottom: '15px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Avg {statFilter}</span>
                      <div style={{ fontSize: '3rem', fontWeight: 900, color: '#a855f7', lineHeight: '1' }}>{calcAvg(statsB, statFilter === '3PM' ? 'FG3M' : statFilter)}</div>
                   </div>
                   <div style={{ flex: 1, position: 'relative' }}>
                      <TrendGraph logs={statsB} statKey={statFilter === '3PM' ? 'FG3M' : statFilter} />
                   </div>
                </>
             )}
          </div>

       </div>

    </div>
  );
}
