"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePro } from '@/context/ProContext';
import TransparencyWindow from '@/components/TransparencyWindow';
import ExplainerCard from '@/components/ExplainerCard';
import GhostLogo from '@/components/GhostLogo';
import { Ghost, TrendingUp, TrendingDown, Lock, ChevronDown, ChevronUp } from 'lucide-react';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [topOvers, setTopOvers] = useState([]);
  const [topUnders, setTopUnders] = useState([]);
  const [unfilteredWarning, setUnfilteredWarning] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedOvers, setExpandedOvers] = useState(false);
  const [expandedUnders, setExpandedUnders] = useState(false);
  const { isPro } = usePro();

  const sportColor = (sport) => {
    switch (sport) {
      case 'NBA': return 'var(--sport-nba)';
      case 'MLB': return 'var(--sport-mlb)';
      case 'WNBA': return 'var(--sport-wnba)';
      case 'NFL': return 'var(--sport-nfl)';
      default: return 'var(--sport-lab)';
    }
  };

  useEffect(() => {
    // 1. Fetch Global Top 25 Overs + Unders
    fetch('/api/global/top20')
      .then(res => res.json())
      .then(data => {
         if (data.topOvers) setTopOvers(data.topOvers);
         if (data.topUnders) setTopUnders(data.topUnders);
         if (data.unfilteredWarning) setUnfilteredWarning(data.unfilteredWarning);
         setLoading(false);
      })
      .catch(() => setLoading(false));

    // 2. Run the Grader silently in the background
    fetch('/api/memory/grade').catch(() => {});

    // 3. Silently warm ALL sport caches
    fetch('/api/mlb/predictToday').catch(() => {});
    fetch('/api/wnba/predictToday').catch(() => {});
    fetch('/api/nfl/predictToday').catch(() => {});
    fetch('/api/nba/predictToday').catch(() => {});
  }, []);

  const renderBoardRow = (entry, index, isOver) => {
    const accentColor = isOver ? 'var(--over-color)' : 'var(--under-color)';
    const textColor = isOver ? '#00e68a' : '#ff4d6a';
    const borderColor = isOver ? 'rgba(0, 230, 138, 0.1)' : 'rgba(255, 77, 106, 0.1)';
    const sc = sportColor(entry.sport);

    return (
      <ExplainerCard 
        key={`${isOver ? 'over' : 'under'}-${index}`} 
        prediction={entry} 
        sport={entry.sport}
        overlayMode={true}
        triggerType="wrap"
      >
        <div 
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: 'rgba(0,0,0,0.25)', borderRadius: '10px', padding: '10px 14px',
            border: `1px solid ${borderColor}`,
            transition: 'all 0.25s ease',
            height: '100%',
            boxSizing: 'border-box',
            animation: `materialize 0.4s ease-out ${index * 0.05}s both`,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; e.currentTarget.style.borderColor = `${textColor}30`; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.25)'; e.currentTarget.style.borderColor = borderColor; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
            <span className="mono" style={{ fontSize: '0.65rem', color: textColor, fontWeight: 800, minWidth: '22px', flexShrink: 0, opacity: 0.7 }}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.player}</span>
                <span style={{
                  background: `${sc}15`, color: sc, border: `1px solid ${sc}30`,
                  padding: '1px 6px', borderRadius: '4px', fontSize: '0.5rem', fontWeight: 800,
                  letterSpacing: '0.06em', flexShrink: 0, textTransform: 'uppercase',
                }}>
                  {entry.sport}
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'left', marginTop: '2px' }}>
                {entry.team} vs {entry.opponent} · {entry.category}
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '10px' }}>
            <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 900, color: textColor }}>{entry.accuracy}%</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-ghost)', letterSpacing: '0.04em' }}>{entry.totalGames} plays</div>
          </div>
        </div>
      </ExplainerCard>
    );
  };

  // Freemium: limit to 5 visible rows if not Pro
  const maxFreeRows = 5;
  const defaultVisibleRows = 4;
  const proOvers = isPro ? topOvers : topOvers.slice(0, maxFreeRows);
  const proUnders = isPro ? topUnders : topUnders.slice(0, maxFreeRows);
  const visibleOvers = expandedOvers ? proOvers : proOvers.slice(0, defaultVisibleRows);
  const visibleUnders = expandedUnders ? proUnders : proUnders.slice(0, defaultVisibleRows);

  return (
    <div style={{ 
       display: 'flex', 
       flexDirection: 'column', 
       minHeight: '100%', 
       background: 'var(--bg-dark)',
       position: 'relative'
    }}>
      
      {/* ═══ HERO SECTION ═══ */}
      <div style={{ 
        textAlign: 'center', 
        padding: '32px 20px 8px',
        position: 'relative',
      }}>
        {/* Ambient glow behind ghost */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '200px',
          height: '120px',
          background: 'radial-gradient(ellipse, rgba(0, 212, 170, 0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <GhostLogo size={48} glowColor="#00d4aa" animate={true} />
        
        <h1 style={{ 
          fontFamily: 'var(--font-heading)',
          fontSize: 'clamp(1.4rem, 6vw, 2rem)',
          fontWeight: 900,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          background: 'linear-gradient(135deg, #e8ecf4 30%, #00d4aa 100%)',
          WebkitBackgroundClip: 'text',
          color: 'transparent',
          margin: '8px 0 4px',
        }}>
          Ghhost
        </h1>
        <p style={{ 
          color: 'var(--text-muted)', 
          fontSize: '0.65rem', 
          letterSpacing: '0.2em', 
          textTransform: 'uppercase',
          margin: 0,
        }}>
          Predictive Intelligence
        </p>
      </div>

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div style={{ 
         flex: 1, 
         display: 'flex', 
         flexDirection: 'column',
      }}>
         
         <div style={{ padding: '20px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
               <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--text-main)', letterSpacing: '0.02em' }}>Engine Insights</h2>
               <span style={{ fontSize: '0.65rem', color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Global Genius Boards</span>
            </div>
            <button 
               onClick={() => setShowHistory(!showHistory)}
               style={{ 
                 background: 'rgba(0, 212, 170, 0.06)', 
                 border: '1px solid rgba(0, 212, 170, 0.2)', 
                 color: '#00d4aa', 
                 padding: '6px 14px', 
                 borderRadius: '8px', 
                 cursor: 'pointer', 
                 fontWeight: 700, 
                 display: 'flex', 
                 alignItems: 'center', 
                 gap: '6px',
                 fontSize: '0.72rem',
                 letterSpacing: '0.03em',
                 transition: 'all 0.2s',
               }}
            >
               <Ghost size={14} /> {showHistory ? 'Hide Brain' : 'Brain History'}
            </button>
         </div>

         {showHistory ? (
            <div style={{ padding: '0 20px 30px' }}>
               <TransparencyWindow />
            </div>
         ) : (
            <div style={{ padding: '0 20px 30px' }}>
               {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', padding: '60px 0' }}>
                     <GhostLogo size={40} glowColor="#00d4aa" animate={true} style={{ marginBottom: '16px' }} />
                     <div style={{ fontSize: '0.85rem', animation: 'ghostPulse 2s ease-in-out infinite' }}>Materializing predictions...</div>
                  </div>
               ) : (topOvers.length === 0 && topUnders.length === 0) ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px', fontSize: '0.9rem' }}>
                     No predictions available yet. The engine will populate once games are scheduled.
                  </div>
               ) : (
                  <>
                     {unfilteredWarning && (
                        <div style={{
                           background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)', color: '#f59e0b',
                           padding: '10px 14px', borderRadius: '10px', marginBottom: '16px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '10px'
                        }}>
                           <Ghost size={16} />
                           <div>
                              <strong>Unfiltered Mode:</strong> Prop markets unavailable. Running without bookmaker verification.
                           </div>
                        </div>
                     )}

                     {/* ═══ DUAL GENIUS BOARDS ═══ */}
                     <div style={{
                       display: 'grid',
                       gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
                       gap: '16px',
                     }}>
                       
                       {/* ── TOP OVERS ── */}
                       <div style={{
                         padding: '16px',
                         background: 'linear-gradient(135deg, rgba(0, 230, 138, 0.04), rgba(0, 212, 170, 0.01))',
                         borderRadius: '14px',
                         border: '1px solid rgba(0, 230, 138, 0.12)',
                       }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                           <TrendingUp size={18} color="#00e68a" strokeWidth={2.5} />
                           <h3 style={{ fontSize: '0.95rem', color: '#00e68a', margin: 0, fontWeight: 800, letterSpacing: '0.02em' }}>
                             Top {topOvers.length} Overs
                           </h3>
                           <span style={{ fontSize: '0.55rem', color: 'var(--text-ghost)', marginLeft: 'auto', letterSpacing: '0.08em', textTransform: 'uppercase' }}>All Sports</span>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                           {topOvers.length === 0 ? (
                             <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '0.8rem' }}>
                               No high-accuracy overs found today.
                             </div>
                           ) : (
                             <>
                               {visibleOvers.map((entry, i) => renderBoardRow(entry, i, true))}
                               
                               {/* Expand / Collapse */}
                               {proOvers.length > defaultVisibleRows && (
                                 <button 
                                   onClick={() => setExpandedOvers(!expandedOvers)} 
                                   style={{ 
                                     width: '100%', marginTop: '4px', padding: '7px', 
                                     background: 'rgba(0, 230, 138, 0.05)', 
                                     border: '1px dashed rgba(0, 230, 138, 0.15)', 
                                     color: '#00e68a', borderRadius: '8px', cursor: 'pointer', 
                                     fontSize: '0.72rem', fontWeight: 700,
                                     display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                     transition: '0.2s',
                                   }}
                                 >
                                   {expandedOvers ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> Show All {proOvers.length}</>}
                                 </button>
                               )}

                               {/* Freemium Lock */}
                               {!isPro && topOvers.length > maxFreeRows && (
                                 <div style={{
                                   padding: '12px', borderRadius: '8px',
                                   background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.08)',
                                   textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px'
                                 }}>
                                   <Lock size={16} color="#4a5568" />
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                     {topOvers.length - maxFreeRows} more — <strong style={{ color: '#00d4aa' }}>Upgrade to Pro</strong>
                                   </span>
                                 </div>
                               )}
                             </>
                           )}
                         </div>
                       </div>

                       {/* ── TOP UNDERS ── */}
                       <div style={{
                         padding: '16px',
                         background: 'linear-gradient(135deg, rgba(255, 77, 106, 0.04), rgba(220, 38, 38, 0.01))',
                         borderRadius: '14px',
                         border: '1px solid rgba(255, 77, 106, 0.12)',
                       }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                           <TrendingDown size={18} color="#ff4d6a" strokeWidth={2.5} />
                           <h3 style={{ fontSize: '0.95rem', color: '#ff4d6a', margin: 0, fontWeight: 800, letterSpacing: '0.02em' }}>
                             Top {topUnders.length} Unders
                           </h3>
                           <span style={{ fontSize: '0.55rem', color: 'var(--text-ghost)', marginLeft: 'auto', letterSpacing: '0.08em', textTransform: 'uppercase' }}>All Sports</span>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                           {topUnders.length === 0 ? (
                             <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontSize: '0.8rem' }}>
                               No high-accuracy unders found today.
                             </div>
                           ) : (
                             <>
                               {visibleUnders.map((entry, i) => renderBoardRow(entry, i, false))}
                               
                               {/* Expand / Collapse */}
                               {proUnders.length > defaultVisibleRows && (
                                 <button 
                                   onClick={() => setExpandedUnders(!expandedUnders)} 
                                   style={{ 
                                     width: '100%', marginTop: '4px', padding: '7px', 
                                     background: 'rgba(255, 77, 106, 0.05)', 
                                     border: '1px dashed rgba(255, 77, 106, 0.15)', 
                                     color: '#ff4d6a', borderRadius: '8px', cursor: 'pointer', 
                                     fontSize: '0.72rem', fontWeight: 700,
                                     display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                                     transition: '0.2s',
                                   }}
                                 >
                                   {expandedUnders ? <><ChevronUp size={14} /> Show Less</> : <><ChevronDown size={14} /> Show All {proUnders.length}</>}
                                 </button>
                               )}

                               {/* Freemium Lock */}
                               {!isPro && topUnders.length > maxFreeRows && (
                                 <div style={{
                                   padding: '12px', borderRadius: '8px',
                                   background: 'rgba(0,0,0,0.3)', border: '1px dashed rgba(255,255,255,0.08)',
                                   textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px'
                                 }}>
                                   <Lock size={16} color="#4a5568" />
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                                     {topUnders.length - maxFreeRows} more — <strong style={{ color: '#00d4aa' }}>Upgrade to Pro</strong>
                                   </span>
                                 </div>
                               )}
                             </>
                           )}
                         </div>
                       </div>
                     </div>
                  </>
               )}
            </div>
         )}
      </div>
    </div>
  );
}
