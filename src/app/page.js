"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePro } from '@/context/ProContext';
import TransparencyWindow from '@/components/TransparencyWindow';
import { Ghost } from 'lucide-react';

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [topOvers, setTopOvers] = useState([]);
  const [topUnders, setTopUnders] = useState([]);
  const [activeTab, setActiveTab] = useState('OVERS'); // 'OVERS' or 'UNDERS'
  const [showHistory, setShowHistory] = useState(false);
  const [globalLocks, setGlobalLocks] = useState([]);
  const { isPro } = usePro();

  useEffect(() => {
    // 1. Fetch Global Top 20 Instantly
    fetch('/api/global/top20')
      .then(res => res.json())
      .then(globalData => {
         if (globalData.topLocks) {
            setGlobalLocks(globalData.topLocks);
         }
      })
      .catch(console.error);

    // 2. Run the Grader silently in the background so Actual Results stay updated
    fetch('/api/memory/grade').catch(() => {});

    // 3. Silently warm ALL sport caches so the Genius Board covers every sport
    fetch('/api/mlb/predictToday').catch(() => {});
    fetch('/api/wnba/predictToday').catch(() => {});
    fetch('/api/nfl/predictToday').catch(() => {});

    // 3. Fetch NBA Predictions (Heavy, takes longer)
    fetch('/api/nba/predictToday')
      .then(res => res.json())
      .then(nbaData => {
         if (!nbaData.players) { setLoading(false); return; }
         
         let allEvals = [];
         nbaData.players.forEach(p => {
            p.evaluations.forEach(ev => {
               allEvals.push({ 
                  ...ev, 
                  player: p.player, 
                  team: p.team, 
                  opponent: p.opponentAbbr, 
                  isHome: p.isHome 
               });
            });
         });
         
         const strongOvers = allEvals
             .filter(e => e.call === 'STRONG OVER')
             .sort((a,b) => b.confidence !== a.confidence ? b.confidence - a.confidence : a.rank - b.rank);
             
         const strongUnders = allEvals
             .filter(e => e.call === 'STRONG UNDER')
             .sort((a,b) => b.confidence !== a.confidence ? b.confidence - a.confidence : b.rank - a.rank);

         setTopOvers(strongOvers.slice(0, 5));
         setTopUnders(strongUnders.slice(0, 5));
         setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const renderPredictionCard = (pred, index) => {
     const isOver = activeTab === 'OVERS';
     const baseColor = isOver ? '#22c55e' : '#ef4444';
     const glowColor = isOver ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
     
     return (
        <div key={`${pred.player}-${pred.category}-${index}`} className="swipe-card" style={{
           background: 'rgba(20, 20, 25, 0.6)',
           backdropFilter: 'blur(12px)',
           border: `1px solid rgba(255,255,255,0.05)`,
           borderTop: `3px solid ${baseColor}`,
           borderRadius: '16px',
           padding: '16px',
           display: 'flex',
           flexDirection: 'column',
           justifyContent: 'space-between',
           boxShadow: `0 8px 32px ${glowColor}`,
           flex: '0 0 85%', /* Takes up 85% of the mobile screen so the next card peeks out */
           scrollSnapAlign: 'center',
           height: '100%',
        }}>
           
           {/* Top Info */}
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                 <span style={{ fontWeight: '800', fontSize: '1.2rem', color: 'white', letterSpacing: '-0.02em' }}>{pred.player}</span>
                 <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: '600' }}>
                    {pred.team} {pred.isHome ? 'vs' : '@'} {pred.opponent}
                 </span>
              </div>
              <div style={{ 
                 background: `linear-gradient(135deg, ${baseColor}, ${isOver ? '#15803d' : '#b91c1c'})`, 
                 color: 'white', 
                 padding: '4px 10px', 
                 borderRadius: '20px', 
                 fontSize: '0.75rem', 
                 fontWeight: 'bold',
                 boxShadow: `0 2px 10px ${glowColor}`
              }}>
                 {pred.confidence}%
              </div>
           </div>
           
           {/* Big Stat Display (Normal Season Average) */}
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '15px 0', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '15px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                 <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season Average</span>
                 <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '2.8rem', fontWeight: 900, color: 'white', lineHeight: '1' }}>{pred.avg}</span>
                    <span style={{ fontSize: '1rem', fontWeight: '800', color: baseColor }}>{pred.category}</span>
                 </div>
              </div>
           </div>

           {/* Context Badges (Dense Mobile Layout) */}
           <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div className="context-badge" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
                 <span style={{ fontSize: '1rem' }}>🛡️</span> {pred.oppDesc}
              </div>
              {pred.streakDesc && (
                 <div className="context-badge" style={{ background: pred.streakDesc.includes('⚠️') ? 'rgba(245, 158, 11, 0.1)' : glowColor, color: pred.streakDesc.includes('⚠️') ? '#f59e0b' : baseColor }}>
                    <span style={{ fontSize: '1rem' }}>{pred.streakDesc.includes('🔥') ? '🔥' : pred.streakDesc.includes('🧊') ? '🧊' : '⚠️'}</span> 
                    {pred.streakDesc.replace(/[🔥🧊⚠️]/g, '').trim()}
                 </div>
              )}
              {pred.spatialDesc && (
                 <div className="context-badge" style={{ background: 'rgba(139, 92, 246, 0.1)', color: '#a78bfa' }}>
                    <span style={{ fontSize: '1rem' }}>{pred.spatialDesc.includes('🎯') ? '🎯' : '🛑'}</span> 
                    {pred.spatialDesc.replace(/[🎯🛑]/g, '').trim()}
                 </div>
              )}
              {/* Ghhost Prediction Pinpoint Badge at the bottom in Pink */}
              {pred.memoryDesc && (
                 <div className="context-badge" style={{ background: 'rgba(236, 72, 153, 0.1)', border: '1px solid rgba(236, 72, 153, 0.3)', color: '#f472b6', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Ghost size={16} /> 
                    {pred.memoryDesc.replace(/[👻]/g, '').trim()}
                 </div>
              )}
           </div>
        </div>
     );
  };

  // FREEMIUM LOCK: Slice list to 2 items if not Pro
  const fullList = activeTab === 'OVERS' ? topOvers : topUnders;
  const currentList = isPro ? fullList : fullList.slice(0, 2);

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
               <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Swipe to view</span>
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
            <>
               {/* GLOBAL GENIUS BOARD */}
               {globalLocks.length > 0 && (
                  <div style={{ margin: '0 20px 30px', padding: '20px', background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.05))', borderRadius: '16px', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '16px' }}>
                        <span style={{ fontSize: '1.5rem' }}>🧠</span>
                        <h2 style={{ fontSize: '1.5rem', color: 'white', margin: 0 }}>Top 20 Global Genius Board</h2>
                     </div>
                     <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px', textAlign: 'center' }}>
                        Auto-correcting historical performance log. These are the highest precision locks across ALL live sports today.
                     </p>
                     <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px', scrollSnapType: 'x mandatory' }}>
                        {globalLocks.map((gb, i) => {
                           const sportColor = gb.sport === 'NBA' ? '#f97316' : gb.sport === 'MLB' ? '#3b82f6' : gb.sport === 'WNBA' ? '#ec4899' : '#10b981';
                           const isOver = gb.call.includes('OVER');
                           return (
                           <div key={i} 
                              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px) scale(1.02)'; e.currentTarget.style.boxShadow = `0 16px 48px ${sportColor}22`; }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.4)'; }}
                              style={{ 
                                 minWidth: '260px', scrollSnapAlign: 'start', 
                                 background: 'linear-gradient(145deg, rgba(20,20,35,0.95), rgba(10,10,20,0.98))', 
                                 borderRadius: '16px', padding: '18px', 
                                 border: `1px solid ${sportColor}33`,
                                 textAlign: 'left', position: 'relative',
                                 boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                                 transition: 'transform 0.3s ease, box-shadow 0.3s ease'
                              }}>
                              <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: `linear-gradient(135deg, ${sportColor}, ${sportColor}cc)`, color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.05em', boxShadow: `0 4px 12px ${sportColor}44` }}>
                                 {gb.sport}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: sportColor, fontWeight: 700, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>🏆 Rank #{i+1}</div>
                              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'white', marginBottom: '3px', letterSpacing: '-0.02em' }}>{gb.player}</div>
                              <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '14px', fontWeight: 500 }}>{gb.team} vs {gb.opponent}</div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '10px 12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                 <div>
                                     <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{gb.category}</span>
                                     <div style={{ fontSize: '0.9rem', color: isOver ? '#4ade80' : '#ef4444', fontWeight: 800 }}>{gb.call} {gb.target}</div>
                                 </div>
                                 <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#22c55e', lineHeight: 1 }}>{gb.accuracy}%</div>
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Hit Rate{gb.totalGames ? ` · ${gb.totalGames} plays` : ''}</div>
                                 </div>
                              </div>
                           </div>
                           );
                        })}
                     </div>
                  </div>
               )}

               {/* SEGMENTED TOGGLE (Overs / Unders) */}
         <div style={{ margin: '0 20px 20px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', display: 'flex', padding: '4px' }}>
            <button 
               onClick={() => setActiveTab('OVERS')}
               style={{
                  flex: 1,
                  padding: '10px 0',
                  background: activeTab === 'OVERS' ? '#22c55e' : 'transparent',
                  color: activeTab === 'OVERS' ? 'white' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
               }}
            >
               🔥 Top Overs
            </button>
            <button 
               onClick={() => setActiveTab('UNDERS')}
               style={{
                  flex: 1,
                  padding: '10px 0',
                  background: activeTab === 'UNDERS' ? '#ef4444' : 'transparent',
                  color: activeTab === 'UNDERS' ? 'white' : 'var(--text-muted)',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
               }}
            >
               🧊 Top Unders
            </button>
         </div>

         {/* HORIZONTAL SWIPE CAROUSEL */}
         <div style={{ flex: 1, position: 'relative' }}>
            {loading ? (
               <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                  <div className="spinner" style={{ fontSize: '2rem', marginBottom: '15px' }}>⏳</div>
                  <div style={{ fontSize: '0.9rem' }}>Booting Ghhost Brain...</div>
               </div>
            ) : (
               <div className="carousel-container" style={{
                  display: 'flex',
                  overflowX: 'auto',
                  scrollSnapType: 'x mandatory',
                  gap: '16px',
                  padding: '0 20px 30px', /* Padding bottom for scrollbar/shadows */
                  height: '100%',
                  scrollbarWidth: 'none', /* Hide scrollbar Firefox */
               }}>
                  {currentList.length === 0 ? (
                     <div style={{ flex: '1 0 100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', textAlign: 'center', padding: '0 20px' }}>
                        No high-confidence {activeTab} found for today's slate. Check back later.
                     </div>
                  ) : (
                     <>
                        {currentList.map((pred, idx) => renderPredictionCard(pred, idx))}
                        
                        {/* FREEMIUM UPSELL CARD */}
                        {!isPro && fullList.length > 2 && (
                           <div className="swipe-card upsell-card" style={{
                              background: 'rgba(20, 20, 25, 0.3)',
                              border: `1px dashed rgba(255,255,255,0.2)`,
                              borderRadius: '16px',
                              padding: '24px',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              flex: '0 0 85%',
                              scrollSnapAlign: 'center',
                              height: '100%',
                              textAlign: 'center',
                              position: 'relative',
                              overflow: 'hidden'
                           }}>
                              {/* Background Blur Effect */}
                              <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(8px)', zIndex: 1 }}></div>
                              
                              <div style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                                 <span style={{ fontSize: '3rem' }}>🔒</span>
                                 <h3 style={{ margin: 0, color: 'white', fontSize: '1.2rem', fontWeight: 800 }}>Unlock Full Slate</h3>
                                 <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                                    Ghhost Pro members get access to unlimited daily predictions, deep spatial heatmaps, and the AI Autopsy Memory Engine.
                                 </p>
                                 <button style={{
                                    marginTop: '10px',
                                    background: 'linear-gradient(135deg, #f472b6, #c026d3)',
                                    color: 'white',
                                    border: 'none',
                                    padding: '10px 24px',
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
                     </>
                  )}
               </div>
            )}
         </div>
         </>
         )}
      </div>

      <style>{`
        /* Hide scrollbar for Chrome, Safari and Opera */
        .carousel-container::-webkit-scrollbar {
          display: none;
        }
        
        .context-badge {
           display: flex;
           align-items: center;
           gap: 8px;
           padding: 8px 12px;
           border-radius: 8px;
           font-size: 0.75rem;
           font-weight: 600;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .spinner {
           animation: spin 2s linear infinite;
        }

        /* Responsive Desktop Grid */
        @media (min-width: 768px) {
           .carousel-container {
              display: grid !important;
              grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)) !important;
              overflow-x: visible !important;
              scroll-snap-type: none !important;
              height: auto !important;
           }
           .swipe-card {
              flex: unset !important;
              height: auto !important;
           }
        }
      `}</style>
    </div>
  );
}
