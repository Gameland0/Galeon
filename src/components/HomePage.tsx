import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { alphaAgentService, AlphaSignalPreview, AgentStats } from '../services/alphaAgentService';
import { memeRadarService } from '../services/memeRadarService';
import { MemeRadarSignalPreview } from '../types/memeRadarSignal';
import '../styles/HomePage.css';

const CACHE_KEY = 'galeon_homepage_cache';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

interface DisplaySignal {
  id: string;
  tokenSymbol: string;
  chain?: string;
  createdAt: string;
  source: 'alpha' | 'meme';
  signalType: string;
  currentPrice: number;
  returnPct: number;
}

interface HomeCache {
  stats: AgentStats;
  displaySignals: DisplaySignal[];
  timestamp: number;
}

const toDisplaySignals = (
  alphaList: AlphaSignalPreview[],
  memeList: MemeRadarSignalPreview[]
): DisplaySignal[] => {
  const alpha: DisplaySignal[] = alphaList.map(s => ({
    id: s.signalId,
    tokenSymbol: s.tokenSymbol,
    createdAt: s.createdAt,
    source: 'alpha',
    signalType: s.signalType,
    currentPrice: s.currentPrice,
    returnPct: s.priceChangePercent ?? 0,
  }));
  const meme: DisplaySignal[] = memeList.map(s => {
    const outcome = (s as any).outcome;
    const pnl = outcome?.pnlPct ?? outcome?.highPnl ?? s.priceChange24h ?? 0;
    return {
      id: s.signalId,
      tokenSymbol: s.tokenSymbol,
      chain: s.chain,
      createdAt: s.createdAt,
      source: 'meme',
      signalType: s.signalLevel,
      currentPrice: s.currentPrice,
      returnPct: pnl,
    };
  });
  return [...alpha, ...meme]
    .sort((a, b) => b.returnPct - a.returnPct)
    .slice(0, 6);
};

const getCache = (): HomeCache | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cache: HomeCache = JSON.parse(raw);
    if (Date.now() - cache.timestamp < CACHE_TTL) return cache;
    localStorage.removeItem(CACHE_KEY);
    return null;
  } catch {
    return null;
  }
};

