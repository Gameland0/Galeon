import React, { useContext, useState, useEffect } from 'react';
import { Modal, Button, Select, Input, Form, message, Spin, Alert, Radio } from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useBlockchain } from './BlockchainContext'; 
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { ChatContext } from './ChatContext';
import { compileContract, deployContract, getGasPrice, saveContractConfig, verifyContract, compileSolanaProgram, deploySolanaContract } from '../services/api';
import Web3 from 'web3';

const { Option } = Select;

// 🔧 添加全局部署锁，防止重复部署
let isGlobalDeploying = false;
const DEPLOYMENT_TIMEOUT = 60000; // 60秒超时

// 🔧 添加页面刷新时的锁清理
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    isGlobalDeploying = false;
  });
  
  // 页面变为可见时检查并重置锁（防止标签页切换导致的锁残留）
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // 给一个短暂延迟，然后重置锁
      setTimeout(() => {
        if (isGlobalDeploying) {
          console.warn('🔧 Resetting deployment lock due to page visibility change');
          isGlobalDeploying = false;
        }
      }, 2000);
    }
  });
}

// 🔧 添加全局部署计数器，确保每次部署都有唯一标识
let deploymentCounter = 0;
const getUniqueDeploymentId = () => {
  deploymentCounter++;
  return `${Date.now()}-${deploymentCounter}-${Math.random().toString(36).substr(2, 9)}`;
};



enum ContractType {
  STANDARD = 'standard',
  UPGRADEABLE = 'upgradeable',
  GAME = 'game',
}

interface Contract {
  name: string;
  source: string;
  type: 'solidity' | 'solana-anchor' | 'solana-cargo';
  abi: any[];
  bytecode: string;
  address?: string;
  dependencies?: string[];
  isDeployed: boolean;
  rustFiles?: { name: string; content: string }[];
  programBinaryHex?: string;
  idlJson?: any;
  programId?: string;
  signature?: string;
}

