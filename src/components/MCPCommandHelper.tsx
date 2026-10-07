import React from 'react';
import { Card, Tag, Collapse } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

const { Panel } = Collapse;

interface MCPCommand {
  command: string;
  description: string;
  example: string;
  category: string;
}

interface MCPCommandHelperProps {
  agentName?: string;
  primaryWallet?: string;
}

const MCPCommandHelper: React.FC<MCPCommandHelperProps> = ({ agentName, primaryWallet }) => {
  if (!agentName) {
    return null;
  }

  const getCommandsForCapability = (capability: string): MCPCommand[] => {
    switch (capability) {
      case 'evm-agent-kit':
        return [
          {
            category: 'Transfer',
            command: 'transfer [amount] [token] to [address]',
            description: 'Transfer tokens to another address',
            example: 'transfer 0.1 MATIC to 0xeD4c2576A79D1BB10f9076A69b7Def188A97909A'
          },
          {
            category: 'Balance',
            command: 'check balance [address]',
            description: 'Check wallet balance',
            example: 'check balance 0xeD4c2576A79D1BB10f9076A69b7Def188A97909A'
          },
          {
            category: 'Transaction',
            command: 'query transaction [hash]',
            description: 'Query transaction details',
            example: 'query transaction 0xb27bfabacbfa5dd2b7ce72ec180da623ef8a6479871e470477f78799165d4f2a'
          },
          {
            category: 'Gas',
            command: 'gas price',
            description: 'Get current gas price',
            example: 'current gas price'
          },
          {
            category: 'Tokens',
            command: 'token balances',
            description: 'Get all token balances',
            example: 'show my token balances'
          }
        ];
      
      case 'lifi-agent-kit':
        return [
          {
            category: 'Swap',
            command: 'swap [amount] [from_token] to [to_token]',
            description: 'Swap tokens on the same chain',
            example: 'swap 100 USDC to USDT'
          },
          {
            category: 'Bridge',
            command: 'bridge [amount] [token] from [chain1] to [chain2]',
            description: 'Bridge tokens across chains',
            example: 'bridge 1 ETH from ethereum to polygon'
          },
          {
            category: 'Cross-chain Swap',
            command: 'swap [token1] to [token2] on [chain]',
            description: 'Swap tokens with chain specification',
            example: 'swap MATIC to USDC on polygon'
          },
          {
            category: 'Quote',
            command: 'quote [amount] [from] to [to]',
            description: 'Get swap/bridge quote',
            example: 'quote 1000 USDC to ETH'
          }
        ];
      
      case 'solana-agent-kit':
        return [
          {
            category: 'Transfer',
            command: 'transfer [amount] SOL to [address]',
            description: 'Transfer SOL to another address',
            example: 'transfer 1 SOL to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
          },
          {
            category: 'Token Deploy',
            command: 'deploy token [name] with symbol [symbol]',
            description: 'Deploy a new SPL token',
            example: 'deploy token MyToken with symbol MTK'
          },
          {
            category: 'NFT',
            command: 'mint NFT "[name]" with description "[desc]"',
            description: 'Mint a new NFT',
            example: 'mint NFT "Cool Art" with description "Amazing digital art"'
          },
          {
            category: 'Balance',
            command: 'balance [address]',
            description: 'Check SOL balance',
            example: 'balance 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'
          },
          {
            category: 'Swap',
            command: 'swap [amount] [token1] to [token2]',
            description: 'Swap tokens on Solana',
            example: 'swap 100 USDC to SOL'
          }
        ];
      
      default:
        return [];
    }
  };

  // 根据钱包类型确定能力
  const capabilities = primaryWallet === 'metamask' ? ['evm-agent-kit'] : 
                      primaryWallet === 'phantom' ? ['solana-agent-kit'] : 
                      ['evm-agent-kit'];
  
  const allCommands: MCPCommand[] = capabilities.flatMap(cap => getCommandsForCapability(cap));
  const groupedCommands = allCommands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = [];
    }
    acc[cmd.category].push(cmd);
    return acc;
  }, {} as Record<string, MCPCommand[]>);

  return (
    <Card 
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <QuestionCircleOutlined />
          <span>{agentName ? `${agentName} MCP Capabilities` : 'MCP Command Helper'}</span>
        </div>
      }
      size="small"
      style={{ 
        marginBottom: '16px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}
    >
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {capabilities.map(cap => (
          <Tag key={cap} color={
            cap === 'evm-agent-kit' ? 'blue' :
            cap === 'lifi-agent-kit' ? 'purple' :
            cap === 'solana-agent-kit' ? 'green' : 'default'
          }>
            {cap === 'evm-agent-kit' ? '⚡ EVM' :
             cap === 'lifi-agent-kit' ? '🌉 LI.FI' :
             cap === 'solana-agent-kit' ? '☀️ Solana' : cap}
          </Tag>
        ))}
      </div>

      <Collapse 
        ghost
        defaultActiveKey={['examples']}
        style={{ background: '#f5f5f5', borderRadius: '6px' }}
      >
        <Panel header="📝 Command Examples" key="examples">
          {Object.entries(groupedCommands).map(([category, commands]) => (
            <div key={category} style={{ marginBottom: '16px' }}>
              <div style={{ 
                fontWeight: '600', 
                fontSize: '13px', 
                color: '#666',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {category}
              </div>
              {commands.map((cmd, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    marginBottom: '12px',
                    padding: '10px',
                    background: 'white',
                    borderRadius: '6px',
                    border: '1px solid #e8e8e8'
                  }}
                >
                  <div style={{ 
                    fontFamily: 'monospace', 
                    fontSize: '13px',
                    color: '#1890ff',
                    marginBottom: '4px',
                    fontWeight: '500'
                  }}>
                    {cmd.command}
                  </div>
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#666',
                    marginBottom: '4px'
                  }}>
                    {cmd.description}
                  </div>
                  <div style={{ 
                    fontSize: '12px',
                    color: '#999',
                    fontStyle: 'italic',
                    background: '#f9f9f9',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontFamily: 'monospace'
                  }}>
                    Example: {cmd.example}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </Panel>
      </Collapse>
    </Card>
  );
};

export default MCPCommandHelper;