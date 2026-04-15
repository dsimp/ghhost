"use client";

import React, { useState, useEffect, useMemo } from 'react';
import CourtMap from '@/components/CourtMap';
import { ShieldAlert, Crosshair, Target, Zap, Activity } from 'lucide-react';

export default function Home() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [mode, setMode] = useState('PLAYER'); // 'PLAYER', 'TEAM_DEF', or 'PREDICTOR'
  
  const [selectedEntity, setSelectedEntity] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [playerStats, setPlayerStats] = useState(null);
  const [shotData, setShotData] = useState([]);
  
  const [opponentFilter, setOpponentFilter] = useState('');
  const [activeZone, setActiveZone] = useState(null);

  const [predictionsData, setPredictionsData] = useState(null);
  const [predictorLoading, setPredictorLoading] = useState(false);
  
  const [targetStat, setTargetStat] = useState('PTS'); // PTS, REB, AST, STL, BLK, TOV, 3PM

  const [spatialResults, setSpatialResults] = useState({});

  useEffect(() => {
    Promise.all([
      fetch('/api/nba/players').then(res => res.json()),
      fetch('/api/nba/teams').then(res => res.json())
    ]).then(([playersData, teamsData]) => {
      if (!playersData.error) setPlayers(playersData);
      if (!teamsData.error) setTeams(teamsData);
    }).catch(err => console.error("Initial load err", err));
  }, []);

  const runSpatialEngine = async (playerId, opponentId, playerName) => {
     setSpatialResults(prev => ({...prev, [playerId]: { loading: true } }));
     try {
       const [playerRes, defRes] = await Promise.all([
          fetch(`/api/nba/shotChart?playerId=${playerId}`),
          fetch(`/api/nba/shotChart?teamId=${opponentId}&defenseMode=true`)
       ]);
       const pShots = await playerRes.json();
       const dShots = await defRes.json();
       
       if (pShots.error || dShots.error) throw new Error("Failed fetching spatial frames");
       
       // Calc Hotspot (Volume * Efficiency => Highest Makes)
       const zoneCounts = {};
       pShots.forEach(s => {
          if(!s.shot_made) return; 
          if (!zoneCounts[s.shot_zone_basic]) zoneCounts[s.shot_zone_basic] = 0;
          zoneCounts[s.shot_zone_basic]++;
       });
       
       let hotZone = null; let max = 0;
       Object.keys(zoneCounts).forEach(z => {
          if (zoneCounts[z] > max) { max = zoneCounts[z]; hotZone = z; }
       });
       if (!hotZone) throw new Error("Not enough shot data");
       
       // Find Opponent performance in that hotZone
       const defInZone = dShots.filter(s => s.shot_zone_basic === hotZone);
       const dPct = defInZone.length > 0 ? (defInZone.filter(s => s.shot_made).length / defInZone.length * 100).toFixed(1) : 0;
       
       // Find Player performance in hotZone
       const pInZone = pShots.filter(s => s.shot_zone_basic === hotZone);
       const pPct = pInZone.length > 0 ? (pInZone.filter(s => s.shot_made).length / pInZone.length * 100).toFixed(1) : 0;
       
       // Determine edge mathematically
       let call = 'NEUTRAL MATCHUP';
       let color = 'white';
       
       // The baseline for paints is ~55%. The baseline for 3s is ~36%. So generic static thresholds are tricky.
       // We'll compare it dynamically: if Opponent percentage is > 5% higher than league avg, or > Player's pct
       // Let's use a simple heuristic based on the zone type.
       let is3PT = hotZone.includes('3');
       let poorDefThreshold = is3PT ? 38 : 60; // 38% for 3PT is bad defense. 60% for paint is bad defense.
       let eliteDefThreshold = is3PT ? 33 : 52; 

       if (dPct >= poorDefThreshold) { call = 'SPATIAL OVER'; color = '#22c55e'; }
       else if (dPct <= eliteDefThreshold) { call = 'SPATIAL UNDER'; color = '#ef4444'; }
       else { call = 'SPATIAL NEUTRAL'; color = '#f59e0b'; }
       
       setSpatialResults(prev => ({...prev, [playerId]: {
          loaded: true, loading: false, hotZone, pPct, dPct, call, color
       }}));
     } catch (e) {
       setSpatialResults(prev => ({...prev, [playerId]: { loading: false, error: e.message } }));
     }
  };

  const handleSelect = async (entity) => {
    setSelectedEntity(entity);
    setSearchTerm(entity.name);
    setOpponentFilter(''); 
    setActiveZone(null);
    setLoading(true);
    setError('');

    try {
      if (mode === 'PLAYER') {
        const [statsRes, shotRes] = await Promise.all([
          fetch(`/api/nba/playerStats?playerId=${entity.id}`),
          fetch(`/api/nba/shotChart?playerId=${entity.id}`)
        ]);
        const stats = await statsRes.json();
        const shots = await shotRes.json();
        if (stats.error) throw new Error(stats.error);
        
        setPlayerStats(stats);
        setShotData(shots);
      } else if (mode === 'TEAM_DEF') {
        const shotRes = await fetch(`/api/nba/shotChart?teamId=${entity.id}&defenseMode=true`);
        const shots = await shotRes.json();
        if (shots.error) throw new Error(shots.error);
        
        setPlayerStats(null);
        setShotData(shots);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch analytics.');
    } finally {
      setLoading(false);
    }
  };

  const loadPredictor = async () => {
     setPredictorLoading(true);
     try {
       const res = await fetch('/api/nba/predictToday');
       const data = await res.json();
       if(data.error) throw new Error(data.error);
       setPredictionsData(data);
     } catch (err) {
       setError(err.message || "Failed predicting today's slate");
     } finally {
       setPredictorLoading(false);
     }
  };

  const onModeToggle = (newMode) => {
    setMode(newMode);
    setSelectedEntity(null);
    setSearchTerm('');
    setShotData([]);
    setPlayerStats(null);
    setActiveZone(null);
    
    if (newMode === 'PREDICTOR' && !predictionsData) {
       loadPredictor();
    }
  };

  // Filter shots by opponent (in Player mode) and active zone
  const filteredShots = useMemo(() => {
    if (!shotData) return [];
    let filtered = shotData;
    if (mode === 'PLAYER' && opponentFilter) {
      filtered = filtered.filter(s => s.opponent === opponentFilter);
    }
    // Zone filtering
    if (activeZone) {
      filtered = filtered.filter(s => s.shot_zone_basic === activeZone);
    }
    return filtered;
  }, [shotData, opponentFilter, activeZone, mode]);

  // Compute stat map for Player vs Team dynamically
  const filteredStats = useMemo(() => {
    if (!playerStats?.gameLogs) return null;
    let logs = playerStats.gameLogs;
    if (opponentFilter) {
      logs = logs.filter(log => log.opponent === opponentFilter);
    }
    
    if (logs.length === 0) return null;
    const sum = logs.reduce((acc, log) => {
       acc.PTS += log.pts;
       acc.REB += log.reb;
       acc.AST += log.ast;
       acc.STL += log.stl;
       acc.TOV += log.tov;
       acc.BLK += log.blk;
       acc['3PM'] += log.fgm; // Approximate if we don't have accurate FG3M, wait fgm is total. 
       // Note: log.fg_pct implies we have general shooting, we will skip 3PM generic sum if missing from our simple log, but we handled it in API.
       return acc;
    }, { PTS: 0, REB: 0, AST: 0, STL: 0, TOV: 0, BLK: 0, '3PM': 0 });

    const games = logs.length;
    return {
       games,
       PTS: (sum.PTS / games).toFixed(1),
       REB: (sum.REB / games).toFixed(1),
       AST: (sum.AST / games).toFixed(1),
       STL: (sum.STL / games).toFixed(1),
       BLK: (sum.BLK / games).toFixed(1),
       TOV: (sum.TOV / games).toFixed(1)
    };
  }, [playerStats, opponentFilter]);

  // Compute percentage stats for current zone view
  const computedPctStats = useMemo(() => {
    if (!filteredShots || filteredShots.length === 0) return null;
    const attempts = filteredShots.length;
    const makes = filteredShots.filter(s => s.shot_made).length;
    const pct = ((makes / attempts) * 100).toFixed(1);
    return { attempts, makes, pct };
  }, [filteredShots]);

  const activeSearchList = mode === 'PLAYER' ? players : teams;

  return (
    <main className="main-container">
      <header className="header">
        <h1>{mode === 'PREDICTOR' ? 'Daily Predictor Engine' : (mode === 'PLAYER' ? 'Player Predictive Engine' : 'Team Defense Analytics')}</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => onModeToggle('PLAYER')}
            style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'PLAYER' ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', color: 'white', cursor: 'pointer', transition: '0.3s' }}
          >
            <Crosshair style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/>
            Player Evaluation
          </button>
          <button 
            onClick={() => onModeToggle('TEAM_DEF')}
            style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'TEAM_DEF' ? '#8b5cf6' : 'transparent', border: '1px solid #8b5cf6', color: 'white', cursor: 'pointer', transition: '0.3s' }}
          >
            <ShieldAlert style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/>
            Team Defense
          </button>
          <button 
            onClick={() => onModeToggle('PREDICTOR')}
            style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'PREDICTOR' ? '#f59e0b' : 'transparent', border: '1px solid #f59e0b', color: 'white', cursor: 'pointer', transition: '0.3s' }}
          >
            <Zap style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/>
            Daily Predictor
          </button>
        </div>
      </header>

      {/* SEARCH SECTION ONLY IN NON-PREDICTOR MODE */}
      {mode !== 'PREDICTOR' && (
        <section className="search-section">
          <div className="search-bar" style={{ position: 'relative' }}>
            <input 
              type="text" 
              className="input-glass" 
              placeholder={mode === 'PLAYER' ? "Search for a player..." : "Search for a team..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (!selectedEntity || selectedEntity.name.toLowerCase() !== searchTerm.toLowerCase()) && (
               <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel-bg)', borderRadius: '12px', marginTop: '8px', zIndex: 50, maxHeight: '300px', overflowY: 'auto' }}>
                  {activeSearchList.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10).map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => handleSelect(item)}
                      style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}
                    >
                      {item.name} {mode === 'PLAYER' ? <span style={{color: 'var(--text-muted)'}}>({item.team})</span> : ''}
                    </div>
                  ))}
               </div>
            )}
          </div>
        </section>
      )}

      {loading && <div className="loading">Analyzing massive datasets...</div>}
      {error && <div style={{color: '#ef4444', textAlign: 'center'}}><ShieldAlert /> {error}</div>}

      {/* PLAYER / TEAM ANALYTICS VIEW */}
      {mode !== 'PREDICTOR' && selectedEntity && !loading && (
        <>
          {mode === 'PLAYER' && (
            <div style={{display: 'flex', justifyContent: 'center', marginBottom: '20px', gap: '10px', alignItems: 'center'}}>
               <span style={{color: 'var(--text-muted)'}}>Primary Analytics Filter:</span>
               <select className="dropdown-glass" value={targetStat} onChange={(e) => setTargetStat(e.target.value)}>
                  {['PTS','REB','AST','STL','BLK','TOV'].map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>
          )}

          <div className="dashboard-grid">
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                 <div>
                   <h2 style={{ fontSize: '2rem', marginBottom: '8px' }}>{selectedEntity.name}</h2>
                   <p style={{ color: 'var(--accent)', fontWeight: 600 }}>
                     {mode === 'TEAM_DEF' ? 'Season Defensive Profile' : 'Target Category: ' + targetStat}
                   </p>
                 </div>
                 
                 {mode === 'PLAYER' && playerStats?.gameLogs && (
                   <select 
                     className="dropdown-glass" 
                     value={opponentFilter} 
                     onChange={(e) => setOpponentFilter(e.target.value)}
                   >
                     <option value="">vs All Teams (Season Avg)</option>
                     {Array.from(new Set(playerStats.gameLogs.map(l => l.opponent))).sort().map(opp => (
                       <option key={opp} value={opp}>vs. {opp}</option>
                     ))}
                   </select>
                 )}
              </div>

              {/* Dynamic Stats Output based on new target feature */}
              {mode === 'PLAYER' && filteredStats && (
                  <div style={{marginTop: '20px'}}>
                     <div style={{fontSize: '3.5rem', fontWeight: 900, color: '#f8fafc', marginBottom: '5px'}}>
                        {filteredStats[targetStat]} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>{targetStat} / Game</span>
                     </div>
                     <p style={{color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px'}}>
                        Opponent Filter: {opponentFilter ? `Averages computed over ${filteredStats.games} games against the ${opponentFilter}` : `Season long average across all opponents`}
                     </p>
                     
                     <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                        {['PTS','REB','AST','STL','BLK'].filter(s => s!==targetStat).map(s => (
                           <div key={s} style={{background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '8px'}}>
                              <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{s} </span>
                              <strong style={{fontSize: '1.2rem'}}>{filteredStats[s]}</strong>
                           </div>
                        ))}
                     </div>
                  </div>
              )}

              {/* Interactive Zone Calculation Box */}
              <div style={{ marginTop: '30px', padding: '24px', background: 'rgba(255, 255, 255, 0.03)', borderRadius: '16px', flex: 1, border: '1px solid var(--panel-border)' }}>
                 {computedPctStats ? (
                    <div style={{ textAlign: 'center' }}>
                       <h3 style={{ fontSize: '1.4rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                         <Target style={{verticalAlign:'middle', marginRight:'8px', color: 'var(--accent)'}}/>
                         {activeZone ? `Zone: ${activeZone}` : 'All Interactive Court Locations'}
                       </h3>
                       <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginBottom: '20px' }}>
                          <div>
                             <div style={{ fontSize: '3rem', fontWeight: 900, color: computedPctStats.pct > 40 ? '#22c55e' : (computedPctStats.pct < 30 ? '#ef4444' : '#eab308') }}>
                                {computedPctStats.pct}%
                             </div>
                             <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{mode === 'TEAM_DEF' ? 'Opponent FGM' : 'Shooting %'}</div>
                          </div>
                       </div>
                       <div style={{ fontSize: '1.2rem' }}>
                          {computedPctStats.makes} <span style={{ color: 'var(--text-muted)' }}>Makes /</span> {computedPctStats.attempts} <span style={{ color: 'var(--text-muted)' }}>Attempts</span>
                       </div>
                    </div>
                 ) : (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>No shots found for these constraints.</div>
                 )}
              </div>
            </div>

            <div className="glass-panel" style={{ position: 'relative' }}>
              <h3 style={{ textAlign: 'center', marginBottom: '16px' }}>
                 Interactive Shot Chart
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '20px' }}>
                Note: X/Y court data is strictly limited to Shot Attempts (PTS).
              </p>
              
              <CourtMap 
                shots={filteredShots} 
                activeZone={activeZone}
                onZoneClick={setActiveZone}
              />
            </div>
            
          </div>
        </>
      )}

      {/* PREDICTOR VIEW */}
      {mode === 'PREDICTOR' && (
        <div style={{maxWidth: '1000px', margin: '0 auto'}}>
          {predictorLoading && <div className="loading" style={{marginTop: '50px'}}><Activity size={48} style={{display:'block', margin:'0 auto', marginBottom:'10px', color:'#f59e0b'}}/> Evaluating Statistical Defenses vs Starting Rosters...</div>}
          
          {!predictorLoading && predictionsData?.matchups && (
             <div style={{marginBottom: '40px', textAlign: 'center'}}>
                <h2 style={{fontSize: '1.5rem', color: 'var(--text-muted)'}}>Today's Slate ({predictionsData.matchups.length} Matchups Found)</h2>
                <div style={{display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px', flexWrap: 'wrap'}}>
                  {predictionsData.matchups.map((m, i) => (
                    <div key={i} style={{background: 'rgba(255,255,255,0.05)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--panel-border)'}}>
                       {m.away} <span style={{color: '#f59e0b'}}>@</span> {m.home}
                    </div>
                  ))}
                </div>
             </div>
          )}

          {!predictorLoading && predictionsData?.players && (
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                {predictionsData.players.map((p, i) => (
                   <div key={i} className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
                         <div>
                            <h3 style={{fontSize: '1.3rem'}}>{p.player}</h3>
                            <span style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>{p.team} vs {p.opponent}</span>
                         </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                         {p.evaluations.map(ev => (
                            <div key={ev.category} style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column' }}>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>{ev.category}</span>
                                  <span style={{ fontSize: '0.7rem', color: ev.color, fontWeight: 800, padding: '2px 6px', background: `${ev.color}20`, borderRadius: '4px' }}>
                                     {ev.call}
                                  </span>
                               </div>
                               <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '2px' }}>{ev.avg}</div>
                               <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{ev.oppDesc}</div>
                            </div>
                         ))}
                      </div>

                      {/* SPATIAL ENGINE SECTION */}
                      <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                         {!spatialResults[p.playerId]?.loaded && !spatialResults[p.playerId]?.loading && (
                            <button 
                               onClick={() => runSpatialEngine(p.playerId, p.opponentId, p.player)}
                               style={{ width: '100%', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', fontSize: '0.9rem' }}
                            >
                               <Target size={16} style={{display:'inline', verticalAlign:'middle', marginRight:'6px'}}/>
                               Run Spatial Deep-Dive
                            </button>
                         )}
                         {spatialResults[p.playerId]?.loading && (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>Fetching 10,000+ local X/Y metrics...</div>
                         )}
                         {spatialResults[p.playerId]?.error && (
                            <div style={{ color: '#ef4444', textAlign: 'center', fontSize: '0.9rem' }}>{spatialResults[p.playerId].error}</div>
                         )}
                         {spatialResults[p.playerId]?.loaded && (
                            <div>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                  <strong style={{color: 'white', fontSize: '0.95rem'}}>Spatial Hotspot</strong>
                                  <span style={{ background: spatialResults[p.playerId].color, color: 'black', fontWeight: 800, fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px' }}>
                                     {spatialResults[p.playerId].call}
                                  </span>
                               </div>
                               <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                  <strong style={{color: '#f59e0b'}}>{spatialResults[p.playerId].hotZone}</strong> is this player's most damaging area ({spatialResults[p.playerId].pPct}% FGM). 
                                  The {p.opponent} defense allows opponents to shoot <strong style={{color: 'white'}}>{spatialResults[p.playerId].dPct}%</strong> in this specific exact zone.
                               </p>
                            </div>
                         )}
                      </div>
                   </div>
                ))}

                {predictionsData.players.length === 0 && (
                   <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)'}}>
                      <div style={{fontSize: '2rem', marginBottom: '10px'}}>💤</div>
                      No active players found for today's slate.
                   </div>
                )}
             </div>
          )}
        </div>
      )}

    </main>
  );
}
