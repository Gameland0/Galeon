/**
 * Galeon NEAR Agent Service
 * - Polls all registered signal sources via FusionEngine
 * - Fuses signals with weighted voting + regime guard
 * - Executes trades via NEAR Intents + Hyperliquid
 * - Exposes status/execution/source API for frontend dashboard
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { SignalPoller } from './signals/signalPoller';
import { IntentsExecutor } from './execution/intentsExecutor';
import { HLBridge } from './execution/hlBridge';
import { NearKeyManager } from './keys/nearKeyManager';
import { ExecutionLog } from './store/executionLog';
import { RiskCheck } from './risk/riskCheck';
import { SourceStore } from './fusion/sourceStore';
import { FusionEngine } from './fusion/fusionEngine';
import { IntelBuffer } from './fusion/intelBuffer';
import { TrustStore } from './fusion/trustStore';
import { SignalValidator } from './fusion/signalValidator';
import { agentRoutes } from './routes/agentRoutes';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

// Core services
const keyManager = new NearKeyManager();
const executionLog = new ExecutionLog();
const riskCheck = new RiskCheck();
const intentsExecutor = new IntentsExecutor(keyManager, executionLog);
const hlBridge = new HLBridge(intentsExecutor);
const sourceStore = new SourceStore();
const intelBuffer = new IntelBuffer();
const trustStore = new TrustStore();
const signalValidator = new SignalValidator();
const fusionEngine = new FusionEngine(sourceStore, intelBuffer, trustStore, signalValidator);

// Auto-trust built-in Brain
trustStore.setTrusted('galeon-brain');
const signalPoller = new SignalPoller(riskCheck, intentsExecutor, hlBridge, executionLog, fusionEngine);

// API routes
app.use('/api/agent', agentRoutes(keyManager, executionLog, signalPoller, intentsExecutor, sourceStore, fusionEngine));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    running: signalPoller.isRunning(),
    accounts: keyManager.getRegisteredAccounts().length,
    sources: sourceStore.getActive().length,
  });
});

app.listen(PORT, () => {
  console.log(`[Agent] Galeon NEAR Agent running on port ${PORT}`);
  console.log(`[Agent] Signal source: ${process.env.AI_SERVER_URL || 'http://localhost:8080/api'}`);
  console.log(`[Agent] NEAR network: ${process.env.NEAR_NETWORK_ID || 'mainnet'}`);
  console.log(`[Agent] Active signal sources: ${sourceStore.getActive().length}`);

  // Auto-resume polling for any accounts restored from disk
  const accounts = keyManager.getRegisteredAccounts();
  if (accounts.length > 0) {
    console.log(`[Agent] Resuming signal polling for ${accounts.length} account(s)`);
    signalPoller.start(accounts[0]);
  }
});
