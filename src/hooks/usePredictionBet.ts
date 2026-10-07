/**
 * usePredictionBet — 链上下注 hook
 *
 * 流程:
 *   1. 检查/切换到 Base
 *   2. 检查 USDC 余额
 *   3. Approve USDC（如不足）
 *   4. 调用合约 placeBet
 *   5. 等待确认 → 返回 txHash
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import PredictionMarketABI from '../contracts/PredictionMarket.json';

// ── 合约配置 (从环境变量读取，fallback 到 Base Mainnet) ─────────────────────
const CHAIN_ID = Number(process.env.REACT_APP_PREDICTION_CHAIN_ID) || 8453;
const CONTRACT_ADDRESS = process.env.REACT_APP_PREDICTION_CONTRACT_ADDRESS || '0x7127ea3c571D4e446d29E26953a3D6DdD9fF558f';
const USDC_ADDRESS = process.env.REACT_APP_PREDICTION_USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_DECIMALS = 6;

const USDC_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

const CHAIN_CONFIGS: Record<number, { chainId: string; chainName: string; nativeCurrency: { name: string; symbol: string; decimals: number }; rpcUrls: string[]; blockExplorerUrls: string[] }> = {
  8453: {
    chainId: '0x2105',
    chainName: 'Base',
    nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
  },
  84532: {
    chainId: '0x14A34',
    chainName: 'Base Sepolia',
    nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://sepolia.base.org'],
    blockExplorerUrls: ['https://sepolia.basescan.org'],
  },
};

const BASE_CHAIN_PARAMS = CHAIN_CONFIGS[CHAIN_ID] || CHAIN_CONFIGS[8453];

// ── Types ────────────────────────────────────────────────────────────────────

export type BetStep =
  | 'idle'
  | 'switching_chain'
  | 'checking'
  | 'approving'
  | 'betting'
  | 'confirming'
  | 'done'
  | 'error';

export const BET_STEP_LABELS: Record<BetStep, string> = {
  idle: 'Ready to bet',
  switching_chain: 'Switching to Base...',
  checking: 'Checking USDC balance...',
  approving: 'Approving USDC (step 1/2)...',
  betting: 'Submitting bet (step 2/2)...',
  confirming: 'Waiting for on-chain confirmation...',
  done: 'Bet placed successfully',
  error: 'Bet failed',
};

interface PlaceBetOnChainParams {
  contractEventId: string; // bytes32 hex, from prediction_events.contract_event_id
  predictedPnlPct: number; // e.g. 4.5 → pnl% (will be converted to bps)
  betAmountUSDC: number;   // dollar amount, e.g. 20
}

interface UsePredictionBetReturn {
  step: BetStep;
  placeBetOnChain: (params: PlaceBetOnChainParams) => Promise<string>; // returns txHash
  reset: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePredictionBet(): UsePredictionBetReturn {
  const [step, setStep] = useState<BetStep>('idle');

  const reset = useCallback(() => setStep('idle'), []);

  const placeBetOnChain = useCallback(async ({
    contractEventId,
    predictedPnlPct,
    betAmountUSDC,
  }: PlaceBetOnChainParams): Promise<string> => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error('NO_WALLET');

    try {
      // ── 1. 请求账户 ──────────────────────────────────────────────────────
      setStep('switching_chain');
      await eth.request({ method: 'eth_requestAccounts' });

      // ── 2. 切换链 ─────────────────────────────────────────────────────────
      const currentChainHex: string = await eth.request({ method: 'eth_chainId' });
      if (parseInt(currentChainHex, 16) !== CHAIN_ID) {
        try {
          await eth.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: BASE_CHAIN_PARAMS.chainId }],
          });
        } catch (err: any) {
          if (err.code === 4902) {
            // 钱包里还没有这条链，先添加
            await eth.request({
              method: 'wallet_addEthereumChain',
              params: [BASE_CHAIN_PARAMS],
            });
          } else {
            throw err;
          }
        }
      }

      // ── 2b. 二次确认链ID ────────────────────────────────────────────────
      const verifyChainHex: string = await eth.request({ method: 'eth_chainId' });
      if (parseInt(verifyChainHex, 16) !== CHAIN_ID) {
        throw new Error('WRONG_CHAIN');
      }

      // ── 3. 获取 signer ────────────────────────────────────────────────────
      setStep('checking');
      const provider = new ethers.BrowserProvider(eth);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();

      // ── 4. 检查 USDC 余额 ─────────────────────────────────────────────────
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
      const betAmountWei = BigInt(Math.round(betAmountUSDC * 10 ** USDC_DECIMALS));

      const balance: bigint = await usdc.balanceOf(userAddress);
      if (balance < betAmountWei) {
        const have = Number(balance) / 10 ** USDC_DECIMALS;
        throw new Error(`INSUFFICIENT_USDC:${have.toFixed(2)}`);
      }

      // ── 5. Approve（如授权不足）──────────────────────────────────────────
      const allowance: bigint = await usdc.allowance(userAddress, CONTRACT_ADDRESS);
      if (allowance < betAmountWei) {
        setStep('approving');
        // Circle USDC 不支持 MaxUint256，用精确金额
      const approveTx = await usdc.approve(CONTRACT_ADDRESS, betAmountWei);
        await approveTx.wait();
      }

      // ── 6. 调用合约 placeBet ─────────────────────────────────────────────
      setStep('betting');
      const predictedPnlBps = Math.round(predictedPnlPct * 100); // % → bps
      const contract = new ethers.Contract(CONTRACT_ADDRESS, PredictionMarketABI.abi, signer);
      const tx = await contract.placeBet(contractEventId, predictedPnlBps, betAmountWei);

      // ── 7. 等待确认 ───────────────────────────────────────────────────────
      setStep('confirming');
      await tx.wait();

      setStep('done');
      return tx.hash as string;
    } catch (err: any) {
      setStep('error');
      throw err;
    }
  }, []);

  return { step, placeBetOnChain, reset };
}
