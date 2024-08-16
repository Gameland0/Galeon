export const AgentRegistryABI = {
  abi: [
    {
      "inputs": [],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "agentId",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "owner",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "name",
          "type": "string"
        }
      ],
      "name": "AgentCreated",
      "type": "event"
    },
    {
      "inputs": [
        {
          "internalType": "string",
          "name": "name",
          "type": "string"
        },
        {
          "internalType": "string",
          "name": "description",
          "type": "string"
        }
      ],
      "name": "createAgent",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "agentId",
          "type": "uint256"
        }
      ],
      "name": "getAgent",
      "outputs": [
        {
          "components": [
            {
              "internalType": "string",
              "name": "name",
              "type": "string"
            },
            {
              "internalType": "string",
              "name": "description",
              "type": "string"
            },
            {
              "internalType": "address",
              "name": "owner",
              "type": "address"
            }
          ],
          "internalType": "struct AgentRegistry.Agent",
          "name": "",
          "type": "tuple"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "owner",
          "type": "address"
        }
      ],
      "name": "getAgentsByOwner",
      "outputs": [
        {
          "internalType": "uint256[]",
          "name": "",
          "type": "uint256[]"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "totalAgents",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
  ],
  networks: {
    1: {
      address: "0x1234567890123456789012345678901234567890" // 以太坊主网地址（示例）
    },
    3: {
      address: "0x9876543210987654321098765432109876543210" // Ropsten 测试网地址（示例）
    },
    4: {
      address: "0xaabbccddeeaabbccddeeaabbccddeeaabbccddee" // Rinkeby 测试网地址（示例）
    },
    5: {
      address: "0x1122334455112233445511223344551122334455" // Goerli 测试网地址（示例）
    },
    42: {
      address: "0x6677889900667788990066778899006677889900" // Kovan 测试网地址（示例）
    },
    56: {
      address: "0xffaabbccddffaabbccddffaabbccddffaabbccdd" // Binance Smart Chain 主网地址（示例）
    },
    97: {
      address: "0x85347aD2EF4A138a6D023b443EDEeC384cB91393" // Binance Smart Chain 测试网地址（示例）
    }
  }
};