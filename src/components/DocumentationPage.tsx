import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/DocumentationPage.css';

type Section = 'overview' | 'getting-started' | 'alpha-signal' | 'meme-radar' | 'auto-trade' | 'telegram-bot';

const NAV_ITEMS: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'getting-started', label: 'Getting Started' },
  { key: 'alpha-signal', label: 'Alpha Signal' },
  { key: 'meme-radar', label: 'Meme Radar' },
  { key: 'auto-trade', label: 'Auto Trade' },
  { key: 'telegram-bot', label: 'Telegram Bot' },
];

const DocumentationPage: React.FC = () => {
  const [active, setActive] = useState<Section>('overview');
  const navigate = useNavigate();

  return (
    <div className="doc-page">
      {/* Sidebar */}
      <aside className="doc-sidebar">
        <div className="doc-sidebar-title" onClick={() => navigate('/')}>GALEON</div>
        <nav className="doc-nav">
          {NAV_ITEMS.map(item => (
            <button
              key={item.key}
              className={`doc-nav-item ${active === item.key ? 'active' : ''}`}
              onClick={() => setActive(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="doc-content">
        {active === 'overview' && <OverviewSection />}
        {active === 'getting-started' && <GettingStartedSection />}
        {active === 'alpha-signal' && <AlphaSignalSection />}
        {active === 'meme-radar' && <MemeRadarSection />}
        {active === 'auto-trade' && <AutoTradeSection />}
        {active === 'telegram-bot' && <TelegramBotSection />}
      </main>
    </div>
  );
};

/* ==================== SECTIONS ==================== */

const OverviewSection = () => (
  <article className="doc-article">
    <h1>Galeon Documentation</h1>
    <p className="doc-lead">
      Galeon is an autonomous multi-agent AI system that transforms Web3 trading from manual decision-making into fully automated, intelligent execution.
    </p>

    <section className="doc-section">
      <h2>Vision</h2>
      <p>
        To become the intelligent trading infrastructure of the Web3 world — enabling every ordinary user to access the same level of information discovery and trade execution capability as institutions and smart money, eliminating the information and execution gap between retail and professional traders.
      </p>
    </section>

    <section className="doc-section">
      <h2>Mission</h2>
      <p>
        Automate on-chain data analysis, risk assessment, and trade execution so users can participate in crypto trading safely and efficiently — without constant monitoring or professional expertise.
      </p>

      <div className="doc-card-grid">
        <div className="doc-card">
          <div className="doc-card-icon">&#x1F50D;</div>
          <h3>Discovery</h3>
          <p>AI automatically scans multiple chains and data sources to surface valuable trading opportunities for users.</p>
        </div>
        <div className="doc-card">
          <div className="doc-card-icon">&#x1F6E1;</div>
          <h3>Safety</h3>
          <p>Every trade must pass risk controls and security verification before execution, protecting user assets.</p>
        </div>
        <div className="doc-card">
          <div className="doc-card-icon">&#x26A1;</div>
          <h3>Execution</h3>
          <p>From signal to on-chain settlement, fully automated with zero human delay.</p>
        </div>
        <div className="doc-card">
          <div className="doc-card-icon">&#x1F310;</div>
          <h3>Accessibility</h3>
          <p>Institutional-level risk management tools — dynamic stop-loss, laddered take-profit, circuit breakers — simplified for all users.</p>
        </div>
      </div>
    </section>
  </article>
);

const GettingStartedSection = () => (
  <article className="doc-article">
    <h1>Getting Started</h1>
    <p className="doc-lead">Get from zero to automated trading in under 5 minutes.</p>

    <section className="doc-section">
      <h2>1. Connect Your Wallet</h2>
      <p>
        Open the Galeon Web DApp at{' '}
        <a href="https://galeon.gameland.network" target="_blank" rel="noopener noreferrer">
          galeon.gameland.network
        </a>{' '}
        and connect your wallet:
      </p>
      <ul>
        <li><strong>EVM chains (BSC / Base):</strong> Connect with MetaMask</li>
        <li><strong>Solana chain:</strong> Connect with Phantom</li>
      </ul>
      <p>Once connected, you will be redirected to the main interface. Click "Show Marketplace" to find the <strong>Alpha Auto Agent</strong>.</p>
    </section>

    <section className="doc-section">
      <h2>2. Deposit Funds</h2>
      <p>Deposit stablecoins (USDT on BSC, USDC on Base/Solana) plus a small amount of native tokens for gas fees:</p>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Chain</th><th>Stablecoin</th><th>Gas Token</th></tr>
          </thead>
          <tbody>
            <tr><td>BSC</td><td>USDT</td><td>BNB</td></tr>
            <tr><td>Base</td><td>USDC</td><td>ETH</td></tr>
            <tr><td>Solana</td><td>USDC</td><td>SOL</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>3. Create a Strategy</h2>
      <p>Navigate to Auto Trade, choose a strategy type, set your risk parameters (stop-loss, take-profit, position size), and enable it. The AI agents will handle everything from there.</p>
    </section>

    <section className="doc-section">
      <h2>4. Connect Telegram (Optional)</h2>
      <p>
        Link your account via <strong>@Galeon_Alpha_Bot</strong> on Telegram to receive real-time signal notifications and manage trades via commands.
      </p>
    </section>
  </article>
);

const AlphaSignalSection = () => (
  <article className="doc-article">
    <h1>Alpha Signal</h1>
    <p className="doc-lead">AI-powered trading signals with precise entry, stop-loss, and take-profit targets.</p>

    <section className="doc-section">
      <h2>What is Alpha Signal?</h2>
      <p>
        Alpha Signal is an automated trading signal system powered by AI. It performs <strong>hourly scans</strong> of Binance Alpha tokens through comprehensive multi-dimensional analysis, producing trading signals with specific entry prices, stop-loss levels, and take-profit targets.
      </p>
    </section>

    <section className="doc-section">
      <h2>How to View Signals</h2>
      <div className="doc-two-col">
        <div>
          <h3>Web DApp</h3>
          <ul>
            <li>Navigate to <strong>Alpha Agent &rarr; Alpha Signals</strong> tab</li>
            <li>Filter by signal type (LONG / SHORT / BUY / SELL) and status</li>
            <li>Sort by confidence, time, or win rate</li>
            <li>Click signal cards for detailed information</li>
          </ul>
        </div>
        <div>
          <h3>Telegram</h3>
          <ul>
            <li><code>/signals</code> — View all active signals</li>
            <li><code>/signals LONG</code> — View long signals only</li>
            <li><code>/signal &lt;signal_id&gt;</code> — View single signal details</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="doc-section">
      <h2>Signal Content</h2>
      <p>Each signal includes:</p>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Field</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td>Token Info</td><td>Name, chain, current price</td></tr>
            <tr><td>Signal Type</td><td>LONG / SHORT / BUY / SELL</td></tr>
            <tr><td>Confidence</td><td>0–100% (signals generated only at &ge; 70%)</td></tr>
            <tr><td>Risk Level</td><td>LOW / MEDIUM / HIGH</td></tr>
            <tr><td>Trading Plan</td><td>Entry range, stop-loss, take-profit targets (TP1 / TP2 / TP3)</td></tr>
            <tr><td>Charts</td><td>DexScreener / GMGN chart links</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>Manual Copy Trading</h2>
      <p>When an interesting signal appears in Telegram, you can manually buy:</p>
      <div className="doc-code">
        <code>/buy LAB 50</code>
      </div>
      <p>This command purchases $50 worth of LAB. The system automatically identifies the correct blockchain and DEX for execution.</p>
    </section>
  </article>
);

const MemeRadarSection = () => (
  <article className="doc-article">
    <h1>Meme Radar</h1>
    <p className="doc-lead">AI-powered meme token discovery — scan 4 chains every 10 minutes, filter scams automatically.</p>

    <section className="doc-section">
      <h2>What is Meme Radar?</h2>
      <p>
        Meme Radar is an AI-powered meme token discovery system that scans <strong>BSC, Solana, Base, and Ethereum every 10 minutes</strong> to identify early opportunities while filtering out scams.
      </p>
    </section>

    <section className="doc-section">
      <h2>How to View Signals</h2>
      <div className="doc-two-col">
        <div>
          <h3>Web DApp</h3>
          <ul>
            <li>Navigate to <strong>Alpha Agent &rarr; Meme Radar</strong> tab</li>
            <li>Filter by chain and signal status</li>
            <li>Click any token card for detailed analysis</li>
          </ul>
        </div>
        <div>
          <h3>Telegram</h3>
          <ul>
            <li><code>/meme</code> — View all active meme signals</li>
            <li><code>/signal &lt;signal_id&gt;</code> — View signal details</li>
          </ul>
        </div>
      </div>
    </section>

    <section className="doc-section">
      <h2>Signal Levels</h2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Level</th><th>Score</th><th>Meaning</th></tr>
          </thead>
          <tbody>
            <tr><td><span className="doc-badge green">STRONG_BUY</span></td><td>&ge; 70</td><td>High-confidence opportunity</td></tr>
            <tr><td><span className="doc-badge blue">BUY</span></td><td>50 – 69</td><td>Moderate opportunity</td></tr>
            <tr><td><span className="doc-badge gray">WATCH</span></td><td>&lt; 50</td><td>Monitor only</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>Golden Snipe Safety Check</h2>
      <p>Before any token appears in signals, it must pass a <strong>10-point safety check</strong>:</p>
      <div className="doc-check-grid">
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Top 10 holder concentration &le; 45%</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Developer holdings &le; 10%</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Minimum liquidity $15K</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Minimum 150 holders</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>No honeypot detected</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Contract verified</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>No mint function abuse</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Reasonable buy/sell tax</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Active trading volume</div>
        <div className="doc-check-item"><span className="doc-check-icon">&#10003;</span>Liquidity locked or burned</div>
      </div>
      <p className="doc-note">Tokens that fail any check are never shown in signal lists.</p>
    </section>
  </article>
);

const AutoTradeSection = () => (
  <article className="doc-article">
    <h1>Auto Trade</h1>
    <p className="doc-lead">From signal to profit, fully automated. Set your strategy and let AI handle the rest.</p>

    <section className="doc-section">
      <h2>How It Works</h2>
      <p>
        Auto Trade is a fully automated trading system. You set up a strategy and risk parameters — the system independently handles signal reception, position entry, monitoring, and exit execution without manual intervention.
      </p>
      <div className="doc-flow">
        <div className="doc-flow-step">Signal Detected</div>
        <div className="doc-flow-arrow">&rarr;</div>
        <div className="doc-flow-step">Risk Check</div>
        <div className="doc-flow-arrow">&rarr;</div>
        <div className="doc-flow-step">Auto Entry</div>
        <div className="doc-flow-arrow">&rarr;</div>
        <div className="doc-flow-step">Monitor</div>
        <div className="doc-flow-arrow">&rarr;</div>
        <div className="doc-flow-step">Auto Exit</div>
      </div>
    </section>

    <section className="doc-section">
      <h2>Setup Guide</h2>
      <p>Follow these steps to get your automated trading running:</p>

      <div className="doc-step-block">
        <div className="doc-step-header">
          <span className="doc-step-num">Step 1</span>
          <h3>Create Wallet &amp; Enable Auto Trading</h3>
        </div>
        <p>
          Navigate to the <strong>Auto Trade</strong> page. First, create your embedded wallet address. Then enable trading for your preferred chain:
        </p>
        <ul>
          <li><strong>EVM Auto Trading Enabled</strong> — for BSC and Base chains</li>
          <li><strong>Solana Auto Trading Enabled</strong> — for Solana chain</li>
        </ul>
        <p>
          On success you will see a confirmation:
        </p>
        <div className="doc-code"><code>Authorized for BSC and Base chains</code></div>
        <div className="doc-code"><code>Enabled Successfully</code></div>
      </div>

      <div className="doc-step-block">
        <div className="doc-step-header">
          <span className="doc-step-num">Step 2</span>
          <h3>Deposit Trading Funds</h3>
        </div>
        <p>
          Click the <strong>Deposit</strong> button to view your wallet addresses. Send stablecoins (USDT on BSC, USDC on Base/Solana) plus a small amount of native tokens for gas fees.
        </p>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>Chain</th><th>Stablecoin</th><th>Gas Token</th></tr>
            </thead>
            <tbody>
              <tr><td>BSC</td><td>USDT</td><td>BNB</td></tr>
              <tr><td>Base</td><td>USDC</td><td>ETH</td></tr>
              <tr><td>Solana</td><td>USDC</td><td>SOL</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="doc-step-block">
        <div className="doc-step-header">
          <span className="doc-step-num">Step 3</span>
          <h3>Create Your Trading Strategy</h3>
        </div>
        <p>
          Go to the <strong>Strategy</strong> tab and create your own trading strategy. The AI agent will trade based on your configured parameters.
        </p>
        <p>
          After saving, return to the Strategy page — you will see your strategy card. Click <strong>Edit</strong> to configure the <strong>Signal Source</strong>. Available signal sources:
        </p>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr><th>Signal Source</th><th>Description</th></tr>
            </thead>
            <tbody>
              <tr><td>AI Signal</td><td>Follow Alpha Signal AI-generated trading signals</td></tr>
              <tr><td>Twitter KOL</td><td>Monitor and follow Twitter KOL trading recommendations</td></tr>
              <tr><td>Telegram</td><td>Monitor Telegram group messages for trading signals. Requires QR code login, then select up to <strong>3 groups</strong> to monitor</td></tr>
              <tr><td>Fusion</td><td>Multi-source signal fusion — combines AI, KOL, and social signals</td></tr>
              <tr><td>Memecoin</td><td>Follow Meme Radar detected meme token signals</td></tr>
              <tr><td>Range Trading</td><td>Range-based grid trading within defined price boundaries</td></tr>
            </tbody>
          </table>
        </div>
        <p className="doc-note">
          For Telegram monitoring: scan the QR code to log in, then select the Telegram groups you want to monitor (maximum 3 groups).
        </p>
      </div>

      <div className="doc-step-block">
        <div className="doc-step-header">
          <span className="doc-step-num">Step 4</span>
          <h3>Bind Telegram Bot</h3>
        </div>
        <p>
          In the <strong>Bind Telegram Bot</strong> section:
        </p>
        <ol>
          <li>Open Telegram and search for <strong>@Galeon_Alpha_Bot</strong></li>
          <li>On the web page, click <strong>Generate bind code</strong> to get a 6-digit code</li>
          <li>In Telegram, send the bind command with your code:</li>
        </ol>
        <div className="doc-code"><code>/bind 123456</code></div>
        <p>
          Once bound, you will receive real-time trade notifications, signal alerts, and can manage your positions directly from Telegram.
        </p>
      </div>
    </section>

    <section className="doc-section">
      <h2>Auto Trade Page Tabs</h2>
      <p>After setup, the Auto Trade page provides four tabs for monitoring and management:</p>
      <div className="doc-card-grid">
        <div className="doc-card">
          <div className="doc-card-icon">&#x1F4E1;</div>
          <h3>Signal</h3>
          <p>Real-time view of all monitored signals from your configured sources. See signal type, confidence, price, and status as they come in.</p>
        </div>
        <div className="doc-card">
          <div className="doc-card-icon">&#x1F4CA;</div>
          <h3>Position</h3>
          <p>View all your current open positions — entry price, current P&amp;L, stop-loss and take-profit levels, and time held.</p>
        </div>
        <div className="doc-card">
          <div className="doc-card-icon">&#x1F4D6;</div>
          <h3>History</h3>
          <p>Complete trade history showing all past entries and exits, profit/loss per trade, and overall performance metrics.</p>
        </div>
        <div className="doc-card">
          <div className="doc-card-icon">&#x2699;</div>
          <h3>Strategy</h3>
          <p>Create, edit, enable/disable, and delete your trading strategies. Up to 3 active strategies per account.</p>
        </div>
      </div>
    </section>

    <section className="doc-section">
      <h2>Configuration Parameters</h2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Parameter</th><th>Range</th><th>Default</th></tr>
          </thead>
          <tbody>
            <tr><td>Position Size</td><td>$10 – $1,000</td><td>$50</td></tr>
            <tr><td>Stop Loss</td><td>-5% to -20%</td><td>-10%</td></tr>
            <tr><td>Take Profit</td><td>+15% to +100%</td><td>+30%</td></tr>
            <tr><td>Max Positions</td><td>1 – 10</td><td>3</td></tr>
            <tr><td>Min Confidence</td><td>70 – 95</td><td>75</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>Risk Safeguards</h2>
      <div className="doc-card-grid">
        <div className="doc-card">
          <h3>Dynamic Stop-Loss</h3>
          <p>ATR-based trailing stop-loss that adapts to market volatility, protecting gains while allowing room to run.</p>
        </div>
        <div className="doc-card">
          <h3>Laddered Take-Profit</h3>
          <p>Tiered profit-taking that locks partial gains at each target level, reducing the risk of giving back profits.</p>
        </div>
        <div className="doc-card">
          <h3>Circuit Breaker</h3>
          <p>Automatic trading pause after consecutive losses, preventing emotional or cascading loss scenarios.</p>
        </div>
        <div className="doc-card">
          <h3>Batch Limits</h3>
          <p>Position size limits per batch to manage pool impact and slippage during high-volume periods.</p>
        </div>
      </div>
    </section>
  </article>
);

const TelegramBotSection = () => (
  <article className="doc-article">
    <h1>Telegram Bot Commands</h1>
    <p className="doc-lead">Complete command reference for @Galeon_Alpha_Bot. Supports English and Chinese.</p>

    <section className="doc-section">
      <h2>Account</h2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Command</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code>/start</code></td><td>Start / bind account</td></tr>
            <tr><td><code>/bind &lt;code&gt;</code></td><td>Bind with 6-digit verification code</td></tr>
            <tr><td><code>/bindweb</code></td><td>Generate a bind code for web linking</td></tr>
            <tr><td><code>/unbind</code></td><td>Unlink Telegram from your account</td></tr>
            <tr><td><code>/balance</code></td><td>View wallet balance</td></tr>
            <tr><td><code>/wallet</code></td><td>View deposit addresses</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>Signals</h2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Command</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code>/signals [type] [page]</code></td><td>View Alpha signals (type: LONG / BUY / SHORT)</td></tr>
            <tr><td><code>/meme [page]</code></td><td>View Meme Radar signals</td></tr>
            <tr><td><code>/signal &lt;id&gt;</code></td><td>View signal details</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>Strategy</h2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Command</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code>/newstrategy</code></td><td>Create a new trading strategy</td></tr>
            <tr><td><code>/editstrategy &lt;id&gt;</code></td><td>Edit an existing strategy</td></tr>
            <tr><td><code>/togglestrategy &lt;id&gt;</code></td><td>Enable / disable a strategy</td></tr>
            <tr><td><code>/delstrategy &lt;id&gt;</code></td><td>Delete a strategy</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>Trading</h2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Command</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code>/buy &lt;token&gt; &lt;amount&gt;</code></td><td>Manual buy (e.g. <code>/buy LAB 50</code>)</td></tr>
            <tr><td><code>/sell &lt;token&gt;</code></td><td>Sell entire position</td></tr>
            <tr><td><code>/positions</code></td><td>View all open positions</td></tr>
            <tr><td><code>/position &lt;token&gt;</code></td><td>View single position details</td></tr>
            <tr><td><code>/trades [page]</code></td><td>View trade history</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <section className="doc-section">
      <h2>System</h2>
      <div className="doc-table-wrap">
        <table className="doc-table">
          <thead>
            <tr><th>Command</th><th>Description</th></tr>
          </thead>
          <tbody>
            <tr><td><code>/autotrade</code></td><td>Toggle auto trading on/off</td></tr>
            <tr><td><code>/notify</code></td><td>Toggle push notifications</td></tr>
            <tr><td><code>/lang</code></td><td>Switch language (EN / ZH)</td></tr>
            <tr><td><code>/stats</code></td><td>View trading statistics (win rate, P&amp;L)</td></tr>
            <tr><td><code>/help</code></td><td>Show all available commands</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </article>
);

export default DocumentationPage;
