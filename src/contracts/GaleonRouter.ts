/**
 * GaleonRouter Contract Interface
 * AI Micro-Execution Router on Monad
 */

import { ethers } from 'ethers';
import { MONAD_CONTRACTS, MONAD_CHAIN_CONFIG } from '../config/monad';

export const GALEON_ROUTER_ABI = [
  // Micro-Execution
  'function openMicroPosition(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint256 decisionId) returns (uint256 positionId)',
  'function addToPosition(uint256 positionId, uint256 amountIn, uint256 amountOutMin)',
  'function partialExit(uint256 positionId, uint256 tokenAmount, uint256 amountOutMin)',
  'function emergencyExit(uint256 positionId, uint256 amountOutMin)',
  'function closePosition(uint256 positionId, uint256 amountOutMin)',

  // Simple swap (non-micro)
  'function executeSwap(address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOutMin, uint256 decisionId) returns (uint256 amountOut)',

  // Query
  'function microPositions(uint256 positionId) view returns (address trader, address tokenIn, address tokenOut, uint256 totalAmountIn, uint256 totalTokenAmount, uint256 realizedPnl, uint8 stepCount, uint256 decisionId, uint256 endorsedTradeId, bool isOpen, uint256 openedAt)',
  'function getTraderPositionCount(address trader) view returns (uint256)',
  'function getTraderPositionId(address trader, uint256 index) view returns (uint256)',
  'function feeRate() view returns (uint256)',

  // Events
  'event MicroPositionOpened(uint256 indexed positionId, address indexed trader, address token, uint256 amount, uint256 decisionId)',
  'event MicroStep(uint256 indexed positionId, string stepType, uint256 amountIn, uint256 amountOut, uint8 stepNumber)',
  'event MicroPositionClosed(uint256 indexed positionId, uint256 totalIn, uint256 totalOut, int256 pnlBps)',
  'event FeeCollected(address indexed trader, uint256 feeAmount)',
];

export interface MicroPosition {
  positionId: number;
  trader: string;
  tokenIn: string;
  tokenOut: string;
  totalAmountIn: bigint;
  totalTokenAmount: bigint;
  realizedPnl: bigint;
  stepCount: number;
  decisionId: number;
  endorsedTradeId: number;
  isOpen: boolean;
  openedAt: number;
}

/**
 * Get GaleonRouter contract instance (read-only)
 */
export function getGaleonRouterContract(provider?: ethers.Provider): ethers.Contract {
  const rpcUrl = MONAD_CHAIN_CONFIG.rpcUrls[0];
  const p = provider || new ethers.JsonRpcProvider(rpcUrl);
  return new ethers.Contract(MONAD_CONTRACTS.GaleonRouter, GALEON_ROUTER_ABI, p);
}

/**
 * Get GaleonRouter contract with signer (for write operations)
 */
export function getGaleonRouterWithSigner(signer: ethers.Signer): ethers.Contract {
  return new ethers.Contract(MONAD_CONTRACTS.GaleonRouter, GALEON_ROUTER_ABI, signer);
}

/**
 * Fetch a micro position
 */
export async function fetchMicroPosition(positionId: number): Promise<MicroPosition | null> {
  try {
    const contract = getGaleonRouterContract();
    const p = await contract.microPositions(positionId);

    return {
      positionId,
      trader: p.trader,
      tokenIn: p.tokenIn,
      tokenOut: p.tokenOut,
      totalAmountIn: p.totalAmountIn,
      totalTokenAmount: p.totalTokenAmount,
      realizedPnl: p.realizedPnl,
      stepCount: Number(p.stepCount),
      decisionId: Number(p.decisionId),
      endorsedTradeId: Number(p.endorsedTradeId),
      isOpen: p.isOpen,
      openedAt: Number(p.openedAt),
    };
  } catch (error) {
    console.error(`Failed to fetch position #${positionId}:`, error);
    return null;
  }
}

/**
 * Fetch all active positions for a trader
 */
export async function fetchTraderPositions(traderAddress: string): Promise<MicroPosition[]> {
  try {
    const contract = getGaleonRouterContract();
    const count = Number(await contract.getTraderPositionCount(traderAddress));
    const positions: MicroPosition[] = [];

    for (let i = 0; i < count; i++) {
      const posId = Number(await contract.getTraderPositionId(traderAddress, i));
      const pos = await fetchMicroPosition(posId);
      if (pos && pos.isOpen) positions.push(pos);
    }

    return positions;
  } catch (error) {
    console.error(`Failed to fetch positions for ${traderAddress}:`, error);
    return [];
  }
}
