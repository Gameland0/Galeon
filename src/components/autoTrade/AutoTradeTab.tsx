/**
 * Auto Trade Tab Component
 * 🔧 修复：不再创建独立的 PrivyWalletProvider，避免重复实例化导致无限循环
 * PrivyWalletProvider 现在由父组件 AlphaAgentPage 提供
 */

import React, { useState } from 'react';
import { useWallet } from '../../contexts/PrivyWalletContext'; // 🔧 只导入 useWallet hook
import WalletManager from './WalletManager';
import PositionManager from './PositionManager';
import TradeLogs from './TradeLogs';
import { TwitterKOLConfig } from './TwitterKOLConfig';
import { TelegramGroupConfig } from './TelegramGroupConfig';
import { KOLSignalHistory } from './KOLSignalHistory';
import { TelegramSignalHistory } from './TelegramSignalHistory';
import { RangeMonitor } from './RangeMonitor';
import { SignalMonitor } from './SignalMonitor';
import TelegramBotBind from './TelegramBotBind';

interface AutoTradeSettings {
  chain: 'BSC' | 'Base' | 'Solana';
  tradeAmountUsdt: number;
  maxSlippage: number; // 最大滑点百分比
  stopLossPercent: number;
  takeProfitPercent: number;
  maxPositions: number;
  // Follow strategy configuration
  followStrategy: 'ALL' | 'WHITELIST' | 'TOP_SIGNALS' | 'TWITTER_KOL' | 'TELEGRAM' | 'FUSION' | 'MEME' | 'RANGE';
  whitelistedTokens: string[];
  minConfidence: number;
  // Twitter Signal configuration
  maxKOLs: number;
  twitterMinScore: number;
  // Meme Coin Strategy configuration
  memeEnableRiskCheck: boolean;   // Enable risk validation (false = trust KOL, true = check thresholds)
  memeMinLiquidity: number;       // Minimum liquidity in USD (only effective when risk check enabled)
  memeMinTxnCount: number;        // Minimum 24h transaction count (only effective when risk check enabled)
  memeSupportedChains: string[];  // Supported chains for meme coins (BSC, Base, Solana, etc.)
  // Meme Radar signal source configuration
  memeRadarEnabled: boolean;      // Enable Meme Radar AI as signal source
  memeRadarMinScore: number;      // Minimum radar score to trigger trade (0-100)
  memeRadarSignalLevel: 'STRONG_BUY_ONLY' | 'STRONG_BUY_AND_BUY' | 'STRONG_BUY_AND_WATCH'; // Signal level filter
  memeRadarUseTradingPlan: boolean; // Use signal's built-in entry/SL/TP vs strategy defaults
  // Dynamic Stop Loss configuration
  stopLossMode: 'FIXED' | 'ATR' | 'TRAILING';
  atrMultiplier: number;          // ATR multiplier for stop loss (default 2.0)
  trailingActivationPct: number;  // Profit % to activate trailing stop (default 5.0)
  trailingStopPct: number;        // Trailing stop % below high (default 3.0)
  // Partial Take Profit configuration
  partialTpEnabled: boolean;      // Enable partial take profit
  partialTpRules: { profitPct: number; sellPct: number }[]; // Partial TP rules
  // Range Trading configuration
  rangeTakeProfitPercent: number; // Range Trading take profit % (default 10)
  rangeStopLossPercent: number;   // Range Trading stop loss % (default 5)
}

/**
 * Auto Trade content component (inside Privy Provider)
 */
