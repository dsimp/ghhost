'use client';
import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Zap, Clock, Calendar, Check, ShieldAlert } from 'lucide-react';

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [customAmount, setCustomAmount] = useState('5');
  const [isCustomMode, setIsCustomMode] = useState(false);

  const handleCheckout = async (planType, priceIdOrAmount) => {
    if (!session) {
      router.push('/login');
      return;
    }
    
    setError(null);

    // Validate 72-Hour Pass Custom Amount
    let finalAmount = null;
    if (planType === 'donation') {
      finalAmount = isCustomMode ? parseFloat(customAmount) : priceIdOrAmount;
      if (isNaN(finalAmount) || finalAmount < 5) {
        setError('Minimum donation is $5.00 USD.');
        return;
      }
    }

    setLoading(true);

    try {
      const payload = planType === 'donation' 
        ? { type: 'donation', amount: finalAmount }
        : { type: 'subscription', priceId: priceIdOrAmount };

      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error || 'Failed to initialize checkout.');
        setLoading(false);
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '60px 20px', maxWidth: '1200px', margin: '0 auto', color: 'white' }}>
      <div style={{ textAlign: 'center', marginBottom: '60px' }}>
        <h1 style={{ fontSize: '3rem', fontWeight: 'bold', marginBottom: '15px', background: 'linear-gradient(to right, #ffffff, #a1a1aa)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
          Choose Your Edge
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.2rem', maxWidth: '600px', margin: '0 auto' }}>
          Get instant access to the AI predictive engine. Support the servers, unlock the daily predictions, and level up your sports knowledge.
        </p>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '15px', borderRadius: '12px', textAlign: 'center', maxWidth: '600px', margin: '0 auto 30px auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <ShieldAlert size={20} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'row', gap: '30px', justifyContent: 'center', flexWrap: 'wrap' }}>
        
        {/* Tier 1: 72-Hour Pass */}
        <div className="glass-panel" style={{ flex: '1', minWidth: '300px', maxWidth: '350px', padding: '40px 30px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#94a3b8' }}>
            <Clock size={24} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>72-Hour Pass</h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '30px', minHeight: '40px' }}>
            Perfect for the weekend slate. Support Ghhost and get immediate short-term access.
          </p>
          
          <div style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span style={{ fontSize: '2.5rem', fontWeight: 'bold' }}>$5+</span>
              <span style={{ color: 'var(--text-muted)' }}>/ one-time</span>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '40px' }}>
            {['$5', '$10', 'Custom'].map(val => (
              <div key={val}>
                <button
                  onClick={() => {
                    if (val === 'Custom') setIsCustomMode(true);
                    else { setIsCustomMode(false); handleCheckout('donation', parseInt(val.replace('$', ''))); }
                  }}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.05)',
                    color: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontWeight: '500'
                  }}
                  onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseOut={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                >
                  {val === 'Custom' ? 'Custom Donation' : `Donate ${val}`}
                </button>
              </div>
            ))}
            
            {isCustomMode && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
                <input 
                  type="number"
                  min="5"
                  value={customAmount}
                  onChange={e => setCustomAmount(e.target.value)}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid var(--accent)', background: 'rgba(0,0,0,0.5)', color: 'white', outline: 'none' }}
                  placeholder="Amount"
                />
                <button 
                  onClick={() => handleCheckout('donation', null)}
                  style={{ padding: '0 20px', borderRadius: '8px', background: 'var(--accent)', color: 'white', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
                >
                  Go
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tier 2: Monthly (Highlighted) */}
        <div className="glass-panel" style={{ flex: '1', minWidth: '320px', maxWidth: '380px', padding: '40px 30px', display: 'flex', flexDirection: 'column', border: '2px solid var(--accent)', position: 'relative', transform: 'scale(1.05)', zIndex: 10, boxShadow: '0 10px 40px rgba(139, 92, 246, 0.2)' }}>
          <div style={{ position: 'absolute', top: '-15px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: 'white', padding: '5px 15px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 'bold', letterSpacing: '1px', textTransform: 'uppercase' }}>
            Recommended
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#c084fc' }}>
            <Zap size={24} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Monthly Pro</h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '30px', minHeight: '40px' }}>
            Consistent daily predictions across all sports. Auto-renews every month.
          </p>
          
          <div style={{ marginBottom: '30px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
              <span style={{ fontSize: '3rem', fontWeight: 'bold' }}>$20</span>
              <span style={{ color: 'var(--text-muted)' }}>/ month</span>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '15px', marginBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Check size={18} color="#a855f7" /> <span>Full MLB, NBA, NFL access</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Check size={18} color="#a855f7" /> <span>Live Memory Bank History</span></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><Check size={18} color="#a855f7" /> <span>Cancel anytime</span></div>
          </div>

          <button 
            onClick={() => handleCheckout('subscription', process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY)}
            disabled={loading}
            style={{ width: '100%', padding: '16px', borderRadius: '12px', background: 'var(--accent)', color: 'white', fontSize: '1.1rem', fontWeight: 'bold', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', marginTop: 'auto' }}
          >
            Subscribe Monthly
          </button>
        </div>

        {/* Tier 3: 6-Month / Annual */}
        <div className="glass-panel" style={{ flex: '1', minWidth: '300px', maxWidth: '350px', padding: '40px 30px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', color: '#38bdf8' }}>
            <Calendar size={24} />
            <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>Long Term</h2>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginBottom: '30px', minHeight: '40px' }}>
            For the serious sports enthusiast. Lock in a discounted rate upfront.
          </p>
          
          <div style={{ marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
            
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                 <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>6 Months</span>
                 <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>$100</span>
               </div>
               <div style={{ fontSize: '0.85rem', color: '#4ade80' }}>Saves $20</div>
               <button 
                  onClick={() => handleCheckout('subscription', process.env.NEXT_PUBLIC_STRIPE_PRICE_6MONTH)}
                  style={{ width: '100%', marginTop: '15px', padding: '10px', borderRadius: '8px', background: 'transparent', color: '#38bdf8', border: '1px solid #38bdf8', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Select 6-Month
                </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '15px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                 <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>1 Year</span>
                 <span style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>$180</span>
               </div>
               <div style={{ fontSize: '0.85rem', color: '#4ade80' }}>Saves $60 (Best Value)</div>
               <button 
                  onClick={() => handleCheckout('subscription', process.env.NEXT_PUBLIC_STRIPE_PRICE_ANNUAL)}
                  style={{ width: '100%', marginTop: '15px', padding: '10px', borderRadius: '8px', background: 'transparent', color: '#38bdf8', border: '1px solid #38bdf8', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  Select Annual
                </button>
            </div>

          </div>
          
        </div>

      </div>
    </div>
  );
}
