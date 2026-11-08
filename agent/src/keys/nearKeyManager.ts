/**
 * NEAR Key Manager — Stores and uses Function-Call Keys for Agent signing
 * Keys are persisted to disk so they survive restarts
 */

import { connect, keyStores, KeyPair, Account } from 'near-api-js';
import * as fs from 'fs';
import * as path from 'path';

const NEAR_NETWORK_ID = process.env.NEAR_NETWORK_ID || 'mainnet';
const NEAR_NODE_URL = process.env.NEAR_NODE_URL || 'https://rpc.mainnet.near.org';
const KEYS_FILE = path.join(process.cwd(), '.agent-keys.json');

interface RegisteredKey {
  accountId: string;
  publicKey: string;
  secretKey: string;
  registeredAt: string;
}

export class NearKeyManager {
  private keys = new Map<string, RegisteredKey>();
  private keyStore = new keyStores.InMemoryKeyStore();

  constructor() {
    this.loadFromDisk();
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(KEYS_FILE)) {
        const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf-8'));
        for (const key of Object.values(data) as RegisteredKey[]) {
          this.keys.set(key.accountId, key);
          // Restore to keyStore
          const keyPair = KeyPair.fromString(key.secretKey as any);
          this.keyStore.setKey(NEAR_NETWORK_ID, key.accountId, keyPair);
          console.log(`[KeyManager] Restored key for ${key.accountId}`);
        }
      }
    } catch (err) {
      console.error('[KeyManager] Failed to load keys from disk:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const data: Record<string, RegisteredKey> = {};
      this.keys.forEach((v, k) => { data[k] = v; });
      fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[KeyManager] Failed to save keys to disk:', err);
    }
  }

  async registerKey(accountId: string, publicKey: string, secretKey: string): Promise<void> {
    this.keys.set(accountId, {
      accountId,
      publicKey,
      secretKey,
      registeredAt: new Date().toISOString(),
    });

    const keyPair = KeyPair.fromString(secretKey as any);
    await this.keyStore.setKey(NEAR_NETWORK_ID, accountId, keyPair);
    this.saveToDisk();

    console.log(`[KeyManager] Registered key for ${accountId}: ${publicKey.slice(0, 20)}...`);
  }

  async revokeKey(accountId: string): Promise<void> {
    this.keys.delete(accountId);
    await this.keyStore.removeKey(NEAR_NETWORK_ID, accountId);
    this.saveToDisk();
    console.log(`[KeyManager] Revoked key for ${accountId}`);
  }

  async getSigningAccount(accountId: string): Promise<Account> {
    if (!this.keys.has(accountId)) {
      throw new Error(`No key registered for ${accountId}`);
    }

    const near = await connect({
      networkId: NEAR_NETWORK_ID,
      keyStore: this.keyStore,
      nodeUrl: NEAR_NODE_URL,
    });

    return near.account(accountId);
  }

  hasKey(accountId: string): boolean {
    return this.keys.has(accountId);
  }

  getRegisteredAccounts(): string[] {
    return Array.from(this.keys.keys());
  }

  getKeyInfo(accountId: string): { publicKey: string; registeredAt: string } | null {
    const key = this.keys.get(accountId);
    if (!key) return null;
    return { publicKey: key.publicKey, registeredAt: key.registeredAt };
  }
}
