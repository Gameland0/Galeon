/**
 * Hyperliquid Perp Trader
 * Ported from ai-server/src/services/HyperliquidTradeExecutor.js
 *
 * Uses Agent private key to sign EIP-712 orders on Hyperliquid.
 * Agent can only trade — cannot withdraw funds (HL enforced).
 *
 * Sign flow (matching HL Python SDK sign_l1_action):
 *   1. msgpack.pack(action) → binary
 *   2. concat nonce(8 bytes BE) + vaultAddress flag + address bytes
 *   3. keccak256(result) → connectionId
 *   4. Build phantomAgent { source: 'a', connectionId }
 *   5. EIP-712 signTypedData(phantomAgent)
 */

import axios from 'axios';
import { ethers } from 'ethers';
import { Packr } from 'msgpackr';

const msgpackr = new Packr({ useRecords: false, variableMapSize: true });

const HL_API = 'https://api.hyperliquid.xyz';

// EIP-712 domain for Hyperliquid
const HL_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000',
};

// EIP-712 type definitions
const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
};

interface AssetInfo {
  index: number;
  szDecimals: number;
  pxDecimals: number;
  maxLeverage: number;
  name: string;
}

interface OrderResult {
  orderId: string | null;
  entryPrice: number;
  size: number;
  side: string;
  symbol: string;
}

export class HLTrader {
  private agentWallet: ethers.Wallet;
  private agentAddress: string;
  private assetCache: Map<string, AssetInfo> | null = null;
  private assetCacheAt = 0;
  private assetCacheTTL = 5 * 60 * 1000; // 5 min

