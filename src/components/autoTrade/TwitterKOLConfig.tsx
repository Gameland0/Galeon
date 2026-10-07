/**
 * Twitter KOL 配置组件
 * 功能:
 * 1. 添加/删除 KOL
 * 2. 配置 KOL 信任模式
 * 3. 查看 KOL 绩效统计
 * 4. 打开信号历史弹窗
 */

import React, { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import * as twitterApi from '../../services/twitterSignalApi';
import './TwitterKOLConfig.css';

interface KOL {
  id?: number;
  handle: string;
  trustMode: 'STRICT' | 'FULL_TRUST';
  winRate30d?: number;
  enabled?: boolean;
}

interface TwitterKOLConfigProps {
  strategyId: number;
  onOpenSignalHistory: () => void;
  maxKOLs?: number;
}

export function TwitterKOLConfig({
  strategyId,
  onOpenSignalHistory,
  maxKOLs = 5
}: TwitterKOLConfigProps) {
  const { getAccessToken } = usePrivy();

  const [kols, setKOLs] = useState<KOL[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 新增 KOL 表单
  const [newKOL, setNewKOL] = useState<KOL>({
    handle: '',
    trustMode: 'STRICT'
  });

  // 加载 KOL 列表
  useEffect(() => {
    loadKOLs();
  }, [strategyId]);

  const loadKOLs = async () => {
    try {
      setIsLoading(true);
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError('Please login first');
        return;
      }

      const response = await twitterApi.getStrategyKOLs(strategyId, accessToken);
      setKOLs(response.kols.map(k => ({
        id: k.id,
        handle: k.kol_handle,
        trustMode: k.trust_mode,
        winRate30d: k.win_rate_30d,
        enabled: k.enabled
      })));
    } catch (error: any) {
      console.error('Failed to load KOLs:', error);
      setError(error.response?.data?.error || 'Failed to load KOLs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddKOL = async () => {
    // 验证
    if (!newKOL.handle.trim()) {
      setError('KOL handle cannot be empty');
      return;
    }

    // 去除 @ 符号
    const cleanHandle = newKOL.handle.replace('@', '').trim();

    if (kols.length >= maxKOLs) {
      setError(`Maximum ${maxKOLs} KOLs per strategy`);
      return;
    }

    // 检查重复
    if (kols.some(k => k.handle.toLowerCase() === cleanHandle.toLowerCase())) {
      setError('KOL already exists');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError('Please login first');
        return;
      }

      await twitterApi.addKOL({
        strategyId,
        kolHandle: cleanHandle,
        kolWeight: 80, // 默认值，不再使用
        trustMode: newKOL.trustMode
      }, accessToken);

      setSuccessMessage(`KOL @${cleanHandle} added successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // 重新加载列表
      await loadKOLs();

      // 重置表单
      setNewKOL({ handle: '', trustMode: 'STRICT' });

    } catch (error: any) {
      console.error('Failed to add KOL:', error);
      setError(error.response?.data?.error || 'Failed to add KOL');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveKOL = async (kolHandle: string) => {
    if (!window.confirm(`Are you sure you want to remove @${kolHandle}?`)) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError('Please login first');
        return;
      }

      await twitterApi.removeKOL(strategyId, kolHandle, accessToken);

      setSuccessMessage(`KOL @${kolHandle} removed successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // 重新加载列表
      await loadKOLs();

    } catch (error: any) {
      console.error('Failed to remove KOL:', error);
      setError(error.response?.data?.error || 'Failed to remove KOL');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="twitter-kol-config">
      <div className="section-header">
        <h3>📱 Twitter KOL Configuration</h3>
        <button
          className="btn-view-signals"
          onClick={onOpenSignalHistory}
          disabled={isLoading}
        >
          📊 View Signals
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          ❌ {error}
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success">
          ✅ {successMessage}
        </div>
      )}

      {/* 新增 KOL 表单 */}
      <div className="add-kol-form">
        <h4>Add New KOL ({kols.length}/{maxKOLs})</h4>

        <div className="form-row">
          <div className="form-group">
            <label>Twitter Handle</label>
            <input
              type="text"
              placeholder="@elonmusk"
              value={newKOL.handle}
              onChange={(e) => setNewKOL({ ...newKOL, handle: e.target.value })}
              disabled={isLoading || kols.length >= maxKOLs}
            />
          </div>

          <div className="form-group">
            <label>Trust Mode</label>
            <select
              value={newKOL.trustMode}
              onChange={(e) => setNewKOL({ ...newKOL, trustMode: e.target.value as ('STRICT' | 'FULL_TRUST') })}
              disabled={isLoading || kols.length >= maxKOLs}
            >
              <option value="STRICT">STRICT (KOL + AI)</option>
              <option value="FULL_TRUST">FULL TRUST (Blind Follow)</option>
            </select>
          </div>

          <button
            className="btn-add-kol"
            onClick={handleAddKOL}
            disabled={isLoading || kols.length >= maxKOLs || !newKOL.handle.trim()}
          >
            {isLoading ? '⏳ Adding...' : '➕ Add KOL'}
          </button>
        </div>

        <div className="trust-mode-info">
          <div className="info-item">
            <strong>STRICT Mode:</strong> Execute only when AI also has a BUY signal for the same token (dual verification)
          </div>
          <div className="info-item">
            <strong>FULL TRUST Mode:</strong> Blind follow KOL signals, execute immediately
          </div>
        </div>
      </div>

      {/* KOL 列表 */}
      <div className="kol-list">
        <h4>Active KOLs</h4>

        {kols.length === 0 ? (
          <div className="empty-state">
            <p>No KOLs configured yet. Add your first KOL to start!</p>
          </div>
        ) : (
          <div className="kol-cards">
            {kols.map((kol) => (
              <div key={kol.handle} className="kol-card">
                <div className="kol-header">
                  <div className="kol-info">
                    <h5>@{kol.handle}</h5>
                    <span className={`trust-badge ${kol.trustMode.toLowerCase()}`}>
                      {kol.trustMode}
                    </span>
                  </div>
                  <button
                    className="btn-remove"
                    onClick={() => handleRemoveKOL(kol.handle)}
                    disabled={isLoading}
                    title="Remove KOL"
                  >
                    ✕
                  </button>
                </div>

                {typeof kol.winRate30d === 'number' && (
                  <div className="kol-stats">
                    <div className="stat">
                      <span className="label">30d Win Rate:</span>
                      <span className={`value ${kol.winRate30d >= 70 ? 'positive' : kol.winRate30d < 50 ? 'negative' : ''}`}>
                        {kol.winRate30d.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
