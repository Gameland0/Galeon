import { MCPCallResponse } from '../types/mcp';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SolanaAgentKit } from 'solana-agent-kit';

export class SolanaMCPAdapter {
  private connection: Connection;
  private rpcUrl: string;

  constructor(rpcUrl: string = 'https://api.mainnet-beta.solana.com') {
    this.rpcUrl = rpcUrl;
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  // Read-only operations - can be executed directly
  async getBalance(address: string): Promise<MCPCallResponse> {
    try {
      console.log(`Getting balance for ${address} on ${this.rpcUrl}`);
      
      // Real Solana RPC call
      const publicKey = new PublicKey(address);
      const balanceLamports = await this.connection.getBalance(publicKey);
      const balanceSOL = balanceLamports / LAMPORTS_PER_SOL;
      
      return {
        success: true,
        data: {
          balance: balanceSOL.toFixed(6),
          balanceLamports: balanceLamports,
          currency: 'SOL',
          address: address,
          rpcUrl: this.rpcUrl
        }
      };
    } catch (error) {
      console.error('Error getting balance:', error);
      return {
        success: false,
        error: `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getPrice(tokenMint: string): Promise<MCPCallResponse> {
    try {
      console.log(`Getting price for token ${tokenMint}`);
      
      // Use CoinGecko API for price (free tier)
      let apiUrl = '';
      if (tokenMint.toLowerCase() === 'sol' || tokenMint === 'So11111111111111111111111111111111111111112') {
        apiUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd';
      } else {
        // For other tokens, try to get price by contract address
        apiUrl = `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${tokenMint}&vs_currencies=usd`;
      }
      
      const response = await fetch(apiUrl);
      const data = await response.json();
      
      let price = 0;
      if (tokenMint.toLowerCase() === 'sol' || tokenMint === 'So11111111111111111111111111111111111111112') {
        price = data.solana?.usd || 0;
      } else {
        price = data[tokenMint]?.usd || 0;
      }
      
      return {
        success: true,
        data: {
          price: price.toString(),
          currency: 'USD',
          tokenMint: tokenMint,
          timestamp: new Date().toISOString(),
          source: 'CoinGecko'
        }
      };
    } catch (error) {
      console.error('Error getting price:', error);
      return {
        success: false,
        error: `Failed to get price: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getAssetInfo(assetId: string): Promise<MCPCallResponse> {
    try {
      console.log(`Getting asset info for ${assetId}`);
      
      // Try to get token account info
      const publicKey = new PublicKey(assetId);
      const accountInfo = await this.connection.getAccountInfo(publicKey);
      
      if (!accountInfo) {
        return {
          success: false,
          error: 'Asset not found'
        };
      }
      
      // For SPL tokens, try to get metadata
      // This is a simplified version - in production you'd use Metaplex SDK
      return {
        success: true,
        data: {
          assetId: assetId,
          accountInfo: {
            owner: accountInfo.owner.toBase58(),
            lamports: accountInfo.lamports,
            executable: accountInfo.executable,
            rentEpoch: accountInfo.rentEpoch
          },
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error getting asset info:', error);
      return {
        success: false,
        error: `Failed to get asset info: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async getTPS(): Promise<MCPCallResponse> {
    try {
      // Get recent performance samples
      const samples = await this.connection.getRecentPerformanceSamples(1);
      
      if (samples.length === 0) {
        return {
          success: false,
          error: 'No performance data available'
        };
      }
      
      const sample = samples[0];
      const tps = sample.numTransactions / sample.samplePeriodSecs;
      
      return {
        success: true,
        data: {
          tps: Math.round(tps),
          numTransactions: sample.numTransactions,
          samplePeriodSecs: sample.samplePeriodSecs,
          slot: sample.slot,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error getting TPS:', error);
      return {
        success: false,
        error: `Failed to get TPS: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Write operations - return unsigned transactions for user to sign
  async buildTransfer(from: string, to: string, amount: number): Promise<MCPCallResponse> {
    try {
      console.log(`Building transfer: ${amount} SOL from ${from} to ${to}`);
      
      // Build real Solana transfer transaction
      const fromPubkey = new PublicKey(from);
      const toPubkey = new PublicKey(to);
      const lamports = amount * LAMPORTS_PER_SOL;
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      
      // Import SystemProgram from @solana/web3.js
      const { SystemProgram, Transaction } = await import('@solana/web3.js');
      
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: fromPubkey
      });
      
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: fromPubkey,
          toPubkey: toPubkey,
          lamports: lamports
        })
      );
      
      // Estimate fee
      const fee = await this.connection.getFeeForMessage(
        transaction.compileMessage()
      );
      
      return {
        success: true,
        requiresSignature: true,
        transaction: {
          type: 'transfer',
          from: from,
          to: to,
          amount: amount,
          amountLamports: lamports,
          estimatedFee: fee.value ? fee.value / LAMPORTS_PER_SOL : 0.000005,
          serializedTransaction: transaction.serialize({ requireAllSignatures: false }).toString('base64'),
          blockhash: blockhash
        },
        data: {
          message: `Transfer of ${amount} SOL prepared`,
          estimatedFee: `${fee.value ? (fee.value / LAMPORTS_PER_SOL).toFixed(6) : '0.000005'} SOL`
        }
      };
    } catch (error) {
      console.error('Error building transfer:', error);
      return {
        success: false,
        error: `Failed to build transfer transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async buildTokenDeploy(tokenParams: any): Promise<MCPCallResponse> {
    try {
      console.log('Building token deployment:', tokenParams);
      
      // Token deployment is complex and requires SPL Token program
      // For now, return a structured response indicating capability
      return {
        success: true,
        requiresSignature: true,
        transaction: {
          type: 'deploy_token',
          name: tokenParams.name,
          symbol: tokenParams.symbol,
          decimals: tokenParams.decimals || 9,
          supply: tokenParams.supply,
          estimatedFee: 0.002,
          note: 'Token deployment requires SPL Token program integration'
        },
        data: {
          message: `Token deployment structured: ${tokenParams.name} (${tokenParams.symbol})`,
          estimatedFee: '0.002 SOL',
          status: 'requires_advanced_implementation'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to build token deployment: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  async buildNFTMint(nftParams: any): Promise<MCPCallResponse> {
    try {
      console.log('Building NFT mint:', nftParams);
      
      // NFT minting is complex and requires Metaplex programs
      return {
        success: true,
        requiresSignature: true,
        transaction: {
          type: 'mint_nft',
          name: nftParams.name,
          description: nftParams.description,
          imageUrl: nftParams.imageUrl,
          estimatedFee: 0.01,
          note: 'NFT minting requires Metaplex program integration'
        },
        data: {
          message: `NFT mint structured: ${nftParams.name}`,
          estimatedFee: '0.01 SOL',
          status: 'requires_advanced_implementation'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to build NFT mint: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default new SolanaMCPAdapter();