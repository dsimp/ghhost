"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { Home, FlaskConical } from 'lucide-react';
import GhostLogo from '@/components/GhostLogo';

/* ── Minimal Sport Icons (inline SVG) ── */
const BasketballIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
    <path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10" />
  </svg>
);

const BaseballIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <path d="M4.93 4.93c4.08 2.03 6.14 6.14 6.14 6.14" />
    <path d="M19.07 19.07c-4.08-2.03-6.14-6.14-6.14-6.14" />
    <path d="M14.5 4a16 16 0 0 0-5 16" />
  </svg>
);

const FootballIcon = ({ size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-45 12 12)" />
    <path d="M9.5 9.5L14.5 14.5" />
    <path d="M11 8l-1-1" />
    <path d="M16 13l1 1" />
    <path d="M13 11l-1-1" />
    <path d="M15 12l1 1" />
  </svg>
);

const tabs = [
  { path: '/', label: 'Home', icon: Home, color: '#00d4aa', isLucide: true },
  { path: '/nba', label: 'NBA', icon: BasketballIcon, color: '#ff8c42' },
  { path: '/mlb', label: 'MLB', icon: BaseballIcon, color: '#4d9fff' },
  { path: '/wnba', label: 'WNBA', icon: BasketballIcon, color: '#ff69b4' },
  { path: '/nfl', label: 'NFL', icon: FootballIcon, color: '#34d399' },
  { path: '/lab', label: 'Lab', icon: FlaskConical, color: '#a78bfa', isLucide: true },
];

