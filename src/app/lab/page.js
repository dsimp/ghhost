"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePro } from '@/context/ProContext';
import { Activity, ShieldAlert, ArrowLeftRight, Database, Swords, Terminal, Send, Sparkles } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════
 * POSITION GROUP CLASSIFIER
 * Maps the raw position string from the API into one of three
 * buckets for the side-by-side matchup view.
 * ═══════════════════════════════════════════════════════════════════ */
const POS_GROUP_ORDER = ['Guards', 'Wings', 'Bigs'];
function classifyPosition(pos) {
  if (!pos) return 'Wings';
  const p = pos.toUpperCase();
  if (p.includes('GUARD') || p === 'PG' || p === 'SG' || p === 'G') return 'Guards';
  if (p.includes('CENTER') || p === 'C') return 'Bigs';
  return 'Wings';
}

/* ═══════════════════════════════════════════════════════════════════
 * DROPDOWN LABEL MAP
 * ═══════════════════════════════════════════════════════════════════ */
const HOOPS_LABELS = {
  PTS: 'Points', REB: 'Rebounds', AST: 'Assists',
  STL: 'Steals', BLK: 'Blocks', '3PM': '3-Pointers',
  TOV: 'Turnovers', PRA: 'PTS+REB+AST'
};
const MLB_HITTER_LABELS = {
  TB: 'Total Bases', H: 'Hits', HR: 'Home Runs',
  R: 'Runs', RBI: 'RBI', SB: 'Stolen Bases', BB: 'Walks'
};

/* ═══════════════════════════════════════════════════════════════════
 * TERMINAL STYLES (The Ghhost Insights Terminal)
 * ═══════════════════════════════════════════════════════════════════ */
