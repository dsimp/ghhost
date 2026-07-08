"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePro } from '@/context/ProContext';
import TransparencyWindow from '@/components/TransparencyWindow';
import { Ghost, TrendingUp, TrendingDown } from 'lucide-react';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [topOvers, setTopOvers] = useState([]);
  const [topUnders, setTopUnders] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const { isPro } = usePro();

  const sportColor = (sport) => {
    switch (sport) {
      case 'NBA': return '#f97316';
      case 'MLB': return '#3b82f6';
      case 'WNBA': return '#ec4899';
      case 'NFL': return '#10b981';
      default: return '#8b5cf6';
    }
  };

  useEffect(() => {
    // 1. Fetch Global Top 25 Overs + Unders
    fetch('/api/global/top20')
      .then(res => res.json())
      .then(data => {
         if (data.topOvers) setTopOvers(data.topOvers);
         if (data.topUnders) setTopUnders(data.topUnders);
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
    const accentColor = isOver ? '#22c55e' : '#ef4444';
    const textColor = isOver ? '#4ade80' : '#f87171';
    const borderColor = isOver ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)';
    const sc = sportColor(entry.sport);

    return (
      <div key={`${isOver ? 'over' : 'under'}-${index}`} style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: 'rgba(0,0,0,0.3)', borderRadius: '10px', padding: '10px 14px',
        border: `1px solid ${borderColor}`,
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${accentColor}15`; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.7rem', color: accentColor, fontWeight: 800, minWidth: '24px', flexShrink: 0 }}>
            #{index + 1}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.player}</span>
              <span style={{
                background: `${sc}22`, color: sc, border: `1px solid ${sc}44`,
                padding: '1px 6px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 800,
                letterSpacing: '0.04em', flexShrink: 0
              }}>
                {entry.sport}
              </span>
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'left' }}>
              {entry.team} vs {entry.opponent} · {entry.category}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '10px' }}>
          <div style={{ fontSize: '1.1rem', fontWeight: 900, color: textColor }}>{entry.accuracy}%</div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{entry.totalGames} plays</div>
        </div>
      </div>
    );
  };

  // Freemium: limit to 5 visible rows if not Pro
  const visibleOvers = isPro ? topOvers : topOvers.slice(0, 5);
  const visibleUnders = isPro ? topUnders : topUnders.slice(0, 5);

  return (
    <div style={{ 
       display: 'flex', 
       flexDirection: 'column', 
       minHeight: '100%', 
       background: 'var(--bg-dark)',
       position: 'relative'
    }}>
      
      {/* MAIN CONTENT AREA */}
      <div style={{ 
         flex: 1, 
         display: 'flex', 
         flexDirection: 'column',
         background: 'linear-gradient(to bottom, rgba(255,255,255,0.02), transparent)',
         borderTopLeftRadius: '24px',
         borderTopRightRadius: '24px',
         borderTop: '1px solid rgba(255,255,255,0.05)'
      }}>
         
         <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '15px' }}>
            <div>
               <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, color: 'white' }}>Daily Plays</h2>
               <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global Genius Boards — All Sports</span>
            </div>
            <button 
               onClick={() => setShowHistory(!showHistory)}
               style={{ background: 'rgba(236, 72, 153, 0.15)', border: '1px solid #f472b6', color: '#f472b6', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
               <Ghost size={18} /> {showHistory ? 'Hide Brain History' : 'View Brain History'}
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
                     <div className="spinner" style={{ fontSize: '2rem', marginBottom: '15px' }}>⏳</div>
                     <div style={{ fontSize: '0.9rem' }}>Booting Ghhost Brain...</div>
                  </div>
               ) : (topOvers.length === 0 && topUnders.length === 0) ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px' }}>
                     No predictions available yet. The engine will populate once games are scheduled and caches are warmed.
                  </div>
               ) : (
                  <>
                     {/* ═══ DUAL GENIUS BOARDS ═══ */}
                     <div style={{
                       display: 'grid',
                       gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
                       gap: '20px',
                     }}>
                       
                       {/* TOP 25 OVERS */}
                       <div style={{
                         padding: '20px',
                         background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.08), rgba(16, 185, 129, 0.03))',
                         borderRadius: '16px',
                         border: '1px solid rgba(34, 197, 94, 0.25)'
                       }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                           <TrendingUp size={22} color="#22c55e" />
                           <h3 style={{ fontSize: '1.2rem', color: '#4ade80', margin: 0, fontWeight: 800 }}>
                             Top {topOvers.length} Overs
                           </h3>
                           <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>ALL SPORTS</span>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '700px', overflowY: 'auto' }}>
                           {topOvers.length === 0 ? (
                             <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontSize: '0.85rem' }}>
                               No high-accuracy overs found today.
                             </div>
                           ) : (
                             <>
                               {visibleOvers.map((entry, i) => renderBoardRow(entry, i, true))}
                               
                               {/* Freemium Lock */}
                               {!isPro && topOvers.length > 5 && (
                                 <div style={{
                                   padding: '16px', borderRadius: '10px',
                                   background: 'rgba(0,0,0,0.4)', border: '1px dashed rgba(255,255,255,0.15)',
                                   textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                                 }}>
                                   <span style={{ fontSize: '1.5rem' }}>🔒</span>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                     {topOvers.length - 5} more overs — <strong style={{ color: '#f472b6' }}>Upgrade to Pro</strong>
                                   </span>
                                 </div>
                               )}
                             </>
                           )}
                         </div>
                       </div>

                       {/* TOP 25 UNDERS */}
                       <div style={{
                         padding: '20px',
                         background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(220, 38, 38, 0.03))',
                         borderRadius: '16px',
                         border: '1px solid rgba(239, 68, 68, 0.25)'
                       }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                           <TrendingDown size={22} color="#ef4444" />
                           <h3 style={{ fontSize: '1.2rem', color: '#f87171', margin: 0, fontWeight: 800 }}>
                             Top {topUnders.length} Unders
                           </h3>
                           <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>ALL SPORTS</span>
                         </div>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '700px', overflowY: 'auto' }}>
                           {topUnders.length === 0 ? (
                             <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '30px 0', fontSize: '0.85rem' }}>
                               No high-accuracy unders found today.
                             </div>
                           ) : (
                             <>
                               {visibleUnders.map((entry, i) => renderBoardRow(entry, i, false))}

                               {/* Freemium Lock */}
                               {!isPro && topUnders.length > 5 && (
                                 <div style={{
                                   padding: '16px', borderRadius: '10px',
                                   background: 'rgba(0,0,0,0.4)', border: '1px dashed rgba(255,255,255,0.15)',
                                   textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px'
                                 }}>
                                   <span style={{ fontSize: '1.5rem' }}>🔒</span>
                                   <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                     {topUnders.length - 5} more unders — <strong style={{ color: '#f472b6' }}>Upgrade to Pro</strong>
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

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spinner {
           animation: spin 2s linear infinite;
        }
      `}</style>
    </div>
  );
}
