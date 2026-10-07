// TypeScript type definitions for Solana contracts
import { PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

// ===== Agent Registry Types =====

export interface AgentRegistryAccount {
  authority: PublicKey;
  agentCounter: BN;
  bump: number;
}

export interface AgentAccount {
  id: BN;
  owner: PublicKey;
  name: string;
  description: string;
  agentType: string;
  ipfsHash: string;
  imageUrl: string;
  isPublic: boolean;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

export interface TrainingDataAccount {
  agentId: BN;
  ipfsHash: string;
  dataType: string;
  timestamp: BN;
  bump: number;
}

// ===== Team Registry Types =====

export interface TeamRegistryAccount {
  authority: PublicKey;
  teamCounter: BN;
  bump: number;
}

export interface TeamAccount {
  id: BN;
  teamUuid: string;
  owner: PublicKey;
  name: string;
  description: string;
  agentCount: number;
  maxAgents: number;
  isActive: boolean;
  createdAt: BN;
  updatedAt: BN;
  bump: number;
}

export interface TeamAgentAccount {
  teamId: BN;
  agentId: BN;
  role: string;
  addedAt: BN;
  bump: number;
}

export interface AgentRole {
  id: BN;
  role: string;
}

// ===== Slot Purchase Types =====

export interface SlotConfigAccount {
  authority: PublicKey;
  treasurySol: PublicKey;
  treasuryUsdc: PublicKey;
  usdcMint: PublicKey;
  slotPriceSol: BN;
  slotPriceUsdc: BN;
  defaultTeamLimit: number;
  totalSlotsSold: BN;
  isActive: boolean;
  bump: number;
}

export interface UserTeamLimitAccount {
  user: PublicKey;
  teamLimit: number;
  teamsCreated: number;
  slotsPurchased: BN;
  totalSpentSol: BN;
  totalSpentUsdc: BN;
  bump: number;
}

export enum PaymentType {
  Sol = 'Sol',
  Usdc = 'Usdc'
}

export interface UserLimitInfo {
  user: PublicKey;
  teamLimit: number;
  teamsCreated: number;
  slotsPurchased: BN;
  totalSpentSol: BN;
  totalSpentUsdc: BN;
  availableSlots: number;
}

// ===== Event Types =====

export interface AgentRegisteredEvent {
  agentId: BN;
  owner: PublicKey;
  name: string;
  agentType: string;
  ipfsHash: string;
}

export interface TeamRegisteredEvent {
  teamId: BN;
  teamUuid: string;
  owner: PublicKey;
  name: string;
  agentCount: number;
}

export interface TeamSlotPurchasedEvent {
  user: PublicKey;
  paymentType: PaymentType;
  amountPaid: BN;
  newTeamLimit: number;
  transactionId: BN;
}

// ===== Client Interface Types =====

export interface CreateAgentParams {
  name: string;
  description: string;
  agentType: string;
  ipfsHash: string;
  imageUrl?: string;
}

export interface CreateTeamParams {
  teamUuid: string;
  name: string;
  description: string;
  agents: AgentRole[];
}

export interface UpdateAgentParams {
  name?: string;
  description?: string;
  agentType?: string;
  imageUrl?: string;
}

export interface PurchaseSlotParams {
  quantity?: number;
  useUsdc?: boolean;
}

// ===== Error Types =====

export interface ContractError {
  code: number;
  name: string;
  msg: string;
}