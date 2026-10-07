import { getAgentMCPCapabilities, updateAgentMCPCapabilities, api } from './api';
import { MCPCapability, MCPCallRequest, MCPCallResponse } from '../types/mcp';
import solanaMCPAdapter from './solanaMCPAdapter';

export class MCPService {
  // Determine if chainId is EVM or Solana
  private isEVMChain(chainId: number): boolean {
    return [1, 56, 137, 42161, 8453, 59144].includes(chainId);
  }

  private isSolanaChain(chainId: number): boolean {
    return [101, 999].includes(chainId);
  }

  // Check if agent has specific MCP capability
  async hasCapability(agentId: number, capability: string): Promise<boolean> {
    try {
      const capabilities = await getAgentMCPCapabilities(agentId);
      return capabilities.some((cap: MCPCapability) => 
        cap.enabled && cap.mcpServiceId.includes(capability)
      );
    } catch (error) {
      console.error('Error checking MCP capability:', error);
      return false;
    }
  }

  // Call read-only MCP tool (queries, balance checks, etc.)
  async callReadOnlyTool(agentId: number, tool: string, params: any, chainId?: number, walletInfo?: any): Promise<MCPCallResponse> {
    try {
      console.log(`Calling read-only MCP tool: ${tool}`, { agentId, params, chainId, walletInfo });
      
      // Check if agent has this capability
      const hasCapability = await this.hasCapability(agentId, tool);
      if (!hasCapability) {
        return {
          success: false,
          error: `Agent does not have ${tool} capability enabled`
        };
      }

      // Determine effective chainId from wallet info (prioritize current wallet network)
      let effectiveChainId = chainId;
      if (walletInfo) {
        if (walletInfo.type === 'metamask' && walletInfo.chainId) {
          effectiveChainId = walletInfo.chainId;
          console.log(`[MCP] Using EVM chainId from wallet: ${effectiveChainId}`);
        } else if (walletInfo.type === 'phantom' && walletInfo.network) {
          // Map Solana network to chainId
          const networkMapping: { [key: string]: number } = {
            'mainnet': 101,
            'testnet': 102, 
            'devnet': 103
          };
          effectiveChainId = networkMapping[walletInfo.network] || 103;
          console.log(`[MCP] Using Solana chainId from wallet: ${effectiveChainId} (${walletInfo.network})`);
        }
      }

      // Route to appropriate backend service based on effective chainId
      if (effectiveChainId && this.isEVMChain(effectiveChainId)) {
        // EVM chain - call backend API
        const serviceId = 'evm-agent-kit';
        const response = await api.post(`/mcp/call/${agentId}/${serviceId}/${tool}`, {
          parameters: {
            ...params,
            chainId: effectiveChainId,
            walletInfo: walletInfo
          }
        });
        return response.data;
      } else if (effectiveChainId && this.isSolanaChain(effectiveChainId)) {
        // Solana chain routing (existing logic)
        switch (tool) {
          case 'balance':
            return await solanaMCPAdapter.getBalance(params.address);
          case 'get_price':
            return await solanaMCPAdapter.getPrice(params.tokenMint);
          case 'get_asset':
            return await solanaMCPAdapter.getAssetInfo(params.assetId);
          case 'get_tps':
            return await solanaMCPAdapter.getTPS();
          default:
            return {
              success: false,
              error: `Unknown Solana tool: ${tool}`
            };
        }
      } else {
        // Fallback to Solana for backward compatibility
        switch (tool) {
          case 'balance':
            return await solanaMCPAdapter.getBalance(params.address);
          case 'get_price':
            return await solanaMCPAdapter.getPrice(params.tokenMint);
          case 'get_asset':
            return await solanaMCPAdapter.getAssetInfo(params.assetId);
          case 'get_tps':
            return await solanaMCPAdapter.getTPS();
          default:
            return {
              success: false,
              error: `Unknown read-only tool: ${tool}`
            };
        }
      }
    } catch (error) {
      console.error('Error calling MCP tool:', error);
      return {
        success: false,
        error: 'MCP call failed'
      };
    }
  }

  // Build transaction for write operations (returns unsigned transaction)
  async buildTransaction(agentId: number, operation: string, params: any, chainId?: number, walletInfo?: any): Promise<MCPCallResponse> {
    try {
      console.log(`Building transaction for: ${operation}`, { agentId, params, chainId, walletInfo });
      
      // Check if agent has this capability
      const hasCapability = await this.hasCapability(agentId, operation);
      if (!hasCapability) {
        return {
          success: false,
          error: `Agent does not have ${operation} capability enabled`
        };
      }

      // Determine effective chainId from wallet info (prioritize current wallet network)
      let effectiveChainId = chainId;
      if (walletInfo) {
        if (walletInfo.type === 'metamask' && walletInfo.chainId) {
          effectiveChainId = walletInfo.chainId;
          console.log(`[MCP] Using EVM chainId from wallet for transaction: ${effectiveChainId}`);
        } else if (walletInfo.type === 'phantom' && walletInfo.network) {
          // Map Solana network to chainId
          const networkMapping: { [key: string]: number } = {
            'mainnet': 101,
            'testnet': 102, 
            'devnet': 103
          };
          effectiveChainId = networkMapping[walletInfo.network] || 103;
          console.log(`[MCP] Using Solana chainId from wallet for transaction: ${effectiveChainId} (${walletInfo.network})`);
        }
      }

      // Route to appropriate backend service based on effective chainId
      if (effectiveChainId && this.isEVMChain(effectiveChainId)) {
        // EVM chain - call backend API
        const serviceId = 'evm-agent-kit';
        const response = await api.post(`/mcp/transaction/${agentId}/${serviceId}/${operation}`, {
          parameters: {
            ...params,
            chainId: effectiveChainId,
            walletInfo: walletInfo
          }
        });
        return response.data;
      } else if (effectiveChainId && this.isSolanaChain(effectiveChainId)) {
        // Solana chain routing (existing logic)
        switch (operation) {
          case 'transfer':
            return await solanaMCPAdapter.buildTransfer(params.from, params.to, params.amount);
          case 'deploy_token':
            return await solanaMCPAdapter.buildTokenDeploy(params);
          case 'mint_nft':
            return await solanaMCPAdapter.buildNFTMint(params);
          default:
            return {
              success: false,
              error: `Unknown Solana transaction operation: ${operation}`
            };
        }
      } else {
        // Fallback to Solana for backward compatibility
        switch (operation) {
          case 'transfer':
            return await solanaMCPAdapter.buildTransfer(params.from, params.to, params.amount);
          case 'deploy_token':
            return await solanaMCPAdapter.buildTokenDeploy(params);
          case 'mint_nft':
            return await solanaMCPAdapter.buildNFTMint(params);
          default:
            return {
              success: false,
              error: `Unknown transaction operation: ${operation}`
            };
        }
      }
    } catch (error) {
      console.error('Error building transaction:', error);
      return {
        success: false,
        error: 'Transaction build failed'
      };
    }
  }
}

export default new MCPService();