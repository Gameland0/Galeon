module.exports = {
    "SimpleStorage": {
      abi: [
        {
          "inputs": [{"name": "initialValue", "type": "uint256"}],
          "stateMutability": "nonpayable",
          "type": "constructor"
        },
        {
          "inputs": [],
          "name": "get",
          "outputs": [{"name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        },
        {
          "inputs": [{"name": "newValue", "type": "uint256"}],
          "name": "set",
          "outputs": [],
          "stateMutability": "nonpayable",
          "type": "function"
        }
      ],
      bytecode: "0x608060405234801561001057600080fd5b5060405161015d38038061015d8339818101604052602081101561003357600080fd5b8101908080519060200190929190505050806000819055505060f18061005a6000396000f3fe6080604052348015600f57600080fd5b506004361060325760003560e01c806360fe47b11460375780636d4ce63c146062575b600080fd5b606060048036036020811015604b57600080fd5b8101908080359060200190929190505050607e565b005b606860c1565b6040518082815260200191505060405180910390f35b806000819055507f93fe6d397c74fdf1402a8b72e47b68512f0510d7b98a4bc4cbdf6ac7108b3c59816040518082815260200191505060405180910390a150565b6000805490509056fea26469706673582212206a9bc96091f8b366dd89b53f11a26d4e68d06b5edec85c8399b6aa1df30f39cf64736f6c63430007060033"
    },
    "Token": {
      abi: [
        {
          "inputs": [{"name": "initialSupply", "type": "uint256"}],
          "stateMutability": "nonpayable",
          "type": "constructor"
        },
        {
          "anonymous": false,
          "inputs": [
            {"indexed": true, "name": "from", "type": "address"},
            {"indexed": true, "name": "to", "type": "address"},
            {"indexed": false, "name": "value", "type": "uint256"}
          ],
          "name": "Transfer",
          "type": "event"
        },
        {
          "inputs": [{"name": "recipient", "type": "address"}, {"name": "amount", "type": "uint256"}],
          "name": "transfer",
          "outputs": [{"name": "", "type": "bool"}],
          "stateMutability": "nonpayable",
          "type": "function"
        },
        {
          "inputs": [{"name": "account", "type": "address"}],
          "name": "balanceOf",
          "outputs": [{"name": "", "type": "uint256"}],
          "stateMutability": "view",
          "type": "function"
        }
      ],
      bytecode: "0x60806040523480156100115760006000fd5b506040516105e43803806105e48339818101604052602081101561003557600080fd5b81019080805190602001909291905050505b80600160003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff1681526020019081526020016000208190555080600081905550505b5061054e806100a36000396000f3fe608060405234801561001057600080fd5b50600436106100365760003560e01c806370a082311461003b578063a9059cbb1461009f575b600080fd5b61008660048036036020811015610051576000801b90818101604052602002919050505061010f565b6040518084815260200183151515158152602001828152602001935050505060405180910390f35b6100fa60048036036040811015610057576000801b9081810160405260200291905050506003801b60209150808035906000000000000000000000000000000000000000000000000000000008169050615029565b60405180915060405180910390f35b600160205260008201602001516000825292915050565b60008060008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002054905060008060003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020548211156101a6576000600090506101f1565b826000808473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060008282540392505081905550826000808373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001908152602001600020600082825401925050819055505b80915050925050509190505600a165627a7a72305820a0e1c97f5f49a1d89eafcab60fe7c62d46d48b2de471f8b2d1b1c0bd2bf5a0fb0029"
    }
  };
  