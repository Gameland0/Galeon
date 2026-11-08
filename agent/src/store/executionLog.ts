/**
 * Execution Log — In-memory store for Agent execution records
 * No database needed — simple array storage for hackathon
 */

export interface ExecutionRecord {
  id?: string;
  accountId: string;
  type: 'OPEN' | 'CLOSE' | 'DEPOSIT_HL' | 'WITHDRAW_HL' | 'SWAP';
  symbol: string;
  direction: string;
  amount: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  error?: string;
  txHash?: string;
  pnl?: number;
  timestamp?: string;
}

export class ExecutionLog {
  private records: ExecutionRecord[] = [];
  private counter = 0;

  add(record: Omit<ExecutionRecord, 'id' | 'timestamp'>): ExecutionRecord {
    const full: ExecutionRecord = {
      ...record,
      id: `exec-${++this.counter}`,
      timestamp: new Date().toISOString(),
    };
    this.records.unshift(full); // newest first

    // Keep max 500 records in memory
    if (this.records.length > 500) {
      this.records = this.records.slice(0, 500);
    }

    return full;
  }

  getByAccount(accountId: string, limit = 20): ExecutionRecord[] {
    return this.records
      .filter(r => r.accountId === accountId)
      .slice(0, limit);
  }

  getActivePositions(accountId: string): ExecutionRecord[] {
    const opens = new Map<string, ExecutionRecord>();
    for (const r of this.records) {
      if (r.accountId !== accountId) continue;
      if (r.type === 'OPEN' && r.status === 'SUCCESS') {
        if (!opens.has(r.symbol)) {
          opens.set(r.symbol, r);
        }
      }
      if (r.type === 'CLOSE' && r.status === 'SUCCESS') {
        opens.delete(r.symbol);
      }
    }
    return Array.from(opens.values());
  }

  getTodayPnlPercent(accountId: string): number {
    const today = new Date().toISOString().slice(0, 10);
    let totalPnl = 0;
    for (const r of this.records) {
      if (r.accountId !== accountId) continue;
      if (r.type !== 'CLOSE' || r.status !== 'SUCCESS') continue;
      if (!r.timestamp?.startsWith(today)) continue;
      totalPnl += r.pnl || 0;
    }
    return totalPnl;
  }

  getStats(accountId: string): {
    totalTrades: number;
    totalPnl: number;
    activePositions: number;
  } {
    const acctRecords = this.records.filter(r => r.accountId === accountId);
    const closes = acctRecords.filter(r => r.type === 'CLOSE' && r.status === 'SUCCESS');
    return {
      totalTrades: acctRecords.filter(r => r.type === 'OPEN' && r.status === 'SUCCESS').length,
      totalPnl: closes.reduce((sum, r) => sum + (r.pnl || 0), 0),
      activePositions: this.getActivePositions(accountId).length,
    };
  }
}
