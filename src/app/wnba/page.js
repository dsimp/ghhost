"use client";

import React, { useState, useEffect, useMemo } from 'react';
import CourtMap from '@/components/CourtMap';
import TrendGraph from '@/components/TrendGraph';
import StatLegend from '@/components/StatLegend';
import { useSession } from 'next-auth/react';
import { ShieldAlert, Crosshair, Target, Zap, Activity, AlertTriangle, Lock, Ghost } from 'lucide-react';

export default function WNBADashboard() {
  const { data: session } = useSession();
  const isPro = session?.user?.isPro;
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [mode, setMode] = useState('PLAYER'); 
  
  const [selectedEntity, setSelectedEntity] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [playerStats, setPlayerStats] = useState(null);
  const [shotData, setShotData] = useState([]);
  
  const [opponentFilter, setOpponentFilter] = useState('');
  const [activeZone, setActiveZone] = useState(null);

  const [predictionsData, setPredictionsData] = useState(null);
  const [predictorLoading, setPredictorLoading] = useState(false);
  const [selectedGameFilter, setSelectedGameFilter] = useState('');
  
  const [targetStat, setTargetStat] = useState('PTS'); 

  const [spatialResults, setSpatialResults] = useState({});
  const [riskResults, setRiskResults] = useState({});

  const [flippedCards, setFlippedCards] = useState({});
  const [h2hData, setH2hData] = useState({});
  
  const [flippedFullCards, setFlippedFullCards] = useState({});
  const [playerLogsData, setPlayerLogsData] = useState({});


  useEffect(() => {
    Promise.all([
      fetch('/api/wnba/players').then(res => res.json()),
      fetch('/api/wnba/teams').then(res => res.json())
    ]).then(([playersData, teamsData]) => {
      if (!playersData.error) setPlayers(playersData);
      if (!teamsData.error) setTeams(teamsData);
    }).catch(err => console.error("Initial load err", err));
  }, []);

  const runRiskEngine = async (playerId, opponentName, opponentAbbr, isHomeGame) => {
    setRiskResults(prev => ({...prev, [playerId]: { loading: true }}));
    try {
      const statsRes = await fetch(`/api/wnba/playerStats?playerId=${playerId}`);
      const stats = await statsRes.json();
      if(stats.error || !stats.gameLogs) throw new Error("Failed fetching context logs");

      const logs = stats.gameLogs;
      if(logs.length === 0) throw new Error("No tracking game logs available.");

      const recentLogs = logs.slice(0, 5); 
      const locLogs = logs.filter(l => l.isHome === isHomeGame);
      const h2hLogs = logs.filter(l => l.opponent && l.opponent.includes(opponentAbbr));
      
      const calcAvg = (arr, stat) => arr.length > 0 ? (arr.reduce((acc, l) => acc + l[stat], 0) / arr.length).toFixed(1) : 0;
      
      let warnings = [];
      let highlights = [];
      let riskScore = 0; 
      
      // Analyze variance anomalies across fundamental categories
      ['pts', 'reb', 'ast', 'fg3m'].forEach(stat => {
         const catName = stat === 'fg3m' ? '3PM' : stat.toUpperCase();
         const seasonBase = parseFloat(calcAvg(logs, stat));
         if (seasonBase < 2) return; 
         
         const recentBase = parseFloat(calcAvg(recentLogs, stat));
         const locBase = parseFloat(calcAvg(locLogs, stat));
         
         if (recentBase < seasonBase * 0.8) {
            warnings.push(`Recent Slump: Averaging only ${recentBase} ${catName} over Last 5 (Season: ${seasonBase}).`);
            riskScore++;
         } else if (recentBase > seasonBase * 1.25) {
            highlights.push(`Hot Streak: Surging with ${recentBase} ${catName} over Last 5.`);
         }

         if (locLogs.length > 0 && locBase < seasonBase * 0.8) {
            warnings.push(`Travel Impact: Averages drop to ${locBase} ${catName} in ${isHomeGame ? 'Home' : 'Away'} games.`);
            riskScore++;
         }

         if (h2hLogs.length > 0) {
            const h2hBase = parseFloat(calcAvg(h2hLogs, stat));
            if (h2hBase < seasonBase * 0.75) {
               warnings.push(`Matchup Blocked: Only averaged ${h2hBase} ${catName} vs ${opponentName} earlier this season.`);
               riskScore += 2; // high weight
            }
         }
      });
      
      // Remove generic clutter if there are too many matching logs
      warnings = [...new Set(warnings)];
      highlights = [...new Set(highlights)];

      let finalRisk = 'LOW RISK';
      let riskColor = '#22c55e';
      if (riskScore >= 4) { finalRisk = 'EXTREME RISK'; riskColor = '#ef4444'; }
      else if (riskScore >= 2) { finalRisk = 'MODERATE RISK'; riskColor = '#f59e0b'; }

      // Generate up/down rhythm array 
      let rhythmArray = "N/A";
      if (recentLogs.length > 0) {
        // Reverse so it reads oldest -> newest of the last 5
        rhythmArray = [...recentLogs].reverse().map(l => l.pts).join(' → ');
      }

      const lastGame = logs.length > 0 ? logs[0] : null;

      let h2hAverages = null;
      if (h2hLogs.length > 0) {
         h2hAverages = {
            pts: calcAvg(h2hLogs, 'pts'),
            reb: calcAvg(h2hLogs, 'reb'),
            ast: calcAvg(h2hLogs, 'ast'),
            stl: calcAvg(h2hLogs, 'stl'),
            blk: calcAvg(h2hLogs, 'blk'),
            fg3m: calcAvg(h2hLogs, 'fg3m'),
            games: h2hLogs.length
         };
      }
      
      if (lastGame) {
         if (!h2hAverages) h2hAverages = { pts: 'N/A', reb: 'N/A', ast: 'N/A', stl: 'N/A', blk: 'N/A', fg3m: 'N/A', games: 0 };
         h2hAverages.lastGamePts = lastGame.pts;
         h2hAverages.lastGameReb = lastGame.reb;
         h2hAverages.lastGameAst = lastGame.ast;
         h2hAverages.lastGameStl = lastGame.stl;
         h2hAverages.lastGameBlk = lastGame.blk;
         h2hAverages.lastGameFg3m = lastGame.fg3m;
         h2hAverages.lastGameOpp = lastGame.opponent;
      }

      setRiskResults(prev => ({...prev, [playerId]: {
         loaded: true, loading: false, warnings, highlights, finalRisk, riskColor, rhythmArray, h2hAverages, gameLogs: logs, trendStat: 'PTS'
      }}));
    } catch (e) {
      setRiskResults(prev => ({...prev, [playerId]: { loading: false, error: e.message }}));
    }
  };

  const handleCardFlip = async (playerId, opponentAbbr, categoryKey) => {
    const flipKey = `${playerId}-${categoryKey}`;
    setFlippedCards(prev => ({ ...prev, [flipKey]: !prev[flipKey] }));

    if (h2hData[playerId] || riskResults[playerId]?.h2hAverages) return;

    setH2hData(prev => ({...prev, [playerId]: { loading: true }}));
    try {
      const statsRes = await fetch(`/api/wnba/playerStats?playerId=${playerId}`);
      const stats = await statsRes.json();
      if(stats.error || !stats.gameLogs) throw new Error("Failed");
      const h2hLogs = stats.gameLogs.filter(l => l.opponent && l.opponent.includes(opponentAbbr));
      const lastGame = stats.gameLogs.length > 0 ? stats.gameLogs[0] : null;
      const calcAvg = (arr, stat) => arr.length > 0 ? (arr.reduce((acc, l) => acc + l[stat], 0) / arr.length).toFixed(1) : 'N/A';
      
      const avgs = {
        pts: calcAvg(h2hLogs, 'pts'),
        reb: calcAvg(h2hLogs, 'reb'),
        ast: calcAvg(h2hLogs, 'ast'),
        stl: calcAvg(h2hLogs, 'stl'),
        blk: calcAvg(h2hLogs, 'blk'),
        fg3m: calcAvg(h2hLogs, 'fg3m'),
        games: h2hLogs.length,
        lastGamePts: lastGame ? lastGame.pts : '-',
        lastGameReb: lastGame ? lastGame.reb : '-',
        lastGameAst: lastGame ? lastGame.ast : '-',
        lastGameStl: lastGame ? lastGame.stl : '-',
        lastGameBlk: lastGame ? lastGame.blk : '-',
        lastGameFg3m: lastGame ? lastGame.fg3m : '-',
        lastGameOpp: lastGame ? lastGame.opponent : '-'
      };

      setH2hData(prev => ({...prev, [playerId]: { loading: false, data: avgs }}));
    } catch (e) {
      setH2hData(prev => ({...prev, [playerId]: { loading: false, error: "Error" }}));
    }
  };

  const handleFullCardFlip = async (playerId) => {
    setFlippedFullCards(prev => ({ ...prev, [playerId]: !prev[playerId] }));

    if (playerLogsData[playerId]) return;

    setPlayerLogsData(prev => ({...prev, [playerId]: { loading: true, stat: 'PTS' }}));
    try {
      const statsRes = await fetch(`/api/wnba/playerStats?playerId=${playerId}`);
      const stats = await statsRes.json();
      if(stats.error || !stats.gameLogs) throw new Error("Failed");
      
      setPlayerLogsData(prev => ({...prev, [playerId]: { loading: false, logs: stats.gameLogs, stat: 'PTS' }}));
    } catch (e) {
      setPlayerLogsData(prev => ({...prev, [playerId]: { loading: false, error: "Error" }}));
    }
  };

  const runSpatialEngine = async (playerId, opponentId, playerName) => {
     setSpatialResults(prev => ({...prev, [playerId]: { loading: true } }));
     try {
       const [playerRes, defRes] = await Promise.all([
          fetch(`/api/wnba/shotChart?playerId=${playerId}`),
          fetch(`/api/wnba/shotChart?teamId=${opponentId}&defenseMode=true`)
       ]);
       const pShots = await playerRes.json();
       const dShots = await defRes.json();
       
       if (pShots.error || dShots.error) throw new Error("Failed fetching spatial frames");
       
       // Calc Hotspot
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
       
       // Compare performance
       const defInZone = dShots.filter(s => s.shot_zone_basic === hotZone);
       const dPct = defInZone.length > 0 ? (defInZone.filter(s => s.shot_made).length / defInZone.length * 100).toFixed(1) : 0;
       
       const pInZone = pShots.filter(s => s.shot_zone_basic === hotZone);
       const pPct = pInZone.length > 0 ? (pInZone.filter(s => s.shot_made).length / pInZone.length * 100).toFixed(1) : 0;
       
       let call = 'NEUTRAL MATCHUP';
       let color = 'white';
       
       let is3PT = hotZone.includes('3');
       let poorDefThreshold = is3PT ? 38 : 60; 
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
          fetch(`/api/wnba/playerStats?playerId=${entity.id}`),
          fetch(`/api/wnba/shotChart?playerId=${entity.id}`)
        ]);
        const stats = await statsRes.json();
        const shots = await shotRes.json();
        if (stats.error) throw new Error(stats.error);
        
        setPlayerStats(stats);
        setShotData(shots);
      } else if (mode === 'TEAM_DEF') {
        const shotRes = await fetch(`/api/wnba/shotChart?teamId=${entity.id}&defenseMode=true`);
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
     setError('');
     try {
       const res = await fetch('/api/wnba/predictToday');
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
    
    setSelectedGameFilter('');
    if (newMode === 'PREDICTOR' && !predictionsData) {
       loadPredictor();
    }
  };

  const filteredShots = useMemo(() => {
    if (!shotData) return [];
    let filtered = shotData;
    if (mode === 'PLAYER' && opponentFilter) {
      filtered = filtered.filter(s => s.opponent === opponentFilter);
    }
    if (activeZone) {
      filtered = filtered.filter(s => s.shot_zone_basic === activeZone);
    }
    return filtered;
  }, [shotData, opponentFilter, activeZone, mode]);

  const filteredStats = useMemo(() => {
    if (!playerStats?.gameLogs) return null;
    let logs = playerStats.gameLogs;
    if (opponentFilter) {
      logs = logs.filter(log => log.opponent === opponentFilter);
    }
    if (logs.length === 0) return null;
    const sum = logs.reduce((acc, log) => {
       acc.PTS += log.pts; acc.REB += log.reb; acc.AST += log.ast;
       acc.STL += log.stl; acc.TOV += log.tov; acc.BLK += log.blk; acc['3PM'] += log.fg3m;
       return acc;
    }, { PTS: 0, REB: 0, AST: 0, STL: 0, TOV: 0, BLK: 0, '3PM': 0 });

    const games = logs.length;
    return {
       games,
       PTS: (sum.PTS / games).toFixed(1), REB: (sum.REB / games).toFixed(1),
       AST: (sum.AST / games).toFixed(1), STL: (sum.STL / games).toFixed(1),
       BLK: (sum.BLK / games).toFixed(1), TOV: (sum.TOV / games).toFixed(1)
    };
  }, [playerStats, opponentFilter]);

  const computedPctStats = useMemo(() => {
    if (!filteredShots || filteredShots.length === 0) return null;
    const attempts = filteredShots.length;
    const makes = filteredShots.filter(s => s.shot_made).length;
    const pct = ((makes / attempts) * 100).toFixed(1);
    return { attempts, makes, pct };
  }, [filteredShots]);

  const activeSearchList = mode === 'PLAYER' ? players : teams;

  const geniusBoard = useMemo(() => {
     if (!predictionsData?.players) return [];
     const candidates = [];
     predictionsData.players.forEach(p => {
        p.evaluations.forEach(ev => {
           if (ev.historicalAccuracy !== null && ev.historicalAccuracy !== undefined && ev.historicalAccuracy >= 0.55 && (ev.totalGames || 0) >= 3) {
              candidates.push({
                 player: p.player,
                 team: p.team,
                 opponent: p.opponentAbbr,
                 category: ev.category,
                 call: ev.call,
                 accuracy: (ev.historicalAccuracy * 100).toFixed(0),
                 totalGames: ev.totalGames || 0
              });
           }
        });
     });
     return candidates.sort((a, b) => {
        const scoreA = (a.accuracy / 100) * Math.log2(a.totalGames + 1);
        const scoreB = (b.accuracy / 100) * Math.log2(b.totalGames + 1);
        return scoreB - scoreA;
     }).slice(0, 5);
  }, [predictionsData]);

  return (
    <main className="main-container">
      <header className="header">
        <h1>{mode === 'PREDICTOR' ? 'Daily Predictor Engine' : (mode === 'PLAYER' ? 'Player Predictive Engine' : 'Team Defense Analytics')}</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => onModeToggle('PLAYER')} style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'PLAYER' ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', color: 'white', cursor: 'pointer', transition: '0.3s' }}>
            <Crosshair style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/> Player Evaluation
          </button>
          <button onClick={() => onModeToggle('TEAM_DEF')} style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'TEAM_DEF' ? '#8b5cf6' : 'transparent', border: '1px solid #8b5cf6', color: 'white', cursor: 'pointer', transition: '0.3s' }}>
            <ShieldAlert style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/> Team Defense
          </button>
          <button onClick={() => onModeToggle('PREDICTOR')} style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'PREDICTOR' ? '#f59e0b' : 'transparent', border: '1px solid #f59e0b', color: 'white', cursor: 'pointer', transition: '0.3s' }}>
            <Zap style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/> Daily Predictor
          </button>
        </div>
      </header>

      {/* SEARCH SECTION ONLY IN NON-PREDICTOR MODE */}
      {mode !== 'PREDICTOR' && (
        <section className="search-section">
          <div className="search-bar" style={{ position: 'relative' }}>
            <input type="text" className="input-glass" placeholder={mode === 'PLAYER' ? "Search for a player..." : "Search for a team..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchTerm && (!selectedEntity || selectedEntity.name.toLowerCase() !== searchTerm.toLowerCase()) && (
               <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel-bg)', borderRadius: '12px', marginTop: '8px', zIndex: 50, maxHeight: '300px', overflowY: 'auto' }}>
                  {activeSearchList.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10).map(item => (
                    <div key={item.id} onClick={() => handleSelect(item)} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}>
                      {item.name} {mode === 'PLAYER' ? <span style={{color: 'var(--text-muted)'}}>({item.team})</span> : ''}
                    </div>
                  ))}
               </div>
            )}
          </div>
        </section>
      )}

      {loading && <div className="loading">Analyzing massive datasets...</div>}
      {error && <div style={{color: '#ef4444', textAlign: 'center', marginTop: '20px'}}><ShieldAlert /> {error}</div>}

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
                   <p style={{ color: 'var(--accent)', fontWeight: 600 }}>{mode === 'TEAM_DEF' ? 'Season Defensive Profile' : 'Target Category: ' + targetStat}</p>
                 </div>
                 
                 {mode === 'PLAYER' && playerStats?.gameLogs && (
                   <select className="dropdown-glass" value={opponentFilter} onChange={(e) => setOpponentFilter(e.target.value)}>
                     <option value="">vs All Teams (Season Avg)</option>
                     {Array.from(new Set(playerStats.gameLogs.map(l => l.opponent))).sort().map(opp => <option key={opp} value={opp}>vs. {opp}</option>)}
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
                             <div style={{ fontSize: '3rem', fontWeight: 900, color: computedPctStats.pct > 40 ? '#22c55e' : (computedPctStats.pct < 30 ? '#ef4444' : '#eab308') }}>{computedPctStats.pct}%</div>
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
              <h3 style={{ textAlign: 'center', marginBottom: '16px' }}>Interactive Shot Chart</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '20px' }}>Note: X/Y court data is strictly limited to Shot Attempts (PTS).</p>
              <CourtMap shots={filteredShots} activeZone={activeZone} onZoneClick={setActiveZone} />
            </div>
            
            {/* TREND GRAPH SECTION */}
            <div className="glass-panel" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.5rem' }}>Performance Trend ({targetStat})</h3>
                <div style={{ display: 'flex', gap: '15px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '3px', background: 'var(--accent)' }}></div> Raw Game
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '3px', background: '#f59e0b' }}></div> 5-Game Trend
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <div style={{ width: '12px', height: '1px', borderTop: '1.5px dashed #8b5cf6' }}></div> Season Avg
                  </div>
                </div>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '5px' }}>
                 Game-by-game tracking {opponentFilter ? `vs ${opponentFilter}` : 'across the season'}.
              </p>
              
              <TrendGraph 
                 logs={playerStats?.gameLogs ? (opponentFilter ? playerStats.gameLogs.filter(l => l.opponent === opponentFilter) : playerStats.gameLogs) : []} 
                 statKey={targetStat} 
              />
            </div>
          </div>
        </>
      )}

      {/* PREDICTOR VIEW */}
      {mode === 'PREDICTOR' && (
        <div style={{maxWidth: '1200px', margin: '0 auto'}}>
          {predictorLoading && (
            <div style={{ marginTop: '50px' }}>
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <Activity size={48} style={{ display: 'block', margin: '0 auto', marginBottom: '10px', color: '#f59e0b', animation: 'pulse 1.5s infinite' }} />
                <div style={{ color: 'var(--text-muted)' }}>Evaluating Statistical Defenses vs Starting Rosters...</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: '20px' }}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="glass-panel skeleton skeleton-card"></div>
                ))}
              </div>
            </div>
          )}
          
          {!predictorLoading && predictionsData?.matchups && (
             <div style={{marginBottom: '40px', textAlign: 'center'}}>
                {geniusBoard.length > 0 && (
                   <div style={{ marginBottom: '30px', padding: '20px', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.05))', borderRadius: '16px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
                         <Lock size={24} color="#22c55e" />
                         <h2 style={{ fontSize: '1.5rem', color: 'white', margin: 0 }}>Genius Accuracy Board</h2>
                      </div>
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                         Auto-correcting historical performance log. These are the top {geniusBoard.length} players the engine predicts with the highest historical accuracy.
                      </p>
                      <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }}>
                         {geniusBoard.map((gb, i) => (
                            <div key={i} style={{ minWidth: '220px', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', padding: '16px', border: '1px solid var(--panel-border)', textAlign: 'left' }}>
                               <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 700, marginBottom: '4px' }}>Rank #{i+1}</div>
                               <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', marginBottom: '4px' }}>{gb.player}</div>
                               <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '10px' }}>{gb.team} vs {gb.opponent}</div>
                               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                     <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{gb.category}</span>
                                     <div style={{ fontSize: '0.7rem', color: gb.call.includes('OVER') ? '#4ade80' : '#ef4444', fontWeight: 800 }}>{gb.call}</div>
                                  </div>
                                  <div style={{ textAlign: 'right' }}>
                                     <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#22c55e' }}>{gb.accuracy}%</div>
                                     <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Hit Rate</div>
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>
                )}
             
                <h2 style={{fontSize: '1.5rem', color: 'var(--text-muted)'}}>Today's Slate ({predictionsData.matchups.length} Matchups Found)</h2>
                <div style={{display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px', flexWrap: 'wrap'}}>
                  {predictionsData.matchups.map((m, i) => {
                    const gameLabel = `${m.away} @ ${m.home}`;
                    const isSelected = selectedGameFilter === gameLabel;
                    return (
                      <div key={i} 
                           onClick={() => setSelectedGameFilter(isSelected ? '' : gameLabel)}
                           style={{
                             background: isSelected ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.05)', 
                             padding: '8px 16px', 
                             borderRadius: '8px', 
                             border: isSelected ? '1px solid #f59e0b' : '1px solid var(--panel-border)',
                             cursor: 'pointer',
                             transition: '0.2s'
                           }}>
                         {m.away} <span style={{color: '#f59e0b'}}>@</span> {m.home}
                      </div>
                    );
                  })}
                </div>
                
                <StatLegend sport="WNBA" />
             </div>
          )}

          {!predictorLoading && predictionsData?.players && (
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: '20px' }}>
                {(() => {
                   let displayList = predictionsData.players.filter(p => !selectedGameFilter || selectedGameFilter.includes(p.opponent));
                   if (!isPro) displayList = displayList.slice(0, 4);
                   
                   return displayList.map((p, i) => {
                   const isFullFlipped = flippedFullCards[p.playerId];
                   const trendData = playerLogsData[p.playerId];
                   
                   const alerts = [];
                   p.evaluations.forEach(ev => {
                      if (ev.streakDesc) alerts.push({ cat: ev.category, desc: ev.streakDesc, type: 'streak' });
                      if (ev.memoryDesc) alerts.push({ cat: ev.category, desc: ev.memoryDesc, type: 'memory' });
                   });
                   
                   return (
                   <div key={i} style={{ perspective: '1200px' }}>
                     <div style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        transition: 'transform 0.6s',
                        transformStyle: 'preserve-3d',
                        transform: isFullFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                     }}>
                       {/* FRONT OF FULL CARD */}
                       <div className="glass-panel" 
                           onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 16px 48px rgba(139,92,246,0.12)'; }}
                           onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'; }}
                           style={{ 
                              backfaceVisibility: 'hidden', display: 'flex', flexDirection: 'column',
                              background: 'linear-gradient(145deg, rgba(20,20,35,0.95), rgba(12,12,25,0.98))',
                              border: '1px solid rgba(139,92,246,0.15)',
                              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                              transition: 'transform 0.3s ease, box-shadow 0.3s ease'
                           }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
                              <div>
                                 <h3 style={{fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 2px 0'}}>{p.player}</h3>
                                 <span style={{color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500}}>{p.team} vs {p.opponent} ({p.isHome ? 'Home' : 'Away'})</span>
                              </div>
                              <button onClick={() => handleFullCardFlip(p.playerId)} style={{background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#a78bfa', padding: '7px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: '0.3s', letterSpacing: '0.02em'}}>
                                 📈 Flip to Trend
                              </button>
                           </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                         {p.evaluations.map(ev => {
                            const flipKey = `${p.playerId}-${ev.category}`;
                            const isFlipped = flippedCards[flipKey];
                            const loadedH2H = h2hData[p.playerId]?.data || riskResults[p.playerId]?.h2hAverages;
                            const h2hLoading = h2hData[p.playerId]?.loading && !loadedH2H;
                            
                            const catLower = ev.category === '3PM' ? 'fg3m' : ev.category.toLowerCase();
                            const h2hVal = loadedH2H ? loadedH2H[catLower] : null;

                            const lastGameValKey = `lastGame${catLower.charAt(0).toUpperCase() + catLower.slice(1)}`;
                            const lastGameVal = loadedH2H ? loadedH2H[lastGameValKey] : null;

                            return (
                               <div key={ev.category} 
                                    onClick={() => handleCardFlip(p.playerId, p.opponentAbbr, ev.category)}
                                    style={{ 
                                       perspective: '1000px', 
                                       cursor: 'pointer', 
                                       height: '90px' 
                                    }}>
                                  <div style={{
                                     position: 'relative',
                                     width: '100%',
                                     height: '100%',
                                     transition: 'transform 0.6s',
                                     transformStyle: 'preserve-3d',
                                     transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                                  }}>
                                     {/* FRONT OF CARD */}
                                     <div style={{
                                         position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
                                         background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '10px', 
                                         border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column'
                                      }}>
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{ev.category}</span>
                                            <span style={{ fontSize: '0.6rem', color: ev.color, fontWeight: 800, padding: '3px 10px', background: `${ev.color}18`, borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.03em', border: `1px solid ${ev.color}30` }}>
                                               {ev.call}
                                            </span>
                                         </div>
                                         <div style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '2px', letterSpacing: '-0.02em' }}>{ev.avg}</div>
                                         <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{ev.oppDesc}</div>
                                      </div>

                                     {/* BACK OF CARD */}
                                     <div style={{
                                        position: 'absolute', width: '100%', height: '100%', backfaceVisibility: 'hidden',
                                        transform: 'rotateY(180deg)', background: 'rgba(0,0,0,0.5)',
                                        borderRadius: '8px', border: '1px solid var(--accent)', display: 'flex', overflow: 'hidden'
                                     }}>
                                        <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '6px' }}>
                                           <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, marginBottom: '2px', textAlign: 'center', lineHeight: '1.2' }}>vs <br/>{p.opponentAbbr}</span>
                                           {!loadedH2H && h2hLoading ? (
                                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>...</div>
                                           ) : (
                                              <>
                                                 <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'white', lineHeight: '1.2' }}>
                                                    {h2hVal}
                                                 </div>
                                                 {loadedH2H && <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '0px' }}>{loadedH2H.games} Gms</div>}
                                              </>
                                           )}
                                        </div>
                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '6px' }}>
                                           <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: 700, marginBottom: '2px', textAlign: 'center', lineHeight: '1.2' }}>Last<br/>Game</span>
                                           {!loadedH2H && h2hLoading ? (
                                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>...</div>
                                           ) : (
                                              <>
                                                 <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b', lineHeight: '1.2' }}>
                                                    {lastGameVal}
                                                 </div>
                                                 {loadedH2H && <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: '0px' }}>vs {loadedH2H.lastGameOpp}</div>}
                                              </>
                                           )}
                                        </div>
                                     </div>
                                  </div>
                               </div>
                            );
                         })}
                      </div>

                       {alerts.length > 0 && (
                          <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                             {alerts.map((al, idx) => (
                                <div key={idx} style={{ 
                                   fontSize: '0.75rem', 
                                   padding: '6px', 
                                   borderRadius: '6px', 
                                   background: al.type === 'memory' ? 'rgba(236, 72, 153, 0.1)' : 'rgba(245, 158, 11, 0.1)', 
                                   color: al.type === 'memory' ? '#f472b6' : '#f59e0b',
                                   border: al.type === 'memory' ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)'
                                }}>
                                   <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>{al.cat}:</strong> {al.type === 'memory' ? <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginRight: '4px' }}><Ghost size={16} /></span> : '⚠️'} {al.desc.replace(/[👻🔥🧊⚠️]/g, '').trim()}
                                </div>
                             ))}
                          </div>
                       )}

                      {/* DEEP DIVE ENGINES ROW */}
                      <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                         {/* SPATIAL ENGINE SECTION */}
                         <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                            {!spatialResults[p.playerId]?.loaded && !spatialResults[p.playerId]?.loading && (
                               <button onClick={() => runSpatialEngine(p.playerId, p.opponentId, p.player)} style={{ width: '100%', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', fontSize: '0.8rem' }}>
                                  <Target size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Analysis
                               </button>
                            )}
                            {spatialResults[p.playerId]?.loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.8rem' }}>Extracting Maps...</div>}
                            {spatialResults[p.playerId]?.error && <div style={{ color: '#ef4444', textAlign: 'center', fontSize: '0.8rem' }}>{spatialResults[p.playerId].error}</div>}
                            {spatialResults[p.playerId]?.loaded && (
                               <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                     <strong style={{color: 'white', fontSize: '0.8rem'}}>Hotspot Call</strong>
                                     <span style={{ color: spatialResults[p.playerId].color, fontWeight: 800, fontSize: '0.7rem' }}>{spatialResults[p.playerId].call}</span>
                                  </div>
                                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                                     <strong style={{color: '#f59e0b'}}>{spatialResults[p.playerId].hotZone}</strong> is this player's peak zone ({spatialResults[p.playerId].pPct}%). 
                                     Defense allows <strong style={{color: 'white'}}>{spatialResults[p.playerId].dPct}%</strong> here.
                                  </p>
                               </div>
                            )}
                         </div>

                         {/* CONTEXTUAL RISK ENGINE SECTION */}
                         <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                            {!riskResults[p.playerId]?.loaded && !riskResults[p.playerId]?.loading && (
                               <button onClick={() => runRiskEngine(p.playerId, p.opponent, p.opponentAbbr, p.isHome)} style={{ width: '100%', background: 'transparent', border: '1px dashed #f59e0b', color: '#f59e0b', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', fontSize: '0.8rem' }}>
                                  <AlertTriangle size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Context Risk
                               </button>
                            )}
                            {riskResults[p.playerId]?.loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.8rem' }}>Scanning 82-Game Logs...</div>}
                            {riskResults[p.playerId]?.error && <div style={{ color: '#ef4444', textAlign: 'center', fontSize: '0.8rem' }}>{riskResults[p.playerId].error}</div>}
                            {riskResults[p.playerId]?.loaded && (
                               <div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                     <strong style={{color: 'white', fontSize: '0.8rem'}}>Overall Status</strong>
                                     <span style={{ color: riskResults[p.playerId].riskColor, fontWeight: 800, fontSize: '0.7rem' }}>{riskResults[p.playerId].finalRisk}</span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '6px' }}>
                                     PTS Rhythm: <strong style={{color: 'white'}}>{riskResults[p.playerId].rhythmArray}</strong>
                                  </div>
                                  {riskResults[p.playerId].h2hAverages ? (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '4px' }}>
                                         <strong style={{color: 'white', display: 'block', marginBottom: '4px'}}>Past Stats vs {p.opponent} ({riskResults[p.playerId].h2hAverages.games} Games):</strong>
                                         PTS: <span style={{color: 'white'}}>{riskResults[p.playerId].h2hAverages.pts}</span> | 
                                         REB: <span style={{color: 'white'}}>{riskResults[p.playerId].h2hAverages.reb}</span> | 
                                         AST: <span style={{color: 'white'}}>{riskResults[p.playerId].h2hAverages.ast}</span> | 
                                         3PM: <span style={{color: 'white'}}>{riskResults[p.playerId].h2hAverages.fg3m}</span>
                                      </div>
                                  ) : (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '8px' }}>
                                         No previous matchups vs {p.opponent}.
                                      </div>
                                  )}
                                  <ul style={{ paddingLeft: '14px', fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                                     {riskResults[p.playerId].highlights.map((h, idx) => <li key={`h-${idx}`} style={{color: '#4ade80', marginBottom: '4px'}}>{h}</li>)}
                                     {riskResults[p.playerId].warnings.map((w, idx) => <li key={`w-${idx}`} style={{color: '#f87171', marginBottom: '4px'}}>{w}</li>)}
                                     {riskResults[p.playerId].warnings.length === 0 && riskResults[p.playerId].highlights.length === 0 && <li>Baseline consistent. No major anomalies.</li>}
                                  </ul>
                               </div>
                            )}
                         </div>
                      </div>

                    </div>

                    {/* DUMMY BACK OF CARD TO MAINTAIN FLIP ILLUSION */}
                    <div className="glass-panel" style={{
                       position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                       backfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
                       background: 'rgba(0,0,0,0.5)', border: '1px solid var(--accent)', opacity: 0.5
                    }}></div>
                  </div>
                </div>
               );
             });
             })()}

             {/* FREEMIUM UPSELL CARD */}
             {!isPro && predictionsData.players.length > 4 && (
                <div style={{
                   background: 'rgba(20, 20, 25, 0.3)',
                   border: '1px dashed rgba(255,255,255,0.2)',
                   borderRadius: '16px',
                   padding: '30px',
                   display: 'flex',
                   flexDirection: 'column',
                   justifyContent: 'center',
                   alignItems: 'center',
                   textAlign: 'center',
                   position: 'relative',
                   overflow: 'hidden',
                   minHeight: '400px'
                }}>
                   <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(8px)', zIndex: 1 }}></div>
                   <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                      <span style={{ fontSize: '3rem' }}>🔒</span>
                      <h3 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 800 }}>Unlock Full Slate</h3>
                      <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: '1.5', maxWidth: '80%' }}>
                         Ghhost Pro members get access to unlimited daily predictions, deep spatial heatmaps, and the AI Autopsy Memory Engine.
                      </p>
                      {session ? (
                         <form action="/api/stripe/checkout" method="POST">
                           <button type="submit" style={{ marginTop: '10px', background: 'white', color: 'black', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', border: 'none' }}>
                             Subscribe to Ghhost Pro - $19.99/mo
                           </button>
                         </form>
                      ) : (
                         <a href="/login" style={{ marginTop: '10px', textDecoration: 'none', background: 'white', color: 'black', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer' }}>
                           Sign In to Subscribe
                         </a>
                      )}
                   </div>
                </div>
             )}

                {/* THE SCREEN PROJECTION OVERLAY (MODAL) */}
                {predictionsData.players.filter(p => !selectedGameFilter || selectedGameFilter.includes(p.opponent)).map((p) => {
                   const isFullFlipped = flippedFullCards[p.playerId];
                   if (!isFullFlipped) return null;
                   const trendData = playerLogsData[p.playerId];

                   return (
                     <div key={`modal-${p.playerId}`} style={{
                        position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                        zIndex: 99999, display: 'flex', justifyContent: 'center', alignItems: 'center',
                        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
                        animation: 'fadeInOverlay 0.3s ease forwards'
                     }}>
                        <style>{`
                          @keyframes fadeInOverlay { from { opacity: 0; } to { opacity: 1; } }
                          @keyframes projectForward { 
                            from { transform: perspective(1200px) rotateY(-180deg) translateZ(-500px) scale(0.5); opacity: 0; } 
                            to { transform: perspective(1200px) rotateY(0deg) translateZ(0) scale(1); opacity: 1; } 
                          }
                        `}</style>
                        <div className="glass-panel" style={{
                           width: '95vw', maxWidth: '1400px', height: '85vh',
                           display: 'flex', flexDirection: 'column',
                           background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--accent)',
                           boxShadow: '0 0 80px rgba(139, 92, 246, 0.4)',
                           animation: 'projectForward 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards'
                        }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                              <div>
                                 <h2 style={{fontSize: 'clamp(1.5rem, 4vw, 2rem)', color: 'white'}}>{p.player} <span style={{color: 'var(--accent)'}}>Performance Trend</span></h2>
                                 <span style={{color: 'var(--text-muted)', fontSize: 'clamp(0.8rem, 2vw, 1rem)'}}>Detailed interactive game logs vs {p.opponent} and rest of league.</span>
                              </div>
                              <button onClick={() => handleFullCardFlip(p.playerId)} style={{background: 'var(--accent)', border: 'none', color: 'white', padding: '10px 24px', borderRadius: '8px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 15px rgba(139, 92, 246, 0.5)', whiteSpace: 'nowrap'}}>
                                 Close Projection
                              </button>
                           </div>

                           <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                              {trendData?.loading && <div style={{textAlign: 'center', marginTop: '40px', color: 'var(--text-muted)', fontSize: '1.5rem'}}>Booting Projection Matrix...</div>}
                              {trendData?.error && <div style={{color: '#ef4444', textAlign: 'center', fontSize: '1.5rem'}}>Signal Lost. Failed to load trend data.</div>}
                              {!trendData?.loading && trendData?.logs && (
                                 <>
                                   <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                       <span style={{color: 'var(--text-muted)'}}>Target Metric:</span>
                                       <select 
                                         className="dropdown-glass" 
                                         style={{ fontSize: '1.2rem', padding: '8px 16px', fontWeight: 'bold' }}
                                         value={trendData.stat} 
                                         onChange={(e) => setPlayerLogsData(prev => ({...prev, [p.playerId]: {...prev[p.playerId], stat: e.target.value}}))}
                                       >
                                         {['PTS','REB','AST','STL','BLK','TOV','3PM','PRA'].map(s => <option key={s} value={s}>{s}</option>)}
                                       </select>
                                     </div>
                                   </div>
                                   <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
                                     <TrendGraph logs={trendData.logs} statKey={trendData.stat === '3PM' ? 'FG3M' : trendData.stat} />
                                   </div>
                                 </>
                              )}
                           </div>
                        </div>
                     </div>
                   );
                 })}

                {predictionsData.players.length === 0 && (
                   <div style={{gridColumn: '1 / -1', textAlign: 'center', padding: '60px 40px', background: 'rgba(0,0,0,0.2)', borderRadius: '16px', border: '1px solid var(--panel-border)', color: 'var(--text-muted)'}}>
                      <div style={{fontSize: '3rem', marginBottom: '15px'}}>💤</div>
                      <h3 style={{fontSize: '1.5rem', color: 'white', marginBottom: '8px'}}>No Active Slates Found</h3>
                      <p>There are zero daily matchups or active players scheduled for today's NBA slate.<br/>(Try checking back tomorrow when games resume!)</p>
                   </div>
                )}
             </div>
          )}
        </div>
      )}

    </main>
  );
}
