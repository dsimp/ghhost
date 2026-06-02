"use client";

import React, { useState, useEffect, useMemo } from 'react';
import FieldMap from '@/components/FieldMap';
import TrendGraph from '@/components/TrendGraph';
import { ShieldAlert, Crosshair, Target, Zap, Activity, AlertTriangle, Search, Navigation } from 'lucide-react';
import { usePro } from '@/context/ProContext';

export default function MLBHome() {
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [mode, setMode] = useState('HITTER'); 
  
  const [selectedEntity, setSelectedEntity] = useState(null); 
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [playerStats, setPlayerStats] = useState(null);
  const [hitData, setHitData] = useState([]);
  
  const [opponentFilter, setOpponentFilter] = useState('');
  const [activeZone, setActiveZone] = useState(null);

  const [predictionsData, setPredictionsData] = useState(null);
  const [predictorLoading, setPredictorLoading] = useState(false);
  const [activePredictorTab, setActivePredictorTab] = useState('OVERS');
  
  const [targetStat, setTargetStat] = useState('TB'); 
  const { isPro } = usePro();
  const [spatialResults, setSpatialResults] = useState({});
  const [riskResults, setRiskResults] = useState({});

  const [flippedCards, setFlippedCards] = useState({});
  const [h2hData, setH2hData] = useState({});
  const [predictorTrends, setPredictorTrends] = useState({});
  
  const [selectedGameFilter, setSelectedGameFilter] = useState('');
  const [flippedFullCards, setFlippedFullCards] = useState({});
  const [playerLogsData, setPlayerLogsData] = useState({});

  useEffect(() => {
    Promise.all([
      fetch('/api/mlb/players').then(res => res.json()),
      fetch('/api/mlb/teams').then(res => res.json())
    ]).then(([playersData, teamsData]) => {
      if (!playersData.error) setPlayers(Array.isArray(playersData) ? playersData : (playersData.players || []));
      if (!teamsData.error) setTeams(Array.isArray(teamsData) ? teamsData : (teamsData.teams || []));
    }).catch(err => console.error("Initial load err", err));
  }, []);

  const runRiskEngine = async (playerId, opponentName, opponentAbbr, isHomeGame) => {
    setRiskResults(prev => ({...prev, [playerId]: { loading: true }}));
    try {
      const statsRes = await fetch(`/api/mlb/playerStats?playerId=${playerId}`);
      const stats = await statsRes.json();
      if(stats.error || !stats.gameLogs) throw new Error("Failed fetching context logs");

      const logs = stats.gameLogs;
      if(logs.length === 0) throw new Error("No tracking game logs available.");

      const recentLogs = logs.slice(0, 5); 
      const locLogs = logs.filter(l => l.isHome === isHomeGame);
      const h2hLogs = logs.filter(l => l.opponent && l.opponentAbbr === opponentAbbr);
      
      const calcAvg = (arr, stat) => arr.length > 0 ? (arr.reduce((acc, l) => acc + l[stat], 0) / arr.length).toFixed(1) : 0;
      
      let warnings = [];
      let highlights = [];
      let riskScore = 0; 
      
      // Analyze variance anomalies across fundamental categories
      ['H', 'HR', 'RBI', 'TB'].forEach(stat => {
         const catName = stat;
         const seasonBase = parseFloat(calcAvg(logs, stat));
         if (seasonBase < 0.5) return; 
         
         const recentBase = parseFloat(calcAvg(recentLogs, stat));
         const locBase = parseFloat(calcAvg(locLogs, stat));
         
         if (recentBase < seasonBase * 0.7) {
            warnings.push(`Recent Slump: Averaging only ${recentBase} ${catName} over Last 5 (Season: ${seasonBase}).`);
            riskScore++;
         } else if (recentBase > seasonBase * 1.3) {
            highlights.push(`Hot Streak: Surging with ${recentBase} ${catName} over Last 5.`);
         }

         if (locLogs.length > 0 && locBase < seasonBase * 0.8) {
            warnings.push(`Travel Impact: Averages drop to ${locBase} ${catName} in ${isHomeGame ? 'Home' : 'Away'} games.`);
            riskScore++;
         }

         if (h2hLogs.length > 0) {
            const h2hBase = parseFloat(calcAvg(h2hLogs, stat));
            if (h2hBase < seasonBase * 0.6) {
               warnings.push(`Matchup Blocked: Only averaged ${h2hBase} ${catName} vs ${opponentName} earlier this season.`);
               riskScore += 2; // high weight
            }
         }
      });
      
      warnings = [...new Set(warnings)];
      highlights = [...new Set(highlights)];

      let finalRisk = 'LOW RISK';
      let riskColor = '#22c55e';
      if (riskScore >= 4) { finalRisk = 'EXTREME RISK'; riskColor = '#ef4444'; }
      else if (riskScore >= 2) { finalRisk = 'MODERATE RISK'; riskColor = '#f59e0b'; }

      let rhythmArray = "N/A";
      if (recentLogs.length > 0) {
        rhythmArray = [...recentLogs].reverse().map(l => l.H).join(' → ');
      }

      const lastGame = logs.length > 0 ? logs[0] : null;

      let h2hAverages = null;
      if (h2hLogs.length > 0) {
         h2hAverages = {
            H: calcAvg(h2hLogs, 'H'),
            HR: calcAvg(h2hLogs, 'HR'),
            RBI: calcAvg(h2hLogs, 'RBI'),
            TB: calcAvg(h2hLogs, 'TB'),
            K: calcAvg(h2hLogs, 'K'),
            BB: calcAvg(h2hLogs, 'BB'),
            games: h2hLogs.length
         };
      }
      
      if (lastGame) {
         if (!h2hAverages) h2hAverages = { H: 'N/A', HR: 'N/A', RBI: 'N/A', TB: 'N/A', K: 'N/A', BB: 'N/A', games: 0 };
         h2hAverages.lastGameH = lastGame.H;
         h2hAverages.lastGameHR = lastGame.HR;
         h2hAverages.lastGameRBI = lastGame.RBI;
         h2hAverages.lastGameTB = lastGame.TB;
         h2hAverages.lastGameOpp = lastGame.opponent;
      }

      setRiskResults(prev => ({...prev, [playerId]: {
         loaded: true, loading: false, warnings, highlights, finalRisk, riskColor, rhythmArray, h2hAverages
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
      const statsRes = await fetch(`/api/mlb/playerStats?playerId=${playerId}`);
      const stats = await statsRes.json();
      if(stats.error || !stats.gameLogs) throw new Error("Failed");
      const h2hLogs = stats.gameLogs.filter(l => l.opponent && l.opponentAbbr === opponentAbbr);
      const lastGame = stats.gameLogs.length > 0 ? stats.gameLogs[0] : null;
      const calcAvg = (arr, stat) => arr.length > 0 ? (arr.reduce((acc, l) => acc + l[stat], 0) / arr.length).toFixed(1) : 'N/A';
      
      const avgs = {
        h: calcAvg(h2hLogs, 'H'),
        hr: calcAvg(h2hLogs, 'HR'),
        rbi: calcAvg(h2hLogs, 'RBI'),
        tb: calcAvg(h2hLogs, 'TB'),
        k: calcAvg(h2hLogs, 'K'),
        bb: calcAvg(h2hLogs, 'BB'),
        games: h2hLogs.length,
        lastGameH: lastGame ? lastGame.H : '-',
        lastGameHr: lastGame ? lastGame.HR : '-',
        lastGameRbi: lastGame ? lastGame.RBI : '-',
        lastGameTb: lastGame ? lastGame.TB : '-',
        lastGameOpp: lastGame ? lastGame.opponent : '-'
      };

      setH2hData(prev => ({...prev, [playerId]: { loading: false, data: avgs }}));
    } catch (e) {
      setH2hData(prev => ({...prev, [playerId]: { loading: false, error: "Error" }}));
    }
  };

  const runSpatialEngine = async (playerId, isPitcher, playerName) => {
     setSpatialResults(prev => ({...prev, [playerId]: { loading: true } }));
     try {
       const [playerRes] = await Promise.all([
          fetch(`/api/mlb/hitChart?playerId=${playerId}&isPitcher=${isPitcher}`)
       ]);
       const data = await playerRes.json();
       
       if (data.error || !data.sprayChart) throw new Error("Failed fetching spray chart");
       
       const sprayStats = data.sprayChart;
       
       let hotZone = null; let max = 0;
       Object.keys(sprayStats).forEach(z => {
          if (sprayStats[z] > max) { max = sprayStats[z]; hotZone = z; }
       });
       if (!hotZone) throw new Error("Not enough hit data");
       
       const totalHits = Object.values(sprayStats).reduce((a, b) => a + b, 0);
       const pPct = ((max / totalHits) * 100).toFixed(1);
       
       let call = isPitcher ? 'PULL HEAVY ALLOWED' : 'PULL HITTER';
       let color = '#f59e0b';

       if (pPct > 40) { call = 'EXTREME TENDENCY'; color = '#ef4444'; }
       else if (pPct < 25) { call = 'SPRAY HITTER'; color = '#22c55e'; }
       
       setSpatialResults(prev => ({...prev, [playerId]: {
          loaded: true, loading: false, hotZone, pPct, call, color
       }}));
     } catch (e) {
       setSpatialResults(prev => ({...prev, [playerId]: { loading: false, error: e.message } }));
     }
  };

  const handleSelect = async (entity) => {
    setSelectedEntity(entity);
    setSearchTerm(entity.name || entity.fullName);
    setOpponentFilter(''); 
    setActiveZone(null);
    setLoading(true);
    setError('');

    try {
      const isPitcher = mode === 'PITCHER';
      const [statsRes, hitRes] = await Promise.all([
        fetch(`/api/mlb/playerStats?playerId=${entity.id}`),
        fetch(`/api/mlb/hitChart?playerId=${entity.id}&isPitcher=${isPitcher}`)
      ]);
      const stats = await statsRes.json();
      const hits = await hitRes.json();
      if (stats.error) throw new Error(stats.error);
      
      setPlayerStats(stats);
      setHitData(hits.simulatedHits || []);
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
       const res = await fetch('/api/mlb/predictToday');
       const data = await res.json();
       if(data.error) throw new Error(data.error);
       setPredictionsData(data);
      } catch (err) {
         setError(err.message || 'Failed loading Daily Predictor.');
      } finally {
         setPredictorLoading(false);
      }
  };

  const handleFullCardFlip = async (playerId) => {
    // Freemium Lock
    if (!isPro) {
       alert("Trend Graphs are exclusive to Ghhost Pro members. Upgrade to unlock!");
       return;
    }
    
    setFlippedFullCards(prev => ({ ...prev, [playerId]: !prev[playerId] }));

    if (playerLogsData[playerId]) return;

    setPlayerLogsData(prev => ({...prev, [playerId]: { loading: true }}));
    try {
      const statsRes = await fetch(`/api/mlb/playerStats?playerId=${playerId}`);
      const stats = await statsRes.json();
      if(stats.error || !stats.gameLogs) throw new Error("Failed");
      
      setPlayerLogsData(prev => ({...prev, [playerId]: { loading: false, logs: stats.gameLogs }}));
    } catch (e) {
      setPlayerLogsData(prev => ({...prev, [playerId]: { loading: false, error: "Error" }}));
    }
  };


  const loadPredictorTrend = async (pitcherId) => {
    if (predictorTrends[pitcherId]) {
      // Toggle off if already loaded
      setPredictorTrends(prev => {
        const next = {...prev};
        delete next[pitcherId];
        return next;
      });
      return;
    }
    setPredictorTrends(prev => ({...prev, [pitcherId]: { loading: true, stat: 'ER' }}));
    try {
      const statsRes = await fetch(`/api/mlb/playerStats?playerId=${pitcherId}`);
      const stats = await statsRes.json();
      if(stats.error) throw new Error("Failed");
      setPredictorTrends(prev => ({...prev, [pitcherId]: { loading: false, logs: stats.gameLogs, stat: 'ER' }}));
    } catch (e) {
      setPredictorTrends(prev => ({...prev, [pitcherId]: { loading: false, error: e.message }}));
    }
  };

  const onModeToggle = (newMode) => {
    setMode(newMode);
    setSelectedEntity(null);
    setSearchTerm('');
    setHitData([]);
    setPlayerStats(null);
    setActiveZone(null);
    
    if (newMode === 'PREDICTOR' && !predictionsData) {
       loadPredictor();
    }
  };

  const filteredHits = useMemo(() => {
    if (!hitData) return [];
    let filtered = hitData;
    if (activeZone) {
      filtered = filtered.filter(s => s.zone === activeZone);
    }
    return filtered;
  }, [hitData, activeZone]);

  const filteredStats = useMemo(() => {
    if (!playerStats?.gameLogs) return null;
    let logs = playerStats.gameLogs;
    if (opponentFilter) {
      logs = logs.filter(log => log.opponent === opponentFilter);
    }
    if (logs.length === 0) return null;
    
    if (mode === 'HITTER') {
        const sum = logs.reduce((acc, log) => {
           acc.H += log.H || 0; acc.HR += log.HR || 0; acc.RBI += log.RBI || 0;
           acc.TB += log.TB || 0; acc.SB += log.SB || 0; acc.K += log.K || 0; acc.BB += log.BB || 0;
           return acc;
        }, { H: 0, HR: 0, RBI: 0, TB: 0, SB: 0, K: 0, BB: 0 });

        const games = logs.length;
        return {
           games,
           H: (sum.H / games).toFixed(1), HR: (sum.HR / games).toFixed(1),
           RBI: (sum.RBI / games).toFixed(1), TB: (sum.TB / games).toFixed(1),
           SB: (sum.SB / games).toFixed(1), K: (sum.K / games).toFixed(1), BB: (sum.BB / games).toFixed(1)
        };
    } else {
        const sum = logs.reduce((acc, log) => {
            acc.K += log.K || 0; acc.ER += log.ER || 0; acc.IP += parseFloat(log.IP) || 0;
            return acc;
        }, { K: 0, ER: 0, IP: 0 });
        
        const games = logs.length;
        const era = sum.IP > 0 ? (sum.ER * 9 / sum.IP).toFixed(2) : '0.00';
        return {
           games,
           K: (sum.K / games).toFixed(1),
           ER: (sum.ER / games).toFixed(1),
           IP: (sum.IP / games).toFixed(1),
           ERA: era
        };
    }
  }, [playerStats, opponentFilter, mode]);

  const activeSearchList = mode === 'PREDICTOR' ? [] : players;

  return (
    <main className="main-container">
      <header className="header">
        <h1>{mode === 'PREDICTOR' ? 'MLB Daily Predictor Engine' : (mode === 'HITTER' ? 'Hitter Predictive Engine' : 'Pitcher Defense Analytics')}</h1>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => onModeToggle('HITTER')} style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'HITTER' ? 'var(--accent)' : 'transparent', border: '1px solid var(--accent)', color: 'white', cursor: 'pointer', transition: '0.3s' }}>
            <Crosshair style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/> Hitter Evaluation
          </button>
          <button onClick={() => onModeToggle('PITCHER')} style={{ padding: '8px 24px', borderRadius: '999px', background: mode === 'PITCHER' ? '#8b5cf6' : 'transparent', border: '1px solid #8b5cf6', color: 'white', cursor: 'pointer', transition: '0.3s' }}>
            <ShieldAlert style={{display:'inline', verticalAlign:'middle', marginRight:'8px'}} size={18}/> Pitcher Profile
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
            <input type="text" className="input-glass" placeholder={mode === 'HITTER' ? "Search for a hitter..." : "Search for a pitcher..."} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            {searchTerm && (!selectedEntity || (selectedEntity.fullName || selectedEntity.name).toLowerCase() !== searchTerm.toLowerCase()) && (
               <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel-bg)', borderRadius: '12px', marginTop: '8px', zIndex: 50, maxHeight: '300px', overflowY: 'auto' }}>
                  {activeSearchList.filter(p => (p.fullName || p.name).toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 10).map(item => (
                    <div key={item.id} onClick={() => handleSelect(item)} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}>
                      {item.fullName || item.name}
                    </div>
                  ))}
               </div>
            )}
          </div>
        </section>
      )}

      {loading && <div className="loading">Analyzing MLB datasets...</div>}
      {error && <div style={{color: '#ef4444', textAlign: 'center', marginTop: '20px'}}><ShieldAlert /> {error}</div>}

      {/* PLAYER / TEAM ANALYTICS VIEW */}
      {mode !== 'PREDICTOR' && selectedEntity && !loading && (
        <>
          {mode === 'HITTER' && (
            <div style={{display: 'flex', justifyContent: 'center', marginBottom: '20px', gap: '10px', alignItems: 'center'}}>
               <span style={{color: 'var(--text-muted)'}}>Primary Analytics Filter:</span>
               <select className="dropdown-glass" value={targetStat} onChange={(e) => setTargetStat(e.target.value)}>
                  {['H','HR','RBI','TB','K','BB','SB'].map(s => <option key={s} value={s}>{s}</option>)}
               </select>
            </div>
          )}

          <div className="dashboard-grid">
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                 <div>
                   <h2 style={{ fontSize: '2rem', marginBottom: '8px' }}>{selectedEntity.fullName || selectedEntity.name}</h2>
                   <p style={{ color: 'var(--accent)', fontWeight: 600 }}>{mode === 'PITCHER' ? 'Starting Pitcher Defense Profile' : 'Target Category: ' + targetStat}</p>
                 </div>
                 
                 {playerStats?.gameLogs && (
                   <select className="dropdown-glass" value={opponentFilter} onChange={(e) => setOpponentFilter(e.target.value)}>
                     <option value="">vs All Teams (Season Avg)</option>
                     {Array.from(new Set(playerStats.gameLogs.map(l => l.opponent))).sort().map(opp => <option key={opp} value={opp}>vs. {opp}</option>)}
                   </select>
                 )}
              </div>

              {/* Dynamic Stats Output based on new target feature */}
              {filteredStats && mode === 'HITTER' && (
                  <div style={{marginTop: '20px'}}>
                     <div style={{fontSize: '3.5rem', fontWeight: 900, color: '#f8fafc', marginBottom: '5px'}}>
                        {filteredStats[targetStat]} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>{targetStat} / Game</span>
                     </div>
                     <p style={{color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px'}}>
                        Opponent Filter: {opponentFilter ? `Averages computed over ${filteredStats.games} games against the ${opponentFilter}` : `Season long average across all opponents`}
                     </p>
                     
                     <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                        {['H','HR','RBI','TB','K','BB','SB'].filter(s => s!==targetStat).map(s => (
                           <div key={s} style={{background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '8px'}}>
                              <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>{s} </span>
                              <strong style={{fontSize: '1.2rem'}}>{filteredStats[s]}</strong>
                           </div>
                        ))}
                     </div>
                  </div>
              )}

              {filteredStats && mode === 'PITCHER' && (
                  <div style={{marginTop: '20px'}}>
                     <div style={{fontSize: '3.5rem', fontWeight: 900, color: '#f8fafc', marginBottom: '5px'}}>
                        {filteredStats.ERA} <span style={{fontSize: '1rem', color: 'var(--text-muted)'}}>ERA</span>
                     </div>
                     <p style={{color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '20px'}}>
                        Opponent Filter: {opponentFilter ? `Averages computed over ${filteredStats.games} games against the ${opponentFilter}` : `Season long average`}
                     </p>
                     
                     <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                        <div style={{background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '8px'}}>
                           <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>K/G </span>
                           <strong style={{fontSize: '1.2rem'}}>{filteredStats.K}</strong>
                        </div>
                        <div style={{background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '8px'}}>
                           <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>IP/G </span>
                           <strong style={{fontSize: '1.2rem'}}>{filteredStats.IP}</strong>
                        </div>
                        <div style={{background: 'rgba(255,255,255,0.05)', padding: '10px 15px', borderRadius: '8px'}}>
                           <span style={{fontSize: '0.8rem', color: 'var(--text-muted)'}}>ER/G </span>
                           <strong style={{fontSize: '1.2rem'}}>{filteredStats.ER}</strong>
                        </div>
                     </div>
                  </div>
              )}

              {/* Advanced Deep Dive Engines */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                 {/* SPATIAL ENGINE SECTION */}
                 <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                    {!spatialResults[selectedEntity.id]?.loaded && !spatialResults[selectedEntity.id]?.loading && (
                       <button onClick={() => runSpatialEngine(selectedEntity.id, mode === 'PITCHER', selectedEntity.fullName)} style={{ width: '100%', background: 'transparent', border: '1px dashed var(--accent)', color: 'var(--accent)', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', fontSize: '0.8rem' }}>
                          <Target size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Spray Analysis
                       </button>
                    )}
                    {spatialResults[selectedEntity.id]?.loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.8rem' }}>Extracting Maps...</div>}
                    {spatialResults[selectedEntity.id]?.error && <div style={{ color: '#ef4444', textAlign: 'center', fontSize: '0.8rem' }}>{spatialResults[selectedEntity.id].error}</div>}
                    {spatialResults[selectedEntity.id]?.loaded && (
                       <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                             <strong style={{color: 'white', fontSize: '0.8rem'}}>Spray Tendency</strong>
                             <span style={{ color: spatialResults[selectedEntity.id].color, fontWeight: 800, fontSize: '0.7rem' }}>{spatialResults[selectedEntity.id].call}</span>
                          </div>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                             Zone: <strong style={{color: '#f59e0b'}}>{spatialResults[selectedEntity.id].hotZone}</strong> is the most active zone ({spatialResults[selectedEntity.id].pPct}%). 
                          </p>
                       </div>
                    )}
                 </div>

                 {/* CONTEXTUAL RISK ENGINE SECTION */}
                 {mode === 'HITTER' && (
                 <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                    {!riskResults[selectedEntity.id]?.loaded && !riskResults[selectedEntity.id]?.loading && (
                       <button onClick={() => runRiskEngine(selectedEntity.id, opponentFilter || "All", opponentFilter || "ALL", false)} style={{ width: '100%', background: 'transparent', border: '1px dashed #f59e0b', color: '#f59e0b', padding: '8px', borderRadius: '6px', cursor: 'pointer', transition: '0.2s', fontSize: '0.8rem' }}>
                          <AlertTriangle size={14} style={{display:'inline', verticalAlign:'middle', marginRight:'4px'}}/> Context Risk
                       </button>
                    )}
                    {riskResults[selectedEntity.id]?.loading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.8rem' }}>Scanning Game Logs...</div>}
                    {riskResults[selectedEntity.id]?.error && <div style={{ color: '#ef4444', textAlign: 'center', fontSize: '0.8rem' }}>{riskResults[selectedEntity.id].error}</div>}
                    {riskResults[selectedEntity.id]?.loaded && (
                       <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                             <strong style={{color: 'white', fontSize: '0.8rem'}}>Overall Status</strong>
                             <span style={{ color: riskResults[selectedEntity.id].riskColor, fontWeight: 800, fontSize: '0.7rem' }}>{riskResults[selectedEntity.id].finalRisk}</span>
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '6px' }}>
                             Hit Rhythm (Last 5): <strong style={{color: 'white'}}>{riskResults[selectedEntity.id].rhythmArray}</strong>
                          </div>
                          <ul style={{ paddingLeft: '14px', fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                             {riskResults[selectedEntity.id].highlights.map((h, idx) => <li key={`h-${idx}`} style={{color: '#4ade80', marginBottom: '4px'}}>{h}</li>)}
                             {riskResults[selectedEntity.id].warnings.map((w, idx) => <li key={`w-${idx}`} style={{color: '#f87171', marginBottom: '4px'}}>{w}</li>)}
                             {riskResults[selectedEntity.id].warnings.length === 0 && riskResults[selectedEntity.id].highlights.length === 0 && <li>Baseline consistent. No major anomalies.</li>}
                          </ul>
                       </div>
                    )}
                 </div>
                 )}
              </div>
            </div>

            <div className="glass-panel" style={{ position: 'relative' }}>
              <h3 style={{ textAlign: 'center', marginBottom: '16px' }}>Interactive Spray Chart</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', marginBottom: '20px' }}>Simulated hits mapped from zone distribution.</p>
              <FieldMap hits={filteredHits} />
            </div>
            
            {/* TREND GRAPH SECTION */}
            <div className="glass-panel" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ fontSize: '1.5rem' }}>Performance Trend ({mode === 'PITCHER' ? (targetStat === 'ERA' ? 'ER' : targetStat) : targetStat})</h3>
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
                 statKey={mode === 'PITCHER' && targetStat === 'ERA' ? 'ER' : targetStat} 
              />
            </div>
          </div>
        </>
      )}

      {/* PREDICTOR VIEW */}
      {mode === 'PREDICTOR' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
          {predictorLoading && (
             <div className="loading" style={{marginTop: '50px'}}>
                <Activity size={48} style={{display:'block', margin:'0 auto', marginBottom:'10px', color:'#3b82f6'}} className="spinner"/> 
                Booting MLB Ghhost Brain...
             </div>
          )}
          
          {!predictorLoading && predictionsData?.matchups && (
             <div style={{marginBottom: '40px', textAlign: 'center'}}>
                <h2 style={{fontSize: '1.5rem', color: 'var(--text-muted)'}}>Today's Slate ({predictionsData.matchups.length} Matchups Found)</h2>
                <div style={{display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px', flexWrap: 'wrap'}}>
                  {predictionsData.matchups.map((m, i) => {
                    const gameLabel = `${m.away} @ ${m.home}`;
                    const isSelected = selectedGameFilter === gameLabel;
                    return (
                      <div key={i} 
                           onClick={() => setSelectedGameFilter(isSelected ? '' : gameLabel)}
                           style={{
                             background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.05)', 
                             padding: '8px 16px', 
                             borderRadius: '8px', 
                             border: isSelected ? '1px solid #3b82f6' : '1px solid var(--panel-border)',
                             cursor: 'pointer',
                             transition: '0.2s'
                           }}>
                         {m.away} <span style={{color: '#3b82f6'}}>@</span> {m.home}
                      </div>
                    );
                  })}
                </div>
             </div>
          )}

          {!predictorLoading && predictionsData?.players && (
             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 380px), 1fr))', gap: '20px' }}>
                {(() => {
                   let displayList = predictionsData.players.filter(p => !selectedGameFilter || selectedGameFilter.includes(p.opponent));
                   if (!isPro) displayList = displayList.slice(0, 4); // Freemium Lock
                   
                   return displayList.map((pred, idx) => {
                      const isFullFlipped = flippedFullCards[pred.playerId];
                      const trendData = playerLogsData[pred.playerId];
                      
                      return (
                         <div key={idx} style={{ perspective: '1200px', minHeight: '400px' }}>
                           <div style={{
                              position: 'relative',
                              width: '100%',
                              height: '100%',
                              transition: 'transform 0.6s',
                              transformStyle: 'preserve-3d',
                              transform: isFullFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                           }}>
                             {/* FRONT OF CARD */}
                             <div className="glass-panel" style={{ backfaceVisibility: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', borderTop: pred.isPitcher ? '4px solid #8b5cf6' : '4px solid #3b82f6' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--panel-border)', paddingBottom: '10px' }}>
                                   <div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <h3 style={{fontSize: '1.3rem', margin: 0}}>{pred.player}</h3>
                                        <span style={{ background: pred.isPitcher ? '#8b5cf6' : '#3b82f6', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 'bold' }}>
                                           {pred.position || (pred.isPitcher ? 'PITCHER' : 'HITTER')}
                                        </span>
                                      </div>
                                      <span style={{color: 'var(--text-muted)', fontSize: '0.85rem'}}>{pred.team} vs {pred.opponent} ({pred.isHome ? 'Home' : 'Away'})</span>
                                   </div>
                                   <button onClick={() => handleFullCardFlip(pred.playerId)} style={{background: 'transparent', border: '1px solid var(--accent)', color: 'white', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer', transition: '0.2s'}}>
                                      📈 Trend
                                   </button>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                   {pred.evaluations.map(evalData => (
                                      <div key={evalData.category} style={{
                                         background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px', 
                                         border: '1px solid var(--panel-border)', display: 'flex', flexDirection: 'column'
                                      }}>
                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 700 }}>{evalData.category}</span>
                                            <span style={{ fontSize: '0.7rem', color: evalData.color, fontWeight: 800, padding: '2px 6px', background: `${evalData.color}20`, borderRadius: '4px' }}>
                                               {evalData.call}
                                            </span>
                                         </div>
                                         <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '2px' }}>{evalData.avg}</div>
                                         <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{evalData.oppDesc.replace('Matchup: ', '')}</div>
                                      </div>
                                   ))}
                                </div>

                                <div style={{ marginTop: '15px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
                                   {pred.evaluations.map((evalData, eIdx) => {
                                      const alerts = [];
                                      if (evalData.spatialDesc) alerts.push({ text: evalData.spatialDesc, color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.1)', border: 'rgba(245, 158, 11, 0.3)', icon: '🎯' });
                                      if (evalData.streakDesc) alerts.push({ text: evalData.streakDesc, color: evalData.call.includes('OVER') ? '#4ade80' : '#f87171', bg: evalData.call.includes('OVER') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', border: evalData.call.includes('OVER') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)', icon: '⚡' });
                                      if (evalData.memoryDesc) alerts.push({ text: evalData.memoryDesc.replace('👻', '').trim(), color: '#f472b6', bg: 'rgba(236, 72, 153, 0.1)', border: 'rgba(236, 72, 153, 0.3)', icon: '👻' });
                                      
                                      return alerts.map((al, aIdx) => (
                                         <div key={`${eIdx}-${aIdx}`} style={{ 
                                            fontSize: '0.75rem', 
                                            padding: '6px', 
                                            borderRadius: '6px', 
                                            background: al.bg, 
                                            color: al.color,
                                            border: `1px solid ${al.border}`
                                         }}>
                                            <strong>{evalData.category}:</strong> {al.icon} {al.text}
                                         </div>
                                      ));
                                   })}
                                </div>
                             </div>

                             {/* BACK OF CARD: TREND GRAPH */}
                             <div className="glass-panel" style={{
                                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                                backfaceVisibility: 'hidden', transform: 'rotateY(180deg)',
                                display: 'flex', flexDirection: 'column',
                                background: 'rgba(20, 20, 25, 0.95)', border: '1px solid var(--accent)'
                             }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                   <h3 style={{fontSize: '1.1rem'}}>{pred.player} Last 10</h3>
                                   <button onClick={() => handleFullCardFlip(pred.playerId)} style={{background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem'}}>✕</button>
                                </div>
                                <div style={{ flex: 1, position: 'relative' }}>
                                   {trendData?.loading ? (
                                      <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>Extracting Game Logs...</div>
                                   ) : trendData?.error ? (
                                      <div style={{ color: '#ef4444', textAlign: 'center', marginTop: '40px' }}>Failed to load trend data.</div>
                                   ) : trendData?.logs ? (
                                      <TrendGraph 
                                         logs={trendData.logs.slice(0, 10)} 
                                         statKey={pred.isPitcher ? (pred.evaluations[0]?.category === 'K' ? 'strikeOuts' : 'earnedRuns') : 'TB'} 
                                      />
                                   ) : null}
                                </div>
                                <div style={{ textAlign: 'center', marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                   Target Line shown in Orange.
                                </div>
                             </div>
                           </div>
                         </div>
                      );
                   });
                })()}

                {/* FREEMIUM UPSELL CARD */}
                {!isPro && predictionsData.players.length > 4 && (
                   <div className="glass-panel upsell-card" style={{
                      background: 'rgba(20, 20, 25, 0.3)',
                      border: `1px dashed rgba(255,255,255,0.2)`,
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
                      <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', padding: '20px' }}>
                         <span style={{ fontSize: '3rem' }}>🔒</span>
                         <h3 style={{ margin: 0, color: 'white', fontSize: '1.5rem', fontWeight: 800 }}>Unlock Full Slate</h3>
                         <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.4' }}>
                            Ghhost Pro members get access to unlimited daily MLB predictions, Interactive Trend Graphs, and the AI Autopsy Memory Engine.
                         </p>
                         <button style={{
                            marginTop: '10px',
                            background: 'linear-gradient(135deg, #f472b6, #c026d3)',
                            color: 'white',
                            border: 'none',
                            padding: '12px 30px',
                            borderRadius: '30px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                            boxShadow: '0 4px 15px rgba(236, 72, 153, 0.4)'
                         }}>
                            Upgrade to Pro
                         </button>
                      </div>
                   </div>
                )}
             </div>
          )}
        </div>
      )}

    </main>
  );
}