const TERMINAL_STYLES = {
  container: {
    background: 'linear-gradient(180deg, rgba(0,0,0,0.95), rgba(10,5,20,0.98))',
    border: '1px solid rgba(168,85,247,0.3)',
    borderRadius: '16px',
    overflow: 'hidden',
    boxShadow: '0 0 30px rgba(168,85,247,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  titleBar: {
    background: 'linear-gradient(90deg, rgba(168,85,247,0.15), rgba(34,197,94,0.08))',
    borderBottom: '1px solid rgba(168,85,247,0.2)',
    padding: '12px 18px',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  titleText: {
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: '0.85rem', fontWeight: 700,
    color: '#a855f7', letterSpacing: '1px',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  statusDot: (active) => ({
    width: '8px', height: '8px', borderRadius: '50%',
    background: active ? '#22c55e' : '#f59e0b',
    boxShadow: active ? '0 0 8px #22c55e' : '0 0 8px #f59e0b',
    animation: active ? 'pulse 2s infinite' : 'none',
  }),
  feed: {
    padding: '16px 18px',
    maxHeight: '320px', overflowY: 'auto',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: '0.78rem', lineHeight: '1.7',
    display: 'flex', flexDirection: 'column', gap: '10px',
  },
  message: (isUser) => ({
    color: isUser ? '#f59e0b' : '#c4b5fd',
    padding: '8px 12px',
    borderRadius: '8px',
    background: isUser ? 'rgba(245,158,11,0.06)' : 'rgba(168,85,247,0.06)',
    borderLeft: `2px solid ${isUser ? '#f59e0b' : 'rgba(168,85,247,0.4)'}`,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  }),
  inputBar: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '12px 18px',
    borderTop: '1px solid rgba(168,85,247,0.15)',
    background: 'rgba(0,0,0,0.5)',
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(168,85,247,0.2)',
    borderRadius: '10px', padding: '10px 14px',
    color: '#e2e8f0',
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: '0.8rem', outline: 'none',
    transition: 'border-color 0.2s',
  },
  sendBtn: (disabled) => ({
    background: disabled ? 'rgba(168,85,247,0.15)' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
    border: 'none', borderRadius: '10px',
    padding: '10px 14px', cursor: disabled ? 'not-allowed' : 'pointer',
    color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.5 : 1, transition: 'all 0.2s',
    boxShadow: disabled ? 'none' : '0 0 12px rgba(168,85,247,0.3)',
  }),
};

export default function LabPage() {
  const { isPro } = usePro();
  
  const [sport, setSport] = useState('NBA');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [cache, setCache] = useState({});
  const [selectedMatchup, setSelectedMatchup] = useState(null);
  
  // Sport-specific filters
  const [hoopsFilter, setHoopsFilter] = useState('PTS');
  const [mlbOrientation, setMlbOrientation] = useState('AWAY_PITCHER');
  const [mlbFilter, setMlbFilter] = useState('TB');

  // ═══════════════════════════════════════════════════
  // GHHOST INSIGHTS TERMINAL STATE
  // ═══════════════════════════════════════════════════
  const [insightMessages, setInsightMessages] = useState([]);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightInput, setInsightInput] = useState('');
  const [insightsFetched, setInsightsFetched] = useState(null); // tracks which matchup was analyzed
  const feedRef = useRef(null);

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
     // Reset insights when sport changes
     setInsightMessages([]);
     setInsightsFetched(null);
  }, [sport, cache]);

  const currentData = cache[sport] || { matchups: [], players: [] };
  const matchups = currentData.matchups;
  
  const activeGame = useMemo(() => {
     if (!selectedMatchup || !matchups) return null;
     return matchups.find(m => `${m.away} @ ${m.home}` === selectedMatchup);
  }, [selectedMatchup, matchups]);

  const activePlayers = useMemo(() => {
     if (!activeGame || !currentData.players) return [];
     return currentData.players.filter(p => p.opponent === activeGame.away || p.opponent === activeGame.home);
  }, [activeGame, currentData]);

  const awayPlayers = useMemo(() => activePlayers.filter(p => !p.isHome), [activePlayers]);
  const homePlayers = useMemo(() => activePlayers.filter(p => p.isHome), [activePlayers]);

  /* ══════════════════════════════════════════════════════════════════
   * SHARED HELPERS
   * ══════════════════════════════════════════════════════════════════ */
  const getStat = (player, category) => {
     const ev = player.evaluations.find(e => e.category === category);
     return ev ? parseFloat(ev.projectedTarget || ev.avg || 0) : 0;
  };

  const getAvg = (player, category) => {
     const ev = player.evaluations.find(e => e.category === category);
     return ev ? parseFloat(ev.avg || 0) : 0;
  };

  const getCall = (player, category) => {
     const ev = player.evaluations.find(e => e.category === category);
     return ev || null;
  };

  /* ═══════════════════════════════════════════════════════════
   * VS BADGE
   * ═══════════════════════════════════════════════════════════ */
  const VsBadge = () => (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: '42px', minWidth: '42px', alignSelf: 'center'
    }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(245,158,11,0.25))',
        border: '1px solid rgba(168,85,247,0.4)',
        borderRadius: '50%', width: '36px', height: '36px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.65rem', fontWeight: 900, color: 'rgba(255,255,255,0.7)',
        letterSpacing: '1px', boxShadow: '0 0 12px rgba(168,85,247,0.3)'
      }}>
        VS
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════
   * PLAYER CARD
   * ═══════════════════════════════════════════════════════════ */
  const PlayerCard = ({ player, statKey, accentColor, isTopPlayer }) => {
    const val = getStat(player, statKey);
    const avg = getAvg(player, statKey);
    const ev = getCall(player, statKey);
    const callColor = ev?.color || 'transparent';

    return (
      <div className="glass-panel" style={{
        padding: '12px 14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: isTopPlayer ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.3)',
        borderLeft: `3px solid ${accentColor}`, transition: 'background 0.2s',
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
            {player.player}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '6px', fontWeight: 'normal' }}>
              {player.position}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Proj: <span style={{ color: 'white', fontWeight: 'bold' }}>{val > 0 ? val.toFixed(1) : '-'}</span>
            <span style={{ margin: '0 6px' }}>|</span>
            Avg: {avg > 0 ? avg.toFixed(1) : '-'}
          </div>
        </div>
        {ev && (
          <div style={{
            fontSize: '0.6rem', fontWeight: 800, color: callColor,
            padding: '3px 8px', borderRadius: '6px',
            background: `${callColor}18`, border: `1px solid ${callColor}40`,
            whiteSpace: 'nowrap'
          }}>
            {ev.call}
          </div>
        )}
      </div>
    );
  };

  /* ═══════════════════════════════════════════════════════════════
   * GHHOST INSIGHTS TERMINAL — Fetch & Render Logic
   * ═══════════════════════════════════════════════════════════════ */

  // Auto-scroll feed to bottom when new messages arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [insightMessages]);

  // Auto-fetch insights when a new matchup is selected
  useEffect(() => {
    if (!activeGame || !activePlayers || activePlayers.length === 0) return;
    const matchupKey = `${sport}_${activeGame.away}_${activeGame.home}`;
    if (insightsFetched === matchupKey) return; // Already fetched

    setInsightsFetched(matchupKey);
    fetchInsights();
  }, [activeGame, activePlayers]);

  const fetchInsights = useCallback(async (question = null) => {
    if (!activeGame || activePlayers.length === 0) return;

    setInsightLoading(true);

    // If it's a user question, add it to the feed immediately
    if (question) {
      setInsightMessages(prev => [...prev, { type: 'user', text: question }]);
    }

    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          activeGame,
          players: activePlayers,
          question,
        }),
      });
      const data = await res.json();

      if (data.insights) {
        const newMessages = data.insights.map(text => ({ type: 'system', text }));
        setInsightMessages(prev => [...prev, ...newMessages]);
      }
    } catch {
      setInsightMessages(prev => [
        ...prev,
        { type: 'system', text: '👻 Connection to the Assembly Line was interrupted. Please try again.' },
      ]);
    } finally {
      setInsightLoading(false);
    }
  }, [activeGame, activePlayers, sport]);

  const handleInsightSubmit = (e) => {
    e.preventDefault();
    const q = insightInput.trim();
    if (!q || insightLoading) return;
    setInsightInput('');
    fetchInsights(q);
  };

  /* ═══════════════════════════════════════════════════════════════
   * RENDER: GHHOST INSIGHTS TERMINAL
   * ═══════════════════════════════════════════════════════════════ */
  const renderInsightsTerminal = () => {
    const hasGame = activeGame && activePlayers.length > 0;

    return (
      <div style={TERMINAL_STYLES.container}>
        {/* Title Bar */}
        <div style={TERMINAL_STYLES.titleBar}>
          <div style={TERMINAL_STYLES.titleText}>
            <Terminal size={16} />
            GHHOST INSIGHTS
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>v2.0</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
              {insightLoading ? 'ANALYZING…' : hasGame ? 'ONLINE' : 'AWAITING DATA'}
            </span>
            <div style={TERMINAL_STYLES.statusDot(!insightLoading && hasGame)} />
          </div>
        </div>

        {/* Feed Area */}
        <div ref={feedRef} style={TERMINAL_STYLES.feed}>
          {!hasGame && insightMessages.length === 0 && (
            <div style={{ color: 'rgba(168,85,247,0.5)', textAlign: 'center', padding: '30px 0', fontStyle: 'italic' }}>
              Select a matchup above to activate the Assembly Line…
            </div>
          )}

          {insightMessages.map((msg, i) => (
            <div key={i} style={TERMINAL_STYLES.message(msg.type === 'user')}>
              {msg.type === 'user' && <span style={{ opacity: 0.6 }}>{'> '}</span>}
              {formatInsightText(msg.text)}
            </div>
          ))}

          {insightLoading && (
            <div style={{ color: '#a855f7', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px' }}>
              <Sparkles size={14} style={{ animation: 'pulse 1.2s infinite' }} />
              <span style={{ animation: 'pulse 1.5s infinite' }}>Ghhost is analyzing the Assembly Line…</span>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form onSubmit={handleInsightSubmit} style={TERMINAL_STYLES.inputBar}>
          <input
            type="text"
            value={insightInput}
            onChange={(e) => setInsightInput(e.target.value)}
            placeholder={hasGame ? 'Ask Ghhost anything… "What if Tatum gets in foul trouble?"' : 'Select a matchup first…'}
            disabled={!hasGame || insightLoading}
            style={{
              ...TERMINAL_STYLES.input,
              cursor: (!hasGame || insightLoading) ? 'not-allowed' : 'text',
            }}
            onFocus={(e) => { e.target.style.borderColor = '#a855f7'; }}
            onBlur={(e) => { e.target.style.borderColor = 'rgba(168,85,247,0.2)'; }}
          />
          <button
            type="submit"
            disabled={!hasGame || insightLoading || !insightInput.trim()}
            style={TERMINAL_STYLES.sendBtn(!hasGame || insightLoading || !insightInput.trim())}
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    );
  };

  // Simple markdown-ish bold formatter for terminal messages
  function formatInsightText(text) {
    if (!text) return text;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: '#e2e8f0', fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  }

  // ==========================================
  // BASKETBALL RENDERING LOGIC (NBA / WNBA)
  // ==========================================
  const renderBasketballMatchup = () => {
     if (!activeGame) return null;

     const groupByPosition = (players) => {
       const groups = { Guards: [], Wings: [], Bigs: [] };
       players.forEach(p => {
         const bucket = classifyPosition(p.position);
         groups[bucket].push(p);
       });
       Object.keys(groups).forEach(k => {
         groups[k].sort((a, b) => getStat(b, hoopsFilter) - getStat(a, hoopsFilter));
       });
       return groups;
     };

     const awayGroups = groupByPosition(awayPlayers);
     const homeGroups = groupByPosition(homePlayers);

     return (
        <div style={{ marginTop: '20px' }}>
           <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
              <select className="dropdown-glass" value={hoopsFilter} onChange={(e) => setHoopsFilter(e.target.value)} style={{ padding: '8px 20px', fontSize: '1.1rem', background: 'rgba(168, 85, 247, 0.15)', border: '1px solid #a855f7', color: 'white', borderRadius: '12px', cursor: 'pointer' }}>
                 {Object.entries(HOOPS_LABELS).map(([key, label]) => (
                    <option key={key} value={key} style={{ color: 'black' }}>{label}</option>
                 ))}
              </select>
           </div>

           <div style={{ display: 'flex', gap: '30px', marginBottom: '15px' }}>
              <h3 style={{ flex: 1, textAlign: 'center', color: '#f59e0b', fontSize: '1.3rem', margin: 0 }}>{activeGame.away}</h3>
              <div style={{ width: '42px' }} />
              <h3 style={{ flex: 1, textAlign: 'center', color: '#a855f7', fontSize: '1.3rem', margin: 0 }}>{activeGame.home}</h3>
           </div>
           
           {POS_GROUP_ORDER.map(group => {
              const awayGroup = awayGroups[group] || [];
              const homeGroup = homeGroups[group] || [];
              if (awayGroup.length === 0 && homeGroup.length === 0) return null;
              const maxLen = Math.max(awayGroup.length, homeGroup.length);
              return (
                <div key={group} style={{ marginBottom: '25px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '12px' }}>
                     <div style={{ height: '1px', background: 'var(--panel-border)', flex: 1 }} />
                     <h4 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '2px', fontWeight: 700 }}>{group}</h4>
                     <div style={{ height: '1px', background: 'var(--panel-border)', flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                     {Array.from({ length: maxLen }).map((_, idx) => (
                        <div key={idx} style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                           <div style={{ flex: 1 }}>
                              {awayGroup[idx] ? (
                                 <PlayerCard player={awayGroup[idx]} statKey={hoopsFilter} accentColor="#f59e0b" isTopPlayer={idx === 0} />
                              ) : (
                                 <div style={{ padding: '12px', opacity: 0.3, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                              )}
                           </div>
                           <VsBadge />
                           <div style={{ flex: 1 }}>
                              {homeGroup[idx] ? (
                                 <PlayerCard player={homeGroup[idx]} statKey={hoopsFilter} accentColor="#a855f7" isTopPlayer={idx === 0} />
                              ) : (
                                 <div style={{ padding: '12px', opacity: 0.3, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                              )}
                           </div>
                        </div>
                     ))}
                  </div>
                </div>
              );
           })}
        </div>
     );
  };

  // ==========================================
  // BASEBALL RENDERING LOGIC (MLB)
  // ==========================================
  const renderBaseballMatchup = () => {
     if (!activeGame) return null;

     if (mlbOrientation === 'FULL_LINEUP') {
        const awayHitters = awayPlayers.filter(p => !p.isPitcher).sort((a,b) => getStat(b, mlbFilter) - getStat(a, mlbFilter));
        const homeHitters = homePlayers.filter(p => !p.isPitcher).sort((a,b) => getStat(b, mlbFilter) - getStat(a, mlbFilter));
        const maxLen = Math.max(awayHitters.length, homeHitters.length);

        return (
           <div style={{ marginTop: '20px' }}>
              {renderMlbToggle()}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
                 <select className="dropdown-glass" value={mlbFilter} onChange={(e) => setMlbFilter(e.target.value)} style={{ padding: '8px 20px', fontSize: '1.05rem', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.4)', color: 'white', borderRadius: '12px', cursor: 'pointer' }}>
                    {Object.entries(MLB_HITTER_LABELS).map(([key, label]) => (
                       <option key={key} value={key} style={{ color: 'black' }}>{label}</option>
                    ))}
                 </select>
              </div>
              <div style={{ display: 'flex', gap: '30px', marginBottom: '15px' }}>
                 <h3 style={{ flex: 1, textAlign: 'center', color: '#f59e0b', fontSize: '1.3rem', margin: 0 }}>{activeGame.away}</h3>
                 <div style={{ width: '42px' }} />
                 <h3 style={{ flex: 1, textAlign: 'center', color: '#a855f7', fontSize: '1.3rem', margin: 0 }}>{activeGame.home}</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                 {Array.from({ length: maxLen }).map((_, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                       <div style={{ flex: 1 }}>
                          {awayHitters[idx] ? (
                             <PlayerCard player={awayHitters[idx]} statKey={mlbFilter} accentColor="#f59e0b" isTopPlayer={idx === 0} />
                          ) : (
                             <div style={{ padding: '12px', opacity: 0.3, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                          )}
                       </div>
                       <VsBadge />
                       <div style={{ flex: 1 }}>
                          {homeHitters[idx] ? (
                             <PlayerCard player={homeHitters[idx]} statKey={mlbFilter} accentColor="#a855f7" isTopPlayer={idx === 0} />
                          ) : (
                             <div style={{ padding: '12px', opacity: 0.3, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                          )}
                       </div>
                    </div>
                 ))}
              </div>
              {awayHitters.length === 0 && homeHitters.length === 0 && (
                 <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>No hitter data available for this matchup.</div>
              )}
           </div>
        );
     }

     const pitcherTeam = mlbOrientation === 'AWAY_PITCHER' ? activeGame.away : activeGame.home;
     const hitterTeam = mlbOrientation === 'AWAY_PITCHER' ? activeGame.home : activeGame.away;
     const teamPlayers = mlbOrientation === 'AWAY_PITCHER' ? awayPlayers : homePlayers;
     let startingPitcher = teamPlayers.find(p => p.isPitcher);
     const hitterTeamPlayers = mlbOrientation === 'AWAY_PITCHER' ? homePlayers : awayPlayers;
     const hitters = hitterTeamPlayers.filter(p => !p.isPitcher);
     const sortedHitters = [...hitters].sort((a,b) => getStat(b, mlbFilter) - getStat(a, mlbFilter));

     return (
        <div style={{ marginTop: '20px' }}>
           {renderMlbToggle()}
           <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '30px' }}>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '10px' }}>
                    <h3 style={{ margin: 0 }}>{hitterTeam} Hitters</h3>
                    <select className="dropdown-glass" value={mlbFilter} onChange={(e) => setMlbFilter(e.target.value)} style={{ padding: '6px 12px', fontSize: '0.9rem', background: 'rgba(255,255,255,0.05)', color: 'white', borderRadius: '8px', cursor: 'pointer' }}>
                       {Object.entries(MLB_HITTER_LABELS).map(([key, label]) => (
                          <option key={key} value={key} style={{ color: 'black' }}>{label}</option>
                       ))}
                    </select>
                 </div>
                 {sortedHitters.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No hitter data available for {hitterTeam}.</div>}
                 {sortedHitters.map((p, i) => (
                    <PlayerCard key={p.playerId} player={p} statKey={mlbFilter} accentColor="var(--accent)" isTopPlayer={i === 0} />
                 ))}
              </div>
           </div>
        </div>
     );
  };

  const renderMlbToggle = () => (
    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
       <button onClick={() => setMlbOrientation('AWAY_PITCHER')} style={{ padding: '8px 18px', borderRadius: '12px 0 0 12px', background: mlbOrientation === 'AWAY_PITCHER' ? 'var(--accent)' : 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid var(--panel-border)', cursor: 'pointer', fontWeight: mlbOrientation === 'AWAY_PITCHER' ? 700 : 400, transition: 'all 0.2s' }}>Away Pitcher</button>
       <button onClick={() => setMlbOrientation('FULL_LINEUP')} style={{ padding: '8px 18px', borderRadius: '0', background: mlbOrientation === 'FULL_LINEUP' ? 'var(--accent)' : 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid var(--panel-border)', borderLeft: 'none', borderRight: 'none', cursor: 'pointer', fontWeight: mlbOrientation === 'FULL_LINEUP' ? 700 : 400, transition: 'all 0.2s' }}>
          <Swords size={14} style={{ marginRight: '5px', verticalAlign: 'middle' }} />
          Head-to-Head
       </button>
       <button onClick={() => setMlbOrientation('HOME_PITCHER')} style={{ padding: '8px 18px', borderRadius: '0 12px 12px 0', background: mlbOrientation === 'HOME_PITCHER' ? 'var(--accent)' : 'rgba(0,0,0,0.4)', color: 'white', border: '1px solid var(--panel-border)', cursor: 'pointer', fontWeight: mlbOrientation === 'HOME_PITCHER' ? 700 : 400, transition: 'all 0.2s' }}>Home Pitcher</button>
    </div>
  );

  // ==========================================
  // FOOTBALL RENDERING LOGIC (NFL)
  // ==========================================
  const renderFootballMatchup = () => {
     if (!activeGame) return null;

     const renderPosGroup = (position, label, statKey) => {
        const awayPos = awayPlayers.filter(p => p.position === position).sort((a,b) => getStat(b, statKey) - getStat(a, statKey));
        const homePos = homePlayers.filter(p => p.position === position).sort((a,b) => getStat(b, statKey) - getStat(a, statKey));
        if (awayPos.length === 0 && homePos.length === 0) return null;
        const maxLen = Math.max(awayPos.length, homePos.length);
        return (
           <div style={{ marginBottom: '30px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px' }}>
                 <div style={{ height: '1px', background: 'var(--panel-border)', flex: 1 }}></div>
                 <h4 style={{ margin: 0, color: 'var(--accent)', textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '2px' }}>{label} ({statKey})</h4>
                 <div style={{ height: '1px', background: 'var(--panel-border)', flex: 1 }}></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                 {Array.from({ length: maxLen }).map((_, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '0', alignItems: 'stretch' }}>
                       <div style={{ flex: 1 }}>
                          {awayPos[idx] ? (
                             <PlayerCard player={awayPos[idx]} statKey={statKey} accentColor="#f59e0b" isTopPlayer={idx === 0} />
                          ) : (
                             <div style={{ padding: '12px', opacity: 0.3, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                          )}
                       </div>
                       <VsBadge />
                       <div style={{ flex: 1 }}>
                          {homePos[idx] ? (
                             <PlayerCard player={homePos[idx]} statKey={statKey} accentColor="#a855f7" isTopPlayer={idx === 0} />
                          ) : (
                             <div style={{ padding: '12px', opacity: 0.3, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)' }}>—</div>
                          )}
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        );
     };

     return (
        <div style={{ marginTop: '20px' }}>
           <div style={{ display: 'flex', gap: '30px', marginBottom: '20px' }}>
              <h3 style={{ flex: 1, textAlign: 'center', color: '#f59e0b', fontSize: '1.4rem' }}>{activeGame.away} (Away)</h3>
              <div style={{ width: '42px' }}></div>
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
                {matchups.map((m, idx) => {
                   const gameStr = `${m.away} @ ${m.home}`;
                   const isSel = selectedMatchup === gameStr;
                   return (
                      <div 
                         key={`${gameStr}-${idx}`}
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

             {/* ══════════════════════════════════════════════════
              * GHHOST INSIGHTS TERMINAL — rendered below matchups
              * ══════════════════════════════════════════════════ */}
             <div style={{ marginTop: '30px' }}>
                {renderInsightsTerminal()}
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
