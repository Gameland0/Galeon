import Web3 from 'web3';
import { AbiItem } from 'web3-utils';
import { AgentRegistryABI } from '../contracts/AgentRegistryABI';

let web3: Web3 | null = null;
let agentRegistryContract: any = null;

export const initWeb3 = async () => {
  if ((window as any).ethereum) {
    web3 = new Web3((window as any).ethereum);
    try {
      await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
    } catch (error) {
      console.error("User denied account access");
    }
  } else if ((window as any).web3) {
    web3 = new Web3((window as any).web3.currentProvider);
  } else {
    console.log('Non-Ethereum browser detected. You should consider trying MetaMask!');
  }

  if (web3) {
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = AgentRegistryABI.networks[networkId as keyof typeof AgentRegistryABI.networks];
    if (deployedNetwork) {
      agentRegistryContract = new web3.eth.Contract(
        AgentRegistryABI.abi as AbiItem[],
        deployedNetwork.address
      );
    } else {
      console.error('AgentRegistry contract not deployed to detected network.');
    }
  }
};


export const getAccounts = async (): Promise<string[]> => {
  if (!web3) {
    throw new Error("Web3 is not initialized");
  }
  return await web3.eth.getAccounts();
};

// export const getAgentsByOwner = async (ownerAddress: string): Promise<any[]> => {
//   if (!agentRegistryContract) {
//     throw new Error("AgentRegistry contract is not initialized");
//   }
//   return await agentRegistryContract.methods.getAgentsByOwner(ownerAddress).call();
// };


export const getAgentsByOwner = async (ownerAddress: string): Promise<number[]> => {
  if (!agentRegistryContract) {
    throw new Error("AgentRegistry contract is not initialized");
  }
  try {
    const agentIds = await agentRegistryContract.methods.getAgentsByOwner(ownerAddress).call();
    return agentIds.map((id: string) => parseInt(id));
  } catch (error) {
    console.error("Error getting agents by owner", error);
    throw error;
  }
};


export const getAgent = async (agentId: number): Promise<any> => {
  if (!agentRegistryContract) {
    throw new Error("AgentRegistry contract is not initialized");
  }
  try {
    const agent = await agentRegistryContract.methods.getAgent(agentId).call();
    return {
      id: agentId,
      name: agent.name,
      description: agent.description,
      owner: agent.owner
    };
  } catch (error) {
    console.error("Error getting agent", error);
    throw error;
  }
};


// export const createAgent = async (name: string, description: string, ownerAddress: string): Promise<any> => {
//   if (!agentRegistryContract) {
//     throw new Error("AgentRegistry contract is not initialized");
//   }
//   return await agentRegistryContract.methods.createAgent(name, description).send({ from: ownerAddress });
// };
export const createAgent = async (name: string, description: string): Promise<number> => {
  if (!agentRegistryContract || !web3) {
    throw new Error("AgentRegistry contract or Web3 is not initialized");
  }
  try {
    const accounts = await web3.eth.getAccounts();
    const result = await agentRegistryContract.methods.createAgent(name, description)
      .send({ from: accounts[0] });
    return parseInt(result.events.AgentCreated.returnValues.agentId);
  } catch (error) {
    console.error("Error creating agent", error);
    throw error;
  }
};


export const connectWallet = async () => {
  if (!web3) {
    throw new Error("Web3 is not initialized");
  }
  try {
    await (window as any).ethereum.request({ method: 'eth_requestAccounts' });
    return getWalletInfo();
  } catch (error) {
    console.error("User denied account access");
    throw error;
  }
};

export const getWalletInfo = async () => {
  if (!web3) {
    return null;
  }
  try {
    const accounts = await getAccounts();
    if (accounts.length === 0) {
      return null;
    }
    const address = accounts[0];
    const chainId = await web3.eth.getChainId();
    return { address, chainId };
  } catch (error) {
    console.error("Error getting wallet info", error);
    return null;
  }
};