function AutoTradeContent() {
  const { address: privyAddress, privyUserId, isConnected, login, getAccessToken, solanaAddress } = useWallet();

  // Wait for wallet creation if connected but no address
  React.useEffect(() => {
    if (isConnected && !privyAddress) {
      // console.log('⏳ Waiting for Privy to create embedded wallet...');
    }
  }, [isConnected, privyAddress]);
  const [autoTradeSubTab, setAutoTradeSubTab] = useState<'wallet' | 'strategy' | 'settings' | 'signals' | 'positions' | 'history'>('wallet');

  const [autoTradeSettings, setAutoTradeSettings] = useState<AutoTradeSettings>({
    chain: 'BSC',
    tradeAmountUsdt: 50,
    maxSlippage: 2.0, // 默认2%滑点
    stopLossPercent: 10,
    takeProfitPercent: 20,
    maxPositions: 5,
    // Default follow strategy
    followStrategy: 'TOP_SIGNALS',
    whitelistedTokens: [],
    minConfidence: 80,
    // Default Twitter Signal configuration
    maxKOLs: 3,
    twitterMinScore: 70,
    // Default Meme Coin Strategy configuration
    memeEnableRiskCheck: false,  // Default: trust KOL directly (early meme hunting mode)
    memeMinLiquidity: 50000,
    memeMinTxnCount: 100,
    memeSupportedChains: ['BSC', 'Base'],
    // Default Meme Radar signal source configuration
    memeRadarEnabled: false,
    memeRadarMinScore: 70,
    memeRadarSignalLevel: 'STRONG_BUY_ONLY',
    memeRadarUseTradingPlan: true,
    // Default Dynamic Stop Loss configuration
    stopLossMode: 'FIXED',
    atrMultiplier: 2.0,
    trailingActivationPct: 5.0,
    trailingStopPct: 3.0,
    // Default Partial Take Profit configuration
    partialTpEnabled: false,
    partialTpRules: [
      { profitPct: 50, sellPct: 30 },
      { profitPct: 100, sellPct: 30 },
      { profitPct: 200, sellPct: 40 },
    ],
    // Default Range Trading configuration
    rangeTakeProfitPercent: 10,
    rangeStopLossPercent: 5,
  });

  // 🔧 Trade Amount 使用 string state 避免小数输入问题 (0.1 等)
  const [tradeAmountInput, setTradeAmountInput] = useState<string>(String(autoTradeSettings.tradeAmountUsdt));

  // Available token list (loaded from server)
  const [availableTokens, setAvailableTokens] = useState<string[]>([]);

  // Token search keyword
  const [tokenSearchQuery, setTokenSearchQuery] = useState<string>('');

  // Save success status
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Strategy list (max 3)
  const [strategies, setStrategies] = useState<any[]>([]);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [editingStrategyId, setEditingStrategyId] = useState<number | null>(null);
  const [newStrategyName, setNewStrategyName] = useState<string>(''); // New strategy name input

  // Signal History Modal
  const [showSignalHistory, setShowSignalHistory] = useState<boolean>(false);
  const [signalHistoryStrategyId, setSignalHistoryStrategyId] = useState<number | null>(null);
  const [signalHistorySource, setSignalHistorySource] = useState<'twitter' | 'telegram'>('twitter');

  // Range Trading Token Management
  const [rangeTokens, setRangeTokens] = useState<Array<{
    id: number;
    contract_address: string;
    chain: string;
    token_symbol: string;
    token_name: string;
    status: string;
  }>>([]);
  const [newRangeTokenAddress, setNewRangeTokenAddress] = useState<string>('');
  const [newRangeTokenChain, setNewRangeTokenChain] = useState<'BSC' | 'Base' | 'Solana'>('BSC');
  const [isAddingRangeToken, setIsAddingRangeToken] = useState<boolean>(false);
  const [rangeTokenError, setRangeTokenError] = useState<string>('');

  // Range Trading Alpha Token Selection
  const [rangeAlphaTokens, setRangeAlphaTokens] = useState<string[]>([]);
  const [rangeAlphaSearchQuery, setRangeAlphaSearchQuery] = useState<string>('');

  // Range Trading Monitor Modal
  const [showRangeMonitor, setShowRangeMonitor] = useState<boolean>(false);

  // Circuit Breaker (熔断) State
  const [circuitBreaker, setCircuitBreaker] = useState<{
    enabled: boolean;
    threshold: number;
    durationMinutes: number;
    dailyLossLimit: number;
    isPaused: boolean;
    pausedUntil: string | null;
    pauseReason: string | null;
  }>({
    enabled: true,
    threshold: 3,
    durationMinutes: 60,
    dailyLossLimit: -10,
    isPaused: false,
    pausedUntil: null,
    pauseReason: null,
  });
  const [circuitBreakerLoading, setCircuitBreakerLoading] = useState<boolean>(false);
  const [circuitBreakerSaveSuccess, setCircuitBreakerSaveSuccess] = useState<boolean>(false);
  const [showCircuitBreakerPopup, setShowCircuitBreakerPopup] = useState<boolean>(false);

  // Show circuit breaker popup when paused (only once per session)
  React.useEffect(() => {
    if (circuitBreaker.isPaused) {
      const popupShownKey = `circuit_breaker_popup_shown_${circuitBreaker.pausedUntil}`;
      const alreadyShown = sessionStorage.getItem(popupShownKey);
      if (!alreadyShown) {
        setShowCircuitBreakerPopup(true);
        sessionStorage.setItem(popupShownKey, 'true');
      }
    }
  }, [circuitBreaker.isPaused, circuitBreaker.pausedUntil]);

  // Load available token list (based on selected chain)
  React.useEffect(() => {
    const loadAvailableTokens = async () => {
      try {
        // Filter tokens based on selected chain
        const response = await fetch(`/api/auto-trade/available-tokens?chain=${autoTradeSettings.chain}`);
        if (response.ok) {
          const data = await response.json();
          setAvailableTokens(data.tokens || []);
          // console.log(`✅ Loaded ${autoTradeSettings.chain} token list:`, data.tokens?.length, 'tokens');
        }
      } catch (error) {
        // console.error('❌ Failed to load token list:', error);
      }
    };

    loadAvailableTokens();
  }, [autoTradeSettings.chain]); // Listen to chain changes, reload tokens

  // Load Range Trading tokens
  const loadRangeTokens = React.useCallback(async () => {
    if (!privyUserId) return;
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch(`/api/auto-trade/range-tokens/${privyUserId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setRangeTokens(data.data || []);
        }
      }
    } catch (error) {
      console.error('Failed to load range tokens:', error);
    }
  }, [privyUserId, getAccessToken]);

  // Load range tokens when strategy is RANGE
  React.useEffect(() => {
    if (autoTradeSettings.followStrategy === 'RANGE' && privyUserId) {
      loadRangeTokens();
    }
  }, [autoTradeSettings.followStrategy, privyUserId, loadRangeTokens]);

  // Load Circuit Breaker status
  const loadCircuitBreakerStatus = React.useCallback(async () => {
    if (!privyUserId) return;
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch('/api/auto-trade/circuit-breaker/status', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCircuitBreaker(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to load circuit breaker status:', error);
    }
  }, [privyUserId, getAccessToken]);

  // Load circuit breaker status when user logs in
  React.useEffect(() => {
    if (privyUserId) {
      loadCircuitBreakerStatus();
    }
  }, [privyUserId, loadCircuitBreakerStatus]);

  // Save Circuit Breaker config
  const handleSaveCircuitBreaker = async () => {
    setCircuitBreakerLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch('/api/auto-trade/circuit-breaker/config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          enabled: circuitBreaker.enabled,
          threshold: circuitBreaker.threshold,
          durationMinutes: circuitBreaker.durationMinutes,
          dailyLossLimit: circuitBreaker.dailyLossLimit,
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCircuitBreakerSaveSuccess(true);
          setTimeout(() => setCircuitBreakerSaveSuccess(false), 3000);
        }
      }
    } catch (error) {
      console.error('Failed to save circuit breaker config:', error);
    } finally {
      setCircuitBreakerLoading(false);
    }
  };

  // Unpause Circuit Breaker
  const handleUnpauseCircuitBreaker = async () => {
    setCircuitBreakerLoading(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch('/api/auto-trade/circuit-breaker/unpause', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCircuitBreaker(prev => ({
            ...prev,
            isPaused: false,
            pausedUntil: null,
            pauseReason: null,
          }));
        }
      }
    } catch (error) {
      console.error('Failed to unpause circuit breaker:', error);
    } finally {
      setCircuitBreakerLoading(false);
    }
  };

  // Add Range Token
  const handleAddRangeToken = async () => {
    if (!newRangeTokenAddress.trim()) {
      setRangeTokenError('Please enter a contract address');
      return;
    }
    if (!/^0x[a-fA-F0-9]{40}$/.test(newRangeTokenAddress.trim())) {
      setRangeTokenError('Invalid contract address format');
      return;
    }

    setIsAddingRangeToken(true);
    setRangeTokenError('');

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        setRangeTokenError('Authentication failed');
        return;
      }

      const response = await fetch('/api/auto-trade/range-tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          userId: privyUserId,
          contractAddress: newRangeTokenAddress.trim(),
          chain: newRangeTokenChain
        })
      });

      const data = await response.json();
      if (data.success) {
        setNewRangeTokenAddress('');
        loadRangeTokens();
      } else {
        setRangeTokenError(data.error || 'Failed to add token');
      }
    } catch (error) {
      setRangeTokenError('Network error, please try again');
    } finally {
      setIsAddingRangeToken(false);
    }
  };

  // Remove Range Token
  const handleRemoveRangeToken = async (contractAddress: string, chain: string) => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch(
        `/api/auto-trade/range-tokens/${privyUserId}/${contractAddress}?chain=${chain}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );

      if (response.ok) {
        loadRangeTokens();
      }
    } catch (error) {
      console.error('Failed to remove token:', error);
    }
  };

  // Load user's saved configuration
  React.useEffect(() => {
    const loadUserSettings = async () => {
      if (!privyAddress) return;

      try {
        const accessToken = await getAccessToken();
        if (!accessToken) return;

        const response = await fetch('/api/auto-trade/settings', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            // Safely parse whitelistedTokens
            let whitelistedTokens = [];
            try {
              if (data.data.whitelisted_tokens && typeof data.data.whitelisted_tokens === 'string') {
                whitelistedTokens = JSON.parse(data.data.whitelisted_tokens);
              } else if (Array.isArray(data.data.whitelisted_tokens)) {
                whitelistedTokens = data.data.whitelisted_tokens;
              }
            } catch (e) {
              // console.warn('⚠️ Failed to parse whitelist tokens:', e);
              whitelistedTokens = [];
            }

            const loadedAmount = data.data.trade_amount_usdt || 50;
            setTradeAmountInput(String(loadedAmount));
            setAutoTradeSettings({
              chain: data.data.chain || 'BSC',
              tradeAmountUsdt: loadedAmount,
              maxSlippage: data.data.max_slippage_percent || 2.0,
              stopLossPercent: data.data.stop_loss_percent || 10,
              takeProfitPercent: data.data.take_profit_percent || 20,
              maxPositions: data.data.max_positions || 5,
              followStrategy: data.data.follow_strategy || 'TOP_SIGNALS',
              whitelistedTokens: whitelistedTokens,
              minConfidence: data.data.min_confidence || 80,
              maxKOLs: data.data.max_kols || 3,
              twitterMinScore: data.data.twitter_min_score || 70,
              // Dynamic Stop Loss fields
              stopLossMode: data.data.stop_loss_mode || 'FIXED',
              atrMultiplier: parseFloat(data.data.atr_multiplier) || 2.0,
              trailingActivationPct: parseFloat(data.data.trailing_activation_pct) || 5.0,
              trailingStopPct: parseFloat(data.data.trailing_stop_pct) || 3.0,
              // Partial Take Profit fields
              partialTpEnabled: data.data.partial_tp_enabled || false,
              partialTpRules: data.data.partial_tp_rules || [
                { profitPct: 50, sellPct: 30 },
                { profitPct: 100, sellPct: 30 },
                { profitPct: 200, sellPct: 40 },
              ],
              // Meme Coin Strategy fields
              memeEnableRiskCheck: data.data.meme_enable_risk_check || false,
              memeMinLiquidity: data.data.meme_min_liquidity || 50000,
              memeMinTxnCount: data.data.meme_min_txn_count || 100,
              memeSupportedChains: data.data.meme_supported_chains || ['BSC', 'Base', 'Solana'],
              // Meme Radar signal source fields
              memeRadarEnabled: data.data.meme_radar_enabled || false,
              memeRadarMinScore: data.data.meme_radar_min_score || 70,
              memeRadarSignalLevel: data.data.meme_radar_signal_level || 'STRONG_BUY_ONLY',
              memeRadarUseTradingPlan: data.data.meme_radar_use_trading_plan !== undefined ? data.data.meme_radar_use_trading_plan : true,
              // Range Trading fields
              rangeTakeProfitPercent: data.data.range_take_profit_percent || 10,
              rangeStopLossPercent: data.data.range_stop_loss_percent || 5,
            });
          }
        }
      } catch (error) {
        // console.error('❌ Failed to load user configuration:', error);
      }
    };

    loadUserSettings();
  }, [privyAddress, getAccessToken]);

  // Load strategy list
  const loadStrategies = async () => {
    if (!privyAddress) return;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return;

      const response = await fetch('/api/auto-trade/strategies', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStrategies(data.data || []);
          // console.log(`✅ Loaded ${data.count} strategies`, data.data);
        }
      }
    } catch (error) {
      // console.error('❌ Failed to load strategy list:', error);
    }
  };

  // Load strategies when wallet address changes
  React.useEffect(() => {
    if (privyAddress) {
      loadStrategies();
    }
  }, [privyAddress]);

  // Load strategy data to form when editing
  React.useEffect(() => {
    if (editingStrategyId && strategies.length > 0) {
      const strategy = strategies.find(s => s.strategy_id === editingStrategyId);
      if (strategy) {
        // 如果是 Range Trading 策略，使用通用止盈止损来初始化 Range Trading 参数
        const isRangeStrategy = strategy.follow_strategy === 'RANGE';
        const rangeTp = isRangeStrategy ? (parseFloat(strategy.take_profit_percent) || 10) : 10;
        // Range Trading uses positive stop loss values, so convert negative to positive
        const rangeSl = isRangeStrategy ? Math.abs(parseFloat(strategy.stop_loss_percent) || 5) : 5;

        const editAmount = parseFloat(strategy.max_trade_amount) || 50;
        setTradeAmountInput(String(editAmount));
        setAutoTradeSettings({
          chain: strategy.supported_chains?.[0] || 'BSC',
          tradeAmountUsdt: editAmount,
          maxSlippage: parseFloat(strategy.max_slippage_percent) || 2.0,
          // Range Trading syncs to general params, so ensure consistent positive values
          stopLossPercent: isRangeStrategy ? Math.abs(parseFloat(strategy.stop_loss_percent) || 10) : parseFloat(strategy.stop_loss_percent) || 10,
          takeProfitPercent: parseFloat(strategy.take_profit_percent) || 20,
          maxPositions: strategy.max_positions || 5,
          followStrategy: strategy.follow_strategy || 'TOP_SIGNALS',
          whitelistedTokens: strategy.whitelisted_tokens || [],
          minConfidence: parseFloat(strategy.min_confidence) || 80,
          maxKOLs: strategy.max_kols || 3,
          twitterMinScore: strategy.twitter_min_score || 70,
          // Dynamic Stop Loss fields
          stopLossMode: strategy.stop_loss_mode || 'FIXED',
          atrMultiplier: parseFloat(strategy.atr_multiplier) || 2.0,
          trailingActivationPct: parseFloat(strategy.trailing_activation_pct) || 5.0,
          trailingStopPct: parseFloat(strategy.trailing_stop_pct) || 3.0,
          // Partial Take Profit fields
          partialTpEnabled: strategy.partial_tp_enabled || false,
          partialTpRules: strategy.partial_tp_rules || [
            { profitPct: 50, sellPct: 30 },
            { profitPct: 100, sellPct: 30 },
            { profitPct: 200, sellPct: 40 },
          ],
          // Meme Coin Strategy fields
          memeEnableRiskCheck: strategy.meme_enable_risk_check || false,
          memeMinLiquidity: strategy.meme_min_liquidity || 50000,
          memeMinTxnCount: strategy.meme_min_txn_count || 100,
          memeSupportedChains: strategy.meme_supported_chains || ['BSC', 'Base', 'Solana'],
          // Meme Radar signal source fields
          memeRadarEnabled: strategy.meme_radar_enabled || false,
          memeRadarMinScore: strategy.meme_radar_min_score || 70,
          memeRadarSignalLevel: strategy.meme_radar_signal_level || 'STRONG_BUY_ONLY',
          memeRadarUseTradingPlan: strategy.meme_radar_use_trading_plan !== undefined ? strategy.meme_radar_use_trading_plan : true,
          // Range Trading fields - 与通用参数保持同步
          rangeTakeProfitPercent: rangeTp,
          rangeStopLossPercent: rangeSl,
        });

        // ✅ Fix: Load Range Trading Alpha tokens into rangeAlphaTokens state
        // 无论 whitelisted_tokens 是什么值 ([], null, undefined, ["LAB"]), 都要同步到状态
        if (isRangeStrategy) {
          setRangeAlphaTokens(strategy.whitelisted_tokens || []);
        } else {
          // 如果不是 Range Trading 策略，清空 Range Alpha Tokens 状态
          setRangeAlphaTokens([]);
        }
      }
    }
  }, [editingStrategyId, strategies]);

  const handleSaveAutoTradeSettings = async () => {
    if (!privyAddress) {
      alert('Please connect Privy wallet first');
      return;
    }

    try {
      // Get Privy access token
      const accessToken = await getAccessToken();
      // console.log('🔑 Access Token result:', accessToken ? `${accessToken.substring(0, 20)}...` : 'null');

      if (!accessToken) {
        alert('Unable to get access token, please login again');
        return;
      }

      // console.log('📤 Sending save configuration request...', {
      //   userId: privyUserId,
      //   walletAddress: privyAddress,
      //   chain: autoTradeSettings.chain,
      //   chainType: typeof autoTradeSettings.chain,
      //   chainIsArray: Array.isArray(autoTradeSettings.chain),
      //   fullSettings: autoTradeSettings,
      //   tradeAmountUsdt: autoTradeSettings.tradeAmountUsdt,
      // });

      // Prepare request data - use privyUserId as unique user identifier
      const requestData: any = {
        userId: privyUserId,           // Privy User ID (unique identifier)
        walletAddress: privyAddress,   // Embedded Wallet Address (for trading)
        solanaWalletAddress: solanaAddress || undefined, // Solana wallet address (if exists)
        ...autoTradeSettings,
        // Ensure chain is string format, not array
        chain: Array.isArray(autoTradeSettings.chain)
          ? autoTradeSettings.chain[0]
          : autoTradeSettings.chain,
        // ✅ Fix: Include selected Range Trading Alpha tokens
        whitelistedTokens: autoTradeSettings.followStrategy === 'RANGE'
          ? rangeAlphaTokens
          : autoTradeSettings.whitelistedTokens,
      };

      // console.log('📦 requestData:', requestData);

      // Fix: Strategy name is required, remove "default strategy" fallback
      if (editingStrategyId) {
        requestData.strategyId = editingStrategyId;
        const editingStrategy = strategies.find(s => s.strategy_id === editingStrategyId);
        if (!editingStrategy?.strategy_name?.trim()) {
          alert('Please enter strategy name');
          return;
        }
        requestData.strategyName = editingStrategy.strategy_name;
      } else if (isCreatingNew) {
        // New strategy, use user input name
        if (!newStrategyName.trim()) {
          alert('Please enter strategy name');
          return;
        }
        requestData.strategyName = newStrategyName.trim();
      } else {
        // Other cases, strategy name is required
        alert('Please enter strategy name');
        return;
      }

      const response = await fetch('/api/auto-trade/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify(requestData),
      });

      // console.log('📥 Response status:', response.status);

      if (response.ok) {
        // Show save success status
        setSaveSuccess(true);

        // Reload strategy list
        await loadStrategies();

        // Auto hide success message and jump to Strategy tab after 2 seconds
        setTimeout(() => {
          setSaveSuccess(false);
          setAutoTradeSubTab('strategy');
          setIsCreatingNew(false);
          setEditingStrategyId(null);
          setNewStrategyName(''); // Clear strategy name input
        }, 2000);
      } else {
        const error = await response.json();
        // console.error('❌ Failed to save details:', error);
        alert(`Failed to save: ${error.message || 'Unknown error'}`);
      }
    } catch (error) {
      // console.error('❌ Save configuration exception:', error);
      alert('Failed to save configuration, please try again later');
    }
  };

  return (
    <div className="auto-trade-content">
      {/* Sub Tab Navigation */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        {['wallet', 'strategy', 'settings', 'signals', 'positions', 'history'].map((tab) => (
          <button
            key={tab}
            onClick={() => setAutoTradeSubTab(tab as any)}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: '600',
              border: 'none',
              background: 'none',
              color: autoTradeSubTab === tab ? '#3b82f6' : '#6b7280',
              borderBottom:
                autoTradeSubTab === tab ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '-1px',
            }}
          >
            {tab === 'wallet' && '💰 Wallet'}
            {tab === 'strategy' && '🎯 Strategy'}
            {tab === 'settings' && '⚙️ Settings'}
            {tab === 'signals' && '📡 Signals'}
            {tab === 'positions' && '📈 Positions'}
            {tab === 'history' && '📜 History'}
          </button>
        ))}
      </div>

      {/* Wallet Sub Tab */}
      {autoTradeSubTab === 'wallet' && <WalletManager />}

      {/* Strategy Sub Tab */}
      {autoTradeSubTab === 'strategy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Title and new button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>My Strategies ({strategies.length}/3)</h3>
            {strategies.length < 3 && (
              <button
                onClick={() => {
                  setIsCreatingNew(true);
                  setEditingStrategyId(null); // Reset editing state to avoid conflict
                  setNewStrategyName(''); // Clear input
                  setRangeAlphaTokens([]); // ✅ 重置 Range Trading token 选择
                  setAutoTradeSubTab('settings');
                }}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(102, 126, 234, 0.4)',
                }}
              >
                ➕ New Strategy
              </button>
            )}
          </div>

          {/* Strategy list */}
          {strategies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
              <div style={{ fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>No Strategies Yet</div>
              <div style={{ fontSize: '14px' }}>Click "New Strategy" to create your first auto trading strategy</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '16px' }}>
              {strategies.map((strategy) => (
                <div
                  key={strategy.strategy_id}
                  style={{
                    background: strategy.is_active ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : '#f3f4f6',
                    borderRadius: '12px',
                    padding: '20px',
                    color: strategy.is_active ? 'white' : '#374151',
                    boxShadow: strategy.is_active ? '0 4px 12px rgba(102, 126, 234, 0.3)' : 'none',
                    opacity: strategy.is_active ? 1 : 0.7,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: '700' }}>
                        {strategy.strategy_name}
                      </h4>
                      <div style={{ fontSize: '12px', opacity: 0.8 }}>
                        {strategy.is_active ? '✅ Enabled' : '⏸️ Disabled'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {/* Start/Stop button */}
                      <button
                        onClick={async () => {
                          try {
                            const accessToken = await getAccessToken();
                            const response = await fetch(`/api/auto-trade/strategies/${strategy.strategy_id}/toggle`, {
                              method: 'PATCH',
                              headers: {
                                'Authorization': `Bearer ${accessToken}`,
                                'Content-Type': 'application/json',
                              },
                              body: JSON.stringify({ isActive: !strategy.is_active }),
                            });

                            if (response.ok) {
                              await loadStrategies();
                            } else {
                              const data = await response.json();
                              alert(data.message || 'Action failed');
                            }
                          } catch (error) {
                            // console.error('Failed to toggle strategy status:', error);
                            alert('Action failed, please try again');
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: strategy.is_active ? 'rgba(255, 165, 0, 0.2)' : 'rgba(34, 197, 94, 0.2)',
                          color: strategy.is_active ? (strategy.is_active ? '#d97706' : 'white') : '#16a34a',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                        }}
                      >
                        {strategy.is_active ? '⏸️ Stop' : '▶️ Start'}
                      </button>

                      <button
                        onClick={() => {
                          setEditingStrategyId(strategy.strategy_id);
                          setIsCreatingNew(false); // Reset creating state to avoid conflict
                          setAutoTradeSubTab('settings');
                        }}
                        style={{
                          padding: '6px 12px',
                          background: strategy.is_active ? 'rgba(255, 255, 255, 0.2)' : '#e5e7eb',
                          color: strategy.is_active ? 'white' : '#374151',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        ✏️ Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (window.confirm(`Are you sure to delete strategy "${strategy.strategy_name}"?`)) {
                            try {
                              const accessToken = await getAccessToken();
                              const response = await fetch(`/api/auto-trade/strategies/${strategy.strategy_id}`, {
                                method: 'DELETE',
                                headers: { 'Authorization': `Bearer ${accessToken}` },
                              });
                              if (response.ok) {
                                await loadStrategies();
                              }
                            } catch (error) {
                              // console.error('Failed to delete:', error);
                            }
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: strategy.is_active ? 'rgba(255, 0, 0, 0.2)' : '#fca5a5',
                          color: strategy.is_active ? 'white' : '#991b1b',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', fontSize: '13px' }}>
                    <div>
                      <div style={{ opacity: 0.8, marginBottom: '4px' }}>Trading Chain</div>
                      <div style={{ fontWeight: '600' }}>
                        {(() => {
                          // Handle supported_chains as array, nested array, or string
                          let chainValue = strategy.supported_chains;

                          // If array, get first element
                          while (Array.isArray(chainValue) && chainValue.length > 0) {
                            chainValue = chainValue[0];
                          }

                          // If string, try JSON parse
                          if (typeof chainValue === 'string') {
                            try {
                              const parsed = JSON.parse(chainValue);
                              // Recursively parse nested arrays
                              while (Array.isArray(parsed) && parsed.length > 0) {
                                chainValue = parsed[0];
                              }
                            } catch (e) {
                              // If not JSON, use original value
                            }
                          }

                          // console.log('🔍 Chain display logic:', {
                          //   rawValue: strategy.supported_chains,
                          //   processed: chainValue,
                          //   type: typeof chainValue
                          // });
                          return chainValue === 'BSC' ? '🔶 BSC' : chainValue === 'Solana' ? '🟣 Solana' : '🔷 Base';
                        })()}
                      </div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.8, marginBottom: '4px' }}>Trade Amount</div>
                      <div style={{ fontWeight: '600' }}>
                        {strategy.max_trade_amount} {(strategy.supported_chains?.[0] || '').toString().includes('Solana') ? 'SOL' : 'USDT'}
                      </div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.8, marginBottom: '4px' }}>Max Slippage</div>
                      <div style={{ fontWeight: '600' }}>{strategy.max_slippage_percent || 2.0}%</div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.8, marginBottom: '4px' }}>Max Positions</div>
                      <div style={{ fontWeight: '600' }}>{strategy.max_positions}</div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.8, marginBottom: '4px' }}>Stop Loss Mode</div>
                      <div style={{ fontWeight: '600' }}>
                        {strategy.stop_loss_mode === 'ATR' && '📊 ATR'}
                        {strategy.stop_loss_mode === 'TRAILING' && '📈 Trailing'}
                        {(!strategy.stop_loss_mode || strategy.stop_loss_mode === 'FIXED') && '📌 Fixed'}
                      </div>
                    </div>
                    <div>
                      <div style={{ opacity: 0.8, marginBottom: '4px' }}>Follow Strategy</div>
                      <div style={{ fontWeight: '600' }}>
                        {strategy.follow_strategy === 'ALL' && 'All Signals'}
                        {strategy.follow_strategy === 'WHITELIST' && 'Whitelist'}
                        {strategy.follow_strategy === 'TOP_SIGNALS' && `Top (${strategy.min_confidence}%)`}
                        {strategy.follow_strategy === 'TWITTER_KOL' && '📱 Twitter KOL'}
                        {strategy.follow_strategy === 'TELEGRAM' && '💬 Telegram'}
                        {strategy.follow_strategy === 'FUSION' && '🔥 Fusion (AI + KOL)'}
                        {strategy.follow_strategy === 'MEME' && '🎯 Meme Coin'}
                        {strategy.follow_strategy === 'RANGE' && 'Range Trading'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Settings Sub Tab */}
      {autoTradeSubTab === 'settings' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Save success message */}
          {saveSuccess && (
            <div style={{
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white',
              padding: '16px 20px',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: '600',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              animation: 'slideDown 0.3s ease-out',
            }}>
              <span style={{ fontSize: '24px' }}>✅</span>
              <div>
                <div>Configuration saved successfully!</div>
                <div style={{ fontSize: '13px', opacity: 0.95, marginTop: '4px', fontWeight: '400' }}>
                  Your strategy has been updated, check 🎯 Strategy tab
                </div>
              </div>
            </div>
          )}

          {/* Configuration form */}
          <div
            className="settings-panel"
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}
          >
            <h3 style={{ marginBottom: '20px', fontSize: '18px', fontWeight: '700' }}>
              {editingStrategyId ? '✏️ Edit Strategy' : isCreatingNew ? '➕ New Strategy' : '⚙️ Modify Configuration'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Strategy name (only show when creating new) */}
            {isCreatingNew && (
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  Strategy Name <span style={{ color: 'red' }}>*</span>
                </label>
                <input
                  type="text"
                  value={newStrategyName}
                  onChange={(e) => setNewStrategyName(e.target.value)}
                  placeholder="e.g.: My BSC Strategy"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Chain Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Trading Chain
              </label>
              <select
                value={autoTradeSettings.chain}
                onChange={(e) => {
                  const newChain = e.target.value as 'BSC' | 'Base' | 'Solana';
                  const newAmount = newChain === 'Solana'
                    ? (autoTradeSettings.tradeAmountUsdt > 10 ? autoTradeSettings.tradeAmountUsdt : 0.5)
                    : (autoTradeSettings.tradeAmountUsdt < 1 ? 50 : autoTradeSettings.tradeAmountUsdt);
                  setAutoTradeSettings({
                    ...autoTradeSettings,
                    chain: newChain,
                    tradeAmountUsdt: newAmount,
                  });
                  setTradeAmountInput(String(newAmount));
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="BSC">BSC (BNB Smart Chain)</option>
                <option value="Base">Base</option>
                <option value="Solana">Solana</option>
              </select>
            </div>

            {/* Trade Amount */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Trade Amount Per Position ({autoTradeSettings.chain === 'Solana' ? 'SOL' : 'USDT'})
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={tradeAmountInput}
                onChange={(e) => {
                  const raw = e.target.value;
                  // 只允许数字和小数点
                  if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                    setTradeAmountInput(raw);
                    const num = parseFloat(raw);
                    if (!isNaN(num) && num >= 0) {
                      setAutoTradeSettings({ ...autoTradeSettings, tradeAmountUsdt: num });
                    }
                  }
                }}
                onBlur={() => {
                  const value = parseFloat(tradeAmountInput);
                  const minVal = autoTradeSettings.chain === 'Solana' ? 0.1 : 10;
                  if (isNaN(value) || value < minVal) {
                    setTradeAmountInput(String(minVal));
                    setAutoTradeSettings({ ...autoTradeSettings, tradeAmountUsdt: minVal });
                  } else {
                    setTradeAmountInput(String(value));
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Minimum: {autoTradeSettings.chain === 'Solana' ? '0.1 SOL' : '10 USDT'}
              </p>
            </div>

            {/* Max Slippage */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Max Slippage (%)
              </label>
              <input
                type="number"
                value={autoTradeSettings.maxSlippage || ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? 0 : Number(e.target.value);
                  if (value >= 0) {
                    setAutoTradeSettings({
                      ...autoTradeSettings,
                      maxSlippage: value,
                    });
                  }
                }}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (value === 0 || e.target.value === '' || value < 0.1) {
                    setAutoTradeSettings({
                      ...autoTradeSettings,
                      maxSlippage: 0.1,
                    });
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
                min="0.1"
                max="10"
                step="0.1"
              />
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Acceptable price slippage (0.1% - 10%)
              </p>
            </div>

            {/* Dynamic Stop Loss Section */}
            <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
              <label style={{ display: 'block', marginBottom: '12px', fontWeight: '700', fontSize: '16px' }}>
                🛡️ Stop Loss Mode
              </label>

              {/* Stop Loss Mode Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `2px solid ${autoTradeSettings.stopLossMode === 'FIXED' ? '#3b82f6' : '#d1d5db'}`,
                  backgroundColor: autoTradeSettings.stopLossMode === 'FIXED' ? '#eff6ff' : 'white'
                }}>
                  <input
                    type="radio"
                    name="stopLossMode"
                    value="FIXED"
                    checked={autoTradeSettings.stopLossMode === 'FIXED'}
                    onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, stopLossMode: e.target.value as any, partialTpEnabled: false })}
                    style={{ marginRight: '12px', width: '18px', height: '18px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>📌 Fixed Percentage</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Simple fixed % stop loss (beginner friendly)</div>
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `2px solid ${autoTradeSettings.stopLossMode === 'ATR' ? '#3b82f6' : '#d1d5db'}`,
                  backgroundColor: autoTradeSettings.stopLossMode === 'ATR' ? '#eff6ff' : 'white'
                }}>
                  <input
                    type="radio"
                    name="stopLossMode"
                    value="ATR"
                    checked={autoTradeSettings.stopLossMode === 'ATR'}
                    onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, stopLossMode: e.target.value as any, partialTpEnabled: false })}
                    style={{ marginRight: '12px', width: '18px', height: '18px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>📊 ATR Dynamic</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Based on market volatility (recommended)</div>
                  </div>
                </label>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  padding: '12px',
                  borderRadius: '8px',
                  border: `2px solid ${autoTradeSettings.stopLossMode === 'TRAILING' ? '#3b82f6' : '#d1d5db'}`,
                  backgroundColor: autoTradeSettings.stopLossMode === 'TRAILING' ? '#eff6ff' : 'white'
                }}>
                  <input
                    type="radio"
                    name="stopLossMode"
                    value="TRAILING"
                    checked={autoTradeSettings.stopLossMode === 'TRAILING'}
                    onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, stopLossMode: e.target.value as any })}
                    style={{ marginRight: '12px', width: '18px', height: '18px' }}
                  />
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>📈 Trailing Stop</div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Lock profits with trailing stop (advanced)</div>
                  </div>
                </label>
              </div>

              {/* FIXED mode options */}
              {autoTradeSettings.stopLossMode === 'FIXED' && (
                <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                      Stop Loss (%)
                    </label>
                    <input
                      type="number"
                      value={autoTradeSettings.stopLossPercent || ''}
                      onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, stopLossPercent: e.target.value === '' ? 0 : Number(e.target.value) })}
                      onBlur={(e) => { if (!e.target.value) setAutoTradeSettings({ ...autoTradeSettings, stopLossPercent: 10 }); }}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                      min="1"
                      max="50"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                      Take Profit (%)
                    </label>
                    <input
                      type="number"
                      value={autoTradeSettings.takeProfitPercent || ''}
                      onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, takeProfitPercent: e.target.value === '' ? 0 : Number(e.target.value) })}
                      onBlur={(e) => { if (!e.target.value) setAutoTradeSettings({ ...autoTradeSettings, takeProfitPercent: 20 }); }}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                      min="1"
                      max="200"
                    />
                  </div>
                </div>
              )}

              {/* ATR mode options */}
              {autoTradeSettings.stopLossMode === 'ATR' && (
                <div style={{ backgroundColor: '#f0f9ff', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                        ATR Multiplier (Stop Loss)
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.atrMultiplier || ''}
                        onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, atrMultiplier: e.target.value === '' ? 0 : Number(e.target.value) })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                        min="1"
                        max="5"
                        step="0.1"
                      />
                      <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                        Stop Loss = Entry Price - (ATR × Multiplier)
                      </p>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                        Take Profit (%)
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.takeProfitPercent || ''}
                        onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, takeProfitPercent: e.target.value === '' ? 0 : Number(e.target.value) })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                        min="1"
                        max="200"
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#1e40af', padding: '8px', backgroundColor: '#dbeafe', borderRadius: '6px' }}>
                    💡 ATR (Average True Range) automatically adjusts stop loss based on 14-period market volatility. Higher volatility = wider stop loss.
                  </div>
                </div>
              )}

              {/* TRAILING mode options */}
              {autoTradeSettings.stopLossMode === 'TRAILING' && (
                <div style={{ backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '12px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                        Activation Profit (%)
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.trailingActivationPct || ''}
                        onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, trailingActivationPct: e.target.value === '' ? 0 : Number(e.target.value) })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                        min="1"
                        max="50"
                        step="0.5"
                      />
                      <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                        Activate trailing after this profit %
                      </p>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                        Trailing Distance (%)
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.trailingStopPct || ''}
                        onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, trailingStopPct: e.target.value === '' ? 0 : Number(e.target.value) })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                        min="1"
                        max="20"
                        step="0.5"
                      />
                      <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                        Trail this % below highest price
                      </p>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                        Initial Stop Loss (%)
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.stopLossPercent || ''}
                        onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, stopLossPercent: e.target.value === '' ? 0 : Number(e.target.value) })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                        min="1"
                        max="50"
                      />
                      <p style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                        Before trailing is activated
                      </p>
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600', fontSize: '13px' }}>
                        Take Profit (%)
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.takeProfitPercent || ''}
                        onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, takeProfitPercent: e.target.value === '' ? 0 : Number(e.target.value) })}
                        style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '14px', boxSizing: 'border-box' }}
                        min="1"
                        max="200"
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: '#166534', padding: '8px', backgroundColor: '#dcfce7', borderRadius: '6px' }}>
                    💡 Trailing Stop locks in profits: After {autoTradeSettings.trailingActivationPct}% profit, stop loss will follow {autoTradeSettings.trailingStopPct}% below the highest price reached.
                  </div>
                </div>
              )}

            </div>

            {/* Partial Take Profit Configuration - Only available in TRAILING mode */}
            {autoTradeSettings.followStrategy !== 'RANGE' && autoTradeSettings.stopLossMode === 'TRAILING' && (
            <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '12px', border: '1px solid #86efac' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <label style={{ fontWeight: '700', fontSize: '16px', color: '#166534' }}>
                  📊 Partial Take Profit (Ladder Sell)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={autoTradeSettings.partialTpEnabled}
                    onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, partialTpEnabled: e.target.checked })}
                    style={{ marginRight: '8px', width: '18px', height: '18px' }}
                  />
                  <span style={{ fontWeight: '600', fontSize: '14px', color: autoTradeSettings.partialTpEnabled ? '#16a34a' : '#6b7280' }}>
                    {autoTradeSettings.partialTpEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              {autoTradeSettings.partialTpEnabled && (
                <>
                  <div style={{ fontSize: '13px', color: '#166534', marginBottom: '12px', padding: '8px', backgroundColor: '#dcfce7', borderRadius: '6px' }}>
                    💡 Automatically sell portions of your position at different profit levels to lock in gains
                  </div>

                  {/* Warning: Take Profit will be ignored */}
                  <div style={{ fontSize: '13px', color: '#92400e', marginBottom: '12px', padding: '8px', backgroundColor: '#fef3c7', borderRadius: '6px', border: '1px solid #fbbf24' }}>
                    ⚠️ <strong>Note:</strong> When Partial Take Profit is enabled, the fixed "Take Profit %" setting will be ignored to avoid conflicts. Use the rules below to define your profit targets.
                  </div>

                  {/* Partial TP Rules */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {autoTradeSettings.partialTpRules.map((rule, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        backgroundColor: 'white',
                        borderRadius: '8px',
                        border: '1px solid #d1fae5'
                      }}>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#374151', minWidth: '60px' }}>
                          Rule {index + 1}:
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>At</span>
                          <input
                            type="number"
                            value={rule.profitPct || ''}
                            onChange={(e) => {
                              const newRules = [...autoTradeSettings.partialTpRules];
                              newRules[index].profitPct = parseInt(e.target.value, 10) || 0;
                              setAutoTradeSettings({ ...autoTradeSettings, partialTpRules: newRules });
                            }}
                            onBlur={(e) => {
                              if (!e.target.value || parseInt(e.target.value, 10) < 1) {
                                const newRules = [...autoTradeSettings.partialTpRules];
                                newRules[index].profitPct = 1;
                                setAutoTradeSettings({ ...autoTradeSettings, partialTpRules: newRules });
                              }
                            }}
                            style={{ width: '60px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center' }}
                            min="1"
                            max="1000"
                          />
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>% profit, sell</span>
                          <input
                            type="number"
                            value={rule.sellPct || ''}
                            onChange={(e) => {
                              const newRules = [...autoTradeSettings.partialTpRules];
                              newRules[index].sellPct = parseInt(e.target.value, 10) || 0;
                              setAutoTradeSettings({ ...autoTradeSettings, partialTpRules: newRules });
                            }}
                            onBlur={(e) => {
                              if (!e.target.value || parseInt(e.target.value, 10) < 1) {
                                const newRules = [...autoTradeSettings.partialTpRules];
                                newRules[index].sellPct = 1;
                                setAutoTradeSettings({ ...autoTradeSettings, partialTpRules: newRules });
                              }
                            }}
                            style={{ width: '60px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '13px', textAlign: 'center' }}
                            min="1"
                            max="100"
                          />
                          <span style={{ fontSize: '12px', color: '#6b7280' }}>%</span>
                        </div>
                        {autoTradeSettings.partialTpRules.length > 1 && (
                          <button
                            onClick={() => {
                              const newRules = autoTradeSettings.partialTpRules.filter((_, i) => i !== index);
                              setAutoTradeSettings({ ...autoTradeSettings, partialTpRules: newRules });
                            }}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: '#fef2f2',
                              color: '#dc2626',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '12px',
                              cursor: 'pointer',
                              marginLeft: 'auto'
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add Rule Button */}
                  {autoTradeSettings.partialTpRules.length < 5 && (
                    <button
                      onClick={() => {
                        const lastRule = autoTradeSettings.partialTpRules[autoTradeSettings.partialTpRules.length - 1];
                        const newRules = [...autoTradeSettings.partialTpRules, {
                          profitPct: lastRule ? lastRule.profitPct + 50 : 50,
                          sellPct: 20
                        }];
                        setAutoTradeSettings({ ...autoTradeSettings, partialTpRules: newRules });
                      }}
                      style={{
                        marginTop: '10px',
                        padding: '8px 16px',
                        backgroundColor: '#16a34a',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        width: '100%'
                      }}
                    >
                      ➕ Add Rule
                    </button>
                  )}

                  {/* Preview Summary */}
                  <div style={{ marginTop: '12px', padding: '10px', backgroundColor: '#f0fdf4', borderRadius: '6px', fontSize: '12px', color: '#166534' }}>
                    <strong>Preview:</strong>{' '}
                    {autoTradeSettings.partialTpRules.map((rule, i) => (
                      <span key={i}>
                        {i > 0 && ' → '}
                        +{rule.profitPct}%: sell {rule.sellPct}%
                      </span>
                    ))}
                    <br />
                    <span style={{ color: '#6b7280' }}>
                      Total sell: {autoTradeSettings.partialTpRules.reduce((sum, r) => sum + r.sellPct, 0)}% of position
                    </span>
                  </div>
                </>
              )}
            </div>
            )}

            {/* Max Positions */}
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                Max Positions
              </label>
              <input
                type="number"
                value={autoTradeSettings.maxPositions || ''}
                onChange={(e) =>
                  setAutoTradeSettings({
                    ...autoTradeSettings,
                    maxPositions: e.target.value === '' ? 0 : Number(e.target.value),
                  })
                }
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  border: '1px solid #d1d5db',
                  fontSize: '14px',
                  boxSizing: 'border-box',
                }}
                min="1"
                max="10"
              />
            </div>

            {/* Divider */}
            <div style={{ borderTop: '2px solid #e5e7eb', margin: '16px 0' }} />

            {/* Follow Strategy - Card Style */}
            <div>
              <label style={{ display: 'block', marginBottom: '16px', fontWeight: '700', fontSize: '16px' }}>
                📊 Signal Source
              </label>

              {/* Strategy Type Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '12px',
                marginBottom: '16px'
              }}>
                {/* AI Signals Card */}
                <div
                  onClick={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'TOP_SIGNALS' })}
                  style={{
                    padding: '20px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${autoTradeSettings.followStrategy === 'TOP_SIGNALS' || autoTradeSettings.followStrategy === 'ALL' || autoTradeSettings.followStrategy === 'WHITELIST' ? '#3b82f6' : '#e5e7eb'}`,
                    backgroundColor: autoTradeSettings.followStrategy === 'TOP_SIGNALS' || autoTradeSettings.followStrategy === 'ALL' || autoTradeSettings.followStrategy === 'WHITELIST' ? '#eff6ff' : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: autoTradeSettings.followStrategy === 'TOP_SIGNALS' || autoTradeSettings.followStrategy === 'ALL' || autoTradeSettings.followStrategy === 'WHITELIST' ? '0 4px 12px rgba(59, 130, 246, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#1f2937', marginBottom: '4px' }}>AI Signal</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Alpha Analysis</div>
                </div>

                {/* Twitter KOL Card */}
                <div
                  onClick={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'TWITTER_KOL' })}
                  style={{
                    padding: '20px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${autoTradeSettings.followStrategy === 'TWITTER_KOL' ? '#1da1f2' : '#e5e7eb'}`,
                    backgroundColor: autoTradeSettings.followStrategy === 'TWITTER_KOL' ? '#e8f5fd' : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: autoTradeSettings.followStrategy === 'TWITTER_KOL' ? '0 4px 12px rgba(29, 161, 242, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#1f2937', marginBottom: '4px' }}>Twitter KOL</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Follow KOLs</div>
                </div>

                {/* Telegram Card */}
                <div
                  onClick={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'TELEGRAM' })}
                  style={{
                    padding: '20px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${autoTradeSettings.followStrategy === 'TELEGRAM' ? '#0088cc' : '#e5e7eb'}`,
                    backgroundColor: autoTradeSettings.followStrategy === 'TELEGRAM' ? '#e5f5ff' : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: autoTradeSettings.followStrategy === 'TELEGRAM' ? '0 4px 12px rgba(0, 136, 204, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#1f2937', marginBottom: '4px' }}>Telegram</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Group Signals</div>
                </div>

                {/* Fusion Card */}
                <div
                  onClick={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'FUSION' })}
                  style={{
                    padding: '20px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${autoTradeSettings.followStrategy === 'FUSION' ? '#f59e0b' : '#e5e7eb'}`,
                    backgroundColor: autoTradeSettings.followStrategy === 'FUSION' ? '#fffbeb' : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: autoTradeSettings.followStrategy === 'FUSION' ? '0 4px 12px rgba(245, 158, 11, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#1f2937', marginBottom: '4px' }}>Fusion</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Multi-Source</div>
                </div>

                {/* Meme Coin Card */}
                <div
                  onClick={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'MEME' })}
                  style={{
                    padding: '20px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${autoTradeSettings.followStrategy === 'MEME' ? '#10b981' : '#e5e7eb'}`,
                    backgroundColor: autoTradeSettings.followStrategy === 'MEME' ? '#d1fae5' : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: autoTradeSettings.followStrategy === 'MEME' ? '0 4px 12px rgba(16, 185, 129, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#1f2937', marginBottom: '4px' }}>Meme Coin</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Contract Trading</div>
                </div>

                {/* Range Trading Card */}
                <div
                  onClick={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'RANGE' })}
                  style={{
                    padding: '20px 16px',
                    borderRadius: '12px',
                    border: `2px solid ${autoTradeSettings.followStrategy === 'RANGE' ? '#8b5cf6' : '#e5e7eb'}`,
                    backgroundColor: autoTradeSettings.followStrategy === 'RANGE' ? '#ede9fe' : 'white',
                    cursor: 'pointer',
                    textAlign: 'center',
                    transition: 'all 0.2s ease',
                    boxShadow: autoTradeSettings.followStrategy === 'RANGE' ? '0 4px 12px rgba(139, 92, 246, 0.2)' : 'none'
                  }}
                >
                  <div style={{ fontWeight: '600', fontSize: '15px', color: '#1f2937', marginBottom: '4px' }}>Range Trading</div>
                  <div style={{ fontSize: '11px', color: '#6b7280' }}>Buy Low Sell High</div>
                </div>
              </div>

              {/* AI Signal Sub-options (only show when AI-based strategy is selected) */}
              {(autoTradeSettings.followStrategy === 'TOP_SIGNALS' || autoTradeSettings.followStrategy === 'ALL' || autoTradeSettings.followStrategy === 'WHITELIST') && (
                <div style={{
                  background: '#f8fafc',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  marginBottom: '16px'
                }}>
                  <label style={{ display: 'block', marginBottom: '12px', fontWeight: '600', fontSize: '13px', color: '#475569' }}>
                    AI Signal Mode
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${autoTradeSettings.followStrategy === 'TOP_SIGNALS' ? '#3b82f6' : '#e2e8f0'}`, backgroundColor: autoTradeSettings.followStrategy === 'TOP_SIGNALS' ? '#eff6ff' : 'white' }}>
                      <input
                        type="radio"
                        name="aiMode"
                        checked={autoTradeSettings.followStrategy === 'TOP_SIGNALS'}
                        onChange={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'TOP_SIGNALS' })}
                        style={{ marginRight: '10px', width: '16px', height: '16px' }}
                      />
                      <div>
                        <div style={{ fontWeight: '500', fontSize: '13px' }}>⭐ Top Signals Only (Recommended)</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Only follow signals above confidence threshold</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${autoTradeSettings.followStrategy === 'WHITELIST' ? '#3b82f6' : '#e2e8f0'}`, backgroundColor: autoTradeSettings.followStrategy === 'WHITELIST' ? '#eff6ff' : 'white' }}>
                      <input
                        type="radio"
                        name="aiMode"
                        checked={autoTradeSettings.followStrategy === 'WHITELIST'}
                        onChange={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'WHITELIST' })}
                        style={{ marginRight: '10px', width: '16px', height: '16px' }}
                      />
                      <div>
                        <div style={{ fontWeight: '500', fontSize: '13px' }}>🎯 Whitelist Tokens</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Only follow specified tokens</div>
                      </div>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${autoTradeSettings.followStrategy === 'ALL' ? '#3b82f6' : '#e2e8f0'}`, backgroundColor: autoTradeSettings.followStrategy === 'ALL' ? '#eff6ff' : 'white' }}>
                      <input
                        type="radio"
                        name="aiMode"
                        checked={autoTradeSettings.followStrategy === 'ALL'}
                        onChange={() => setAutoTradeSettings({ ...autoTradeSettings, followStrategy: 'ALL' })}
                        style={{ marginRight: '10px', width: '16px', height: '16px' }}
                      />
                      <div>
                        <div style={{ fontWeight: '500', fontSize: '13px' }}>🌟 Follow All Signals</div>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Auto follow all AI signals (higher risk)</div>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Meme Coin Strategy Configuration (show when MEME is selected) */}
            {autoTradeSettings.followStrategy === 'MEME' && (
              <div style={{
                background: '#ecfdf5',
                padding: '20px',
                borderRadius: '12px',
                border: '2px solid #10b981',
                marginBottom: '16px'
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#065f46', marginBottom: '4px' }}>
                    Meme Coin Strategy Settings
                  </div>
                  <div style={{ fontSize: '12px', color: '#047857' }}>
                    Automatically trade tokens from Twitter/Telegram contract addresses
                  </div>
                </div>

                {/* Risk Check Toggle */}
                <div style={{ marginBottom: '20px', padding: '16px', background: autoTradeSettings.memeEnableRiskCheck ? '#fef3c7' : '#dbeafe', borderRadius: '8px', border: `2px solid ${autoTradeSettings.memeEnableRiskCheck ? '#f59e0b' : '#3b82f6'}` }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                    <input
                      type="checkbox"
                      checked={autoTradeSettings.memeEnableRiskCheck}
                      onChange={(e) => setAutoTradeSettings({
                        ...autoTradeSettings,
                        memeEnableRiskCheck: e.target.checked
                      })}
                      style={{ marginRight: '10px', width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                    <span style={{ color: autoTradeSettings.memeEnableRiskCheck ? '#92400e' : '#1e40af' }}>
                      {autoTradeSettings.memeEnableRiskCheck ? 'Risk Check Enabled' : 'Trust KOL Directly (Early Meme Hunting)'}
                    </span>
                  </label>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: autoTradeSettings.memeEnableRiskCheck ? '#92400e' : '#1e40af', marginLeft: '28px' }}>
                    {autoTradeSettings.memeEnableRiskCheck
                      ? 'Will validate liquidity and trading activity before trading'
                      : 'Will trade immediately when KOL posts contract address (higher risk, early opportunities)'}
                  </div>
                </div>

                {/* Minimum Liquidity (only show when risk check is enabled) */}
                {autoTradeSettings.memeEnableRiskCheck && (
                  <>
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '13px', color: '#047857' }}>
                        Minimum Liquidity (USD)
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.memeMinLiquidity}
                        onChange={(e) => setAutoTradeSettings({
                          ...autoTradeSettings,
                          memeMinLiquidity: Number(e.target.value)
                        })}
                        placeholder="50000"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #a7f3d0',
                          fontSize: '13px',
                          backgroundColor: 'white'
                        }}
                      />
                      <div style={{ fontSize: '11px', color: '#047857', marginTop: '4px' }}>
                        Only trade tokens with liquidity above this threshold (default: $50,000)
                      </div>
                    </div>

                    {/* Minimum Transaction Count */}
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '13px', color: '#047857' }}>
                        Minimum 24h Transactions
                      </label>
                      <input
                        type="number"
                        value={autoTradeSettings.memeMinTxnCount}
                        onChange={(e) => setAutoTradeSettings({
                          ...autoTradeSettings,
                          memeMinTxnCount: Number(e.target.value)
                        })}
                        placeholder="100"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #a7f3d0',
                          fontSize: '13px',
                          backgroundColor: 'white'
                        }}
                      />
                      <div style={{ fontSize: '11px', color: '#047857', marginTop: '4px' }}>
                        Only trade tokens with at least this many transactions in 24h (default: 100)
                      </div>
                    </div>
                  </>
                )}

                {/* Supported Chains */}
                <div>
                  <label style={{ display: 'block', marginBottom: '8px', fontWeight: '500', fontSize: '13px', color: '#047857' }}>
                    Supported Chains
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {['BSC', 'Base', 'Solana'].map(chain => (
                      <label
                        key={chain}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          cursor: 'pointer',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${autoTradeSettings.memeSupportedChains.includes(chain) ? '#10b981' : '#d1fae5'}`,
                          backgroundColor: autoTradeSettings.memeSupportedChains.includes(chain) ? '#d1fae5' : 'white',
                          fontSize: '12px',
                          fontWeight: '500',
                          color: '#065f46',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={autoTradeSettings.memeSupportedChains.includes(chain)}
                          onChange={(e) => {
                            const newChains = e.target.checked
                              ? [...autoTradeSettings.memeSupportedChains, chain]
                              : autoTradeSettings.memeSupportedChains.filter(c => c !== chain);
                            setAutoTradeSettings({
                              ...autoTradeSettings,
                              memeSupportedChains: newChains
                            });
                          }}
                          style={{ marginRight: '6px', width: '14px', height: '14px' }}
                        />
                        {chain}
                      </label>
                    ))}
                  </div>
                  <div style={{ fontSize: '11px', color: '#047857', marginTop: '8px' }}>
                    Select which blockchains to monitor for meme coin trading
                  </div>
                </div>

                {/* Meme Radar AI Signal Source */}
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #a7f3d0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '14px', color: '#065f46' }}>
                      <input
                        type="checkbox"
                        checked={autoTradeSettings.memeRadarEnabled}
                        onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, memeRadarEnabled: e.target.checked })}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      🎯 Meme Radar AI Signal Source
                    </label>
                    {autoTradeSettings.memeRadarEnabled && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '12px', background: '#10b981', color: 'white', fontWeight: '600' }}>ON</span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#047857', marginBottom: '12px', marginLeft: '24px' }}>
                    Auto-trade when Meme Radar AI generates STRONG_BUY signals above your score threshold
                  </div>

                  {autoTradeSettings.memeRadarEnabled && (
                    <div style={{ marginLeft: '8px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                      {/* Min Score */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '13px', color: '#047857' }}>
                          Min Radar Score: <strong>{autoTradeSettings.memeRadarMinScore}</strong>
                        </label>
                        <input
                          type="range"
                          min={50}
                          max={95}
                          step={5}
                          value={autoTradeSettings.memeRadarMinScore}
                          onChange={(e) => setAutoTradeSettings({ ...autoTradeSettings, memeRadarMinScore: parseInt(e.target.value) })}
                          style={{ width: '100%', accentColor: '#10b981' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6b7280' }}>
                          <span>50 (Looser)</span><span>95 (Strictest)</span>
                        </div>
                      </div>

                      {/* Signal Level */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '13px', color: '#047857' }}>Signal Level</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {([
                            { value: 'STRONG_BUY_ONLY', label: '🔥 STRONG_BUY only', desc: 'Recommended' },
                            { value: 'STRONG_BUY_AND_BUY', label: '📈 + BUY', desc: 'Balanced' },
                            { value: 'STRONG_BUY_AND_WATCH', label: '👀 + WATCH', desc: 'More signals' },
                          ] as const).map(opt => (
                            <label
                              key={opt.value}
                              style={{
                                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                padding: '10px 8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                                border: `2px solid ${autoTradeSettings.memeRadarSignalLevel === opt.value ? '#10b981' : '#d1fae5'}`,
                                backgroundColor: autoTradeSettings.memeRadarSignalLevel === opt.value ? '#d1fae5' : 'white',
                              }}
                            >
                              <input
                                type="radio"
                                name="memeRadarSignalLevel"
                                value={opt.value}
                                checked={autoTradeSettings.memeRadarSignalLevel === opt.value}
                                onChange={() => setAutoTradeSettings({ ...autoTradeSettings, memeRadarSignalLevel: opt.value })}
                                style={{ display: 'none' }}
                              />
                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#065f46' }}>{opt.label}</span>
                              <span style={{ fontSize: '11px', color: '#6b7280' }}>{opt.desc}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Entry Price Mode */}
                      <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontWeight: '500', fontSize: '13px', color: '#047857' }}>Entry Price Mode</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {([
                            { value: true, label: '🤖 Use Signal Plan', desc: 'AI entry/SL/TP' },
                            { value: false, label: '⚙️ Use My Settings', desc: 'Strategy SL%/TP%' },
                          ] as const).map(opt => (
                            <label
                              key={String(opt.value)}
                              style={{
                                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                padding: '10px 8px', borderRadius: '8px', cursor: 'pointer', textAlign: 'center',
                                border: `2px solid ${autoTradeSettings.memeRadarUseTradingPlan === opt.value ? '#10b981' : '#d1fae5'}`,
                                backgroundColor: autoTradeSettings.memeRadarUseTradingPlan === opt.value ? '#d1fae5' : 'white',
                              }}
                            >
                              <input
                                type="radio"
                                name="memeRadarUseTradingPlan"
                                checked={autoTradeSettings.memeRadarUseTradingPlan === opt.value}
                                onChange={() => setAutoTradeSettings({ ...autoTradeSettings, memeRadarUseTradingPlan: opt.value })}
                                style={{ display: 'none' }}
                              />
                              <span style={{ fontSize: '12px', fontWeight: '600', color: '#065f46' }}>{opt.label}</span>
                              <span style={{ fontSize: '11px', color: '#6b7280' }}>{opt.desc}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Twitter KOL Configuration (show when TWITTER_KOL, FUSION, or MEME is selected) */}
            {(autoTradeSettings.followStrategy === 'TWITTER_KOL' || autoTradeSettings.followStrategy === 'FUSION' || autoTradeSettings.followStrategy === 'MEME') && (
              <div style={{ marginTop: '16px' }}>
                {editingStrategyId ? (
                  <TwitterKOLConfig
                    strategyId={editingStrategyId}
                    onOpenSignalHistory={() => {
                      setSignalHistoryStrategyId(editingStrategyId);
                      setSignalHistorySource('twitter');
                      setShowSignalHistory(true);
                    }}
                    maxKOLs={autoTradeSettings.maxKOLs}
                  />
                ) : (
                  <div style={{
                    background: '#fef3c7',
                    border: '1px solid #fbbf24',
                    borderRadius: '8px',
                    padding: '16px',
                    marginTop: '8px'
                  }}>
                    <div style={{ fontSize: '14px', color: '#92400e', fontWeight: '600', marginBottom: '8px' }}>
                      💡 Save Strategy First
                    </div>
                    <div style={{ fontSize: '13px', color: '#78350f' }}>
                      Please save your strategy configuration first, then you can add Twitter KOLs. Click the "💾 Save Strategy" button below.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Telegram Group Configuration (show when TELEGRAM, FUSION, or MEME is selected) */}
            {(autoTradeSettings.followStrategy === 'TELEGRAM' || autoTradeSettings.followStrategy === 'FUSION' || autoTradeSettings.followStrategy === 'MEME') && (
              <div style={{ marginTop: '16px' }}>
                {editingStrategyId ? (
                  <TelegramGroupConfig
                    strategyId={editingStrategyId}
                    onOpenSignalHistory={() => {
                      setSignalHistoryStrategyId(editingStrategyId);
                      setSignalHistorySource('telegram');
                      setShowSignalHistory(true);
                    }}
                    maxGroups={3}
                  />
                ) : (
                  <div style={{
                    background: '#e0f2fe',
                    border: '1px solid #0ea5e9',
                    borderRadius: '8px',
                    padding: '16px',
                    marginTop: '8px'
                  }}>
                    <div style={{ fontSize: '14px', color: '#0369a1', fontWeight: '600', marginBottom: '8px' }}>
                      💡 Save Strategy First
                    </div>
                    <div style={{ fontSize: '13px', color: '#075985' }}>
                      Please save your strategy configuration first, then you can add Telegram groups. Click the "💾 Save Strategy" button below.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Range Trading Configuration (show when RANGE is selected) */}
            {autoTradeSettings.followStrategy === 'RANGE' && (
              <div style={{
                background: '#f5f3ff',
                padding: '20px',
                borderRadius: '12px',
                border: '2px solid #8b5cf6',
                marginBottom: '16px'
              }}>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: '#5b21b6', marginBottom: '4px' }}>
                    Range Trading Strategy Settings
                  </div>
                  <div style={{ fontSize: '12px', color: '#7c3aed' }}>
                    Buy low, sell high - Automatically detect range-bound tokens and trade within the range
                  </div>
                </div>

                {/* How It Works */}
                <div style={{ marginBottom: '16px', padding: '12px', background: '#ede9fe', borderRadius: '8px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#5b21b6', marginBottom: '8px' }}>
                    How It Works
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '16px', fontSize: '12px', color: '#6d28d9', lineHeight: '1.6' }}>
                    <li>Scans Alpha Tokens and your Meme tokens for range patterns</li>
                    <li>Entry: Range width &ge; 15%, drawdown from high &ge; 10%, position &le; 35%</li>
                  </ul>
                </div>

                {/* Take Profit & Stop Loss Configuration */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#5b21b6', marginBottom: '12px' }}>
                    Take Profit & Stop Loss
                  </div>
                  <div style={{ display: 'flex', gap: '16px' }}>
                    {/* Take Profit Input */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '500', color: '#5b21b6' }}>
                          Take Profit (%)
                        </label>
                        {autoTradeSettings.rangeTakeProfitPercent === 10 && (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            background: '#10b981',
                            color: 'white',
                            borderRadius: '4px',
                            fontWeight: '600'
                          }}>
                            Recommended
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        step="1"
                        value={autoTradeSettings.rangeTakeProfitPercent}
                        onChange={(e) => {
                          const value = Math.max(1, Math.min(100, Number(e.target.value)));
                          setAutoTradeSettings(prev => ({
                            ...prev,
                            rangeTakeProfitPercent: value,
                            takeProfitPercent: value  // 同步到通用参数
                          }));
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #c4b5fd',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#5b21b6',
                          background: 'white',
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '4px' }}>
                        System suggests: +10%
                      </div>
                    </div>

                    {/* Stop Loss Input */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: '500', color: '#5b21b6' }}>
                          Stop Loss (%)
                        </label>
                        {autoTradeSettings.rangeStopLossPercent === 5 && (
                          <span style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            background: '#10b981',
                            color: 'white',
                            borderRadius: '4px',
                            fontWeight: '600'
                          }}>
                            Recommended
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        step="1"
                        value={autoTradeSettings.rangeStopLossPercent}
                        onChange={(e) => {
                          const value = Math.max(1, Math.min(50, Number(e.target.value)));
                          setAutoTradeSettings(prev => ({
                            ...prev,
                            rangeStopLossPercent: value,
                            stopLossPercent: value  // 同步到通用参数
                          }));
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #c4b5fd',
                          fontSize: '14px',
                          fontWeight: '600',
                          color: '#5b21b6',
                          background: 'white',
                          boxSizing: 'border-box'
                        }}
                      />
                      <div style={{ fontSize: '11px', color: '#7c3aed', marginTop: '4px' }}>
                        System suggests: -5%
                      </div>
                    </div>
                  </div>

                  {/* Risk/Reward Ratio Display */}
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    background: autoTradeSettings.rangeTakeProfitPercent / autoTradeSettings.rangeStopLossPercent >= 2 ? '#dcfce7' : '#fef3c7',
                    borderRadius: '6px',
                    border: `1px solid ${autoTradeSettings.rangeTakeProfitPercent / autoTradeSettings.rangeStopLossPercent >= 2 ? '#86efac' : '#fbbf24'}`
                  }}>
                    <div style={{ fontSize: '12px', color: autoTradeSettings.rangeTakeProfitPercent / autoTradeSettings.rangeStopLossPercent >= 2 ? '#166534' : '#92400e' }}>
                      Risk/Reward Ratio: <strong>1:{(autoTradeSettings.rangeTakeProfitPercent / autoTradeSettings.rangeStopLossPercent).toFixed(1)}</strong>
                      {autoTradeSettings.rangeTakeProfitPercent / autoTradeSettings.rangeStopLossPercent >= 2
                        ? ' (Good)'
                        : ' (Consider higher TP or lower SL)'}
                    </div>
                  </div>
                </div>

                {/* Data Sources */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#5b21b6', marginBottom: '8px' }}>
                    Data Sources
                  </div>

                  {/* Alpha Token Selection */}
                  <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #c4b5fd', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#5b21b6', marginBottom: '8px' }}>
                      Alpha Tokens (Select from Binance Alpha list)
                    </div>

                    {/* Search box */}
                    <input
                      type="text"
                      placeholder="🔍 Search Alpha tokens..."
                      value={rangeAlphaSearchQuery}
                      onChange={(e) => setRangeAlphaSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        marginBottom: '8px',
                        borderRadius: '6px',
                        border: '1px solid #c4b5fd',
                        fontSize: '13px',
                        boxSizing: 'border-box'
                      }}
                    />

                    {/* Selected tokens display */}
                    {rangeAlphaTokens.length > 0 && (
                      <div style={{
                        marginBottom: '12px',
                        padding: '12px',
                        background: '#f3f4f6',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb'
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#6b7280', marginBottom: '8px' }}>
                          Selected {rangeAlphaTokens.length} tokens (Click × to remove)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {rangeAlphaTokens.map((token) => (
                            <div
                              key={token}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 10px',
                                background: 'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)',
                                color: 'white',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600',
                                boxShadow: '0 2px 4px rgba(139, 92, 246, 0.3)'
                              }}
                            >
                              {token}
                              <button
                                onClick={() => {
                                  setRangeAlphaTokens(rangeAlphaTokens.filter(t => t !== token));
                                }}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.3)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '16px',
                                  height: '16px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  color: 'white',
                                  padding: 0,
                                  lineHeight: 1
                                }}
                                title={`Remove ${token}`}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Search input */}
                    <div style={{ marginBottom: '8px', fontSize: '11px', color: '#7c3aed' }}>
                      {rangeAlphaTokens.length === 0 ? 'Select tokens from the list below' : 'Add more tokens'}
                    </div>

                    {/* Token grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                      gap: '6px',
                      maxHeight: '150px',
                      overflowY: 'auto',
                      padding: '4px'
                    }}>
                      {availableTokens
                        .filter((token) => token.toLowerCase().includes(rangeAlphaSearchQuery.toLowerCase()))
                        .map((token) => (
                          <label
                            key={token}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              border: '1px solid #ddd6fe',
                              backgroundColor: rangeAlphaTokens.includes(token) ? '#ede9fe' : 'white',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: '500',
                              color: '#5b21b6'
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={rangeAlphaTokens.includes(token)}
                              onChange={(e) => {
                                const newTokens = e.target.checked
                                  ? [...rangeAlphaTokens, token]
                                  : rangeAlphaTokens.filter((t) => t !== token);
                                setRangeAlphaTokens(newTokens);
                              }}
                              style={{ marginRight: '4px', width: '12px', height: '12px' }}
                            />
                            {token}
                          </label>
                        ))}
                    </div>

                    {availableTokens.length === 0 && (
                      <div style={{ textAlign: 'center', color: '#9ca3af', padding: '12px', fontSize: '12px' }}>
                        Loading Alpha tokens...
                      </div>
                    )}

                    {rangeAlphaTokens.length === 0 && availableTokens.length > 0 && (
                      <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '6px', textAlign: 'center' }}>
                        Select Alpha tokens to monitor for Range Trading opportunities
                      </div>
                    )}
                  </div>

                  {/* Add Custom Token */}
                  <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #c4b5fd' }}>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: '#5b21b6', marginBottom: '12px' }}>
                      Add Custom Meme Token
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <select
                        value={newRangeTokenChain}
                        onChange={(e) => setNewRangeTokenChain(e.target.value as 'BSC' | 'Base' | 'Solana')}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: '1px solid #c4b5fd',
                          fontSize: '13px',
                          background: 'white',
                          color: '#5b21b6',
                          fontWeight: '500'
                        }}
                      >
                        <option value="BSC">BSC</option>
                        <option value="Base">Base</option>
                        <option value="Solana">Solana</option>
                      </select>
                      <input
                        type="text"
                        placeholder={newRangeTokenChain === 'Solana' ? 'Token Mint Address' : '0x... (Contract Address)'}
                        value={newRangeTokenAddress}
                        onChange={(e) => {
                          setNewRangeTokenAddress(e.target.value);
                          setRangeTokenError('');
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${rangeTokenError ? '#ef4444' : '#c4b5fd'}`,
                          fontSize: '13px'
                        }}
                      />
                      <button
                        onClick={handleAddRangeToken}
                        disabled={isAddingRangeToken}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: 'none',
                          background: isAddingRangeToken ? '#a78bfa' : '#8b5cf6',
                          color: 'white',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: isAddingRangeToken ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {isAddingRangeToken ? 'Adding...' : 'Add'}
                      </button>
                    </div>
                    {rangeTokenError && (
                      <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '4px' }}>
                        {rangeTokenError}
                      </div>
                    )}

                    {/* Token List */}
                    {rangeTokens.length > 0 && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{ fontSize: '11px', color: '#7c3aed', marginBottom: '8px' }}>
                          Your Tokens ({rangeTokens.length})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {rangeTokens.map((token) => (
                            <div
                              key={`${token.chain}-${token.contract_address}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '8px 12px',
                                background: '#f5f3ff',
                                borderRadius: '6px',
                                border: '1px solid #ddd6fe'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{
                                  fontSize: '10px',
                                  padding: '2px 6px',
                                  background: token.chain === 'BSC' ? '#fbbf24' : token.chain === 'Solana' ? '#9945FF' : '#3b82f6',
                                  color: 'white',
                                  borderRadius: '4px',
                                  fontWeight: '600'
                                }}>
                                  {token.chain}
                                </span>
                                <span style={{ fontSize: '12px', fontWeight: '600', color: '#5b21b6' }}>
                                  {token.token_symbol || 'Loading...'}
                                </span>
                                <span style={{ fontSize: '11px', color: '#7c3aed' }}>
                                  {token.contract_address.slice(0, 6)}...{token.contract_address.slice(-4)}
                                </span>
                              </div>
                              <button
                                onClick={() => handleRemoveRangeToken(token.contract_address, token.chain)}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  border: 'none',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {rangeTokens.length === 0 && (
                      <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '8px', textAlign: 'center' }}>
                        No custom tokens added yet. Add a contract address above.
                      </div>
                    )}
                  </div>
                </div>

                {/* Supported Chains */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#5b21b6', marginBottom: '8px' }}>
                    Supported Chains
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <span style={{
                      padding: '6px 12px',
                      background: '#ddd6fe',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: '#5b21b6'
                    }}>
                      BSC
                    </span>
                    <span style={{
                      padding: '6px 12px',
                      background: '#ddd6fe',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: '#5b21b6'
                    }}>
                      Base
                    </span>
                  </div>
                </div>

                {/* View Monitor Button */}
                <div style={{ marginTop: '16px' }}>
                  <button
                    onClick={() => setShowRangeMonitor(true)}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: '0 4px 12px rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    View Range Trading Monitor
                    <span style={{ fontSize: '12px', opacity: 0.8 }}>(Score, RSI, Support/Resistance)</span>
                  </button>
                </div>

                {/* Info Note */}
                <div style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: '#e0f2fe',
                  borderRadius: '8px',
                  border: '1px solid #0ea5e9'
                }}>
                  <div style={{ fontSize: '12px', color: '#0369a1' }}>
                    <strong>Note:</strong> Range Trading uses its own TP/SL settings configured above. The global Stop Loss settings will be overridden for Range Trading signals.
                  </div>
                </div>
              </div>
            )}

            {/* Whitelist Tokens (only show when WHITELIST is selected) */}
            {autoTradeSettings.followStrategy === 'WHITELIST' && (
              <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  🎯 Token Whitelist (Select tokens to follow)
                </label>
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                  Currently showing: {autoTradeSettings.chain === 'BSC' ? '🔶 BSC Chain' : autoTradeSettings.chain === 'Solana' ? '🟣 Solana Chain' : '🔷 Base Chain'} tokens
                </div>

                {/* Search box */}
                <input
                  type="text"
                  placeholder="🔍 Search tokens... (e.g.: LAB, BLESS)"
                  value={tokenSearchQuery}
                  onChange={(e) => setTokenSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px',
                    marginBottom: '12px',
                    borderRadius: '8px',
                    border: '1px solid #d1d5db',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />

                {/* Selected token statistics */}
                <div style={{ marginBottom: '8px', fontSize: '13px', color: '#6b7280' }}>
                  Selected {autoTradeSettings.whitelistedTokens.length} tokens
                  {autoTradeSettings.whitelistedTokens.length > 0 && (
                    <span style={{ marginLeft: '8px', color: '#3b82f6', fontWeight: '500' }}>
                      ({autoTradeSettings.whitelistedTokens.join(', ')})
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {availableTokens
                    .filter((token) => token.toLowerCase().includes(tokenSearchQuery.toLowerCase()))
                    .map((token) => (
                    <label
                      key={token}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: autoTradeSettings.whitelistedTokens.includes(token) ? '#dbeafe' : 'white',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={autoTradeSettings.whitelistedTokens.includes(token)}
                        onChange={(e) => {
                          const newTokens = e.target.checked
                            ? [...autoTradeSettings.whitelistedTokens, token]
                            : autoTradeSettings.whitelistedTokens.filter((t) => t !== token);
                          setAutoTradeSettings({ ...autoTradeSettings, whitelistedTokens: newTokens });
                        }}
                        style={{ marginRight: '6px' }}
                      />
                      {token}
                    </label>
                  ))}
                </div>

                {/* Hint messages */}
                {availableTokens.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px', fontSize: '14px' }}>
                    Loading token list...
                  </div>
                )}
                {availableTokens.length > 0 &&
                 availableTokens.filter((token) => token.toLowerCase().includes(tokenSearchQuery.toLowerCase())).length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px', fontSize: '14px' }}>
                    😕 No matching tokens: "{tokenSearchQuery}"
                  </div>
                )}
              </div>
            )}

            {/* Min Confidence (only show when TOP_SIGNALS is selected) */}
            {autoTradeSettings.followStrategy === 'TOP_SIGNALS' && (
              <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: '600' }}>
                  ⭐ Minimum Confidence: {autoTradeSettings.minConfidence}%
                </label>
                <input
                  type="range"
                  min="50"
                  max="100"
                  step="5"
                  value={autoTradeSettings.minConfidence}
                  onChange={(e) =>
                    setAutoTradeSettings({
                      ...autoTradeSettings,
                      minConfidence: Number(e.target.value),
                    })
                  }
                  style={{ width: '100%', height: '6px', borderRadius: '3px', outline: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                  <span>50%</span>
                  <span style={{ fontWeight: '600', color: '#3b82f6' }}>{autoTradeSettings.minConfidence}%</span>
                  <span>100%</span>
                </div>
                <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '8px' }}>
                  💡 Only follow signals with confidence ≥ {autoTradeSettings.minConfidence}%
                </div>
              </div>
            )}

            {/* Circuit Breaker (熔断保护) Configuration */}
            <div style={{
              background: circuitBreaker.isPaused ? '#fef2f2' : '#f0fdf4',
              padding: '20px',
              borderRadius: '12px',
              border: circuitBreaker.isPaused ? '1px solid #fecaca' : '1px solid #bbf7d0',
              marginTop: '16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <label style={{ fontWeight: '700', fontSize: '16px', color: circuitBreaker.isPaused ? '#dc2626' : '#16a34a' }}>
                  {circuitBreaker.isPaused ? '⚠️ Circuit Breaker ACTIVE' : '🛡️ Circuit Breaker Protection'}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <span style={{ fontSize: '13px', color: '#6b7280' }}>Enable</span>
                  <input
                    type="checkbox"
                    checked={circuitBreaker.enabled}
                    onChange={(e) => setCircuitBreaker(prev => ({ ...prev, enabled: e.target.checked }))}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                </label>
              </div>

              {/* Paused Status Alert */}
              {circuitBreaker.isPaused && (
                <div style={{
                  background: '#fee2e2',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  border: '1px solid #fca5a5',
                }}>
                  <div style={{ fontWeight: '600', color: '#b91c1c', marginBottom: '4px' }}>
                    Trading Paused
                  </div>
                  <div style={{ fontSize: '13px', color: '#991b1b' }}>
                    Reason: {circuitBreaker.pauseReason}
                  </div>
                  <div style={{ fontSize: '13px', color: '#991b1b', marginTop: '4px' }}>
                    Auto-resume: {circuitBreaker.pausedUntil ? new Date(circuitBreaker.pausedUntil).toLocaleString() : 'N/A'}
                  </div>
                  <button
                    onClick={handleUnpauseCircuitBreaker}
                    disabled={circuitBreakerLoading}
                    style={{
                      marginTop: '12px',
                      padding: '8px 16px',
                      background: circuitBreakerLoading ? '#9ca3af' : '#dc2626',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '600',
                      cursor: circuitBreakerLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {circuitBreakerLoading ? 'Processing...' : 'Resume Trading Now'}
                  </button>
                </div>
              )}

              {circuitBreaker.enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Consecutive Stop Loss Threshold */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', color: '#374151' }}>Consecutive Stop Loss Threshold</span>
                    <select
                      value={circuitBreaker.threshold}
                      onChange={(e) => setCircuitBreaker(prev => ({ ...prev, threshold: Number(e.target.value) }))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '14px',
                        width: '100px',
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n} times</option>
                      ))}
                    </select>
                  </div>

                  {/* Pause Duration */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', color: '#374151' }}>Pause Duration</span>
                    <select
                      value={circuitBreaker.durationMinutes}
                      onChange={(e) => setCircuitBreaker(prev => ({ ...prev, durationMinutes: Number(e.target.value) }))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '14px',
                        width: '130px',
                      }}
                    >
                      <option value={5}>5 minutes</option>
                      <option value={15}>15 minutes</option>
                      <option value={30}>30 minutes</option>
                      <option value={60}>1 hour</option>
                      <option value={120}>2 hours</option>
                      <option value={240}>4 hours</option>
                      <option value={480}>8 hours</option>
                      <option value={1440}>24 hours</option>
                    </select>
                  </div>

                  {/* Daily Loss Limit */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '14px', color: '#374151' }}>Daily Loss Limit</span>
                    <select
                      value={circuitBreaker.dailyLossLimit}
                      onChange={(e) => setCircuitBreaker(prev => ({ ...prev, dailyLossLimit: Number(e.target.value) }))}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '14px',
                        width: '100px',
                      }}
                    >
                      {[-5, -10, -15, -20, -25, -30, -40, -50].map(n => (
                        <option key={n} value={n}>{n}%</option>
                      ))}
                    </select>
                  </div>

                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px', lineHeight: '1.5' }}>
                    💡 Circuit breaker will pause trading when: {circuitBreaker.threshold} consecutive stop losses OR daily loss exceeds {circuitBreaker.dailyLossLimit}%
                  </div>

                  {/* Save Circuit Breaker Button */}
                  <button
                    onClick={handleSaveCircuitBreaker}
                    disabled={circuitBreakerLoading}
                    style={{
                      padding: '10px 16px',
                      background: circuitBreakerLoading ? '#9ca3af' : (circuitBreakerSaveSuccess ? '#16a34a' : '#6366f1'),
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: circuitBreakerLoading ? 'not-allowed' : 'pointer',
                      marginTop: '8px',
                    }}
                  >
                    {circuitBreakerLoading ? 'Saving...' : (circuitBreakerSaveSuccess ? '✓ Saved!' : 'Save Protection Settings')}
                  </button>
                </div>
              )}

              {!circuitBreaker.enabled && (
                <div style={{ fontSize: '13px', color: '#9ca3af', fontStyle: 'italic' }}>
                  Circuit breaker is disabled. Trading will continue without automatic pause protection.
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveAutoTradeSettings}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              Save Configuration
            </button>
          </div>
        </div>

        {/* Telegram Bot 绑定 */}
        <TelegramBotBind />

        </div>
      )}

      {/* Signals Sub Tab */}
      {autoTradeSubTab === 'signals' && <SignalMonitor />}

      {/* Positions Sub Tab */}
      {autoTradeSubTab === 'positions' && privyUserId && (
        <PositionManager userId={privyUserId} />
      )}

      {/* History Sub Tab */}
      {autoTradeSubTab === 'history' && privyUserId && (
        <TradeLogs userId={privyUserId} />
      )}


      {/* Signal History Modal - Twitter KOL or Telegram */}
      {showSignalHistory && signalHistoryStrategyId && (
        signalHistorySource === 'telegram' ? (
          <TelegramSignalHistory
            strategyId={signalHistoryStrategyId}
            onClose={() => {
              setShowSignalHistory(false);
              setSignalHistoryStrategyId(null);
            }}
          />
        ) : (
          <KOLSignalHistory
            strategyId={signalHistoryStrategyId}
            onClose={() => {
              setShowSignalHistory(false);
              setSignalHistoryStrategyId(null);
            }}
          />
        )
      )}

      {/* Range Trading Monitor Modal */}
      {showRangeMonitor && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '1200px',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              position: 'sticky',
              top: 0,
              backgroundColor: 'white',
              zIndex: 10
            }}>
              <button
                onClick={() => setShowRangeMonitor(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#f3f4f6',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#374151'
                }}
              >
                Close
              </button>
            </div>
            <RangeMonitor onClose={() => setShowRangeMonitor(false)} />
          </div>
        </div>
      )}

      {/* Circuit Breaker Alert Popup */}
      {showCircuitBreakerPopup && circuitBreaker.isPaused && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '450px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
            overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
              padding: '24px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: '48px', marginBottom: '8px' }}>⚠️</div>
              <h2 style={{ color: 'white', fontSize: '22px', fontWeight: '700', margin: 0 }}>
                Trading Paused
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '14px', marginTop: '8px' }}>
                Circuit Breaker Activated
              </p>
            </div>

            {/* Content */}
            <div style={{ padding: '24px' }}>
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '20px',
              }}>
                <div style={{ fontWeight: '600', color: '#991b1b', marginBottom: '8px' }}>
                  Reason:
                </div>
                <div style={{ color: '#b91c1c', fontSize: '14px' }}>
                  {circuitBreaker.pauseReason || 'Risk limit exceeded'}
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: '#f3f4f6',
                borderRadius: '10px',
                marginBottom: '20px',
              }}>
                <span style={{ fontSize: '24px' }}>⏰</span>
                <div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Auto-resume at:</div>
                  <div style={{ fontWeight: '600', color: '#374151' }}>
                    {circuitBreaker.pausedUntil
                      ? new Date(circuitBreaker.pausedUntil).toLocaleString()
                      : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => {
                    setShowCircuitBreakerPopup(false);
                    setAutoTradeSubTab('settings');
                  }}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Go to Settings
                </button>
                <button
                  onClick={() => setShowCircuitBreakerPopup(false)}
                  style={{
                    padding: '14px 20px',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '10px',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Auto Trade Tab main component
 * 🔧 修复：移除了 PrivyWalletProvider 包装，由父组件 AlphaAgentPage 提供
 * 这避免了每次 AlphaAgentPage 重新渲染时都创建新的 Provider 实例，
 * 从而消除了导致每秒1000+次RPC请求的无限循环
 */
export default function AutoTradeTab() {
  return <AutoTradeContent />;
}
