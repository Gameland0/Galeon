import React, { useState, useEffect } from 'react';
import MCPServiceCard from './MCPServiceCard';
import { getAgentMCPCapabilities, updateAgentMCPCapabilities } from '../services/api';

interface MCPConfigurationProps {
  agentId: number;
  chainId: number;
  mcpEnabled: boolean;
  onMCPEnabledChange: (enabled: boolean) => void;
}

const MCPConfiguration: React.FC<MCPConfigurationProps> = ({
  agentId,
  chainId,
  mcpEnabled,
  onMCPEnabledChange
}) => {
  const [availableServices, setAvailableServices] = useState<any[]>([]);
  const [serviceStates, setServiceStates] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  // Mock data for different chains
  useEffect(() => {
    const getServicesForChain = (chainId: number) => {
      if (chainId === 101 || chainId === 999) { // Solana mainnet (101) and devnet (999)
        return [{
          id: 'solana-agent-kit',
          name: 'Solana Agent Kit',
          description: 'Complete Solana blockchain operations including wallet, DeFi, and NFT interactions',
          capabilities: ['balance', 'transfer', 'get_price', 'deploy_token', 'mint_nft', 'trade', 'get_asset', 'wallet_address', 'get_tps', 'resolve_domain']
        }];
      } else if ([1, 56, 137, 42161, 8453, 59144, 10, 43114, 80002].includes(chainId)) { // EVM chains
        return [
          {
            id: 'evm-agent-kit',
            name: 'EVM Agent Kit',
            description: `Complete EVM operations for ${getChainName(chainId)} - Native & ERC20 balances, prices with USD values, gas estimation, and smart contract interactions`,
            capabilities: ['balance', 'transfer', 'get_price', 'get_asset', 'token_balances', 'token_balances_with_prices', 'get_gas_price', 'estimate_gas']
          },
          {
            id: 'lifi-agent-kit',
            name: 'LI.FI Multi-Chain Agent Kit',
            description: `Advanced multi-chain DEX aggregator and bridge for EVM chains - Cross-chain swaps, bridges, and optimal routing`,
            capabilities: ['transfer', 'swap', 'bridge', 'quote', 'balance']
          }
        ];
      }
      return [];
    };

    setAvailableServices(getServicesForChain(chainId));
    
    // Load existing MCP configuration
    loadMCPConfiguration();
  }, [chainId, agentId]);

  const loadMCPConfiguration = async () => {
    try {
      const response = await getAgentMCPCapabilities(agentId);
      console.log('[MCP Frontend Debug] Raw response from API:', response);
      
      // 处理后端返回的数据结构: { success: true, data: [...] }
      const capabilities = response.success ? response.data : response;
      console.log('[MCP Frontend Debug] Extracted capabilities:', capabilities);
      
      const states: Record<string, boolean> = {};
      if (Array.isArray(capabilities)) {
        capabilities.forEach((cap: any) => {
          const enabled = Boolean(cap.enabled); // 确保转换为布尔值
          states[cap.mcpServiceId] = enabled;
          console.log('[MCP Frontend Debug] Service', cap.mcpServiceId, 'enabled:', cap.enabled, '->', enabled);
        });
      }
      console.log('[MCP Frontend Debug] Final service states:', states);
      setServiceStates(states);
    } catch (error) {
      console.log('No existing MCP configuration found, using defaults:', error);
    }
  };

  const handleServiceToggle = async (serviceId: string, enabled: boolean) => {
    setLoading(true);
    
    // Update local state immediately for better UX
    setServiceStates(prev => ({
      ...prev,
      [serviceId]: enabled
    }));

    try {
      // Prepare capabilities data
      const capabilities = availableServices.map(service => ({
        mcpServiceId: service.id,
        enabled: service.id === serviceId ? enabled : (serviceStates[service.id] || false),
        config: {
          rpcUrl: chainId === 101 ? 'https://api.mainnet-beta.solana.com' : 
                  chainId === 999 ? 'https://api.devnet.solana.com' : ''
        }
      }));

      await updateAgentMCPCapabilities(agentId, capabilities);
      console.log(`MCP Service ${serviceId} ${enabled ? 'enabled' : 'disabled'} for agent ${agentId}`);
    } catch (error) {
      console.error('Failed to update MCP configuration:', error);
      // Revert local state on error
      setServiceStates(prev => ({
        ...prev,
        [serviceId]: !enabled
      }));
    }
    
    setLoading(false);
  };

  const getChainName = (id: number) => {
    switch (id) {
      case 1: return 'Ethereum Mainnet';
      case 56: return 'BSC Mainnet';
      case 97: return 'BSC Testnet';
      case 137: return 'Polygon';
      case 42161: return 'Arbitrum One';
      case 8453: return 'Base Mainnet';
      case 59144: return 'Linea Mainnet';
      case 101: return 'Solana Mainnet';
      case 999: return 'Solana Devnet';
      default: return `Chain ID ${id}`;
    }
  };

  return (
    <div className="mcp-configuration">
      <div className="mcp-header">
        <div className="mcp-title-section">
          <h3>🔗 MCP Capabilities</h3>
          <p className="mcp-chain-info">Chain: {getChainName(chainId)}</p>
        </div>
        <label className="mcp-main-toggle">
          <span>Enable MCP</span>
          <input 
            type="checkbox" 
            checked={mcpEnabled}
            disabled={loading}
            onChange={(e) => onMCPEnabledChange(e.target.checked)}
          />
          <span className="mcp-main-slider"></span>
        </label>
      </div>

      {mcpEnabled && (
        <div className="mcp-services-section">
          {availableServices.length > 0 ? (
            <div className="mcp-services-grid">
              {availableServices.map(service => (
                <MCPServiceCard
                  key={service.id}
                  service={service}
                  enabled={serviceStates[service.id] || false}
                  loading={loading}
                  onToggle={(enabled) => handleServiceToggle(service.id, enabled)}
                />
              ))}
            </div>
          ) : (
            <div className="mcp-no-services">
              <p>No MCP services available for this chain yet.</p>
              <p>Solana and EVM chains are supported.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MCPConfiguration;