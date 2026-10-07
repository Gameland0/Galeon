import { 
  Connection, 
  PublicKey, 
  TransactionInstruction,
  Transaction,
  sendAndConfirmTransaction,
  Keypair,
  SystemProgram
} from '@solana/web3.js';
import * as fs from 'fs';
import * as borsh from 'borsh';

// 直接使用Solana原生指令初始化合约
// 避免Anchor版本冲突问题

const PROGRAM_ID = new PublicKey("DikGFucV4ap2dA8MHPfCcaKdpZzK4Camuqu4A8p779zY");
const USDC_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");
const TREASURY_USDC = new PublicKey("8TcQfQY12sMweH9EkvrrXbcgSeB5KGLTUPA4Jmixpm74");

// 指令数据结构定义
class InitializeSlotSystemArgs {
  slot_price_usdc: bigint;
  default_team_limit: number;

  constructor(args: { slot_price_usdc: bigint; default_team_limit: number }) {
    this.slot_price_usdc = args.slot_price_usdc;
    this.default_team_limit = args.default_team_limit;
  }
}

// Borsh schema for serialization
const INITIALIZE_SLOT_SYSTEM_SCHEMA = new Map([
  [InitializeSlotSystemArgs, {
    kind: 'struct',
    fields: [
      ['slot_price_usdc', 'u64'],
      ['default_team_limit', 'u8'],
    ],
  }],
]);

async function initializeContract() {
  console.log('🚀 开始初始化团队槽位购买合约...');
  
  // 设置连接
  const connection = new Connection("https://api.devnet.solana.com");
  
  // 加载钱包
  const keyPairPath = "/Users/css/.config/solana/deploy-keypair.json";
  const wallet = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keyPairPath, 'utf8')))
  );
  
  console.log('📍 程序ID:', PROGRAM_ID.toString());
  console.log('👛 钱包地址:', wallet.publicKey.toString());
  
  // 生成配置PDA
  const [slotConfig, bump] = await PublicKey.findProgramAddress(
    [Buffer.from("slot_config")],
    PROGRAM_ID
  );
  
  console.log('🔧 配置账户:', slotConfig.toString());
  console.log('🔢 Bump:', bump);
  
  // 检查配置是否已存在
  const existingConfig = await connection.getAccountInfo(slotConfig);
  if (existingConfig) {
    console.log('✅ 合约已经初始化');
    console.log('   - 数据长度:', existingConfig.data.length, 'bytes');
    console.log('   - 余额:', existingConfig.lamports / 1000000000, 'SOL');
    return;
  }
  
  console.log('🔄 配置不存在，开始初始化...');
  
  // 准备指令数据
  const args = new InitializeSlotSystemArgs({
    slot_price_usdc: BigInt(2_000_000), // 2.0 USDC
    default_team_limit: 3
  });
  
  // 序列化指令数据
  const instructionData = Buffer.concat([
    Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]), // initializeSlotSystem指令标识符
    Buffer.from(borsh.serialize(INITIALIZE_SLOT_SYSTEM_SCHEMA, args))
  ]);
  
  // 构造交易指令
  const instruction = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },  // authority
      { pubkey: slotConfig, isSigner: false, isWritable: true },       // slot_config
      { pubkey: TREASURY_USDC, isSigner: false, isWritable: false },   // treasury_usdc
      { pubkey: USDC_MINT, isSigner: false, isWritable: false },       // usdc_mint
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
    ],
    programId: PROGRAM_ID,
    data: instructionData,
  });
  
  // 创建交易
  const transaction = new Transaction().add(instruction);
  
  try {
    console.log('📝 发送初始化交易...');
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet],
      {
        commitment: 'confirmed',
        preflightCommitment: 'processed',
      }
    );
    
    console.log('✅ 初始化成功!');
    console.log('📋 交易签名:', signature);
    console.log('🔗 Solana Explorer:', `https://solscan.io/tx/${signature}?cluster=devnet`);
    
    // 验证初始化结果
    const configAccount = await connection.getAccountInfo(slotConfig);
    if (configAccount) {
      console.log('📊 验证配置账户:');
      console.log('   - 数据长度:', configAccount.data.length, 'bytes');
      console.log('   - 余额:', configAccount.lamports / 1000000000, 'SOL');
      console.log('   - 所有者:', configAccount.owner.toString());
    }
    
  } catch (error) {
    console.error('❌ 初始化失败:', error);
    
    if (error instanceof Error) {
      console.error('错误信息:', error.message);
      
      // 尝试解析Solana程序错误
      if (error.message.includes('custom program error')) {
        const match = error.message.match(/custom program error: (0x[0-9a-fA-F]+)/);
        if (match) {
          const errorCode = parseInt(match[1], 16);
          console.error('程序错误代码:', errorCode);
        }
      }
    }
  }
}

// 主函数
async function main() {
  try {
    await initializeContract();
    console.log('\n🎉 脚本执行完成！');
  } catch (error) {
    console.error('\n💥 脚本执行失败:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { initializeContract };