import React, { useContext, useEffect, useState } from 'react';
import { Button, Modal, message, Upload, Dropdown, Menu } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import Web3 from 'web3';
import { ChatContext } from './ChatContext';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { SubscriptionContract, SubscriptionPlan } from '../contracts/SubscriptionContract'
import { USDTContract } from '../contracts/USDTContract'
import { CreditsPaymentContract } from '../contracts/CreditsPayment'
import iconup from '../image/icon_up.svg'
import BigNumber from 'bignumber.js';
import { syncUserCreditsWithContract } from '../services/api';
import game from '../image/icon_game.svg';
import { PopupTip } from './PopupTip';

export const ChatInput: React.FC = () => {
  const { input, setInput, handleSendMessage, isLoading, setIsLoading, handleClearConversation, isGameMode, toggleGameMode, selectedAgent } = useContext(ChatContext);
  const { credits, refreshCredits, web3, evmAccount, networkId, getWeb3Instance, primaryWallet } = useContext(MultiWalletContext);
  const [showbuy, setshowbuy] = useState(false)
  const [showbuyModal, setshowbuyModal] = useState(false)
  const [availablePlans, setAvailablePlans] = useState<SubscriptionPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [plansLoaded, setPlansLoaded] = useState(false); // 添加缓存标记

  // 气泡提示状态
  const [showCreditTip, setShowCreditTip] = useState(false);
  const [showGameModeTip, setShowGameModeTip] = useState(false);

  // 📎 新增：文件上传状态
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    name: string;
    type: 'image' | 'file';
    data: string;
    size: number;
  }>>([]);

  // 根据选中的Agent和MCP能力动态生成提示
  const getInputPlaceholder = () => {
    if (isGameMode) {
      return "Enter your game requirements...";
    }
    
    // 如果选中了Agent，显示MCP示例命令
    if (selectedAgent) {
      // 根据钱包类型推测可能的MCP能力
      if (primaryWallet === 'metamask') {
        return "Try: 'transfer 0.1 MATIC to 0x...', 'check balance', 'gas price'";
      }
      if (primaryWallet === 'phantom') {
        return "Try: 'transfer 1 SOL to ...', 'deploy token MyToken', 'check balance'";
      }
      return "Try: 'check balance', 'transfer tokens', 'query transaction'";
    }
    
    return "Type your message here or Type \"Create agent\"";
  };

  const inputPlaceholder = getInputPlaceholder();

  if (!credits) {
    refreshCredits()
  }

  // 判断余额是否不足（需要在 useEffect 之前声明）
  const totalCredits = (credits?.creditBalance || 0) + (credits?.buyBalance || 0);
  const isLowBalance = totalCredits < 10;

  // 检查是否显示气泡提示
  useEffect(() => {
    const creditTipClosed = sessionStorage.getItem('creditTipClosed');
    const gameModeTipClosed = sessionStorage.getItem('gameModeTipClosed');

    // 调试信息
    // console.log('🔍 Credit Tip Debug:', {
    //   creditTipClosed,
    //   isLowBalance,
    //   totalCredits,
    //   willShow: !creditTipClosed || isLowBalance
    // });

    // Credit 提示：如果余额不足，即使关闭过也要显示
    const shouldShowCreditTip = !creditTipClosed || isLowBalance;
    setShowCreditTip(shouldShowCreditTip);

    setShowGameModeTip(!gameModeTipClosed);
  }, [isLowBalance, totalCredits]);

  // 关闭 Credit 气泡
  const handleCloseCreditTip = () => {
    setShowCreditTip(false);
    sessionStorage.setItem('creditTipClosed', 'true');
  };

  // 关闭 Game Mode 气泡
  const handleCloseGameModeTip = () => {
    setShowGameModeTip(false);
    sessionStorage.setItem('gameModeTipClosed', 'true');
  };

  // 获取可用的订阅计划
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        // 如果已经加载过计划，直接返回，不重复请求
            if (plansLoaded && availablePlans.length > 0) {
      return;
    }

        // 使用 MultiWalletContext 的 Web3 实例
        const web3Instance = getWeb3Instance();
        if (!web3Instance || !evmAccount) {
          console.log('ℹ️ 钱包未连接，使用备用计划');
          const fallbackPlans = [
            {
              id: 'BASIC',
              name: 'Basic Plan',
              credits: 100,
              price: 4.99,
              priceWei: '4990000',
              active: true,
              costPerCredit: 0.0499
            },
            {
              id: 'PRO',
              name: 'Pro Plan',
              credits: 500,
              price: 19.99,
              priceWei: '19990000',
              active: true,
              costPerCredit: 0.0400
            },
            {
              id: 'DEV',
              name: 'Dev Plan',
              credits: 1500,
              price: 49.99,
              priceWei: '49990000',
              active: true,
              costPerCredit: 0.0333
            }
          ];
          setAvailablePlans(fallbackPlans);
          setPlansLoaded(true);
          return;
        }

        setLoadingPlans(true);

        // 使用 CreditsPaymentV2 合约获取套餐
        const creditsPaymentContract = new CreditsPaymentContract(web3Instance, networkId || 137);
        const plans = await creditsPaymentContract.getAllPackagesV2();

        if (plans && plans.length > 0) {
          setAvailablePlans(plans);
          setPlansLoaded(true);
        } else {
          // 如果 V2 获取失败，fallback 到旧方式
          const subscriptionContract = new SubscriptionContract(web3Instance, networkId || 137);
          const oldPlans = await subscriptionContract.getAvailablePlans();
          setAvailablePlans(oldPlans);
          setPlansLoaded(true);
        }
       
      } catch (error) {
       
        // 如果合约未部署，使用默认计划
        const fallbackPlans = [
          {
            id: 'BASIC',
            name: 'Basic Plan',
            credits: 100,
            price: 4.99,
            priceWei: '4990000',
            active: true,
            costPerCredit: 0.0499
          },
          {
            id: 'PRO',
            name: 'Pro Plan',
            credits: 500,
            price: 19.99,
            priceWei: '19990000',
            active: true,
            costPerCredit: 0.0400
          },
          {
            id: 'DEV',
            name: 'Dev Plan',
            credits: 1500,
            price: 49.99,
            priceWei: '49990000',
            active: true,
            costPerCredit: 0.0333
          }
        ];
        setAvailablePlans(fallbackPlans);
        setPlansLoaded(true); // 即使是备用计划也标记已加载
       
      } finally {
        setLoadingPlans(false);
      }
    };

    if (showbuyModal && !plansLoaded) {
      fetchPlans();
    }
  }, [showbuyModal, web3, evmAccount, networkId, plansLoaded, availablePlans.length, getWeb3Instance]);

  const buyCredits = async (plan: SubscriptionPlan) => {
    try {
      setIsLoading(true);
      
      // 使用 MultiWalletContext 的状态
      const web3Instance = getWeb3Instance();
      if (!web3Instance || !evmAccount) {
        throw new Error('Please connect your wallet first');
      }

      // 检查网络，如果不是 Polygon，提示用户切换
      if (networkId !== 137) {
        try {
          // 尝试切换到 Polygon 网络
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x89' }], // Polygon Mainnet
          });
          // 等待网络切换完成
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (switchError: any) {
          if (switchError.code === 4902) {
            // 网络不存在，尝试添加
            try {
              await (window as any).ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                  chainId: '0x89',
                  chainName: 'Polygon Mainnet',
                  nativeCurrency: {
                    name: 'MATIC',
                    symbol: 'MATIC',
                    decimals: 18,
                  },
                  rpcUrls: ['https://polygon-rpc.com/'],
                  blockExplorerUrls: ['https://polygonscan.com/'],
                }],
              });
            } catch (addError) {
              throw new Error('Please manually switch to Polygon Mainnet in your wallet');
            }
          } else {
            throw new Error('Please switch to Polygon Mainnet to purchase credits');
          }
        }
      }
      
      const creditsPaymentContract = new CreditsPaymentContract(web3Instance, 137);
      const usdtContract = new USDTContract(web3Instance, 137);

      // 检查用户USDT余额
      try {
        const usdtBalance = await usdtContract.getBalance(evmAccount);
        const requiredAmount = Number(plan.priceWei);

        if (usdtBalance < requiredAmount) {
          const balanceInUSD = (usdtBalance / 1000000).toFixed(2);
          const requiredInUSD = (requiredAmount / 1000000).toFixed(2);
          message.error(`Insufficient USDT balance! You have $${balanceInUSD} USDT, but need $${requiredInUSD} USDT. Please add more USDT first.`);
          return;
        }
      } catch (balanceError) {
        // Silent error handling
      }

      // 计算USDT授权金额（Polygon主网：USDT使用6位精度）
      const approveAmount = plan.priceWei;

      // 1. 授权USDT给 CreditsPaymentV2 合约
      await usdtContract.CreditsPaymentApprove(approveAmount, evmAccount);

      // 2. 使用 V2 方法购买 Credits
      const txHash = await creditsPaymentContract.purchaseCreditsV2(
        plan.id as 'BASIC' | 'PRO' | 'DEV',
        evmAccount
      );

      // 3. 获取套餐详情
      const packageDetails = await creditsPaymentContract.getCreditPackageV2(plan.id as 'BASIC' | 'PRO' | 'DEV');

      // 4. 同步合约Credits到数据库
      await syncUserCreditsWithContract({
        credits: packageDetails?.credits || plan.credits,
        transactionHash: txHash,
        planId: plan.id,
        price: packageDetails?.price || plan.price
      });
      
      // 5. 刷新前端Credits显示
      await refreshCredits();

      // 显示成功消息，包含交易哈希链接
      const polygonscanUrl = `https://polygonscan.com/tx/${txHash}`;
      message.success(
        <div>
          Successfully purchased {plan.name}! You received {packageDetails?.credits || plan.credits} credits.
          <br />
          <a href={polygonscanUrl} target="_blank" rel="noopener noreferrer" style={{color: '#1890ff', textDecoration: 'underline'}}>
            View transaction: {txHash.substring(0, 10)}...{txHash.substring(txHash.length - 8)}
          </a>
        </div>,
        10 // 10秒后自动关闭
      );
      setshowbuyModal(false);
      
    } catch (error: any) {
      // 详细的错误处理
      let errorMessage = 'Purchase failed. Please try again.';
      
      if (error.message.includes('switch')) {
        errorMessage = error.message;
      } else if (error.message.includes('User rejected')) {
        errorMessage = 'Transaction was rejected by user';
      } else if (error.message.includes('insufficient funds')) {
        errorMessage = 'Insufficient MATIC for gas fees. Please add more MATIC to your wallet.';
      } else if (error.message.includes('USDT transfer failed')) {
        errorMessage = 'USDT transfer failed. Please check your USDT balance.';
      } else if (error.message.includes('Internal JSON-RPC error')) {
        errorMessage = 'Network error. Please try again later or check your network connection.';
      } else if (error.message.includes('Plan is not active')) {
        errorMessage = 'This plan is not available. Please select another plan.';
      } else if (error.message.includes('Invalid plan')) {
        errorMessage = 'Invalid plan selected. Please try again.';
      } else if (error.message.includes('execution reverted')) {
        errorMessage = 'Transaction failed. This might be due to insufficient USDT balance or contract issues.';
      } else {
        errorMessage = `Purchase failed: ${error.message}`;
      }
      
      message.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  // 🔧 修复：检查总credit（creditBalance + buyBalance）- totalCredits已在第64行声明
  const hasEnoughCredits = totalCredits > 0;
  const isDisabled = isLoading || !hasEnoughCredits;

  // 快捷命令配置 - 根据钱包类型和选中的Agent
  // 只在agent开启MCP功能时显示
  const quickCommands = (selectedAgent && selectedAgent.mcp_enabled) ? (
    primaryWallet === 'metamask' ? [
      { label: 'Transfer', command: 'transfer 0.1 MATIC to ', icon: '💸' },
      { label: 'Balance', command: 'check my balance', icon: '💰' },
      { label: 'Price', command: 'check MATIC price', icon: '📊' },
      { label: 'Swap', command: 'swap 100 USDC to USDT', icon: '🔄' },
      { label: 'Bridge', command: 'bridge 1 ETH from ethereum to polygon to ', icon: '🌉' },
      { label: 'Query TX', command: 'query transaction ', icon: '🔍' },
    ] : primaryWallet === 'phantom' ? [
      { label: 'Transfer', command: 'transfer 1 SOL to ', icon: '💸' },
      { label: 'Balance', command: 'check my balance', icon: '💰' },
      { label: 'Price', command: 'check SOL price', icon: '📊' },
      { label: 'Swap', command: 'swap 100 USDC to SOL', icon: '🔄' },
      { label: 'Deploy Token', command: 'deploy token MyToken with symbol MTK', icon: '🪙' },
    ] : [
      { label: 'Balance', command: 'check balance', icon: '💰' },
      { label: 'Help', command: 'what can you do?', icon: '❓' },
    ]
  ) : [];

  const handleQuickCommand = (command: string) => {
    setInput(command);
  };

  // 📎 新增：图片压缩函数
  const compressImage = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // 最大宽度 1024px
          const maxWidth = 1024;
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: file.type,
                  lastModified: Date.now()
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            file.type,
            0.8 // 压缩质量 80%
          );
        };
        img.onerror = () => reject(new Error('Image load failed'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsDataURL(file);
    });
  };

  // 📎 新增：文件上传处理
  const handleFileUpload = async (file: File) => {
    try {
      // 1. 文件大小验证
      if (file.size > 5 * 1024 * 1024) {
        message.error('File size cannot exceed 5MB');
        return false;
      }

      // 2. 文件类型验证
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        message.error('Only JPG, PNG, GIF, WebP formats are supported');
        return false;
      }

      // 3. 图片压缩（如果大于 500KB）
      let processedFile = file;
      if (file.type.startsWith('image/') && file.size > 500 * 1024) {
        console.log(`Compressing image: ${(file.size / 1024).toFixed(2)}KB`);
        processedFile = await compressImage(file);
        console.log(`Compressed to: ${(processedFile.size / 1024).toFixed(2)}KB`);
      }

      // 4. 转换为 Base64
      const reader = new FileReader();
      reader.onload = () => {
        setUploadedFiles(prev => [...prev, {
          name: processedFile.name,
          type: processedFile.type.startsWith('image/') ? 'image' : 'file',
          data: reader.result as string,
          size: processedFile.size
        }]);
        message.success(`${processedFile.name} uploaded successfully`);
      };
      reader.onerror = () => {
        message.error('File read failed, please try again');
      };
      reader.readAsDataURL(processedFile);

    } catch (error) {
      console.error('File upload error:', error);
      message.error('File upload failed');
    }

    return false; // 阻止 antd Upload 的默认上传行为
  };

  // 📎 新增：移除文件
  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, idx) => idx !== index));
    message.info('File removed');
  };

  // 📎 新增：包装 handleSendMessage，添加文件支持
  const handleSendWithFiles = () => {
    // 传递 uploadedFiles 给 handleSendMessage
    handleSendMessage(uploadedFiles);
    // 发送后清空文件
    setUploadedFiles([]);
  };

  return (
    <div>
            {/* 快捷命令条 - 在输入框上方 */}
            {quickCommands.length > 0 && !isGameMode && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 15px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '8px 8px 0 0',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                    <span style={{ 
                        color: 'white', 
                        fontWeight: '600',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        ⚡ Quick Actions
                    </span>
                    {quickCommands.map((cmd, idx) => (
                        <button
                            key={idx}
                            onClick={() => handleQuickCommand(cmd.command)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                background: 'rgba(255,255,255,0.15)',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: '20px',
                                color: 'white',
                                cursor: 'pointer',
                                padding: '6px 12px',
                                fontSize: '12px',
                                fontWeight: '500',
                                transition: 'all 0.2s ease',
                                backdropFilter: 'blur(10px)'
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.25)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                                e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
                                e.currentTarget.style.transform = 'translateY(0)';
                                e.currentTarget.style.boxShadow = 'none';
                            }}
                        >
                            <span>{cmd.icon}</span>
                            <span>{cmd.label}</span>
                        </button>
                    ))}
                </div>
            )}
            <div className="input-area">
            {/* 📎 新增：文件预览区 */}
            {uploadedFiles.length > 0 && (
                <div style={{
                    display: 'flex',
                    gap: '8px',
                    padding: '10px',
                    overflowX: 'auto',
                    borderBottom: '1px solid #e8e8e8',
                    backgroundColor: '#fafafa'
                }}>
                    {uploadedFiles.map((file, idx) => (
                        <div key={idx} style={{
                            position: 'relative',
                            display: 'inline-block',
                            flexShrink: 0
                        }}>
                            {file.type === 'image' ? (
                                <img
                                    src={file.data}
                                    alt={file.name}
                                    style={{
                                        width: '80px',
                                        height: '80px',
                                        objectFit: 'cover',
                                        borderRadius: '8px',
                                        border: '2px solid #d9d9d9',
                                        cursor: 'pointer'
                                    }}
                                    onClick={() => {
                                        const newWindow = window.open();
                                        if (newWindow) {
                                            newWindow.document.write(`<img src="${file.data}" style="max-width:100%"/>`);
                                        }
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: '80px',
                                    height: '80px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#f0f0f0',
                                    borderRadius: '8px',
                                    border: '2px solid #d9d9d9',
                                    fontSize: '12px',
                                    textAlign: 'center',
                                    padding: '5px'
                                }}>
                                    <span style={{ fontSize: '24px' }}>📄</span>
                                    <span style={{
                                        fontSize: '10px',
                                        marginTop: '4px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        width: '100%'
                                    }}>
                                        {file.name}
                                    </span>
                                </div>
                            )}
                            <button
                                onClick={() => removeFile(idx)}
                                style={{
                                    position: 'absolute',
                                    top: '-8px',
                                    right: '-8px',
                                    width: '24px',
                                    height: '24px',
                                    borderRadius: '50%',
                                    background: '#ff4d4f',
                                    color: 'white',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                                }}
                            >
                                ×
                            </button>
                            <div style={{
                                position: 'absolute',
                                bottom: '-20px',
                                left: '0',
                                fontSize: '10px',
                                color: '#999'
                            }}>
                                {(file.size / 1024).toFixed(1)}KB
                            </div>
                        </div>
                    ))}
                </div>
            )}
            {showbuy? (
                <div className="buy-Credits" onClick={() => setshowbuyModal(true)}>
                    <div>Purchase credits</div>
                </div>
            ):''}
            <div className="credit-info" onClick={() => setshowbuy(!showbuy)} style={{ position: 'relative' }}>
                Purchased: {credits?.buyBalance || 0}
                <span style={{ margin: '0 6px', color: '#b8dba8' }}>|</span>
                Free: {credits?.creditBalance || 0}
                {showCreditTip && (
                    <span
                        style={{
                            position: 'absolute',
                            top: '-10px',
                            right: '-8px',
                            fontSize: '10px',
                            padding: '2px 5px',
                            background: isLowBalance ? '#FFE4B5' : '#E3F2FD',
                            border: isLowBalance ? '1px solid #FF9800' : '1px solid #90CAF9',
                            borderRadius: '10px',
                            color: isLowBalance ? '#D84315' : '#1976D2',
                            fontWeight: '600',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            zIndex: 10
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            handleCloseCreditTip();
                        }}
                    >
                        {isLowBalance ? '⚠️ Low' : '💡 Buy'} ×
                    </span>
                )}
                <img src={iconup} alt="" />
            </div>

            {/* 📎 新增：输入框区域（使用 ➕ 按钮整合功能） */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                flex: 1
            }}>
                {/* ➕ 按钮 - 向上弹出菜单 */}
                <Dropdown
                    overlay={
                        <Menu
                            style={{
                                minWidth: '200px',
                                borderRadius: '8px',
                                boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                                border: '1px solid #e8e8e8',
                                padding: '4px 0'
                            }}
                        >
                            <Menu.Item
                                key="upload"
                                icon={<span style={{ fontSize: '18px' }}>📎</span>}
                                disabled={isLoading || totalCredits <= 0}
                                style={{
                                    padding: '10px 16px',
                                    fontSize: '14px',
                                    fontWeight: '500',
                                    display: 'flex',
                                    alignItems: 'center',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Upload
                                    accept="image/jpeg,image/png,image/gif,image/webp"
                                    showUploadList={false}
                                    beforeUpload={handleFileUpload}
                                    disabled={isLoading || totalCredits <= 0}
                                >
                                    <span style={{
                                        cursor: 'pointer',
                                        display: 'block',
                                        width: '100%',
                                        marginLeft: '8px'
                                    }}>
                                        Upload Image
                                    </span>
                                </Upload>
                            </Menu.Item>
                        </Menu>
                    }
                    placement="topLeft"
                    trigger={['click']}
                    disabled={isLoading}
                >
                    <button
                        style={{
                            background: 'transparent',
                            border: '1px solid #d9d9d9',
                            borderRadius: '4px',
                            fontSize: '20px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            padding: '4px 8px',
                            opacity: isLoading ? 0.5 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.3s',
                            height: '32px',
                            width: '32px'
                        }}
                        disabled={isLoading}
                        title="More options"
                        onMouseEnter={(e) => {
                            if (!isLoading) {
                                e.currentTarget.style.borderColor = '#40a9ff';
                                e.currentTarget.style.color = '#40a9ff';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#d9d9d9';
                            e.currentTarget.style.color = 'inherit';
                        }}
                    >
                        <PlusOutlined />
                    </button>
                </Dropdown>

                {/* 输入框 */}
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !isLoading &&
                        totalCredits > 0 && handleSendWithFiles()}
                    placeholder={totalCredits > 0 ?
                        inputPlaceholder : "No credits available"}
                    disabled={isLoading || totalCredits <= 0}
                    style={{ flex: 1, marginLeft: '10px', marginRight: '10px' }}
                />

                {/* 发送按钮 */}
                <button
                    className="send-button"
                    onClick={handleSendWithFiles}
                    disabled={isLoading || totalCredits <= 0}
                >
                    {isLoading ? 'Sending...' : 'Send'}
                </button>
            </div>
            <Modal
                title="Choose Your Plan"
                open={showbuyModal}
                onCancel={() => setshowbuyModal(false)}
                footer={null}
                confirmLoading={isLoading}
                className="Purchase-credits-modal contract-deployment-modal"
                width={800}
            >
                <div className="Purchase-table">
                    <div className="table-title">Subscription Plans</div>
                    <div className="table-tab flex">
                        <div className="flex-1">Plan</div>
                        <div className="flex-1">Credits</div>
                        <div className="flex-1">Price</div>
                        <div className="flex-1">Action</div>
                    </div>
                    
                    {loadingPlans ? (
                        <div className="table-content flex">
                            <div className="flex-1" style={{textAlign: 'center', padding: '20px'}}>
                                Loading plans...
                            </div>
                        </div>
                    ) : (
                        availablePlans.map((plan, index) => (
                            <div key={plan.id} className="table-content flex">
                                <div className="type flex-1">
                                    <strong>{plan.name}</strong>
                                </div>
                                <div className="amount flex-1">{plan.credits.toLocaleString()}</div>
                                <div className="price flex-1">${plan.price.toFixed(2)}</div>
                                <div className="flex-1 flex justify-content align-items">
                                    <button 
                                        className="buy-button"
                                        onClick={() => buyCredits(plan)}
                                        disabled={isLoading || !plan.active}
                                    >
                                        {isLoading ? 'Processing...' : 'Purchase'}
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                    
                    <div style={{marginTop: '20px', padding: '15px', backgroundColor: '#f5f5f5', borderRadius: '8px'}}>
                        <h4>Plan Comparison:</h4>
                        <ul style={{margin: 0, paddingLeft: '20px'}}>
                            <li><strong>Basic Plan:</strong> Perfect for trying out our services</li>
                            <li><strong>Pro Plan:</strong> Best value for regular users (20% savings)</li>
                            <li><strong>Dev Plan:</strong> Maximum credits for power users (33% savings)</li>
                        </ul>
                    </div>
                </div>
            </Modal>
            </div>
    </div>
  );
};
