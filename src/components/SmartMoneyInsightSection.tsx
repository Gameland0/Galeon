/**
 * Smart Money Insight Section
 * 展示 Sintral/Binance Agent Skills 提供的 Smart Money 数据
 * - Smart Money 信号横幅
 * - 持仓者分布条形图
 * - Binance 交易者数据
 * - 安全审计标签
 *
 * 创建时间: 2026-03-04
 */

import React from 'react';
import { SmartMoneyData } from '../types/alphaSignal';
import '../styles/SmartMoneyInsight.css';

interface Props {
  data: SmartMoneyData;
  currentPrice?: number;
  dimensionScores?: any; // parsed dimensionScores JSON
  liveTokenData?: any; // live data from Binance Agent Skills Token Dynamic API
}

const SmartMoneyInsightSection: React.FC<Props> = ({ data, currentPrice, dimensionScores, liveTokenData }) => {
  const hasData = data && (data.holderDistribution || data.smartMoneyDirection || data.smartMoneyHolders !== null);
  const hasLive = liveTokenData && (liveTokenData.smartMoneyHolders || liveTokenData.kolHolders);

  if (!hasData && !hasLive) {
    return null;
  }

  const smDim = dimensionScores?.smartMoney;
  const hdDim = dimensionScores?.holderDistribution;
  const smmDim = dimensionScores?.smartMoneyMomentum;

  // 持仓者分布数据
  const dist = data.holderDistribution;
  const maxPercent = dist ? Math.max(dist.kol, dist.pro, dist.smartMoney, dist.bundler, dist.newWallet, 1) : 1;

  return (
    <div className="smart-money-section">
      <div className="smart-money-header">
        <h3>Smart Money Insights</h3>
        <span className="smart-money-badge">Binance Agent Skills</span>
      </div>

      {/* Smart Money 信号横幅 */}
      {data.smartMoneyDirection && (
        <div className={`sm-signal-banner ${data.smartMoneyDirection === 'buy' ? 'sm-buy' : 'sm-sell'}`}>
          <div className="sm-signal-icon">
            {data.smartMoneyDirection === 'buy' ? '\u{1F9E0}' : '\u{26A0}\u{FE0F}'}
          </div>
          <div className="sm-signal-text">
            <strong>
              {data.smartMoneyHolders || 0} Smart Money wallets are{' '}
              {data.smartMoneyDirection === 'buy' ? 'BUYING' : 'SELLING'}
            </strong>
            {data.smartMoneyBoost !== null && data.smartMoneyBoost !== 0 && (
              <span className={`sm-boost ${data.smartMoneyBoost > 0 ? 'positive' : 'negative'}`}>
                Confidence {data.smartMoneyBoost > 0 ? '+' : ''}{data.smartMoneyBoost.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 持仓者分布 */}
      {dist && (
        <div className="holder-distribution">
          <h4>Holder Distribution</h4>
          <div className="holder-bars">
            <HolderBar label="KOL" value={dist.kol} maxVal={maxPercent} color="#F7931A" />
            <HolderBar label="Pro Traders" value={dist.pro} maxVal={maxPercent} color="#627EEA" />
            <HolderBar label="Smart Money" value={dist.smartMoney} maxVal={maxPercent} color="#00D395" />
            <HolderBar label="Bundler" value={dist.bundler} maxVal={maxPercent} color={dist.bundler > 1 ? '#FF6B6B' : '#8B949E'} warn={dist.bundler > 1} />
            <HolderBar label="New Wallets" value={dist.newWallet} maxVal={maxPercent} color="#8B949E" />
          </div>
          {hdDim && (
            <div className="holder-score-row">
              <span className={`holder-risk-tag risk-${(hdDim.risk || 'medium').toLowerCase()}`}>
                {hdDim.risk || 'MEDIUM'} Concentration
              </span>
              {hdDim.holdersChange24h !== undefined && hdDim.holdersChange24h !== 0 && (
                <span className={`holders-change ${hdDim.holdersChange24h > 0 ? 'positive' : 'negative'}`}>
                  Holders 24h: {hdDim.holdersChange24h > 0 ? '+' : ''}{hdDim.holdersChange24h.toFixed(1)}%
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Binance 交易者 */}
      {smDim && smDim.bnTraders > 0 && (
        <div className="bn-traders-card">
          <div className="bn-traders-header">
            <span className="bn-icon">B</span>
            <span>{smDim.bnTraders} Binance traders active</span>
          </div>
        </div>
      )}

      {/* Smart Money 动量 */}
      {smmDim && (
        <div className="sm-momentum-card">
          <div className="sm-momentum-header">
            <span>Momentum</span>
            <span className={`momentum-signal ${smmDim.signal === 'LONG' ? 'long' : smmDim.signal === 'SHORT' ? 'short' : 'neutral'}`}>
              {smmDim.signal}
            </span>
          </div>
          <div className="momentum-bar-container">
            <div
              className={`momentum-bar ${smmDim.score >= 65 ? 'bullish' : smmDim.score <= 35 ? 'bearish' : 'neutral'}`}
              style={{ width: `${smmDim.score}%` }}
            />
          </div>
          <div className="momentum-description">{smmDim.description}</div>
        </div>
      )}

      {/* Live Token Data from Binance Agent Skills */}
      {liveTokenData && (
        <div className="live-token-stats">
          <h4>Token Holders (Live)</h4>
          <div className="holder-stats-grid">
            {liveTokenData.kolHolders && parseInt(liveTokenData.kolHolders) > 0 && (
              <div className="holder-stat-item">
                <span className="stat-label">KOL Holders</span>
                <span className="stat-value">{parseInt(liveTokenData.kolHolders).toLocaleString()}</span>
              </div>
            )}
            {liveTokenData.proHolders && parseInt(liveTokenData.proHolders) > 0 && (
              <div className="holder-stat-item">
                <span className="stat-label">Pro Traders</span>
                <span className="stat-value">{parseInt(liveTokenData.proHolders).toLocaleString()}</span>
              </div>
            )}
            {liveTokenData.smartMoneyHolders && parseInt(liveTokenData.smartMoneyHolders) > 0 && (
              <div className="holder-stat-item">
                <span className="stat-label">Smart Money</span>
                <span className="stat-value">{parseInt(liveTokenData.smartMoneyHolders).toLocaleString()}</span>
              </div>
            )}
            {liveTokenData.holders && (
              <div className="holder-stat-item">
                <span className="stat-label">Total Holders</span>
                <span className="stat-value">{parseInt(liveTokenData.holders).toLocaleString()}</span>
              </div>
            )}
            {liveTokenData.top10HoldersPercentage && (
              <div className="holder-stat-item">
                <span className="stat-label">Top 10 Hold</span>
                <span className="stat-value">{parseFloat(liveTokenData.top10HoldersPercentage).toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 安全审计 */}
      {data.auditBlacklist !== null && (
        <div className="audit-tags">
          {data.auditBlacklist ? (
            <span className="audit-tag danger">Blacklist Function Detected</span>
          ) : (
            <span className="audit-tag safe">No Blacklist</span>
          )}
        </div>
      )}
    </div>
  );
};

// 水平条形图组件
const HolderBar: React.FC<{
  label: string;
  value: number;
  maxVal: number;
  color: string;
  warn?: boolean;
}> = ({ label, value, maxVal, color, warn }) => {
  const widthPercent = maxVal > 0 ? Math.max((value / maxVal) * 100, 2) : 2;

  return (
    <div className={`holder-bar-row ${warn ? 'warn' : ''}`}>
      <div className="holder-bar-label">{label}</div>
      <div className="holder-bar-track">
        <div
          className="holder-bar-fill"
          style={{ width: `${widthPercent}%`, backgroundColor: color }}
        />
      </div>
      <div className="holder-bar-value">{value.toFixed(2)}%</div>
    </div>
  );
};

export default SmartMoneyInsightSection;
