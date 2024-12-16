const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider } = require('@project-serum/anchor');
const NodeCache = require('node-cache');

class SolanaValidatorService {
  constructor() {
    this.cache = new NodeCache({ stdTTL: 3600 }); // 1小时缓存
    this.connection = new Connection(process.env.SOLANA_RPC_URL || 'http://localhost:8899');
  }

  async validateProgram(programCode, programId) {
    try {
      // 检查程序代码是否符合 Solana 规范
      const validationResults = {
        syntaxErrors: [],
        securityIssues: [],
        optimizationSuggestions: []
      };

      // 语法检查
      if (!this.checkSyntax(programCode)) {
        validationResults.syntaxErrors.push('Invalid Rust syntax');
      }

      // 安全检查
      const securityIssues = this.checkSecurity(programCode);
      validationResults.securityIssues.push(...securityIssues);

      // 性能优化建议
      const optimizations = this.checkOptimizations(programCode);
      validationResults.optimizationSuggestions.push(...optimizations);

      // 缓存结果
      const cacheKey = `validation_${programId}`;
      this.cache.set(cacheKey, validationResults);

      return validationResults;
    } catch (error) {
      console.error('Error validating Solana program:', error);
      throw new Error('Program validation failed: ' + error.message);
    }
  }

  checkSyntax(programCode) {
    // 基本语法检查
    const requiredPatterns = [
      /use solana_program::/,
      /pub struct/,
      /impl/,
      /pub fn/
    ];

    return requiredPatterns.every(pattern => pattern.test(programCode));
  }

  checkSecurity(programCode) {
    const issues = [];

    // 检查常见安全问题
    if (programCode.includes('unsafe')) {
      issues.push('Use of unsafe code blocks detected');
    }

    // 检查权限控制
    if (!programCode.includes('Signer')) {
      issues.push('Missing signer checks');
    }

    // 检查溢出保护
    if (!programCode.includes('checked_add') && !programCode.includes('checked_sub')) {
      issues.push('Missing overflow protection');
    }

    return issues;
  }

  checkOptimizations(programCode) {
    const suggestions = [];

    // 检查是否使用了过多的计算
    if (programCode.includes('loop') || programCode.includes('while')) {
      suggestions.push('Consider limiting loops to reduce compute units');
    }

    // 检查账户数据大小
    if (programCode.includes('account_info') && !programCode.includes('ACCOUNT_SIZE')) {
      suggestions.push('Consider defining fixed account sizes');
    }

    return suggestions;
  }

  async simulateTransaction(programId, instruction) {
    try {
      const simulation = await this.connection.simulateTransaction(instruction);
      return {
        success: simulation.value.err === null,
        logs: simulation.value.logs,
        units: simulation.value.unitsConsumed
      };
    } catch (error) {
      console.error('Error simulating transaction:', error);
      throw error;
    }
  }

  async estimateRequiredBalance(programSize) {
    try {
      const rentExemption = await this.connection.getMinimumBalanceForRentExemption(programSize);
      return rentExemption;
    } catch (error) {
      console.error('Error estimating required balance:', error);
      throw error;
    }
  }
}

module.exports = new SolanaValidatorService();
