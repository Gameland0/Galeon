// IDL validation utility
import { Program, AnchorProvider, web3 } from '@project-serum/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { 
  SolanaAgentRegistryIDL, 
  SolanaTeamRegistryIDL, 
  SolanaTeamSlotPurchaseIDL,
  CONTRACT_ADDRESSES 
} from '../idl';

/**
 * Validates that the IDL files are correctly formatted and can be used with Anchor
 */
export class IdlValidator {
  private connection: Connection;
  
  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * Validates Agent Registry IDL
   */
  async validateAgentRegistryIdl(): Promise<boolean> {
    try {
      // Check if the IDL has required structure
      const idl = SolanaAgentRegistryIDL as any;
      
      // Validate basic structure
      if (!idl.version || !idl.name || !idl.instructions || !idl.accounts) {
        console.error('Agent Registry IDL missing required fields');
        return false;
      }

      // Validate program ID format
      const programId = new PublicKey(CONTRACT_ADDRESSES.AGENT_REGISTRY);
      console.log('Agent Registry Program ID:', programId.toBase58());

      // Check if key instructions exist
      const requiredInstructions = [
        'initializeRegistry', 
        'registerAgent', 
        'updateAgent', 
        'toggleAgentPublicity',
        'addTrainingData'
      ];
      
      const instructionNames = idl.instructions.map((ix: any) => ix.name);
      const missingInstructions = requiredInstructions.filter(
        name => !instructionNames.includes(name)
      );
      
      if (missingInstructions.length > 0) {
        console.error('Missing instructions:', missingInstructions);
        return false;
      }

      console.log('✓ Agent Registry IDL validation passed');
      return true;
    } catch (error) {
      console.error('Agent Registry IDL validation failed:', error);
      return false;
    }
  }

  /**
   * Validates Team Registry IDL
   */
  async validateTeamRegistryIdl(): Promise<boolean> {
    try {
      const idl = SolanaTeamRegistryIDL as any;
      
      // Validate basic structure
      if (!idl.version || !idl.name || !idl.instructions || !idl.accounts) {
        console.error('Team Registry IDL missing required fields');
        return false;
      }

      // Validate program ID format
      const programId = new PublicKey(CONTRACT_ADDRESSES.TEAM_REGISTRY);
      console.log('Team Registry Program ID:', programId.toBase58());

      // Check if key instructions exist
      const requiredInstructions = [
        'initializeTeamRegistry',
        'registerTeam',
        'updateTeam',
        'addAgentToTeam',
        'removeAgentFromTeam',
        'toggleTeamStatus'
      ];
      
      const instructionNames = idl.instructions.map((ix: any) => ix.name);
      const missingInstructions = requiredInstructions.filter(
        name => !instructionNames.includes(name)
      );
      
      if (missingInstructions.length > 0) {
        console.error('Missing instructions:', missingInstructions);
        return false;
      }

      console.log('✓ Team Registry IDL validation passed');
      return true;
    } catch (error) {
      console.error('Team Registry IDL validation failed:', error);
      return false;
    }
  }

  /**
   * Validates Slot Purchase IDL
   */
  async validateSlotPurchaseIdl(): Promise<boolean> {
    try {
      const idl = SolanaTeamSlotPurchaseIDL as any;
      
      // Validate basic structure
      if (!idl.version || !idl.name || !idl.instructions || !idl.accounts) {
        console.error('Slot Purchase IDL missing required fields');
        return false;
      }

      // Validate program ID format
      const programId = new PublicKey(CONTRACT_ADDRESSES.SLOT_PURCHASE);
      console.log('Slot Purchase Program ID:', programId.toBase58());

      // Check if key instructions exist
      const requiredInstructions = [
        'initializeSlotSystem',
        'initializeUserLimit',
        'buyTeamSlotSol',
        'buyTeamSlotUsdc',
        'buyTeamSlotsBatch',
        'incrementTeamCount',
        'decrementTeamCount'
      ];
      
      const instructionNames = idl.instructions.map((ix: any) => ix.name);
      const missingInstructions = requiredInstructions.filter(
        name => !instructionNames.includes(name)
      );
      
      if (missingInstructions.length > 0) {
        console.error('Missing instructions:', missingInstructions);
        return false;
      }

      console.log('✓ Slot Purchase IDL validation passed');
      return true;
    } catch (error) {
      console.error('Slot Purchase IDL validation failed:', error);
      return false;
    }
  }

  /**
   * Validates all IDL files
   */
  async validateAllIdls(): Promise<boolean> {
    console.log('Starting IDL validation...');
    
    const results = await Promise.all([
      this.validateAgentRegistryIdl(),
      this.validateTeamRegistryIdl(),
      this.validateSlotPurchaseIdl()
    ]);

    const allValid = results.every(result => result === true);
    
    if (allValid) {
      console.log('✅ All IDL files are valid and ready to use');
    } else {
      console.log('❌ Some IDL files have validation errors');
    }

    return allValid;
  }

  /**
   * Test connection to deployed contracts
   */
  async testContractConnections(): Promise<void> {
    console.log('Testing contract connections...');

    const contracts = [
      { name: 'Agent Registry', address: CONTRACT_ADDRESSES.AGENT_REGISTRY },
      { name: 'Team Registry', address: CONTRACT_ADDRESSES.TEAM_REGISTRY },
      { name: 'Slot Purchase', address: CONTRACT_ADDRESSES.SLOT_PURCHASE }
    ];

    for (const contract of contracts) {
      try {
        const programId = new PublicKey(contract.address);
        const accountInfo = await this.connection.getAccountInfo(programId);
        
        if (accountInfo) {
          console.log(`✓ ${contract.name} contract found at ${contract.address}`);
          console.log(`  - Owner: ${accountInfo.owner.toBase58()}`);
          console.log(`  - Executable: ${accountInfo.executable}`);
          console.log(`  - Data length: ${accountInfo.data.length} bytes`);
        } else {
          console.log(`❌ ${contract.name} contract not found at ${contract.address}`);
        }
      } catch (error) {
        console.error(`Error checking ${contract.name}:`, error.message);
      }
    }
  }
}

// Export validation function for easy use
export async function validateSolanaIdls(connection: Connection): Promise<boolean> {
  const validator = new IdlValidator(connection);
  const isValid = await validator.validateAllIdls();
  await validator.testContractConnections();
  return isValid;
}