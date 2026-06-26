"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';

export default function GlobalNav({ children }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg-dark)' }}>
      
      {/* FIXED TOP HEADER */}
      <header style={{ 
         position: 'fixed', 
         top: 0, 
         left: 0, 
         right: 0, 
         height: '60px', 
         background: 'rgba(10, 10, 12, 0.85)', 
         backdropFilter: 'blur(16px)', 
         borderBottom: '1px solid rgba(255,255,255,0.05)',
         display: 'flex', 
         justifyContent: 'space-between', 
         alignItems: 'center', 
         padding: '0 clamp(10px, 3vw, 20px)',
         zIndex: 50,
         maxWidth: '1400px', 
         margin: '0 auto'
      }}>
         <Link href="/" style={{ textDecoration: 'none' }}>
            <h1 style={{ 
               fontSize: 'clamp(1.4rem, 5vw, 1.8rem)', 
               background: 'linear-gradient(to right, #ffffff, #a1a1aa)', 
               WebkitBackgroundClip: 'text', 
               color: 'transparent', 
               letterSpacing: '-0.02em', 
               fontWeight: 900,
               margin: 0
            }}>
               Ghhost
            </h1>
         </Link>
         <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 2vw, 15px)' }}>
            <Link href="/donate" style={{ textDecoration: 'none' }}>
               <div style={{ 
                 background: 'rgba(139, 92, 246, 0.2)',
                 border: '1px solid var(--accent)',
                 color: 'white',
                 padding: '6px clamp(8px, 2vw, 12px)',
                 borderRadius: '20px',
                 fontWeight: 'bold',
                 fontSize: 'clamp(0.7rem, 2vw, 0.8rem)',
                 transition: 'all 0.2s',
                 boxShadow: '0 0 10px rgba(139, 92, 246, 0.3)'
               }}>
                 Donate
               </div>
            </Link>
            {session ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  background: session.user?.isPro ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255,255,255,0.05)',
                  border: session.user?.isPro ? '1px solid rgba(236, 72, 153, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                  padding: '6px clamp(8px, 2vw, 12px)',
                  borderRadius: '20px',
                }}>
                  <span style={{ fontSize: 'clamp(0.65rem, 2vw, 0.75rem)', fontWeight: 'bold', color: session.user?.isPro ? '#f472b6' : '#a1a1aa' }}>
                    {session.user?.isPro ? 'PRO' : 'FREE'}
                  </span>
                </div>
                <div 
                  onClick={() => signOut()}
                  title="Sign Out"
                  style={{ width: 'clamp(32px, 8vw, 40px)', height: 'clamp(32px, 8vw, 40px)', borderRadius: '50%', background: '#111', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}
                >
                   {session.user?.image ? (
                      <img src={session.user.image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                   ) : (
                      <span style={{ color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{session.user?.name?.charAt(0) || session.user?.email?.charAt(0) || 'U'}</span>
                   )}
                </div>
              </div>
            ) : (
              <Link href="/login" style={{ textDecoration: 'none' }}>
                <div style={{ 
                  background: 'white',
                  color: 'black',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontWeight: 'bold',
                  fontSize: '0.85rem'
                }}>
                  Sign In
                </div>
              </Link>
            )}
         </div>
      </header>

      {/* MAIN SCROLLABLE CONTENT */}
      {/* Padding top 60px for header, padding bottom 80px for tab bar */}
      <main style={{ flex: 1, overflowY: 'auto', paddingTop: '60px', paddingBottom: '80px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
         {children}
      </main>

      {/* FIXED BOTTOM TAB BAR */}
      <nav style={{ 
         position: 'fixed', 
         bottom: 0, 
         left: 0, 
         right: 0, 
         height: '80px', 
         background: 'rgba(15, 15, 18, 0.95)', 
         backdropFilter: 'blur(20px)', 
         borderTop: '1px solid rgba(255,255,255,0.08)',
         display: 'flex', 
         justifyContent: 'space-around', 
         alignItems: 'center',
         paddingBottom: '5px', // slightly nudge up from absolute bottom
         zIndex: 50,
         maxWidth: '1400px',
         margin: '0 auto'
      }}>
         
         <Link href="/" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/' ? 'drop-shadow(0 0 8px rgba(255,255,255,0.5))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🏠
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/' ? 'white' : 'var(--text-muted)', transition: 'all 0.2s' }}>Home</span>
         </Link>

         <Link href="/nba" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/nba' ? 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🏀
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/nba' ? '#f97316' : 'var(--text-muted)', transition: 'all 0.2s' }}>NBA</span>
         </Link>

         <Link href="/mlb" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/mlb' ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               ⚾
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/mlb' ? '#3b82f6' : 'var(--text-muted)', transition: 'all 0.2s' }}>MLB</span>
         </Link>

         <Link href="/wnba" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/wnba' ? 'drop-shadow(0 0 8px rgba(236, 72, 153, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🏀
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/wnba' ? '#ec4899' : 'var(--text-muted)', transition: 'all 0.2s' }}>WNBA</span>
         </Link>

         <Link href="/nfl" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/nfl' ? 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🏈
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/nfl' ? '#22c55e' : 'var(--text-muted)', transition: 'all 0.2s' }}>NFL</span>
         </Link>

         <Link href="/lab" style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', flex: 1 }}>
            <div style={{ 
               fontSize: '1.5rem', 
               filter: pathname === '/lab' ? 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.8))' : 'grayscale(100%) opacity(50%)',
               transition: 'all 0.2s'
            }}>
               🧪
            </div>
            <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: pathname === '/lab' ? '#a855f7' : 'var(--text-muted)', transition: 'all 0.2s' }}>The Lab</span>
         </Link>

      </nav>
    </div>
  );
}