  constructor() {
    const agentPk = process.env.HL_AGENT_PRIVATE_KEY;
    if (!agentPk) {
      throw new Error('HL_AGENT_PRIVATE_KEY not set');
    }
    this.agentWallet = new ethers.Wallet(agentPk);
    this.agentAddress = this.agentWallet.address;
    console.log(`[HLTrader] Agent address: ${this.agentAddress}`);
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  /**
   * Open position
   * @param masterAddress - User's HL Master wallet (vault)
   * @param symbol - e.g. 'BTC', 'ETH'
   * @param side - 'LONG' | 'SHORT'
   * @param usdcSize - Position size in USDC
   * @param leverage - Leverage multiplier
   */
  async executeOrder(
    masterAddress: string,
    symbol: string,
    side: 'LONG' | 'SHORT',
    usdcSize: number,
    leverage = 3,
  ): Promise<OrderResult> {
    const asset = await this.getAssetInfo(symbol);
    const isBuy = side === 'LONG';

    // Set leverage for this coin
    await this.updateLeverage(masterAddress, asset.index, leverage);

    // Get current mid price
    const midPrice = await this.getMidPrice(symbol);

    // Calculate size = (usdc * leverage) / price, align to szDecimals
    const nominalUsdc = usdcSize * leverage;
    const rawSize = nominalUsdc / midPrice;
    const size = this.roundSize(rawSize, asset.szDecimals);

    // Market order: IOC limit with 0.1% slippage
    const limitPrice = isBuy
      ? this.roundPrice(midPrice * 1.001, asset.pxDecimals)
      : this.roundPrice(midPrice * 0.999, asset.pxDecimals);

    const order = {
      a: asset.index,
      b: isBuy,
      p: String(limitPrice),
      s: String(size),
      r: false,
      t: { limit: { tif: 'Ioc' } },
    };

    console.log(`[HLTrader] Order: ${symbol} ${side} price=${order.p} size=${order.s} lev=${leverage}x`);

    const result = await this.submitOrder(masterAddress, [order]);

    const fill = result?.response?.data?.statuses?.[0];
    if (fill?.error) {
      throw new Error(`HL order error: ${fill.error}`);
    }
    if (!fill?.filled) {
      throw new Error(`HL order not filled: ${JSON.stringify(fill)}`);
    }

    return {
      orderId: fill.filled.oid || null,
      entryPrice: parseFloat(fill.filled.avgPx),
      size: parseFloat(fill.filled.totalSz) || size,
      side,
      symbol,
    };
  }

  /**
   * Close position (market close all)
   */
  async closePosition(
    masterAddress: string,
    symbol: string,
    side: 'LONG' | 'SHORT',
    size: number,
  ): Promise<any> {
    const asset = await this.getAssetInfo(symbol);
    const isBuy = side === 'SHORT'; // Close long = sell, close short = buy
    const midPrice = await this.getMidPrice(symbol);

    // 3% slippage for close (IOC+0.1% failed in fast markets)
    const limitPrice = isBuy
      ? this.roundPrice(midPrice * 1.03, asset.pxDecimals)
      : this.roundPrice(midPrice * 0.97, asset.pxDecimals);

    const order = {
      a: asset.index,
      b: isBuy,
      p: String(limitPrice),
      s: String(size),
      r: true, // reduceOnly
      t: { limit: { tif: 'Ioc' } },
    };

    return this.submitOrder(masterAddress, [order]);
  }

  /**
   * Set stop loss (HL native SL)
   */
  async setStopLoss(
    masterAddress: string,
    symbol: string,
    side: 'LONG' | 'SHORT',
    size: number,
    triggerPrice: number,
  ): Promise<any> {
    const asset = await this.getAssetInfo(symbol);
    const isBuy = side === 'SHORT';
    const tpx = this.roundPrice(triggerPrice, asset.pxDecimals);

    const order = {
      a: asset.index,
      b: isBuy,
      p: String(tpx),
      s: String(size),
      r: true,
      t: { trigger: { isMarket: true, triggerPx: String(tpx), tpsl: 'sl' } },
    };

    return this.submitOrder(masterAddress, [order]);
  }

  /**
   * Set take profit (HL native TP)
   */
  async setTakeProfit(
    masterAddress: string,
    symbol: string,
    side: 'LONG' | 'SHORT',
    size: number,
    triggerPrice: number,
  ): Promise<any> {
    const asset = await this.getAssetInfo(symbol);
    const isBuy = side === 'SHORT';
    const tpx = this.roundPrice(triggerPrice, asset.pxDecimals);

    const order = {
      a: asset.index,
      b: isBuy,
      p: String(tpx),
      s: String(size),
      r: true,
      t: { trigger: { triggerPx: String(tpx), isMarket: true, tpsl: 'tp' } },
    };

    return this.submitOrder(masterAddress, [order]);
  }

  /**
   * Get positions for a user
   */
  async getPositions(masterAddress: string): Promise<any[]> {
    const resp = await axios.post(`${HL_API}/info`, {
      type: 'clearinghouseState',
      user: masterAddress,
    });
    return resp.data?.assetPositions || [];
  }

  /**
   * Get USDC balance
   */
  async getBalance(masterAddress: string): Promise<number> {
    const resp = await axios.post(`${HL_API}/info`, {
      type: 'clearinghouseState',
      user: masterAddress,
    });
    return parseFloat(resp.data?.marginSummary?.accountValue || '0');
  }

  /**
   * Update leverage for a coin
   */
  async updateLeverage(masterAddress: string, assetIndex: number, leverage: number): Promise<any> {
    const action = {
      type: 'updateLeverage',
      asset: assetIndex,
      isCross: true,
      leverage,
    };
    return this.submitAction(masterAddress, action);
  }

  /**
   * Get mid price for a symbol
   */
  async getMidPrice(symbol: string): Promise<number> {
    const resp = await axios.post(`${HL_API}/info`, { type: 'allMids' });
    const price = parseFloat(resp.data[symbol.toUpperCase()]);
    if (!price) throw new Error(`HL: no mid price for ${symbol}`);
    return price;
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal: Signing & Submission
  // ─────────────────────────────────────────────────────────────────

  /**
   * Submit generic action (updateLeverage etc)
   */
  private async submitAction(masterAddress: string, action: any): Promise<any> {
    const nonce = Date.now();
    const signature = await this.signAction(action, nonce, null);

    const resp = await axios.post(`${HL_API}/exchange`, {
      action,
      nonce,
      signature,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });

    if (resp.data?.status !== 'ok') {
      throw new Error(`HL action rejected: ${JSON.stringify(resp.data)}`);
    }
    return resp.data;
  }

  /**
   * Build order action, sign (EIP-712), submit to HL
   */
  private async submitOrder(masterAddress: string, orders: any[], builder?: any): Promise<any> {
    const nonce = Date.now();

    const action: any = {
      type: 'order',
      orders,
      grouping: 'na',
    };

    if (builder) {
      action.builder = builder;
    }

    const signature = await this.signAction(action, nonce, null);

    const payload = { action, nonce, signature };

    let resp;
    try {
      resp = await axios.post(`${HL_API}/exchange`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      });
    } catch (axiosErr: any) {
      const body = axiosErr.response?.data;
      console.error(`[HLTrader] HTTP ${axiosErr.response?.status}: ${JSON.stringify(body)}`);
      throw new Error(`HL request failed: ${axiosErr.response?.status}: ${JSON.stringify(body)}`);
    }

    if (resp.data?.status !== 'ok') {
      throw new Error(`HL order rejected: ${JSON.stringify(resp.data)}`);
    }

    return resp.data;
  }

  /**
   * HL action hash — matches Python SDK action_hash()
   *
   *   data = msgpack.packb(action)
   *   data += nonce.to_bytes(8, "big")
   *   if vault_address is None: data += b"\x00"
   *   else: data += b"\x01" + address_to_bytes(vault_address)
   *   return keccak(data)
   */
  private actionHash(action: any, nonce: number, vaultAddress: string | null): string {
    const packed = msgpackr.pack(action);

    const nonceBuf = Buffer.alloc(8);
    nonceBuf.writeBigUInt64BE(BigInt(nonce));

    let vaultBuf: Buffer;
    if (vaultAddress) {
      const addrBytes = Buffer.from(vaultAddress.replace('0x', ''), 'hex');
      vaultBuf = Buffer.concat([Buffer.from([0x01]), addrBytes]);
    } else {
      vaultBuf = Buffer.from([0x00]);
    }

    const data = Buffer.concat([packed, nonceBuf, vaultBuf]);
    return ethers.keccak256(data);
  }

  /**
   * EIP-712 sign HL action — matches Python SDK sign_l1_action()
   */
  private async signAction(action: any, nonce: number, vaultAddress: string | null): Promise<{ r: string; s: string; v: number }> {
    const hash = this.actionHash(action, nonce, vaultAddress);

    const phantomAgent = {
      source: 'a', // 'a' = mainnet
      connectionId: hash,
    };

    const sig = await this.agentWallet.signTypedData(
      HL_DOMAIN,
      { Agent: AGENT_TYPES.Agent },
      phantomAgent,
    );

    const { r, s, v } = ethers.Signature.from(sig);
    return { r, s, v };
  }

  // ─────────────────────────────────────────────────────────────────
  // Internal: Asset info & price rounding
  // ─────────────────────────────────────────────────────────────────

  async getAssetInfo(symbol: string): Promise<AssetInfo> {
    await this.refreshAssetCache();

    const info = this.assetCache?.get(symbol.toUpperCase());
    if (!info) {
      throw new Error(`HL asset not found: ${symbol}`);
    }
    return info;
  }

  private async refreshAssetCache(): Promise<void> {
    const now = Date.now();
    if (this.assetCache && now - this.assetCacheAt < this.assetCacheTTL) return;

    const resp = await axios.post(`${HL_API}/info`, { type: 'metaAndAssetCtxs' });
    const [meta] = resp.data;
    const universe = meta?.universe || [];

    const cache = new Map<string, AssetInfo>();
    universe.forEach((asset: any, index: number) => {
      cache.set(asset.name.toUpperCase(), {
        index,
        szDecimals: asset.szDecimals ?? 3,
        pxDecimals: 5,
        maxLeverage: asset.maxLeverage ?? 20,
        name: asset.name,
      });
    });

    this.assetCache = cache;
    this.assetCacheAt = now;
  }

  private roundSize(size: number, szDecimals: number): number {
    const factor = Math.pow(10, szDecimals);
    return Math.floor(size * factor) / factor;
  }

  private roundPrice(price: number, sigFigs = 5): number {
    if (price === 0) return 0;
    const magnitude = Math.floor(Math.log10(Math.abs(price)));
    const decimals = Math.max(0, sigFigs - 1 - magnitude);
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(price * factor) / factor;
    return parseFloat(rounded.toFixed(decimals));
  }
}

// Singleton (lazy init)
let _instance: HLTrader | null = null;

export function getHLTrader(): HLTrader {
  if (!_instance) {
    _instance = new HLTrader();
  }
  return _instance;
}