export default function GlobalNav({ children }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', background: 'var(--bg-dark)' }}>
      
      {/* ═══ FIXED TOP HEADER ═══ */}
      <header style={{ 
         position: 'fixed', 
         top: 0, 
         left: 0, 
         right: 0, 
         height: '56px', 
         background: 'rgba(4, 6, 9, 0.88)', 
         backdropFilter: 'blur(20px)', 
         WebkitBackdropFilter: 'blur(20px)',
         borderBottom: '1px solid rgba(0, 212, 170, 0.06)',
         display: 'flex', 
         justifyContent: 'space-between', 
         alignItems: 'center', 
         padding: '0 clamp(12px, 3vw, 20px)',
         zIndex: 50,
      }}>
         <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GhostLogo size={24} glowColor="#00d4aa" animate={false} />
            <span style={{ 
               fontSize: 'clamp(1.1rem, 4vw, 1.4rem)', 
               fontFamily: 'var(--font-heading)',
               fontWeight: 900,
               color: '#e8ecf4',
               letterSpacing: '0.06em',
               textTransform: 'uppercase',
            }}>
               Ghhost
            </span>
         </Link>

         <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 2vw, 12px)' }}>
            <Link href="/donate" style={{ textDecoration: 'none' }}>
               <div style={{ 
                 background: 'rgba(0, 212, 170, 0.08)',
                 border: '1px solid rgba(0, 212, 170, 0.25)',
                 color: '#00d4aa',
                 padding: '5px clamp(10px, 2.5vw, 14px)',
                 borderRadius: '8px',
                 fontWeight: 700,
                 fontSize: 'clamp(0.65rem, 1.8vw, 0.75rem)',
                 transition: 'all 0.2s',
                 letterSpacing: '0.04em',
                 textTransform: 'uppercase',
               }}>
                 Donate
               </div>
            </Link>
            {session ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(6px, 2vw, 10px)' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '5px',
                  background: session.user?.isPro ? 'rgba(0, 212, 170, 0.1)' : 'rgba(255,255,255,0.03)',
                  border: session.user?.isPro ? '1px solid rgba(0, 212, 170, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                  padding: '5px clamp(8px, 2vw, 12px)',
                  borderRadius: '8px',
                }}>
                  <span style={{ 
                    fontSize: 'clamp(0.6rem, 1.8vw, 0.7rem)', 
                    fontWeight: 800, 
                    color: session.user?.isPro ? '#00d4aa' : '#4a5568',
                    letterSpacing: '0.06em',
                  }}>
                    {session.user?.isPro ? 'PRO' : 'FREE'}
                  </span>
                </div>
                <div 
                  onClick={() => signOut()}
                  title="Sign Out"
                  style={{ 
                    width: 'clamp(28px, 7vw, 34px)', 
                    height: 'clamp(28px, 7vw, 34px)', 
                    borderRadius: '50%', 
                    background: 'rgba(255,255,255,0.04)', 
                    cursor: 'pointer', 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    overflow: 'hidden', 
                    border: '1px solid rgba(255,255,255,0.06)', 
                    flexShrink: 0,
                    transition: 'border-color 0.2s',
                  }}
                >
                   {session.user?.image ? (
                      <img src={session.user.image} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                   ) : (
                      <span style={{ color: '#e8ecf4', fontSize: '0.9rem', fontWeight: 700 }}>{session.user?.name?.charAt(0) || session.user?.email?.charAt(0) || 'U'}</span>
                   )}
                </div>
              </div>
            ) : (
              <Link href="/login" style={{ textDecoration: 'none' }}>
                <div style={{ 
                  background: '#e8ecf4',
                  color: '#06080f',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  letterSpacing: '0.02em',
                }}>
                  Sign In
                </div>
              </Link>
            )}
         </div>
      </header>

      {/* ═══ MAIN SCROLLABLE CONTENT ═══ */}
      <main style={{ flex: 1, overflowY: 'auto', paddingTop: '56px', paddingBottom: '68px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>
         {children}
      </main>

      {/* ═══ FIXED BOTTOM TAB BAR ═══ */}
      <nav style={{ 
         position: 'fixed', 
         bottom: 0, 
         left: 0, 
         right: 0, 
         height: '68px', 
         background: 'rgba(4, 6, 9, 0.92)', 
         backdropFilter: 'blur(24px)', 
         WebkitBackdropFilter: 'blur(24px)',
         borderTop: '1px solid rgba(0, 212, 170, 0.06)',
         display: 'flex', 
         justifyContent: 'space-around', 
         alignItems: 'center',
         paddingBottom: 'env(safe-area-inset-bottom, 0px)',
         zIndex: 50,
      }}>
         {tabs.map((tab) => {
           const isActive = tab.path === '/' ? pathname === '/' : pathname.startsWith(tab.path);
           const IconComponent = tab.icon;

           return (
             <Link 
               key={tab.path}
               href={tab.path} 
               style={{ 
                 textDecoration: 'none', 
                 display: 'flex', 
                 flexDirection: 'column', 
                 alignItems: 'center', 
                 gap: '3px', 
                 flex: 1,
                 position: 'relative',
                 padding: '6px 0',
               }}
             >
               {/* Active indicator dot */}
               {isActive && (
                 <div style={{
                   position: 'absolute',
                   top: '-1px',
                   width: '16px',
                   height: '2px',
                   borderRadius: '2px',
                   background: tab.color,
                   boxShadow: `0 0 8px ${tab.color}60`,
                 }} />
               )}

               <div style={{ 
                  color: isActive ? tab.color : '#2d3748',
                  transition: 'all 0.2s ease',
                  filter: isActive ? `drop-shadow(0 0 6px ${tab.color}50)` : 'none',
               }}>
                  {tab.isLucide ? (
                    <IconComponent size={20} strokeWidth={isActive ? 2 : 1.5} />
                  ) : (
                    <IconComponent size={20} color={isActive ? tab.color : '#2d3748'} />
                  )}
               </div>

               <span style={{ 
                 fontSize: '0.6rem', 
                 fontWeight: isActive ? 700 : 500, 
                 color: isActive ? tab.color : '#2d3748',
                 letterSpacing: '0.04em',
                 transition: 'all 0.2s ease',
                 textTransform: 'uppercase',
               }}>
                 {tab.label}
               </span>
             </Link>
           );
         })}
      </nav>
    </div>
  );
}
