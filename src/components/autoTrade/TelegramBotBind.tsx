import React, { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { generateBindCode, verifyBindCode } from '../../services/telegramBotApi';

const TelegramBotBind: React.FC = () => {
  const { getAccessToken } = usePrivy();

  const [bindCode, setBindCode] = useState<string>('');
  const [bindCodeExpires, setBindCodeExpires] = useState<string>('');
  const [generating, setGenerating] = useState(false);

  const [inputCode, setInputCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<string>('');

  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    setBindCode('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Please log in first');
      const res = await generateBindCode(token);
      if (res.success && res.data) {
        setBindCode(res.data.bindCode);
        setBindCodeExpires(new Date(res.data.expiresAt).toLocaleTimeString('en-US'));
      } else {
        setError(res.error || 'Failed to generate code');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to generate code');
    } finally {
      setGenerating(false);
    }
  };

  const handleVerify = async () => {
    if (!inputCode.trim()) return;
    setVerifying(true);
    setError('');
    setVerifyResult('');
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Please log in first');
      const res = await verifyBindCode(token, inputCode.trim());
      if (res.success && res.data) {
        setVerifyResult(`Linked successfully! TG user: @${res.data.telegramUsername || res.data.telegramId}`);
        setInputCode('');
      } else {
        setError(res.error || 'Verification failed');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700' }}>Bind Telegram Bot</h3>
      </div>

      <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '12px' }}>
        Once linked, you can receive signals, manage positions and execute trades via Telegram Bot.
      </p>

      <a
        href="https://t.me/Galeon_signal_bot"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          background: 'linear-gradient(135deg, #0088cc 0%, #0077b5 100%)',
          color: 'white', padding: '12px 16px', borderRadius: '10px',
          textDecoration: 'none', fontSize: '15px', fontWeight: '600',
          marginBottom: '20px', transition: 'opacity 0.2s'
        }}
      >
        <span style={{ fontSize: '20px' }}>✈️</span>
        Open @Galeon_signal_bot in Telegram
      </a>

      {error && (
        <div style={{
          background: '#fef2f2', color: '#dc2626', padding: '12px 16px',
          borderRadius: '8px', marginBottom: '16px', fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {verifyResult && (
        <div style={{
          background: '#f0fdf4', color: '#16a34a', padding: '12px 16px',
          borderRadius: '8px', marginBottom: '16px', fontSize: '14px'
        }}>
          {verifyResult}
        </div>
      )}

      {/* Method 1: Generate code on Web, enter in TG */}
      <div style={{
        background: '#f8fafc', borderRadius: '10px', padding: '16px',
        marginBottom: '16px', border: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>
          Method 1: Generate a bind code
        </div>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px 0' }}>
          Click to generate, then send <code>/bind &lt;code&gt;</code> in Telegram Bot.
        </p>

        {bindCode ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{
              fontSize: '32px', fontWeight: '700', letterSpacing: '8px',
              color: '#1e40af', fontFamily: 'monospace'
            }}>
              {bindCode}
            </div>
            <div style={{ color: '#6b7280', fontSize: '13px', marginTop: '8px' }}>
              Expires at {bindCodeExpires} (5 minutes)
            </div>
            <div style={{
              background: '#eff6ff', padding: '10px', borderRadius: '8px',
              marginTop: '12px', fontSize: '13px', color: '#1e40af'
            }}>
              Send in TG Bot: <strong>/bind {bindCode}</strong>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            style={{
              width: '100%', padding: '12px', borderRadius: '8px',
              background: generating ? '#94a3b8' : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white', border: 'none', fontSize: '14px',
              fontWeight: '600', cursor: generating ? 'not-allowed' : 'pointer'
            }}
          >
            {generating ? 'Generating...' : 'Generate Bind Code'}
          </button>
        )}
      </div>

      {/* Method 2: Generate code in TG, enter on Web */}
      <div style={{
        background: '#f8fafc', borderRadius: '10px', padding: '16px',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '8px' }}>
          Method 2: Enter TG bind code
        </div>
        <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 12px 0' }}>
          Send <code>/bindweb</code> in Telegram Bot to get a code, then enter it below.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputCode}
            onChange={(e) => setInputCode(e.target.value.toUpperCase())}
            placeholder="Enter 6-digit code"
            maxLength={6}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: '8px',
              border: '1px solid #d1d5db', fontSize: '16px',
              fontFamily: 'monospace', letterSpacing: '4px',
              textAlign: 'center', textTransform: 'uppercase'
            }}
          />
          <button
            onClick={handleVerify}
            disabled={verifying || inputCode.length < 6}
            style={{
              padding: '10px 20px', borderRadius: '8px',
              background: (verifying || inputCode.length < 6) ? '#94a3b8' : '#10b981',
              color: 'white', border: 'none', fontSize: '14px',
              fontWeight: '600', cursor: (verifying || inputCode.length < 6) ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            {verifying ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TelegramBotBind;
