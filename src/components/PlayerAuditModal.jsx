"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Ghost, X, TrendingUp, TrendingDown, CheckCircle2, XCircle, 
  MinusCircle, BarChart3, ShieldCheck, Zap, Calendar, RefreshCw
} from 'lucide-react';

export default function PlayerAuditModal({ player, onClose }) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'HITS' | 'MISSES'

  useEffect(() => {
    setMounted(true);
    if (!player || !player.playerId || !player.category) {
      setLoading(false);
      setError('Invalid player selection');
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const fetchHistory = async () => {
      try {
        const url = `/api/memory/player-history?playerId=${encodeURIComponent(player.playerId)}&category=${encodeURIComponent(player.category)}&sport=${encodeURIComponent(player.sport || '')}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (isMounted) {
          setData(json);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error('Failed to load audit history:', err);
          setError('Failed to load prediction history');
          setLoading(false);
        }
      }
    };

    fetchHistory();

    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      isMounted = false;
      document.body.style.overflow = 'auto';
    };
  }, [player]);

  if (!mounted || !player) return null;

  const sportColor = (sport) => {
    switch (sport) {
      case 'NBA': return 'var(--sport-nba)';
      case 'MLB': return 'var(--sport-mlb)';
      case 'WNBA': return 'var(--sport-wnba)';
      case 'NFL': return 'var(--sport-nfl)';
      default: return '#00d4aa';
    }
  };

  const sc = sportColor(player.sport);

  const filteredHistory = data?.history ? data.history.filter(item => {
    if (filter === 'HITS') return item.hit === true;
    if (filter === 'MISSES') return item.hit === false;
    return true;
  }) : [];

  const modalContent = (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: 'rgba(4, 6, 12, 0.82)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        animation: 'fadeIn 0.2s ease-out forwards',
      }}
      onClick={onClose}
    >
      <div 
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          background: 'linear-gradient(180deg, rgba(16, 20, 32, 0.98) 0%, rgba(10, 12, 20, 0.99) 100%)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderBottom: 'none',
          boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.6), 0 0 30px rgba(0, 212, 170, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Drag Indicator Handle */}
        <div style={{ padding: '10px 0 4px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: '38px', height: '4px', borderRadius: '2px', background: 'rgba(255, 255, 255, 0.2)' }} />
        </div>

        {/* Modal Header */}
        <div style={{
          padding: '12px 20px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px',
              background: `${sc}15`, border: `1px solid ${sc}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              <Ghost size={20} color={sc} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {player.player || data?.player?.name || 'Player'}
                </h3>
                <span style={{
                  background: `${sc}20`, color: sc, border: `1px solid ${sc}40`,
                  padding: '2px 7px', borderRadius: '5px', fontSize: '0.6rem', fontWeight: 800,
                  letterSpacing: '0.08em', textTransform: 'uppercase'
                }}>
                  {player.sport || data?.player?.sport}
                </span>
              </div>
              <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {player.category} Engine Prediction Audit & Transparency Log
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'var(--text-muted)',
              width: '32px', height: '32px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
              transition: '0.2s'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '50px 0', color: 'var(--text-muted)', gap: '12px' }}>
              <RefreshCw size={28} className="spin" color="#00d4aa" />
              <span style={{ fontSize: '0.82rem', letterSpacing: '0.05em' }}>Auditing past engine predictions...</span>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#ff4d6a', fontSize: '0.85rem' }}>
              {error}
            </div>
          ) : (
            <>
              {/* ═══ MATHEMATICAL SCIENCE HIGHLIGHTS ═══ */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '10px'
              }}>
                {/* Accuracy Score Pill */}
                <div style={{
                  background: 'rgba(0, 212, 170, 0.05)',
                  border: '1px solid rgba(0, 212, 170, 0.2)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    <ShieldCheck size={14} color="#00d4aa" /> True Hit Rate
                  </div>
                  <div className="mono" style={{ fontSize: '1.4rem', fontWeight: 900, color: '#00d4aa' }}>
                    {data?.summary?.hitRate}%
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-ghost)' }}>
                    {data?.summary?.hits} Hits / {data?.summary?.totalPlays} Plays
                  </div>
                </div>

                {/* Over vs Under Split */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    <BarChart3 size={14} color="#3b82f6" /> Over / Under
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '2px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#00e68a' }}>
                      O: {data?.summary?.over?.hitRate}%
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ff4d6a' }}>
                      U: {data?.summary?.under?.hitRate}%
                    </span>
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-ghost)' }}>
                    {data?.summary?.over?.total} Overs · {data?.summary?.under?.total} Unders
                  </div>
                </div>

                {/* Line Delta / Precision */}
                <div style={{
                  background: 'rgba(255, 255, 255, 0.025)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>
                    <Zap size={14} color="#a855f7" /> Line Delta
                  </div>
                  <div className="mono" style={{ fontSize: '1.05rem', fontWeight: 800, color: data?.summary?.precision?.avgDiff >= 0 ? '#00e68a' : '#ff4d6a' }}>
                    {data?.summary?.precision?.avgDiff >= 0 ? `+${data?.summary?.precision?.avgDiff}` : data?.summary?.precision?.avgDiff} Avg
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-ghost)' }}>
                    Target: {data?.summary?.precision?.avgTarget} vs Actual: {data?.summary?.precision?.avgActual}
                  </div>
                </div>
              </div>

              {/* ═══ RECENT CHRONOLOGICAL STREAK TIMELINE ═══ */}
              {data?.summary?.streak && data.summary.streak.length > 0 && (
                <div style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-ghost)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                    Recent Chronological Track Record (Last {data.summary.streak.length} Games)
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                    {data.summary.streak.map((st, i) => (
                      <div 
                        key={i} 
                        title={`${st.date} - ${st.call}: ${st.status}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: st.status === 'HIT' ? 'rgba(0, 230, 138, 0.15)' : (st.status === 'MISS' ? 'rgba(255, 77, 106, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                          border: `1px solid ${st.status === 'HIT' ? 'rgba(0, 230, 138, 0.3)' : (st.status === 'MISS' ? 'rgba(255, 77, 106, 0.3)' : 'rgba(245, 158, 11, 0.3)')}`,
                          color: st.status === 'HIT' ? '#00e68a' : (st.status === 'MISS' ? '#ff4d6a' : '#f59e0b'),
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          flexShrink: 0
                        }}
                      >
                        {st.status === 'HIT' ? <CheckCircle2 size={11} /> : (st.status === 'MISS' ? <XCircle size={11} /> : <MinusCircle size={11} />)}
                        <span>{st.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══ CHRONOLOGICAL AUDIT LOG SECTION ═══ */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.02em' }}>
                    Historical Audit Log ({filteredHistory.length})
                  </div>

                  {/* Filter Pills */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['ALL', 'HITS', 'MISSES'].map(f => (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        style={{
                          background: filter === f ? 'rgba(0, 212, 170, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                          border: filter === f ? '1px solid rgba(0, 212, 170, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                          color: filter === f ? '#00d4aa' : 'var(--text-muted)',
                          padding: '3px 9px',
                          borderRadius: '6px',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: '0.2s'
                        }}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredHistory.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    No prediction logs match the selected filter.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filteredHistory.map((item, idx) => {
                      const isHit = item.hit === true;
                      const isMiss = item.hit === false;
                      const isPush = item.hit === null;

                      const statusBg = isHit ? 'rgba(0, 230, 138, 0.06)' : (isMiss ? 'rgba(255, 77, 106, 0.06)' : 'rgba(245, 158, 11, 0.06)');
                      const statusBorder = isHit ? 'rgba(0, 230, 138, 0.2)' : (isMiss ? 'rgba(255, 77, 106, 0.2)' : 'rgba(245, 158, 11, 0.2)');
                      const statusColor = isHit ? '#00e68a' : (isMiss ? '#ff4d6a' : '#f59e0b');

                      return (
                        <div
                          key={item.id || idx}
                          style={{
                            background: statusBg,
                            border: `1px solid ${statusBorder}`,
                            borderRadius: '10px',
                            padding: '10px 14px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '10px'
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                {item.dateKey}
                              </span>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                {item.isHome ? 'vs' : '@'} {item.opponent}
                              </span>
                              <span style={{
                                background: item.call.includes('OVER') ? 'rgba(0,230,138,0.1)' : 'rgba(255,77,106,0.1)',
                                color: item.call.includes('OVER') ? '#00e68a' : '#ff4d6a',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontSize: '0.58rem',
                                fontWeight: 800
                              }}>
                                {item.call} {item.target}
                              </span>
                            </div>

                            {item.contextNote && (
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-ghost)', marginTop: '2px' }}>
                                💡 {item.contextNote}
                              </div>
                            )}
                          </div>

                          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {isHit && <CheckCircle2 size={13} color="#00e68a" />}
                              {isMiss && <XCircle size={13} color="#ff4d6a" />}
                              {isPush && <MinusCircle size={13} color="#f59e0b" />}
                              <span className="mono" style={{ fontSize: '0.85rem', fontWeight: 900, color: statusColor }}>
                                {item.actualResult !== null ? `${item.actualResult} actual` : 'Push'}
                              </span>
                            </div>

                            {item.diff !== null && (
                              <span style={{ fontSize: '0.6rem', color: item.diff >= 0 ? '#00e68a' : '#ff4d6a', fontWeight: 700 }}>
                                {item.diff >= 0 ? `+${item.diff}` : item.diff} from line
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
