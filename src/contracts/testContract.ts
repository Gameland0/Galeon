import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { SolanaTeamSlotPurchaseClient } from './SolanaTeamSlotPurchaseClient';

// 简单的测试脚本来验证合约功能
async function testContract() {
  console.log('🧪 开始测试Solana团队槽位购买合约...');
  
  // 连接到Devnet
  const connection = new Connection("https://api.devnet.solana.com");
  
  // 模拟钱包状态
  const mockWallet = {
    publicKey: null,
    connected: false,
    signTransaction: async () => null,
    signAllTransactions: async () => [],
  };
  
  // 创建客户端实例
  const client = new SolanaTeamSlotPurchaseClient(connection, mockWallet as any);
  
  console.log('📍 合约地址:', SolanaTeamSlotPurchaseClient.PROGRAM_ID);
  console.log('💰 USDC Mint:', SolanaTeamSlotPurchaseClient.USDC_MINT_DEVNET);
  console.log('🏦 Treasury:', SolanaTeamSlotPurchaseClient.TREASURY_WALLET);
  
  // 获取配置PDA
  try {
    const [configPDA] = await client.getSlotConfigPDA();
    console.log('🔧 配置PDA地址:', configPDA.toString());
    
    // 检查配置账户是否存在
    const configAccount = await connection.getAccountInfo(configPDA);
    if (configAccount) {
      console.log('✅ 配置账户存在');
      console.log('   - 数据长度:', configAccount.data.length, 'bytes');
      console.log('   - 所有者:', configAccount.owner.toString());
      console.log('   - 余额:', configAccount.lamports / 1000000000, 'SOL');
    } else {
      console.log('❌ 配置账户不存在 - 需要初始化');
    }
    
    // 检查程序账户
    const programId = new PublicKey(SolanaTeamSlotPurchaseClient.PROGRAM_ID);
    const programAccount = await connection.getAccountInfo(programId);
    if (programAccount) {
      console.log('✅ 程序账户存在');
      console.log('   - 可执行:', programAccount.executable);
      console.log('   - 数据长度:', programAccount.data.length, 'bytes');
      console.log('   - 所有者:', programAccount.owner.toString());
    } else {
      console.log('❌ 程序账户不存在');
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
  
  console.log('\n🎉 合约测试完成！');
}

// 如果直接运行此脚本
if (require.main === module) {
  testContract().catch(console.error);
}

export { testContract };