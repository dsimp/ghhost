"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { usePro } from '@/context/ProContext';
import { Activity, ShieldAlert, ArrowLeftRight, Database } from 'lucide-react';

export default function LabPage() {
  const { isPro } = usePro();
  
  const [sport, setSport] = useState('NBA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [cache, setCache] = useState({});
  const [selectedMatchup, setSelectedMatchup] = useState(null);
  
  // Sport-specific filters
  const [hoopsFilter, setHoopsFilter] = useState('PTS');
  const [mlbOrientation, setMlbOrientation] = useState('AWAY_PITCHER'); // 'AWAY_PITCHER' or 'HOME_PITCHER'
  const [mlbFilter, setMlbFilter] = useState('TB');

  useEffect(() => {
    setError('');
    
    if (cache[sport]) {
       if (cache[sport].matchups && cache[sport].matchups.length > 0 && !selectedMatchup) {
          const m = cache[sport].matchups[0];
          setSelectedMatchup(`${m.away} @ ${m.home}`);
       }
       return;
    }
    
    setLoading(true);
    
    fetch(`/api/${sport.toLowerCase()}/predictToday`)
      .then(res => res.json())
      .then(data => {
         if (data.error || data.message) {
            setError(data.message || data.error);
         } else {
            setCache(prev => ({...prev, [sport]: data}));
            if (data.matchups && data.matchups.length > 0) {
               const m = data.matchups[0];
               setSelectedMatchup(`${m.away} @ ${m.home}`);
            }
         }
      })
      .catch(err => setError('Failed to load matchup analytics.'))
      .finally(() => setLoading(false));
      
  }, [sport]);

  // When sport changes, reset selected matchup to the first one available
  useEffect(() => {
     if (cache[sport] && cache[sport].matchups.length > 0) {
        const m = cache[sport].matchups[0];
        setSelectedMatchup(`${m.away} @ ${m.home}`);
     } else {
        setSelectedMatchup(null);
     }
  }, [sport, cache]);


  const currentData = cache[sport] || { matchups: [], players: [] };
  const matchups = currentData.matchups;
  
  // Extract currently selected game details
  const activeGame = useMemo(() => {
     if (!selectedMatchup || !matchups) return null;
     return matchups.find(m => `${m.away} @ ${m.home}` === selectedMatchup);
  }, [selectedMatchup, matchups]);

  // Extract players for the active game
  const activePlayers = useMemo(() => {
     if (!activeGame || !currentData.players) return [];
     return currentData.players.filter(p => p.opponent === activeGame.away || p.opponent === activeGame.home);
  }, [activeGame, currentData]);

  const awayPlayers = useMemo(() => activePlayers.filter(p => !p.isHome), [activePlayers]);
  const homePlayers = useMemo(() => activePlayers.filter(p => p.isHome), [activePlayers]);

  // ==========================================
  // BASKETBALL RENDERING LOGIC (NBA / WNBA)
  // ==========================================
  const renderBasketballMatchup = () => {
     if (!activeGame) return null;
     
     const getStat = (player, category) => {
        const ev = player.evaluations.find(e => e.category === category);
        return ev ? parseFloat(ev.projectedTarget || ev.avg || 0) : 0;
     };

     const getAvg = (player, category) => {
        const ev = player.evaluations.find(e => e.category === category);
        return ev ? parseFloat(ev.avg || 0) : 0;
     };

     const sortedAway = [...awayPlayers].sort((a,b) => getStat(b, hoopsFilter) - getStat(a, hoopsFilter));
     const sortedHome = [...homePlayers].sort((a,b) => getStat(b, hoopsFilter) - getStat(a, hoopsFilter));

     const renderLineup = (playersList, isHome) => (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
           <h3 style={{ textAlign: 'center', color: isHome ? '#a855f7' : '#f59e0b', fontSize: '1.2rem', margin: '0 0 10px 0' }}>
              {isHome ? activeGame.home : activeGame.away}
           </h3>
           {playersList.map((p, i) => {
              const val = getStat(p, hoopsFilter);
              return (
                 <div key={p.playerId} className="glass-panel" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)', borderLeft: `3px solid ${isHome ? '#a855f7' : '#f59e0b'}` }}>
                    <div>
                       <div style={{ fontWeight: 'bold' }}>{p.player} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>{p.position}</span></div>
                       <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Proj: <span style={{ color: 'white', fontWeight: 'bold' }}>{val > 0 ? val.toFixed(1) : '-'}</span> 
                          <span style={{ margin: '0 6px' }}>|</span> 
                          Avg: {getAvg(p, hoopsFilter) > 0 ? getAvg(p, hoopsFilter).toFixed(1) : '-'}
                       </div>
                    </div>
                 </div>
              )
           })}
        </div>
     );

     return (
        <div style={{ marginTop: '20px' }}>
           <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <select className="dropdown-glass" value={hoopsFilter} onChange={(e) => setHoopsFilter(e.target.value)} style={{ padding: '8px 20px', fontSize: '1.1rem', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid #a855f7', color: 'white' }}>
                 {['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM'].map(s => <option key={s} value={s} style={{ color: 'black' }}>{s === '3PM' ? '3-Pointers' : s}</option>)}
              </select>
           </div>
           
           <div style={{ display: 'flex', gap: '30px' }}>
              {renderLineup(sortedAway, false)}
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)' }}><ArrowLeftRight /></div>
              {renderLineup(sortedHome, true)}
           </div>
        </div>
     );
  };

  // ==========================================
  // BASEBALL RENDERING LOGIC (MLB)
  // ==========================================
  const renderBaseballMatchup = () => {
     if (!activeGame) return null;
     
     const pitcherTeam = mlbOrientation === 'AWAY_PITCHER' ? activeGame.away : activeGame.home;
     const hitterTeam = mlbOrientation === 'AWAY_PITCHER' ? activeGame.home : activeGame.away;
     
     // Find the starting pitcher
     const teamPlayers = mlbOrientation === 'AWAY_PITCHER' ? awayPlayers : homePlayers;
     let startingPitcher = teamPlayers.find(p => p.isPitcher);
     
     const hitterTeamPlayers = mlbOrientation === 'AWAY_PITCHER' ? homePlayers : awayPlayers;
     const hitters = hitterTeamPlayers.filter(p => !p.isPitcher);
     
     const getStat = (player, category) => {
        const ev = player.evaluations.find(e => e.category === category);
        return ev ? parseFloat(ev.projectedTarget || ev.avg || 0) : 0;
     };

     const getAvg = (player, category) => {
        const ev = player.evaluations.find(e => e.category === category);
        return ev ? parseFloat(ev.avg || 0) : 0;
     };

     const sortedHitters = [...hitters].sort((a,b) => getStat(b, mlbFilter) - getStat(a, mlbFilter));

     return (
        <div style={{ marginTop: '20px' }}>
           <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <button onClick={() => setMlbOrientation('AWAY_PITCHER')} style={{ padding: '8px 20px', borderRadius: '12px 0 0 12px', background: mlbOrientation === 'AWAY_PITCHER' ? 'var(--accent)' : 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid var(--panel-border)' }}>Away Pitcher</button>
              <button onClick={() => setMlbOrientation('HOME_PITCHER')} style={{ padding: '8px 20px', borderRadius: '0 12px 12px 0', background: mlbOrientation === 'HOME_PITCHER' ? 'var(--accent)' : 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid var(--panel-border)' }}>Home Pitcher</button>
           </div>
           
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px' }}>
              {/* PITCHER COLUMN */}
              <div className="glass-panel" style={{ height: 'fit-content', background: 'linear-gradient(180deg, rgba(34, 197, 94, 0.1), rgba(0,0,0,0.5))', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                 <h3 style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '5px' }}>Opposing Pitcher ({pitcherTeam})</h3>
                 <h2 style={{ fontSize: '1.8rem', color: 'white', margin: '0 0 20px 0' }}>{startingPitcher ? startingPitcher.player : 'Unknown/TBD'}</h2>
                 
                 {startingPitcher && (
                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: '10px' }}>
                        {['K', 'HA', 'BB', 'ER', 'IP'].map(cat => {
                          const val = getStat(startingPitcher, cat);
                          return (
                             <div key={cat} style={{ background: 'rgba(0,0,0,0.4)', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cat} Projection</div>
                                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#22c55e' }}>{val > 0 ? val.toFixed(1) : '-'}</div>
                             </div>
                          )
                       })}
                    </div>
                 )}
              </div>
              
              {/* HITTERS COLUMN */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0 }}>{hitterTeam} Hitters</h3>
                    <select className="dropdown-glass" value={mlbFilter} onChange={(e) => setMlbFilter(e.target.value)} style={{ padding: '6px 12px', fontSize: '0.9rem', background: 'rgba(255,255,255,0.05)', color: 'white' }}>
                       {['TB', 'H', 'HR', 'R', 'RBI', 'SB'].map(s => <option key={s} value={s} style={{ color: 'black' }}>{s}</option>)}
                    </select>
                 </div>
                 
                 {sortedHitters.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No hitter data available for {hitterTeam}.</div>}
                 
                 {sortedHitters.map((p, i) => {
                    const val = getStat(p, mlbFilter);
                    const avg = getAvg(p, mlbFilter);
                    return (
                       <div key={p.playerId} className="glass-panel" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.3)', borderLeft: `3px solid var(--accent)` }}>
                          <div>
                             <div style={{ fontWeight: 'bold' }}>{p.player} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>{p.position}</span></div>
                             <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                Proj: <span style={{ color: 'white', fontWeight: 'bold' }}>{val > 0 ? val.toFixed(1) : '-'}</span> 
                                <span style={{ margin: '0 6px' }}>|</span> 
                                Avg: {avg > 0 ? avg.toFixed(1) : '-'}
                             </div>
                          </div>
                       </div>
                    )
                 })}
              </div>
           </div>
        </div>
     );
  };

  // ==========================================
  // FOOTBALL RENDERING LOGIC (NFL)
  // ==========================================
  const renderFootballMatchup = () => {
     if (!activeGame) return null;
     
     const getStat = (player, category) => {
        const ev = player.evaluations.find(e => e.category === category);
        return ev ? parseFloat(ev.projectedTarget || ev.avg || 0) : 0;
     };

     const renderPosGroup = (position, label, statKey) => {
        const awayPos = awayPlayers.filter(p => p.position === position).sort((a,b) => getStat(b, statKey) - getStat(a, statKey));
        const homePos = homePlayers.filter(p => p.position === position).sort((a,b) => getStat(b, statKey) - getStat(a, statKey));
        
        if (awayPos.length === 0 && homePos.length === 0) return null;
        
        return (
           <div style={{ marginBottom: '30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                 <div style={{ height: '1px', background: 'var(--panel-border)', flex: 1 }}></div>
                 <h4 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '2px' }}>{label} ({statKey})</h4>
                 <div style={{ height: '1px', background: 'var(--panel-border)', flex: 1 }}></div>
              </div>
              
              <div style={{ display: 'flex', gap: '30px' }}>
                 {/* AWAY */}
                 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {awayPos.map(p => {
                       const val = getStat(p, statKey);
                       const avg = getAvg(p, statKey);
                       return (
                       <div key={p.playerId} className="glass-panel" style={{ padding: '10px 15px', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', borderLeft: `3px solid #f59e0b` }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                             <span style={{ fontWeight: 'bold' }}>{p.player} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>{p.position}</span></span>
                             <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                Proj: <span style={{ color: 'white', fontWeight: 'bold' }}>{val > 0 ? val.toFixed(1) : '-'}</span> | Avg: {avg > 0 ? avg.toFixed(1) : '-'}
                             </div>
                          </div>
                       </div>
                    )})}
                 </div>
                 <div style={{ width: '20px' }}></div>
                 {/* HOME */}
                 <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {homePos.map(p => {
                       const val = getStat(p, statKey);
                       const avg = getAvg(p, statKey);
                       return (
                       <div key={p.playerId} className="glass-panel" style={{ padding: '10px 15px', display: 'flex', justifyContent: 'space-between', background: 'rgba(0,0,0,0.3)', borderLeft: `3px solid #a855f7` }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                             <span style={{ fontWeight: 'bold' }}>{p.player} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>{p.position}</span></span>
                             <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                Proj: <span style={{ color: 'white', fontWeight: 'bold' }}>{val > 0 ? val.toFixed(1) : '-'}</span> | Avg: {avg > 0 ? avg.toFixed(1) : '-'}
                             </div>
                          </div>
                       </div>
                    )})}
                 </div>
              </div>
           </div>
        );
     };

     return (
        <div style={{ marginTop: '20px' }}>
           <div style={{ display: 'flex', gap: '30px', marginBottom: '20px' }}>
              <h3 style={{ flex: 1, textAlign: 'center', color: '#f59e0b', fontSize: '1.4rem' }}>{activeGame.away} (Away)</h3>
              <div style={{ width: '20px' }}></div>
              <h3 style={{ flex: 1, textAlign: 'center', color: '#a855f7', fontSize: '1.4rem' }}>{activeGame.home} (Home)</h3>
           </div>
           
           {renderPosGroup('QB', 'Quarterbacks', 'passYds')}
           {renderPosGroup('RB', 'Running Backs', 'rushYds')}
           {renderPosGroup('WR', 'Wide Receivers', 'recYds')}
           {renderPosGroup('TE', 'Tight Ends', 'recYds')}
        </div>
     );
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
       
       <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 900, color: '#a855f7', margin: 0 }}>🧪 The Lab</h2>
          <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Multi-Sport Analytical Matchup Matrix</p>
       </div>

       {/* SPORT SELECTOR */}
       <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
          {['NBA', 'WNBA', 'MLB', 'NFL'].map(s => (
             <button 
                key={s} 
                onClick={() => setSport(s)}
                style={{ 
                   padding: '10px 30px', 
                   borderRadius: '999px', 
                   background: sport === s ? 'var(--accent)' : 'rgba(255,255,255,0.05)', 
                   border: `1px solid ${sport === s ? 'var(--accent)' : 'var(--panel-border)'}`, 
                   color: 'white', 
                   fontWeight: 700,
                   cursor: 'pointer', 
                   transition: 'all 0.3s' 
                }}>
                {s}
             </button>
          ))}
       </div>

       {/* ERROR & LOADING STATES */}
       {loading && (
          <div style={{ textAlign: 'center', padding: '50px' }}>
             <Activity size={48} style={{ color: 'var(--accent)', animation: 'pulse 1.5s infinite', margin: '0 auto 15px auto' }} />
             <div style={{ color: 'var(--text-muted)' }}>Retrieving latest predictive payload for {sport}...</div>
          </div>
       )}
       {error && !loading && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', padding: '20px', borderRadius: '12px', textAlign: 'center', color: '#ef4444' }}>
             <ShieldAlert size={32} style={{ margin: '0 auto 10px auto', display: 'block' }} />
             {error}
          </div>
       )}

       {/* MATCHUP SELECTOR */}
       {!loading && !error && matchups.length > 0 && (
          <>
             <div style={{ display: 'flex', overflowX: 'auto', gap: '10px', paddingBottom: '10px', margin: '20px 0' }}>
                {matchups.map(m => {
                   const gameStr = `${m.away} @ ${m.home}`;
                   const isSel = selectedMatchup === gameStr;
                   return (
                      <div 
                         key={gameStr}
                         onClick={() => setSelectedMatchup(gameStr)}
                         style={{
                            minWidth: '180px',
                            background: isSel ? 'rgba(168, 85, 247, 0.2)' : 'rgba(0,0,0,0.4)',
                            border: `1px solid ${isSel ? '#a855f7' : 'var(--panel-border)'}`,
                            borderRadius: '12px',
                            padding: '15px',
                            textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            boxShadow: isSel ? '0 4px 15px rgba(168, 85, 247, 0.3)' : 'none'
                         }}>
                         <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Away</div>
                         <div style={{ fontWeight: 800, color: 'white' }}>{m.away}</div>
                         <div style={{ margin: '5px 0', color: 'var(--accent)', fontSize: '0.8rem', fontWeight: 900 }}>@</div>
                         <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '5px' }}>Home</div>
                         <div style={{ fontWeight: 800, color: 'white' }}>{m.home}</div>
                      </div>
                   )
                })}
             </div>
             
             {/* RENDER ACTIVE MATCHUP COMPONENT BASED ON SPORT */}
             <div style={{ borderTop: '1px solid var(--panel-border)', paddingTop: '20px' }}>
                {(sport === 'NBA' || sport === 'WNBA') && renderBasketballMatchup()}
                {sport === 'MLB' && renderBaseballMatchup()}
                {sport === 'NFL' && renderFootballMatchup()}
             </div>
          </>
       )}
       
       {!loading && !error && matchups.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '50px' }}>
             <Database size={48} style={{ margin: '0 auto 15px auto', opacity: 0.5 }} />
             No games scheduled for today in {sport}.
          </div>
       )}

    </div>
  );
}