export const ContractDeployment: React.FC = () => {
  const {
    chainid,
    connect, 
    web3, 
    evmAddress 
  } = useBlockchain();
  
  // 🔧 添加MultiWalletContext支持
  const {
    evmAccount: multiWalletEvmAccount,
    connectMetaMask,
    isAuthenticated,
    web3: multiWalletWeb3,
    networkId
  } = useContext(MultiWalletContext);
  
  const { 
    contracts, 
    setContracts,
    deployModalVisible, 
    setDeployModalVisible,
    setMessages,
    conversationId,
    setDeployedContract,
    gameContext,
    setGameContext,
    isGameMode,
    updateContractInfo,
    setIsLoading
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
  const [contractType, setContractType] = useState<ContractType>(ContractType.STANDARD);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<string | null>(null);
  const [compilerVersion, setCompilerVersion] = useState<string>('0.8.25');

  // Auto-select contract for single-contract scenarios when deploy modal opens
  useEffect(() => {
    if (deployModalVisible && !selectedContract && contracts.length === 1) {
      // Automatically select the sole contract
      setSelectedContract(contracts[0]);
    }
  }, [deployModalVisible, selectedContract, contracts]);

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
    },
    '8453': {
      chainId: '0x2105',
      chainName: 'Base',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://mainnet.base.org'],
      blockExplorerUrls: ['https://basescan.org/']
    },
    '10143': {
      chainId: '0x279f',
      chainName: 'Monad Testnet',
      nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
      rpcUrls: ['https://testnet-rpc.monad.xyz'],
      blockExplorerUrls: ['https://testnet.monadexplorer.com']
    },
    '42161': {
      chainId: '0xa4b1',
      chainName: 'Arbitrum One',
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: ['https://arb1.arbitrum.io/rpc'],
      blockExplorerUrls: ['https://arbiscan.io/']
    },
    '50312': {
      chainId: '0xc488',
      chainName: 'Somnia Testnet',
      nativeCurrency: { name: 'STT', symbol: 'STT', decimals: 18 },
      rpcUrls: ['https://dream-rpc.somnia.network/'],
      blockExplorerUrls: ['https://shannon-explorer.somnia.network/']
    },
    '1328': {
      chainId: '0x530',
      chainName: 'Sei Testnet',
      nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 },
      rpcUrls: ['https://evm-rpc-testnet.sei-apis.com'],
      blockExplorerUrls: ['https://seitrace.com']
    },
    '1329': {
      chainId: '0x531',
      chainName: 'Sei Mainnet',
      nativeCurrency: { name: 'SEI', symbol: 'SEI', decimals: 18 },
      rpcUrls: ['https://evm-rpc.sei-apis.com'],
      blockExplorerUrls: ['https://seitrace.com']
    }
  };

  // Process imports and ensure correct SPDX and pragma based on selected compiler version
  const processImports = (source: string, version: string): string => {
    let processedSource = source;

    // 移除任何已有的 pragma solidity 声明，使用更强的正则表达式
    // 第一步：移除完整的pragma语句
    processedSource = processedSource.replace(/^\s*pragma\s+solidity[^;]*;?\s*$/gmi, '');
    
    // 第二步：移除任何单独的版本号行（如 ^0.8.0; 或 >=0.8.0; 或 0.8.0;）
    processedSource = processedSource.replace(/^\s*[\^>=<]*\d+\.\d+\.\d*\s*;?\s*$/gmi, '');
    
    // 第三步：移除任何包含pragma关键字的行
    processedSource = processedSource.replace(/^.*pragma.*$/gmi, '');
    
    // 第四步：移除任何残留的版本号片段（更宽泛的匹配）
    processedSource = processedSource.replace(/^\s*[\^>=<~]*\d+\.\d+[.\d]*\s*;?\s*$/gmi, '');
    
    // 第五步：清理多余的空行
    processedSource = processedSource.replace(/\n\s*\n\s*\n/g, '\n\n');
    processedSource = processedSource.replace(/^\s*\n/gm, '');

    // 🔧 修复常见的合约语法错误
    // 修复错误的合约继承语法，如 "contract GameContract is ReentrancyGuard nonReentrant {"
    processedSource = processedSource.replace(
      /contract\s+(\w+)\s+is\s+([^{]+?)\s+(nonReentrant|onlyOwner|payable|view|pure)\s*\{/g,
      'contract $1 is $2 {'
    );
    
    // 修复错误的修饰符位置，确保修饰符在函数声明中而不是合约声明中
    processedSource = processedSource.replace(
      /contract\s+(\w+)\s+is\s+([^{]+?)\s+(nonReentrant|onlyOwner)\s*\{/g,
      'contract $1 is $2 {'
    );
  
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
  
    // 确保 SPDX License 在最顶端 - 使用更精确的检查
    const spdxRegex = /\/\/\s*SPDX-License-Identifier\s*:\s*[^\n]*/i;
    if (!spdxRegex.test(processedSource)) {
      processedSource = '// SPDX-License-Identifier: MIT\n' + processedSource;
    }
  
    // 基于用户选择的 compilerVersion 注入单一正确的 pragma 声明
    // 🔧 修复：确保不会重复添加pragma，只在没有SPDX的情况下才添加到开头
    if (!spdxRegex.test(source)) {
      processedSource = `pragma solidity ^${version};\n\n` + processedSource;
    } else {
      // 如果已有SPDX，在SPDX后添加pragma
      processedSource = processedSource.replace(
        /^(\/\/\s*SPDX-License-Identifier\s*:\s*[^\n]*\n)/i,
        `$1pragma solidity ^${version};\n\n`
      );
    }
    // 自动注入 ReentrancyGuard 导入，如果合约继承了 ReentrancyGuard
    if (processedSource.includes('is ReentrancyGuard')) {
      processedSource = processedSource.replace(
        `pragma solidity ^${version};\n\n`,
        `pragma solidity ^${version};\nimport "@openzeppelin/contracts/security/ReentrancyGuard.sol";\n\n`
      );
    }
  
    console.log('Processed source:', processedSource);
    return processedSource;
  };
  
  const handleCompile = async () => {
    if (!selectedContract) return;
    // Solana program compile
    if (selectedContract.type === 'solana-anchor' || selectedContract.type === 'solana-cargo') {
      try {
        setProcessingImports(false);
        // Prepare Rust files array
        const rustFiles = [{ name: `${selectedContract.name}.rs`, content: selectedContract.source }];
        const { programBinaryHex, idlJson } = await compileSolanaProgram({ rustFiles });
        setSelectedContract({ ...selectedContract, rustFiles, programBinaryHex, idlJson, programId: undefined, signature: undefined });
        
        // 🔧 修复：同步更新全局contracts数组，确保IDL信息不丢失
        setContracts((prevContracts: any) => 
          prevContracts.map((c: any) => 
            c.name === selectedContract.name
              ? { 
                  ...c, 
                  rustFiles, 
                  programBinaryHex, 
                  idlJson,
                  compiledAt: new Date().toISOString()
                }
              : c
          )
        );
        console.log('🔧 ContractDeployment: Updated global contracts array with compiled Solana program');
        
        message.success('Solana program compiled successfully');
        // Default Solana network to Devnet only if not already selected
        if (!deploymentNetwork) {
        setDeploymentNetwork('solana-devnet');
        }
      } catch (error) {
        console.error('Solana compile error:', error);
        message.error('Error compiling Solana program: ' + (error as any).message);
      }
      return;
    }

    setProcessingImports(true);
    setImportWarnings([]);
    
    try {
      const { source } = selectedContract;
      // 使用用户选择的 compilerVersion 处理源码
      const processedSource = processImports(source, compilerVersion);

      const result = await compileContract({
        source: processedSource,
        compilerVersion
      });

      if (result.success && result.abi && result.bytecode) {
        setSelectedContract({
          ...selectedContract,
          abi: result.abi,
          bytecode: result.bytecode
        });

        // 🔧 修复：同步更新全局contracts数组，确保ABI信息不丢失
        setContracts((prevContracts: any) => 
          prevContracts.map((c: any) => 
            c.name === selectedContract.name
              ? { 
                  ...c, 
                  abi: result.abi, 
                  bytecode: result.bytecode,
                  compiledAt: new Date().toISOString()
                }
              : c
          )
        );
        console.log('🔧 ContractDeployment: Updated global contracts array with compiled ABI');

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
            const chainIdRaw = await web3.eth.getChainId();
            const chainId = Number(chainIdRaw);
            const isZkEVM = chainId === 1101 || chainId === 1442;

            const gasEstimateRaw = await web3.eth.estimateGas({ data: result.bytecode });
            const gasEstimate = Number(gasEstimateRaw);
            const adjustedGas = isZkEVM 
              ? Math.ceil(gasEstimate * 1.2)
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
      if (error.response.data.errors.length) {
        let errstr = ''
        error.response.data.errors.map((item: any) => {
          errstr = errstr+item
        })
        setMessages((prev: any) => [...prev, {
          sender: 'system',
          content: `Compilation error: ${errstr}`,
          conversationId
        }]);
      } else {
        setMessages((prev: any) => [...prev, {
          sender: 'system',
          content: `Compilation error: ${error.message}`,
          conversationId
        }]);
      }
      
      message.error('Failed to compile: ' + error.message);
    } finally {
      setProcessingImports(false);
    }
  };

  const handleDeploy = async () => {
    if (!selectedContract) return;
    
    // 🔧 修复：增强防重复机制
    if (isDeploying || isGlobalDeploying) {
      message.warning('Deployment already in progress. Please wait...');
      return;
    }
    
    // Solana program deploy
    if (selectedContract.type === 'solana-anchor' || selectedContract.type === 'solana-cargo') {
      // 🔧 强化部署锁检查
      if (isGlobalDeploying) {
        const shouldProceed = window.confirm(
          '检测到正在进行的部署操作。这可能是由于之前的部署没有正常完成。\n\n点击"确定"强制开始新的部署，或点击"取消"等待。'
        );
        if (!shouldProceed) {
          return;
        } else {
          console.warn('🔧 User chose to force reset deployment lock');
          isGlobalDeploying = false;
        }
      }
      
      setIsDeploying(true);
      isGlobalDeploying = true;
      
      // 🔧 设置超时清理锁
      const timeoutId = setTimeout(() => {
        if (isGlobalDeploying) {
          console.warn('Deployment timeout, releasing lock');
          isGlobalDeploying = false;
        }
      }, DEPLOYMENT_TIMEOUT);
      
      try {
        // Map UI selection to Solana cluster names
        let cluster: string;
        if (deploymentNetwork === 'solana-mainnet') {
          cluster = 'mainnet-beta';
        } else if (deploymentNetwork === 'solana-testnet') {
          cluster = 'testnet';
        } else {
          cluster = 'devnet';
        }
        
        const deployId = getUniqueDeploymentId();
        console.log('🔧 Starting Solana deployment to:', cluster, 'with ID:', deployId);
        message.loading({ content: `Deploying Solana program... (ID: ${deployId.split('-')[1]})`, key: 'deploy' });
        
        const { programId, signature } = await deploySolanaContract({
          rustFiles: selectedContract.rustFiles || [],
          network: cluster,
          deploymentId: deployId // 传递唯一标识符
        });
        
        setSelectedContract({ ...selectedContract, programId, signature, isDeployed: true });
        message.success({ content: `Solana program deployed successfully: ${programId}`, key: 'deploy' });
        setDeployedContract(selectedContract.name);
        
        // 🔧 修复：更新游戏代码中的合约信息（Solana版本）
        updateContractInfo(programId, selectedContract.idlJson || [], deploymentNetwork);
        
        // 如果是游戏合约，更新游戏上下文
        if (gameContext) {
          setGameContext({
            ...gameContext,
            contractAddress: programId,
            contractABI: selectedContract.idlJson || []
          });
        }
        
        // 调用部署成功处理函数，添加消息到对话框
        await onDeploySuccess(programId, getNetworkName(deploymentNetwork));
        
        // 关闭部署模态框
        setSelectedContract(null);
        setDeployModalVisible(false);
        
      } catch (error: any) {
        console.error('Solana deploy error:', error);
        // Extract backend error message if available
        const backendError = error.response?.data?.error || error.message;
        message.error({ content: `Error deploying Solana program: ${backendError}`, key: 'deploy' });
      } finally {
        setIsDeploying(false);
        isGlobalDeploying = false;
        clearTimeout(timeoutId);
      }
      return;
    }

    if (!selectedContract?.abi || !selectedContract?.bytecode) {
      message.error('Please compile the contract first');
      return;
    }

    // 🔧 修复钱包连接状态检查：优先检查MultiWalletContext
    const currentEvmAddress = multiWalletEvmAccount || evmAddress;
    
    if (!currentEvmAddress) {
      try {
        // 优先尝试通过MultiWalletContext连接
        if (!multiWalletEvmAccount) {
          await connectMetaMask();
          // 给React状态更新一些时间
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // 再次检查MultiWalletContext状态
          if (!multiWalletEvmAccount) {
            // 如果MultiWalletContext连接失败，尝试BlockchainContext
        await connect();
            await new Promise(resolve => setTimeout(resolve, 500));
            
        if (!evmAddress) {
          message.error('Please connect your wallet first');
          return;
            }
          }
        }
      } catch (error) {
        console.error('Wallet connection error:', error);
        message.error('Failed to connect wallet');
        return;
      }
    }

    // 🔧 检查网络ID，优先使用MultiWalletContext的networkId
    const currentNetworkId = networkId?.toString() || chainid;
    
    if (currentNetworkId !== deploymentNetwork) {
      const state = await handleNetworkChange(deploymentNetwork);
      if (!state) return;
    }

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
      // 检查是否有gameId
      

      // 🔧 使用正确的钱包地址
      const currentEvmAddress = multiWalletEvmAccount || evmAddress;
      const currentWeb3 = multiWalletWeb3 || web3;
      
      if (!currentEvmAddress) {
        message.error('Wallet address not found');
        return;
      }

      const gasPrice = await getGasPrice(Number(deploymentNetwork));
      const address = await deployContract(
        selectedContract!.abi,
        selectedContract!.bytecode,
        constructorParams,
        currentEvmAddress,
        Number(deploymentNetwork),
        gasPrice
      );

      message.success(`Contract deployed at: ${address}`);
      
      // 更新合约状态
      setContracts((prevContracts: any) => 
        prevContracts.map((c: any) => 
          c.name === selectedContract!.name
            ? { 
                ...c, 
                address, 
                isDeployed: true, 
                contractType,
                abi: selectedContract!.abi
              }
            : c
        )
      );

      // 更新游戏代码中的合约信息
      updateContractInfo(address, selectedContract!.abi, deploymentNetwork);

      // 如果是游戏合约，更新游戏上下文
      if (contractType === ContractType.GAME && gameContext) {
        setGameContext({
          ...gameContext,
          contractAddress: address,
          contractABI: selectedContract!.abi
        });
      }

      try {
        // 保存合约配置
        await saveContractConfig({
          gameId: gameContext.gameId,
          address,
          abi: selectedContract!.abi,
          networkId: deploymentNetwork,
          contractType
        });
      } catch (error) {
        console.error('Failed to save contract config:', error);
      }

      // 调用部署成功处理函数
      await onDeploySuccess(address, getNetworkName(deploymentNetwork));
      
      setSelectedContract(null);
      setShowDeployConfirm(false);
      setDeployModalVisible(false);
      setDeployedContract(selectedContract!.name);

    } catch (error: any) {
      console.error('Deployment error:', error);
      message.error('Failed to deploy: ' + error.message);
    } finally {
      setIsDeploying(false);
    }
  };

  const handleNetworkChange = async (networkId: any) => {
    try {
      console.log('🔄 Starting network change to:', networkId);
      
      // 检测并获取正确的MetaMask provider（和之前修复连接问题的方法一样）
      const ethereum = (window as any).ethereum;
      let provider = null;
      
      if (!ethereum) {
        throw new Error('No Ethereum wallet found. Please install MetaMask.');
      }

      console.log('🔄 Available providers:', {
        hasEthereum: !!ethereum,
        isMetaMask: ethereum?.isMetaMask,
        isOKX: ethereum?.isOKX,
        providers: ethereum?.providers?.length || 0
      });

      // 如果有多个钱包，尝试找到MetaMask
      if (ethereum.providers && ethereum.providers.length > 0) {
        const metamaskProvider = ethereum.providers.find((p: any) => p.isMetaMask);
        if (metamaskProvider) {
          provider = metamaskProvider;
          console.log('🔄 Using MetaMask provider from multi-wallet environment');
        } else {
          throw new Error('MetaMask not found in multi-wallet environment. Please ensure MetaMask is installed and enabled.');
        }
      } else if (ethereum.isMetaMask) {
        provider = ethereum;
        console.log('🔄 Using single MetaMask provider');
      } else {
        // 可能是其他钱包（如OKX）伪装成主provider
        throw new Error(`Wrong wallet detected. Expected MetaMask, found: ${ethereum.isOKX ? 'OKX' : 'Unknown wallet'}.\n\nPlease disable other wallet extensions or set MetaMask as default.`);
      }

      if (!provider || !provider.request) {
        throw new Error('MetaMask provider not properly initialized.');
      }

      // 🔧 先检查钱包连接状态，优先使用MultiWalletContext
      const currentEvmAddress = multiWalletEvmAccount || evmAddress;
      if (!currentEvmAddress) {
        try {
          await connectMetaMask();
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
        await connect();
      }
      }

      // 验证网络配置存在
      const networkConfig = networks[networkId];
      if (!networkConfig) {
        throw new Error(`Network configuration not found for ID: ${networkId}`);
      }

      console.log('🔄 Network config:', networkConfig);

      // 首先尝试切换到现有网络
      try {
        console.log('🔄 Attempting to switch to existing network...');
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: networkConfig.chainId }],
        });
        console.log('🔄 Network switch successful');
        return true;
      } catch (switchError: any) {
        console.log('🔄 Switch failed, attempting to add network...', switchError);
        
        // 如果网络不存在（错误代码4902），则添加网络
        if (switchError.code === 4902) {
          try {
            await provider.request({
        method: 'wallet_addEthereumChain',
              params: [networkConfig],
      });
            console.log('🔄 Network added successfully');
            return true;
          } catch (addError: any) {
            console.error('🔄 Failed to add network:', addError);
            throw new Error(`Failed to add network: ${addError.message}`);
          }
        } else {
          // 其他错误（如用户拒绝）
          throw new Error(`Network switch failed: ${switchError.message || 'User rejected'}`);
        }
      }
    } catch (error: any) {
      console.error('🔄 Network change error:', error);
      message.error(`Network switch failed: ${error.message}`);
      return false;
    }
  };

  const handleonCancel = () => {
    setDeployModalVisible(false)
    setSelectedContract(null)
  }

  const onDeploySuccess = async (address: string, chainType: string) => {
    try {
      // 检查是否为有效的合约（EVM合约有abi，Solana合约有idlJson）
      if (selectedContract && (selectedContract.abi || selectedContract.idlJson)) {
        const contractInfo = selectedContract.type.startsWith('solana') 
          ? `Program ID: ${address}` 
          : `Contract Address: ${address}`;
        
        // 添加部署成功消息
        setMessages((prevMessages: any) => [
          ...prevMessages,
          {
            sender: 'system',
            content: `${selectedContract.type.startsWith('solana') ? 'Solana program' : 'Smart contract'} "${selectedContract.name}" deployed successfully on ${chainType}!\n\n${contractInfo}\n\nThe contract is now ready for interaction.`,
            conversationId
          }
        ]);
      }
      
      // 🔧 关键修复：确保部署成功后重置ChatContext的isLoading状态
      // 这是为了防止合约部署后发送按钮被禁用
      setTimeout(() => {
        console.log('🔧 Ensuring chat isLoading is reset after contract deployment');
        // 通过ChatContext重置isLoading状态
        if (typeof setIsLoading === 'function') {
          setIsLoading(false);
        }
      }, 100);
      
    } catch (error: any) {
      console.error('Error in onDeploySuccess:', error);
      message.error('Failed to save contract configuration: ' + error.message);
    }
  };

  // Compute whether deploy should be enabled for both EVM and Solana
  const canDeploy = selectedContract
    ? (selectedContract.type.startsWith('solana')
        ? !!selectedContract.programBinaryHex
        : !!selectedContract.bytecode)
    : false;

  // 🔧 添加调试信息
  console.log('🔧 ContractDeployment: Deploy button state debug:', {
    selectedContract: selectedContract?.name,
    contractType: selectedContract?.type,
    hasBytecode: !!selectedContract?.bytecode,
    hasProgramBinaryHex: !!selectedContract?.programBinaryHex,
    canDeploy,
    isDeploying
  });

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
              onChange={(value) => {
                const contract = contracts.find((c: any) => c.name === value) || null;
                console.log('🔧 ContractDeployment: Selected contract:', contract);
                console.log('🔧 Contract type:', contract?.type);
                setSelectedContract(contract);
                // 根据合约类型清空之前的网络选择
                setDeploymentNetwork(null);
              }}
            >
              {contracts
                .filter((contract: any) => !contract.isDeployed)
                .map((contract: any) => {
                  // 🔧 修复：生成更友好的合约类型显示名称
                  const getContractTypeDisplay = (type: string) => {
                    switch (type) {
                      case 'solidity':
                        return 'EVM/Solidity';
                      case 'solana-anchor':
                        return 'Solana/Anchor';
                      case 'solana-cargo':
                        return 'Solana/Native';
                      default:
                        return type || 'Unknown';
                    }
                  };
                  
                  return (
                    <Option key={contract.name} value={contract.name}>
                      {contract.name} ({getContractTypeDisplay(contract.type)})
                    </Option>
                  );
                })}
            </Select>
          </Form.Item>

          {verificationResult && (
            <Form.Item>
              <Alert
                message="Verification Status"
                description={verificationResult}
                type={verificationResult.includes('success') ? 'success' : 'error'}
                showIcon
              />
            </Form.Item>
          )}

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
            {(() => {
              console.log('🔧 ContractDeployment: Rendering network selection for contract type:', selectedContract?.type);
              return selectedContract?.type === 'solidity' ? (
            <Select
              placeholder="Select deployment network"
              value={deploymentNetwork}
              onChange={setDeploymentNetwork}
            >
                {/* EVM Networks */}
              <Option value="1">Ethereum Mainnet</Option>
              <Option value="137">Polygon Mainnet</Option>
              <Option value="56">BNB Chain Mainnet</Option>
              <Option value="97">BNB Chain Testnet</Option>
              <Option value="1101">Polygon zkEVM Mainnet</Option>
              <Option value="2442">Polygon zkEVM Testnet</Option>
              <Option value="8453">Base</Option>
              <Option value="10143">Monad Testnet</Option>
              <Option value="42161">Arbitrum One</Option>
              <Option value="50312">Somnia Testnet</Option>
              <Option value="1328">Sei Testnet</Option>
              <Option value="1329">Sei Mainnet</Option>
            </Select>
            ) : (
              <Select
                placeholder="Select Solana network"
                value={deploymentNetwork}
                onChange={setDeploymentNetwork}
              >
                <Option value="solana-devnet">Solana Devnet</Option>
                  <Option value="solana-mainnet">Solana Mainnet</Option>
                  <Option value="solana-testnet">Solana Testnet</Option>
              </Select>
              );
            })()}
          </Form.Item>

          {(() => {
            if (!selectedContract?.abi) {
              console.log('🔧 ContractDeployment: No ABI found for selectedContract');
              return null;
            }
            
            const constructor = selectedContract.abi.find((item: any) => item.type === 'constructor');
            console.log('🔧 ContractDeployment: Constructor found:', !!constructor);
            console.log('🔧 ContractDeployment: Constructor inputs:', constructor?.inputs);
            
            if (!constructor?.inputs || constructor.inputs.length === 0) {
              console.log('🔧 ContractDeployment: No constructor inputs found');
              return null;
            }
            
            return constructor.inputs.map((input: any, index: number) => (
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
            ));
          })()}

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

          {selectedContract?.type === 'solidity' && (
          <Form.Item label="Solidity Compiler Version">
            <Select
              placeholder="Select compiler version"
              value={compilerVersion}
              onChange={setCompilerVersion}
            >
              <Option value="0.8.25">Solidity 0.8.25 (Latest)</Option>
              <Option value="0.8.20">Solidity 0.8.20</Option>
              <Option value="0.8.17">Solidity 0.8.17</Option>
              <Option value="0.8.13">Solidity 0.8.13</Option>
              <Option value="0.8.4">Solidity 0.8.4</Option>
              <Option value="0.7.6">Solidity 0.7.6</Option>
              <Option value="0.6.12">Solidity 0.6.12</Option>
              <Option value="0.5.17">Solidity 0.5.17</Option>
            </Select>
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
                disabled={isDeploying || !canDeploy}
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
    '1101': 'Polygon zkEVM Mainnet',
    '2442': 'Polygon zkEVM Testnet',
    '8453': 'Base',
    '10143': 'Monad Testnet',
    '42161': 'Arbitrum One',
    '50312': 'Somnia Testnet',
    '1328': 'Sei Testnet',
    '1329': 'Sei Mainnet',
    'solana-devnet': 'Solana Devnet',
    'solana-mainnet': 'Solana Mainnet',
    'solana-testnet': 'Solana Testnet'
  };
  return networkId ? networks[networkId] || 'Unknown Network' : 'No Network Selected';
}



