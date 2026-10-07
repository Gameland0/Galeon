/**
 * Telegram Group 配置组件
 * 功能:
 * 1. Telegram 授权管理
 * 2. 添加/删除监控群组
 * 3. 配置群组信任模式
 * 4. 查看信号历史
 */

import React, { useState, useEffect, useCallback } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import * as telegramApi from '../../services/telegramSignalApi';
import './TelegramGroupConfig.css';

interface TelegramGroup {
  chatId: number;
  chatTitle: string;
  chatUsername?: string;
  chatType: 'GROUP' | 'SUPERGROUP' | 'CHANNEL';
  memberCount?: number;
}

interface MonitoredGroup {
  id?: number;
  chatId: number;
  chatTitle: string;
  chatType: string;
  trustMode: 'STRICT' | 'BALANCED' | 'AGGRESSIVE';
  minConfidence: number;
  enabled: boolean;
  signalCount?: number;
}

interface TelegramGroupConfigProps {
  strategyId: number;
  onOpenSignalHistory: () => void;
  maxGroups?: number;
}

export function TelegramGroupConfig({
  strategyId,
  onOpenSignalHistory,
  maxGroups = 5
}: TelegramGroupConfigProps) {
  const { getAccessToken } = usePrivy();

  // 授权状态
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [telegramUser, setTelegramUser] = useState<{ name: string; username: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [authTempId, setAuthTempId] = useState<string | null>(null);

  // 2FA 状态
  const [needs2FA, setNeeds2FA] = useState(false);
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [submitting2FA, setSubmitting2FA] = useState(false);
  const [twoFAError, setTwoFAError] = useState<string | null>(null);

  // 群组状态
  const [availableGroups, setAvailableGroups] = useState<TelegramGroup[]>([]);
  const [monitoredGroups, setMonitoredGroups] = useState<MonitoredGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 新增群组表单
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [newGroupConfig, setNewGroupConfig] = useState({
    trustMode: 'BALANCED' as 'STRICT' | 'BALANCED' | 'AGGRESSIVE',
    minConfidence: 0.6
  });

  // 群组搜索
  const [groupSearchQuery, setGroupSearchQuery] = useState('');

  // 编辑群组状态
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingConfig, setEditingConfig] = useState<{
    trustMode: 'STRICT' | 'BALANCED' | 'AGGRESSIVE';
    minConfidence: number;
  } | null>(null);

  // 检查授权状态
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // 轮询检查 QR 码扫描状态
  useEffect(() => {
    if (!authTempId) return;

    let pollCount = 0;
    const MAX_POLLS = 150; // 5 minutes max (150 * 2s = 300s)

    const pollInterval = setInterval(async () => {
      pollCount++;

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          console.warn('⚠️ No access token available');
          return;
        }

        const result = await telegramApi.checkAuthStatus(accessToken, authTempId);

        if (result.status === 'completed' || result.status === 'success') {
          console.log('✅ Telegram authorization successful!');
          setIsAuthorized(true);
          setNeeds2FA(false);
          setTwoFactorPassword('');
          setTwoFAError(null);
          // 兼容两种字段名：后端可能返回 firstName/username 或 telegramName/telegramUsername
          const tgUser = result.telegramUser;
          setTelegramUser({
            name: tgUser?.telegramName || tgUser?.firstName || '',
            username: tgUser?.telegramUsername || tgUser?.username || ''
          });
          setQrCodeUrl(null);
          setAuthTempId(null);
          setSuccessMessage('Telegram authorized successfully!');
          setTimeout(() => setSuccessMessage(null), 3000);

          // 加载群组列表
          loadAvailableGroups();
          loadMonitoredGroups();
        } else if (result.status === 'need_2fa') {
          // 需要2FA密码
          console.log('🔐 2FA password required');
          setNeeds2FA(true);
          setPasswordHint(result.passwordHint || null);
          if (result.error) {
            setTwoFAError(result.error);
          }
        } else if (result.status === 'verifying_2fa') {
          // 正在验证2FA密码
          console.log('🔑 Verifying 2FA password...');
          setSubmitting2FA(true);
        } else if (result.status === 'expired') {
          console.warn('⏰ QR code expired');
          setQrCodeUrl(null);
          setAuthTempId(null);
          setNeeds2FA(false);
          setError('QR code expired, please try again');
        } else if (result.status === 'pending' || result.status === 'waiting') {
        } else {
          console.warn('⚠️ Unknown status:', result.status);
        }

        // 超时检查
        if (pollCount >= MAX_POLLS) {
          console.error('⏰ Polling timeout after 5 minutes');
          setQrCodeUrl(null);
          setAuthTempId(null);
          setError('QR code scanning timeout. Please try again.');
        }
      } catch (err: any) {
        console.error('❌ Poll auth status error:', err);
        console.error('Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status
        });

        // 如果是网络错误或服务器错误，显示给用户
        if (err.response?.status >= 500 || err.message?.includes('Network')) {
          setError(`Connection error: ${err.message}. Please check your network.`);
          setQrCodeUrl(null);
          setAuthTempId(null);
        }
      }
    }, 2000);

    return () => {
      console.log('🛑 Stopping QR code polling');
      clearInterval(pollInterval);
    };
  }, [authTempId]);

  const checkAuthStatus = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const result = await telegramApi.checkAuthStatus(accessToken);

      if (result.authorized && !result.needsReauth) {
        setIsAuthorized(true);
        setTelegramUser({
          name: result.telegramUser?.telegramName || '',
          username: result.telegramUser?.telegramUsername || ''
        });
        loadAvailableGroups();
        loadMonitoredGroups();
      }
    } catch (err) {
      console.error('Check auth status error:', err);
    }
  };

  const handleInitiateAuth = async () => {
    try {
      setAuthLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setError('Please login first');
        return;
      }

      const result = await telegramApi.initiateAuth(accessToken);

      if (result.alreadyAuthorized) {
        setIsAuthorized(true);
        setTelegramUser({
          name: result.telegramUser?.telegramName || '',
          username: result.telegramUser?.telegramUsername || ''
        });
        loadAvailableGroups();
        loadMonitoredGroups();
      } else if (result.qrCodeDataUrl) {
        setQrCodeUrl(result.qrCodeDataUrl);
        setAuthTempId(result.tempId || null);
      }
    } catch (err: any) {
      console.error('Initiate auth error:', err);
      setError(err.response?.data?.error || 'Failed to initiate authorization');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRevokeAuth = async () => {
    if (!window.confirm('Are you sure you want to disconnect Telegram? All monitored groups will be removed.')) {
      return;
    }

    try {
      setAuthLoading(true);
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      await telegramApi.revokeAuth(accessToken);

      setIsAuthorized(false);
      setTelegramUser(null);
      setAvailableGroups([]);
      setMonitoredGroups([]);
      setSuccessMessage('Telegram disconnected successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to revoke authorization');
    } finally {
      setAuthLoading(false);
    }
  };

  // 提交2FA密码
  const handleSubmit2FA = async () => {
    if (!twoFactorPassword.trim()) {
      setTwoFAError('Please enter your 2FA password');
      return;
    }

    if (!authTempId) {
      setTwoFAError('Session expired. Please try again.');
      return;
    }

    setSubmitting2FA(true);
    setTwoFAError(null);

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setTwoFAError('Please login first');
        return;
      }

      const result = await telegramApi.submit2FA(accessToken, authTempId, twoFactorPassword);
      console.log('📤 2FA submit result:', result);

      if (result.success) {
        // 密码已提交，继续轮询等待验证结果
        setTwoFactorPassword('');
        // 轮询会继续检查状态
      } else {
        setTwoFAError(result.error || '2FA verification failed');
      }
    } catch (err: any) {
      console.error('❌ 2FA submit error:', err);
      setTwoFAError(err.response?.data?.error || err.message || '2FA verification failed');
    } finally {
      setSubmitting2FA(false);
    }
  };

  // 取消2FA输入
  const handleCancel2FA = () => {
    setNeeds2FA(false);
    setQrCodeUrl(null);
    setAuthTempId(null);
    setTwoFactorPassword('');
    setTwoFAError(null);
    setPasswordHint(null);
  };

  const loadAvailableGroups = async () => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const result = await telegramApi.getUserGroups(accessToken);
      setAvailableGroups([...result.groups, ...result.channels]);
    } catch (err) {
      console.error('Load groups error:', err);
    }
  };

  const loadMonitoredGroups = async () => {
    try {
      setIsLoading(true);
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const result = await telegramApi.getStrategyGroups(strategyId, accessToken);
      setMonitoredGroups(result.groups.map(g => ({
        id: g.id,
        chatId: g.chatId,
        chatTitle: g.chatTitle,
        chatType: g.chatType,
        trustMode: g.trustMode,
        minConfidence: g.minConfidence,
        enabled: g.enabled,
        signalCount: g.signalCount
      })));
    } catch (err) {
      console.error('Load monitored groups error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddGroup = async () => {
    if (!selectedGroupId) {
      setError('Please select a group');
      return;
    }

    if (monitoredGroups.length >= maxGroups) {
      setError(`Maximum ${maxGroups} groups per strategy`);
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

      const selectedGroup = availableGroups.find(g => g.chatId === selectedGroupId);

      await telegramApi.addGroup({
        strategyId,
        chatId: selectedGroupId,
        chatTitle: selectedGroup?.chatTitle || 'Unknown Group',
        chatUsername: selectedGroup?.chatUsername || null,
        chatType: selectedGroup?.chatType || 'SUPERGROUP',
        trustMode: newGroupConfig.trustMode,
        minConfidence: newGroupConfig.minConfidence
      }, accessToken);
      setSuccessMessage(`Group "${selectedGroup?.chatTitle}" added successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);

      // 重新加载列表
      await loadMonitoredGroups();

      // 重置表单
      setSelectedGroupId(null);
      setNewGroupConfig({ trustMode: 'BALANCED', minConfidence: 0.6 });

    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveGroup = async (chatId: number, chatTitle: string) => {
    if (!window.confirm(`Are you sure you want to remove "${chatTitle}"?`)) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      if (!accessToken) return;

      await telegramApi.removeGroup(strategyId, chatId, accessToken);

      setSuccessMessage(`Group "${chatTitle}" removed successfully!`);
      setTimeout(() => setSuccessMessage(null), 3000);

      await loadMonitoredGroups();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleGroup = async (chatId: number, enabled: boolean) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      await telegramApi.updateGroupConfig(strategyId, chatId, { enabled }, accessToken);
      await loadMonitoredGroups();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update group');
    }
  };

  const handleEditGroup = (group: MonitoredGroup) => {
    setEditingGroupId(group.chatId);
    setEditingConfig({
      trustMode: group.trustMode,
      minConfidence: group.minConfidence
    });
  };

  const handleSaveEdit = async (chatId: number) => {
    if (!editingConfig) return;

    try {
      setIsLoading(true);
      setError(null);

      const accessToken = await getAccessToken();
      if (!accessToken) return;

      await telegramApi.updateGroupConfig(strategyId, chatId, {
        trustMode: editingConfig.trustMode,
        minConfidence: editingConfig.minConfidence
      }, accessToken);

      setSuccessMessage('Group configuration updated successfully!');
      setTimeout(() => setSuccessMessage(null), 3000);

      setEditingGroupId(null);
      setEditingConfig(null);
      await loadMonitoredGroups();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update group');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingGroupId(null);
    setEditingConfig(null);
  };

  // 过滤已添加的群组，并支持搜索
  const filteredAvailableGroups = availableGroups.filter(g => {
    // 排除已监控的群组
    if (monitoredGroups.some(mg => mg.chatId === g.chatId)) {
      return false;
    }
    // 搜索过滤
    if (groupSearchQuery.trim()) {
      const query = groupSearchQuery.toLowerCase();
      const title = (g.chatTitle || '').toLowerCase();
      const username = (g.chatUsername || '').toLowerCase();
      return title.includes(query) || username.includes(query);
    }
    return true;
  });

  return (
    <div className="telegram-group-config">
      <div className="section-header">
        <h3>💬 Telegram Group Configuration</h3>
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
          {error}
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success">
          {successMessage}
        </div>
      )}

      {/* 授权状态 */}
      {!isAuthorized ? (
        <div className="auth-section">
          {needs2FA ? (
            /* 2FA 密码输入界面 */
            <div className="two-factor-container">
              <div className="two-factor-icon">🔐</div>
              <h4>Two-Factor Authentication</h4>
              <p className="two-factor-desc">
                Your Telegram account has 2FA enabled.<br/>
                Please enter your cloud password to continue.
              </p>

              {passwordHint && (
                <div className="password-hint">
                  <span>💡 Hint: {passwordHint}</span>
                </div>
              )}

              {twoFAError && (
                <div className="two-factor-error">
                  {twoFAError}
                </div>
              )}

              <div className="two-factor-input-group">
                <input
                  type="password"
                  value={twoFactorPassword}
                  onChange={(e) => setTwoFactorPassword(e.target.value)}
                  placeholder="Enter your 2FA password"
                  className="two-factor-input"
                  disabled={submitting2FA}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !submitting2FA) {
                      handleSubmit2FA();
                    }
                  }}
                />
              </div>

              <div className="two-factor-buttons">
                <button
                  className="btn-verify"
                  onClick={handleSubmit2FA}
                  disabled={submitting2FA || !twoFactorPassword.trim()}
                >
                  {submitting2FA ? (
                    <>
                      <span className="spinner" style={{
                        display: 'inline-block',
                        width: '14px',
                        height: '14px',
                        border: '2px solid rgba(255,255,255,0.3)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite',
                        marginRight: '8px'
                      }}></span>
                      Verifying...
                    </>
                  ) : (
                    '✓ Verify'
                  )}
                </button>
                <button
                  className="btn-cancel"
                  onClick={handleCancel2FA}
                  disabled={submitting2FA}
                >
                  Cancel
                </button>
              </div>

              <div className="two-factor-note">
                <small>
                  This is your Telegram cloud password, not your device passcode.
                </small>
              </div>
            </div>
          ) : qrCodeUrl ? (
            <div className="qr-code-container">
              <h4>Scan with Telegram</h4>
              <img src={qrCodeUrl} alt="Telegram QR Code" className="qr-code" />
              <p className="qr-hint">Open Telegram &gt; Settings &gt; Devices &gt; Link Desktop Device</p>
              <div style={{
                marginTop: '12px',
                marginBottom: '20px',
                padding: '10px',
                backgroundColor: '#e0f2fe',
                borderRadius: '6px',
                fontSize: '13px',
                color: '#0369a1'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <span className="spinner" style={{
                    display: 'inline-block',
                    width: '14px',
                    height: '14px',
                    border: '2px solid #bfdbfe',
                    borderTopColor: '#0369a1',
                    borderRadius: '50%',
                    animation: 'spin 1s linear infinite'
                  }}></span>
                  <span>Waiting for you to scan the QR code on your phone...</span>
                </div>
                <div style={{ textAlign: 'center', marginTop: '6px', fontSize: '12px', color: '#075985' }}>
                  💡 Check browser console (F12) for detailed status
                </div>
              </div>
              <button
                className="btn-cancel"
                onClick={() => {
                  setQrCodeUrl(null);
                  setAuthTempId(null);
                }}
                style={{ marginTop: '8px' }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="auth-prompt">
              <div className="auth-icon">🔐</div>
              <h4>Connect Your Telegram</h4>
              <p>To monitor Telegram groups for trading signals, you need to authorize your Telegram account.</p>
              <button
                className="btn-connect"
                onClick={handleInitiateAuth}
                disabled={authLoading}
              >
                {authLoading ? '⏳ Loading...' : '🔗 Connect Telegram'}
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 已授权用户信息 */}
          <div className="auth-info">
            <div className="user-info">
              <span className="user-avatar">👤</span>
              <div>
                <div className="user-name">{telegramUser?.name || 'Telegram User'}</div>
                {telegramUser?.username && (
                  <div className="user-username">@{telegramUser.username}</div>
                )}
              </div>
            </div>
            <button
              className="btn-disconnect"
              onClick={handleRevokeAuth}
              disabled={authLoading}
            >
              Disconnect
            </button>
          </div>

          {/* 新增群组表单 */}
          <div className="add-group-form">
            <h4>Add Monitoring Group ({monitoredGroups.length}/{maxGroups})</h4>

            {/* 群组搜索框 */}
            <div className="group-search-box">
              <input
                type="text"
                value={groupSearchQuery}
                onChange={(e) => setGroupSearchQuery(e.target.value)}
                placeholder="🔍 Search groups by name..."
                className="group-search-input"
                disabled={isLoading || monitoredGroups.length >= maxGroups}
              />
              {groupSearchQuery && (
                <button
                  className="search-clear-btn"
                  onClick={() => setGroupSearchQuery('')}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
              <span className="search-result-count">
                {filteredAvailableGroups.length} groups available
              </span>
            </div>

            {/* 可选群组列表 - 直接显示卡片 */}
            <div className="available-groups-list">
              {filteredAvailableGroups.length === 0 ? (
                <div className="no-groups-hint">
                  {groupSearchQuery ? 'No groups match your search' : 'No available groups'}
                </div>
              ) : (
                filteredAvailableGroups.slice(0, 10).map((group) => (
                  <div
                    key={group.chatId}
                    className={`available-group-card ${selectedGroupId === group.chatId ? 'selected' : ''}`}
                    onClick={() => {
                      if (!isLoading && monitoredGroups.length < maxGroups) {
                        setSelectedGroupId(group.chatId);
                      }
                    }}
                  >
                    <span className="group-icon">{group.chatType === 'CHANNEL' ? '📢' : '👥'}</span>
                    <div className="group-info">
                      <span className="group-name">{group.chatTitle || 'Unknown'}</span>
                      {group.chatUsername && <span className="group-username">@{group.chatUsername}</span>}
                    </div>
                    {(group.memberCount ?? 0) > 0 && <span className="group-members">{group.memberCount} members</span>}
                  </div>
                ))
              )}
              {filteredAvailableGroups.length > 10 && (
                <div className="more-groups-hint">
                  +{filteredAvailableGroups.length - 10} more groups. Use search to find specific groups.
                </div>
              )}
            </div>

            {/* 选中后显示配置选项 */}
            {selectedGroupId && (
              <div className="selected-group-config">
                <div className="selected-group-info">
                  Selected: <strong>{availableGroups.find(g => g.chatId === selectedGroupId)?.chatTitle}</strong>
                </div>
                <div className="config-row">
                  <div className="form-group">
                    <label>Trust Mode</label>
                    <select
                      value={newGroupConfig.trustMode}
                      onChange={(e) => setNewGroupConfig({ ...newGroupConfig, trustMode: e.target.value as any })}
                      disabled={isLoading || monitoredGroups.length >= maxGroups}
                    >
                      <option value="STRICT">STRICT (AI Verify)</option>
                      <option value="BALANCED">BALANCED (Default)</option>
                      <option value="AGGRESSIVE">AGGRESSIVE (High Risk)</option>
                    </select>
                  </div>

                  <button
                    className="btn-add-group"
                    onClick={handleAddGroup}
                    disabled={isLoading || monitoredGroups.length >= maxGroups || !selectedGroupId}
                  >
                    {isLoading ? '⏳ Adding...' : '➕ Add Group'}
                  </button>
                </div>
              </div>
            )}

            <div className="trust-mode-info">
              <div className="info-item">
                <strong>STRICT:</strong> Only execute when AI confirms the signal (safest)
              </div>
              <div className="info-item">
                <strong>BALANCED:</strong> Execute signals with confidence &gt; threshold
              </div>
              <div className="info-item">
                <strong>AGGRESSIVE:</strong> Execute most signals immediately (highest risk)
              </div>
            </div>
          </div>

          {/* 监控群组列表 */}
          <div className="group-list">
            <h4>Monitored Groups</h4>

            {monitoredGroups.length === 0 ? (
              <div className="empty-state">
                <p>No groups configured yet. Add your first group to start monitoring!</p>
              </div>
            ) : (
              <div className="group-cards">
                {monitoredGroups.map((group) => (
                  <div key={group.chatId} className={`group-card ${!group.enabled ? 'disabled' : ''}`}>
                    <div className="group-header">
                      <div className="group-info">
                        <h5>
                          {group.chatType === 'CHANNEL' ? '📢' : '👥'} {group.chatTitle}
                        </h5>
                        {editingGroupId !== group.chatId && (
                          <span className={`trust-badge ${group.trustMode.toLowerCase()}`}>
                            {group.trustMode}
                          </span>
                        )}
                      </div>
                      <div className="group-actions">
                        <label className="toggle-switch">
                          <input
                            type="checkbox"
                            checked={group.enabled}
                            onChange={(e) => handleToggleGroup(group.chatId, e.target.checked)}
                            disabled={editingGroupId !== null}
                          />
                          <span className="slider"></span>
                        </label>
                        {editingGroupId !== group.chatId && (
                          <button
                            className="btn-edit"
                            onClick={() => handleEditGroup(group)}
                            disabled={isLoading || editingGroupId !== null}
                            title="Edit Configuration"
                          >
                            ✏️
                          </button>
                        )}
                        <button
                          className="btn-remove"
                          onClick={() => handleRemoveGroup(group.chatId, group.chatTitle)}
                          disabled={isLoading || editingGroupId !== null}
                          title="Remove Group"
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {editingGroupId === group.chatId && editingConfig ? (
                      <div className="edit-group-config">
                        <div className="form-group">
                          <label>Trust Mode</label>
                          <select
                            value={editingConfig.trustMode}
                            onChange={(e) => setEditingConfig({
                              ...editingConfig,
                              trustMode: e.target.value as 'STRICT' | 'BALANCED' | 'AGGRESSIVE'
                            })}
                            disabled={isLoading}
                          >
                            <option value="STRICT">STRICT (AI Verify)</option>
                            <option value="BALANCED">BALANCED (Default)</option>
                            <option value="AGGRESSIVE">AGGRESSIVE (High Risk)</option>
                          </select>
                        </div>
                        <div className="edit-actions">
                          <button
                            className="btn-save"
                            onClick={() => handleSaveEdit(group.chatId)}
                            disabled={isLoading}
                          >
                            ✓ Save
                          </button>
                          <button
                            className="btn-cancel-edit"
                            onClick={handleCancelEdit}
                            disabled={isLoading}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group-stats">
                        <div className="stat">
                          <span className="label">Signals:</span>
                          <span className="value">{group.signalCount || 0}</span>
                        </div>
                        <div className="stat">
                          <span className="label">Min Confidence:</span>
                          <span className="value">{(group.minConfidence * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 刷新按钮 */}
          <div className="refresh-section">
            <button
              className="btn-refresh"
              onClick={loadAvailableGroups}
              disabled={isLoading}
            >
              🔄 Refresh Groups
            </button>
          </div>
        </>
      )}
    </div>
  );
}
