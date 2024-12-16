import React, { useContext, useState, useEffect } from 'react';
import { Modal, Button, Select, Input, Form, message, Spin, Alert, Tooltip } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useBlockchain } from './BlockchainContext'; 
import { ChatContext } from './ChatContext';
import { compileContract, deployContract, getGasPrice } from '../services/api';
import Web3 from 'web3';
import { 
  processContractSource, 
  validateContractImports,
  getContractDependencies,
  getRequiredLibraries,
  injectContractHelpers
} from '../utils/contractUtils';


const { Option } = Select;

interface Contract {
  name: string;
  source: string;
  type: 'solidity' | 'solana-anchor' | 'solana-cargo';
  abi: any[];
  bytecode: string;
  address?: string;
  dependencies?: string[];
  isDeployed: boolean;
}

export const ContractDeployment: React.FC = () => {
  const { 
    blockchainType, 
    setBlockchainType,
    chainid,
    connect, 
    web3, 
    evmAddress 
  } = useBlockchain();
  
  const { 
    contracts, 
    setContracts,
    deployModalVisible, 
    setDeployModalVisible,
    setMessages,
    conversationId,
    setDeployedContract
  } = useContext(ChatContext)!;

  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [constructorParams, setConstructorParams] = useState<string[]>([]);
  const [deploymentNetwork, setDeploymentNetwork] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [processingImports, setProcessingImports] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);
  const [estimatedGas, setEstimatedGas] = useState<string>('');
  const [gasPriceGwei, setGasPriceGwei] = useState<string>('');
  const [dependencies, setDependencies] = useState<string[]>([]);

  useEffect(() => {
    // if (blockchainType === 'evm' && web3) {
    //   web3.eth.getChainId().then(chainId => setDeploymentNetwork(chainId.toString()));
    // }
  }, [blockchainType, web3]);

  const networks: any = {
    '1': {
      chainId: '0x1',
      chainName: 'Ethereum Mainnet',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://mainnet.infura.io/v3/'],
      blockExplorerUrls: ['https://etherscan.io']
    },
    '56': {
      chainId: '0x38',
      chainName: 'Binance Smart Chain',
      nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
      rpcUrls: ['https://bsc-mainnet.nodereal.io/v1/972acf04ccf54c769e5fcb37eb598e92'],
      blockExplorerUrls: ['https://bscscan.com/']
    },
    '97': {
      chainId: '0x61',
      chainName: 'BNB Smart Chain Testnet',
      nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
      rpcUrls: ['https://bsc-testnet-dataseed.bnbchain.org'],
      blockExplorerUrls: ['https://testnet.bscscan.com']
    },
    '137': {
      chainId: '0x89',
      chainName: 'Polygon Mainnet',
      nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
      rpcUrls: ['https://polygon-rpc.com'],
      blockExplorerUrls: ['https://polygonscan.com']
    },
    '1101': {
      chainId: '0x44D',
      chainName: 'Polygon zkEVM',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://zkevm-rpc.com'],
      blockExplorerUrls: ['https://zkevm.polygonscan.com/']
    },
    '2442': {
      chainId: '0x98A',
      chainName: 'Polygon Cardona zkEVM testnet',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://rpc.cardona.zkevm-rpc.com'],
      blockExplorerUrls: ['https://cardona-zkevm.polygonscan.com/']
    }
  };

  const processImports = (source: string): string => {
    let processedSource = source;
  
    // 确保导入语句使用正确的路径格式
    const importRegex = /import\s+{([^}]+)}\s+from\s+["']@openzeppelin\/contracts([^"']*?)["'];/g;
    processedSource = processedSource.replace(importRegex, (match, imports, path) => {
      return `import { ${imports} } from "@openzeppelin/contracts${path}";`;
    });
  
    // 处理单行导入
    const singleImportRegex = /import\s+["']@openzeppelin\/contracts([^"']+)["'];/g;
    processedSource = processedSource.replace(singleImportRegex, (match, path) => {
      return `import "@openzeppelin/contracts${path}";`;
    });
  
    // 确保有 SPDX License
    if (!processedSource.includes('SPDX-License-Identifier')) {
      processedSource = '// SPDX-License-Identifier: MIT\n' + processedSource;
    }
  
    // 确保有 pragma 声明
    if (!processedSource.includes('pragma solidity')) {
      processedSource = 'pragma solidity ^0.8.0;\n' + processedSource;
    }
  
    console.log('Processed source:', processedSource);
    return processedSource;
  };
  
  const handleCompile = async () => {
    if (!selectedContract) {
      message.error('Please select a contract to compile');
      return;
    }

    setProcessingImports(true);
    setImportWarnings([]);
    
    try {
      // 处理导入
      const processedSource = processImports(selectedContract.source);

      // 编译处理后的源码
      const result = await compileContract({
        source: processedSource
      });

      if (result.success && result.abi && result.bytecode) {
        setSelectedContract({
          ...selectedContract,
          abi: result.abi,
          bytecode: result.bytecode
        });

        // 处理警告
        const warnings = Array.isArray(result.warnings) ? result.warnings : [];
        if (warnings.length > 0) {
          message.warning('Compilation succeeded with warnings');
          setImportWarnings(warnings);
          setMessages((prev: any) => [...prev, {
            sender: 'system',
            content: `Compilation Warnings:\n${warnings.join('\n')}`,
            conversationId
          }]);
        } else {
          message.success('Compilation successful');
        }

        // Gas估算
        if (web3 && result.bytecode) {
          try {
            const chainId = await web3.eth.getChainId();
            const isZkEVM = chainId === 1101 || chainId === 1442;

            const gasEstimate = await web3.eth.estimateGas({
              data: result.bytecode
            });
            const adjustedGas = isZkEVM 
              ? Math.ceil(gasEstimate * 1.2) // zkEVM requires higher gas
              : Math.ceil(gasEstimate * 1.1);
            
            setEstimatedGas(adjustedGas.toString());
            
            const currentGasPrice = await web3.eth.getGasPrice();
            setGasPriceGwei(Web3.utils.fromWei(currentGasPrice, 'gwei'));
          } catch (error) {
            console.warn('Failed to estimate gas:', error);
          }
        }
      } else {
        throw new Error(result.error || 'Compilation failed');
      }
    } catch (error: any) {
      console.error('Compilation error:', error);
      setMessages((prev: any) => [...prev, {
        sender: 'system',
        content: `Compilation error: ${error.message}`,
        conversationId
      }]);
      message.error('Failed to compile: ' + error.message);
    } finally {
      setProcessingImports(false);
    }
  };

  const handleDeploy = async () => {
    if (!selectedContract?.abi || !selectedContract?.bytecode) {
      message.error('Please compile the contract first');
      return;
    }

    if (!evmAddress) {
      try {
        await connect();
        if (!evmAddress) {
          message.error('Please connect your wallet first');
          return;
        }
      } catch (error) {
        message.error('Failed to connect wallet');
        return;
      }
    }
    // console.log('chainid',chainid);
    // console.log('deploymentNetwork',deploymentNetwork);
    if (chainid !== deploymentNetwork) {
      const state = await handleNetworkChange(deploymentNetwork);
      if (!state) return
    }
    // 验证构造函数参数
    if (!validateConstructorParams()) {
      return;
    }

    setShowDeployConfirm(true);
  };

  const validateConstructorParams = (): boolean => {
    if (!selectedContract?.abi) return false;
    
    const constructor = selectedContract.abi.find(x => x.type === 'constructor');
    if (!constructor) return true;

    const params = constructor.inputs || [];
    if (constructorParams.length !== params.length) {
      message.error('Please provide all constructor parameters');
      return false;
    }

    return true;
  };

  const confirmDeploy = async () => {
    setIsDeploying(true);
    
    try {
      const gasPrice = await getGasPrice(Number(deploymentNetwork));
      const address = await deployContract(
        selectedContract!.abi,
        selectedContract!.bytecode,
        constructorParams,
        evmAddress!,
        Number(deploymentNetwork),
        gasPrice
      );

      message.success(`Contract deployed at: ${address}`);
      
      setContracts((prevContracts: any) => 
        prevContracts.map((c: any) => 
          c.name === selectedContract!.name
            ? { ...c, address, isDeployed: true }
            : c
        )
      );
      setSelectedContract(null)
      setMessages((prev: any) => [...prev, {
        sender: 'system',
        content: `The address of your deployed smart contract is ${address}, and the chain is ${getNetworkName(deploymentNetwork)}.`,
        conversationId
      }]);

      setDeployedContract(selectedContract!.name);
      setShowDeployConfirm(false);
      setDeployModalVisible(false);
    } catch (error: any) {
      console.error('Deployment error:', error);
      message.error('Failed to deploy: ' + error.message);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleNetworkChange = async (networkId: any) => {
    try {
      if (!window.ethereum) {
        throw new Error('Please install MetaMask');
      }

      // 先连接钱包
      if (!evmAddress) {
        await connect();
      }

      // 尝试切换网络
      // try {
      //   await window.ethereum.request({
      //     method: 'wallet_switchEthereumChain',
      //     params: [{ chainId: `0x${Number(networkId).toString(16)}` }],
      //   });
      // } catch (switchError: any) {
      //   // This error code indicates that the chain has not been added to MetaMask
      //   if (switchError) {
      //     await window.ethereum.request({
      //       method: 'wallet_addEthereumChain',
      //       params: [networks[networkId]],
      //     });
      //   } else {
      //     throw switchError;
      //   }
      // }

      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [networks[networkId]],
      });

      // setDeploymentNetwork(networkId);
      return true
    } catch (error: any) {
      message.error(error.message);
      console.error('Network switch error:', error);
      return false
    }
  };

  const handleonCancel = () => {
    setDeployModalVisible(false)
    setSelectedContract(null)
  }

  return (
    <>
      <Modal
        title="Deploy Contract"
        open={deployModalVisible}
        onCancel={handleonCancel}
        footer={null}
        width={600}
        className="contract-deployment-modal"
      >
        <Form layout="vertical">
          <Form.Item label="Select Contract">
            <Select
              placeholder="Select a contract"
              value={selectedContract?.name}
              onChange={(value) => setSelectedContract(contracts.find((c: any) => c.name === value) || null)}
            >
              {contracts
                .filter((contract: any) => !contract.isDeployed)
                .map((contract: any) => (
                  <Option key={contract.name} value={contract.name}>
                    {contract.name}
                  </Option>
                ))}
            </Select>
          </Form.Item>

          {selectedContract && (
            <Form.Item label="Contract Source">
              <Input.TextArea 
                value={selectedContract.source}
                autoSize={{ minRows: 4, maxRows: 8 }}
                readOnly
              />
            </Form.Item>
          )}

          <Form.Item label="Deployment Network">
            <Select
              placeholder="Select deployment network"
              value={deploymentNetwork}
              onChange={setDeploymentNetwork}
            >
              <Option value="1">Ethereum Mainnet</Option>
              <Option value="137">Polygon Mainnet</Option>
              <Option value="56">BNB Chain Mainnet</Option>
              <Option value="97">BNB Chain Testnet</Option>
              <Option value="1101">Polygon zkEVM Mainnet</Option>
              <Option value="2442">Polygon zkEVM Testnet</Option>
            </Select>
          </Form.Item>

          {selectedContract?.abi && selectedContract.abi
            .find((item: any) => item.type === 'constructor')?.inputs
            .map((input: any, index: number) => (
              <Form.Item 
                key={index} 
                label={`${input.name} (${input.type})`}
                required
              >
                <Input
                  placeholder={`Enter ${input.type} value`}
                  onChange={(e) => {
                    const newParams = [...constructorParams];
                    newParams[index] = e.target.value;
                    setConstructorParams(newParams);
                  }}
                />
              </Form.Item>
            ))}

          {dependencies && dependencies.length > 0 && (
            <Form.Item label="Contract Dependencies">
              <Alert
                type="info"
                message="Detected Dependencies"
                description={
                  <ul>
                    {dependencies.map((dep, index) => (
                      <li key={index}>{dep}</li>
                    ))}
                  </ul>
                }
              />
            </Form.Item>
          )}

          <Form.Item>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <Button 
                onClick={handleCompile}
                disabled={!selectedContract || processingImports}
              >
                {processingImports ? <Spin size="small" /> : 'Compile Contract'}
              </Button>
              <Button 
                type="primary"
                onClick={handleDeploy}
                disabled={isDeploying || !selectedContract?.bytecode}
              >
                {isDeploying ? <Spin /> : 'Deploy Contract'}
              </Button>
            </div>
          </Form.Item>

          {importWarnings.length > 0 && (
            <Form.Item>
              <Alert
                type="warning"
                message="Compilation Warnings"
                description={
                  <ul>
                    {importWarnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                }
              />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Modal
        title="Confirm Deployment"
        open={showDeployConfirm}
        onOk={confirmDeploy}
        onCancel={() => setShowDeployConfirm(false)}
        confirmLoading={isDeploying}
        className="contract-deployment-modal"
      >
        <div style={{ marginBottom: 16 }}>
          <p>Please confirm the deployment details:</p >
          <div style={{ marginBottom: 8 }}>
            <strong>Network:</strong> {getNetworkName(deploymentNetwork)}
          </div>
          {estimatedGas && (
            <div style={{ marginBottom: 8 }}>
              <strong>Estimated Gas:</strong> {estimatedGas}
            </div>
          )}
          {gasPriceGwei && (
            <div style={{ marginBottom: 8 }}>
              <strong>Gas Price:</strong> {gasPriceGwei} Gwei
            </div>
          )}
        </div>
        <Alert
          type="warning"
          message="Important"
          description="This action cannot be undone. Please verify all parameters before proceeding."
          showIcon
        />
      </Modal>
    </>
  );
};

function getNetworkName(networkId: string | null): string {
  const networks: { [key: string]: string } = {
    '1': 'Ethereum Mainnet',
    '137': 'Polygon Mainnet',
    '56': 'BNB Chain Mainnet',
    '80001': 'Mumbai Testnet',
    '97': 'BNB Chain Testnet',
    '1101': 'Polygon zkEVM Mainne',
    '2442': 'Polygon zkEVM Testnet'
  };
  return networkId ? networks[networkId] || 'Unknown Network' : 'No Network Selected';
}
