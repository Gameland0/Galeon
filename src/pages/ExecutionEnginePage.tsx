/**
 * ExecutionEnginePage
 * Route: /execution-engine
 */
import React, { useEffect, useState, useContext } from 'react';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import ExecutionEngine from '../components/autoTrade/ExecutionEngine';
import { getBinanceKeyStatus, getFeeSummary, getFeeHistory } from '../services/api';

export default function ExecutionEnginePage() {
  const { getCurrentAccount, isAuthenticated } = useContext(MultiWalletContext);
  const account = getCurrentAccount();
  const isConnected = !!account && isAuthenticated;
  const token = localStorage.getItem('token') || '';

  const [binanceKeyStatus, setBinanceKeyStatus] = useState<any>(null);
  const [feeSummary, setFeeSummary] = useState<any>(null);
  const [feeRecords, setFeeRecords] = useState<any[]>([]);

  useEffect(() => {
    if (!isConnected || !token) return;
    Promise.all([
      getBinanceKeyStatus(token),
      getFeeSummary(token),
      getFeeHistory(token, 1, 10),
    ]).then(([keyRes, feeRes, histRes]) => {
      if (keyRes.success) setBinanceKeyStatus(keyRes.data);
      if (feeRes.success) setFeeSummary(feeRes.data);
      if (histRes.success) setFeeRecords(histRes.data?.records || []);
    }).catch(() => {});
  }, [isConnected, token]);

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#1f2937', margin: 0 }}>Execution Engine</h1>
        <p style={{ color: '#6b7280', marginTop: 6, fontSize: 14 }}>
          Manage execution channels for Alpha signals — Hyperliquid, Binance CEX, on-chain DEX
        </p>
      </div>

      {!isConnected ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: '#9ca3af' }}>
          Please connect your wallet
        </div>
      ) : (
        <ExecutionEngine
          userId={account}
          token={token}
          binanceKeyStatus={binanceKeyStatus}
          feeSummary={feeSummary}
          feeRecords={feeRecords}
        />
      )}
    </div>
  );
}
