/**
 * Source Store — Registry of external signal sources with trust weights
 * Persisted to disk. Built-in 'galeon-brain' source always present.
 */

import * as fs from 'fs';
import * as path from 'path';

const STORE_PATH = path.join(__dirname, '../../data/source-store.json');

export interface SignalSource {
  id: string;
  name: string;
  url: string;            // base URL — GET /positions or /intel is appended (empty for push agents)
  apiKey?: string;
  /** Push-mode API key — agent uses this to POST intel to Brain */
  pushApiKey?: string;
  trustWeight: number;    // 0.1 – 2.0, default 1.0
  totalSignals: number;
  wonSignals: number;
  lostSignals: number;
  registeredAt: string;
  active: boolean;
  /** FIP capabilities declared by this agent */
  capabilities?: string[];
  /** Protocol type: 'legacy' (GET /positions) or 'fip' (GET /intel) or 'push' (agent POSTs to Brain) */
  protocolType?: 'legacy' | 'fip' | 'push';
}

export class SourceStore {
  private sources: Map<string, SignalSource> = new Map();

  constructor() {
    this.load();
    // Built-in ai-server is always present at highest trust
    if (!this.sources.has('galeon-brain')) {
      this.sources.set('galeon-brain', {
        id: 'galeon-brain',
        name: 'Galeon Brain (ai-server)',
        url: process.env.AI_SERVER_URL || 'http://localhost:8080/api',
        trustWeight: 2.0,
        totalSignals: 0,
        wonSignals: 0,
        lostSignals: 0,
        registeredAt: new Date().toISOString(),
        active: true,
      });
      this.save();
    }
  }

  register(id: string, name: string, url: string, apiKey?: string, capabilities?: string[], protocolType?: 'legacy' | 'fip' | 'push'): SignalSource {
    const existing = this.sources.get(id);
    const entry: SignalSource = {
      id,
      name,
      url,
      apiKey,
      trustWeight: existing?.trustWeight ?? 1.0,
      totalSignals: existing?.totalSignals ?? 0,
      wonSignals: existing?.wonSignals ?? 0,
      lostSignals: existing?.lostSignals ?? 0,
      registeredAt: existing?.registeredAt ?? new Date().toISOString(),
      active: true,
      capabilities: capabilities || existing?.capabilities,
      protocolType: protocolType || existing?.protocolType || 'legacy',
    };
    this.sources.set(id, entry);
    this.save();
    return entry;
  }

  remove(id: string): void {
    if (id === 'galeon-brain') return; // cannot remove primary source
    this.sources.delete(id);
    this.save();
  }

  setActive(id: string, active: boolean): void {
    const src = this.sources.get(id);
    if (!src) return;
    src.active = active;
    this.save();
  }

  getActive(): SignalSource[] {
    return Array.from(this.sources.values()).filter(s => s.active);
  }

  getAll(): SignalSource[] {
    return Array.from(this.sources.values());
  }

  /** Find agent by push API key (for authenticating incoming push-intel requests) */
  getByPushKey(pushApiKey: string): SignalSource | undefined {
    for (const src of this.sources.values()) {
      if (src.pushApiKey && src.pushApiKey === pushApiKey) return src;
    }
    return undefined;
  }

  get(id: string): SignalSource | undefined {
    return this.sources.get(id);
  }

  recordOutcome(sourceId: string, won: boolean): void {
    const src = this.sources.get(sourceId);
    if (!src) return;
    src.totalSignals++;
    if (won) src.wonSignals++; else src.lostSignals++;
    // Auto-adjust weight by win rate once we have ≥5 signals (except galeon-brain)
    if (src.totalSignals >= 5 && sourceId !== 'galeon-brain') {
      const winRate = src.wonSignals / src.totalSignals;
      src.trustWeight = Math.max(0.1, Math.min(2.0, parseFloat((winRate * 2.0).toFixed(2))));
    }
    this.save();
  }

  private load(): void {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const data = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')) as SignalSource[];
        for (const src of data) {
          this.sources.set(src.id, src);
        }
        console.log(`[SourceStore] Loaded ${this.sources.size} source(s)`);
      }
    } catch {
      /* start fresh */
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(STORE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(Array.from(this.sources.values()), null, 2));
    } catch (err: any) {
      console.error('[SourceStore] Save error:', err.message);
    }
  }
}
