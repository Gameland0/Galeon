/**
 * HL Address Store — maps NEAR accountId to HL EVM address
 * Persisted to disk so it survives restarts
 */

import * as fs from 'fs';
import * as path from 'path';

const STORE_FILE = path.join(process.cwd(), '.hl-addresses.json');

interface HLAddressEntry {
  accountId: string;
  hlAddress: string;
  strategy: string;
  registeredAt: string;
}

class HLAddressStore {
  private store = new Map<string, HLAddressEntry>();

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(STORE_FILE)) {
        const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
        for (const entry of Object.values(data) as HLAddressEntry[]) {
          this.store.set(entry.accountId, entry);
        }
        console.log(`[HLAddressStore] Loaded ${this.store.size} entries`);
      }
    } catch (err) {
      console.error('[HLAddressStore] Failed to load:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const data: Record<string, HLAddressEntry> = {};
      this.store.forEach((v, k) => { data[k] = v; });
      fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[HLAddressStore] Failed to save:', err);
    }
  }

  set(accountId: string, hlAddress: string, strategy = 'stable'): void {
    this.store.set(accountId, {
      accountId,
      hlAddress,
      strategy,
      registeredAt: new Date().toISOString(),
    });
    this.saveToDisk();
  }

  getHLAddress(accountId: string): string | null {
    return this.store.get(accountId)?.hlAddress || null;
  }

  getStrategy(accountId: string): string {
    return this.store.get(accountId)?.strategy || 'stable';
  }

  remove(accountId: string): void {
    this.store.delete(accountId);
    this.saveToDisk();
  }

  has(accountId: string): boolean {
    return this.store.has(accountId);
  }
}

export const hlAddressStore = new HLAddressStore();