const setCache = (data: Omit<HomeCache, 'timestamp'>) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, timestamp: Date.now() }));
  } catch {}
};

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { getCurrentAccount, isAuthenticated } = useContext(MultiWalletContext);
  const isConnected = !!getCurrentAccount() && isAuthenticated;

  const [stats, setStats] = useState<AgentStats | null>(null);
  const [displaySignals, setDisplaySignals] = useState<DisplaySignal[]>([]);
  const [bestReturn, setBestReturn] = useState<number | null>(null);

  useEffect(() => {
    const cached = getCache();
    if (cached && cached.displaySignals) {
      setStats(cached.stats);
      setDisplaySignals(cached.displaySignals);
      const best = cached.displaySignals.reduce((m, s) => Math.max(m, s.returnPct), 0);
      if (best > 0) setBestReturn(best);
      return;
    }
    localStorage.removeItem(CACHE_KEY); // 清除旧格式缓存

    Promise.all([
      alphaAgentService.getStats(),
      alphaAgentService.getSignals({ status: 'HIT_TP', sortBy: 'confidence', offset: 0, limit: 6 }),
      memeRadarService.getSignals({ status: 'WIN', sortBy: 'time', offset: 0, limit: 6 }),
    ]).then(([statsRes, alphaRes, memeRes]) => {
      const merged = toDisplaySignals(alphaRes.signals || [], memeRes.signals || []);
      setStats(statsRes);
      setDisplaySignals(merged);
      const best = merged.reduce((m, s) => Math.max(m, s.returnPct), 0);
      if (best > 0) setBestReturn(best);
      setCache({ stats: statsRes, displaySignals: merged });
    }).catch(() => {});
  }, []);

  const handleStartTrading = () => {
    if (isConnected) {
      navigate('/alpha-agent?tab=auto-trade');
    } else {
      navigate('/login');
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const maxReturn = Math.max(...displaySignals.map(s => s.returnPct), 1);

  return (
    <div className="home-page">
      {/* HERO */}
      <section className="home-hero">
        <h1>Your <span>AI Trading Edge</span> in Web3</h1>
        <p className="home-hero-desc">
          AI agents discover opportunities, verify token safety, and execute trades on-chain — fully automated, so you don't have to.
        </p>
        <button className="home-hero-cta" onClick={handleStartTrading}>
          Start Trading
        </button>
        <div className="home-hero-sub">No coding required. No manual trading.</div>

        <div className="home-stats-bar">
          <div className="home-stat-item">
            <div className="home-stat-value">
              {stats ? `${stats.winRate.toFixed(1)}%` : '--'}
            </div>
            <div className="home-stat-label">Signal Win Rate</div>
          </div>
          <div className="home-stat-item">
            <div className="home-stat-value">
              {stats ? `${stats.totalSignals.toLocaleString()}+` : '--'}
            </div>
            <div className="home-stat-label">Signals Generated</div>
          </div>
          <div className="home-stat-item">
            <div className="home-stat-value green">
              {bestReturn !== null ? `+${bestReturn.toFixed(0)}%` : '--'}
            </div>
            <div className="home-stat-label">Best Signal Return</div>
          </div>
        </div>

        <div className="home-trust-line">Supporting BSC, Base, Solana and Ethereum</div>
      </section>

      {/* FEATURES */}
      <section className="home-features">
        <div className="home-section-title">What Galeon Does For You</div>
        <div className="home-section-subtitle">Three AI-powered modules working together to find and capture alpha</div>

        <div className="home-feature-grid">
          <div className="home-feature-card" onClick={() => navigate('/alpha-agent?tab=signals')}>
            <div className="home-feature-icon purple">AS</div>
            <h3>Alpha Signal</h3>
            <p>AI scans Binance Alpha tokens every hour using 14-dimension analysis — technical indicators, smart money flows, funding rates, and social sentiment. Delivers precise entry, stop-loss, and take-profit targets.</p>
            <div className="home-feature-bottom">
              <div className="home-feature-stat">Win Rate: 68%</div>
              <span className="home-feature-link">Explore Signals &rarr;</span>
            </div>
          </div>

          <div className="home-feature-card" onClick={() => navigate('/alpha-agent?tab=meme-radar')}>
            <div className="home-feature-icon blue">MR</div>
            <h3>Meme Radar</h3>
            <p>Detects early-stage meme tokens across 4 chains by tracking smart money, KOLs, and whale movements. Every token must pass a 10-point Golden Snipe safety check — filtering out scams before they reach you.</p>
            <div className="home-feature-bottom">
              <div className="home-feature-stat blue">Win Rate: 62%</div>
              <span className="home-feature-link">Scan Memes &rarr;</span>
            </div>
          </div>

          <div className="home-feature-card" onClick={() => navigate('/alpha-agent?tab=auto-trade')}>
            <div className="home-feature-icon green">AT</div>
            <h3>Auto Trade</h3>
            <p>From signal to profit, fully automated. Choose your strategy, set risk parameters — AI handles entry, real-time monitoring, dynamic trailing stop-loss, laddered take-profit, and circuit breakers. 8 strategy types.</p>
            <div className="home-feature-bottom">
              <div className="home-feature-stat green">8 Strategy Types</div>
              <span className="home-feature-link">Start Auto Trading &rarr;</span>
            </div>
          </div>
        </div>
      </section>

      {/* TOP SIGNALS */}
      <section className="home-signals">
        <div className="home-section-title">Recent Winning Signals</div>
        <div className="home-section-subtitle">Real results generated by Galeon AI agents — verified on-chain</div>

        <div className="home-signals-table">
          <div className="home-signals-header">
            <div>Token</div>
            <div>Source</div>
            <div>Signal Price</div>
            <div>Peak Return</div>
          </div>

          {displaySignals.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8', fontSize: '14px' }}>
              No winning signals data available
            </div>
          ) : displaySignals.map((signal, i) => {
            const barPct = `${Math.round((signal.returnPct / maxReturn) * 100)}%`;
            const priceDisplay = signal.currentPrice > 0
              ? `$${signal.currentPrice < 0.01 ? signal.currentPrice.toFixed(6) : signal.currentPrice.toFixed(4)}`
              : '--';
            return (
              <div className="home-signal-row" key={signal.id || i}>
                <div>
                  <div className="home-signal-token-name">{signal.tokenSymbol}</div>
                  <div className="home-signal-token-meta">
                    {signal.chain ? `${signal.chain} · ` : ''}{formatDate(signal.createdAt)}
                  </div>
                </div>
                <div>
                  <span className={`home-signal-source-badge ${signal.source}`}>
                    {signal.source === 'alpha' ? 'Alpha Signal' : 'Meme Radar'}
                  </span>
                  <span className="home-signal-source-type">{signal.signalType}</span>
                </div>
                <div className="home-signal-price">{priceDisplay}</div>
                <div className="home-signal-return">
                  <div className="home-return-value">+{signal.returnPct.toFixed(0)}%</div>
                  <div className="home-return-bar-bg">
                    <div className="home-return-bar" style={{ width: barPct }} />
                  </div>
                </div>
              </div>
            );
          })}

          <div className="home-signals-footer">
            Showing top performing signals. Past performance is for transparency — not a guarantee of future results.
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="home-how">
        <div className="home-section-title">Get Started in 3 Steps</div>
        <div className="home-section-subtitle">From zero to automated trading in under 5 minutes</div>

        <div className="home-steps">
          <div className="home-step">
            <div className="home-step-number">1</div>
            <h3>Connect Wallet</h3>
            <p>Connect your wallet and deposit USDT. Supports MetaMask, Phantom, and Privy embedded wallets.</p>
          </div>
          <div className="home-step">
            <div className="home-step-number">2</div>
            <h3>Choose Strategy</h3>
            <p>Pick your signal source — Alpha Signal, Meme Radar, KOL, or Fusion. Set your risk parameters and trade amount.</p>
          </div>
          <div className="home-step">
            <div className="home-step-number">3</div>
            <h3>Auto Profit</h3>
            <p>AI agents handle everything: entry, real-time monitoring, stop-loss, and take-profit. Fully on-chain, fully automated.</p>
          </div>
        </div>

        <div className="home-how-cta">
          <button onClick={handleStartTrading}>Start Trading Now</button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="home-footer">
        <div className="home-footer-left">GALEON &copy; 2026</div>
        <div className="home-footer-links">
          <a href="https://x.com/HelloGaleon" target="_blank" rel="noopener noreferrer">Twitter</a>
          <a href="https://t.me" target="_blank" rel="noopener noreferrer">Telegram</a>
          <a href="#/docs" onClick={(e) => { e.preventDefault(); navigate('/docs'); }}>Documentation</a>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
