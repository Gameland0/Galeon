// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import './ai_zc.sol';

contract AgentRegistry {

    AgentRegistry_zc az;
    constructor(address aaz)
    {
        az = AgentRegistry_zc(aaz);
    }

    function registerAgent(string memory _name, string memory _description, string memory _agentType, string memory _ipfsHash) public returns (uint256) {
        
        uint256  agentCount =  az.registerAgent(_name, _description, _agentType, _ipfsHash);
        
        return agentCount;
    }

    function betchregisterAgent(string[] memory _name, string[] memory _description, string[] memory _agentType, string[] memory _ipfsHash) public returns (uint256[] memory) {
        uint[] memory agentCounts = new uint[](_name.length);
        for(uint8 i=0;i<_name.length;i++){
            uint256  agentCount =  az.registerAgent(_name[i], _description[i], _agentType[i], _ipfsHash[i]);
            agentCounts[i] = agentCount;
        }
        
        
        return agentCounts;
    }

    function updateAgent(uint256 _id, string memory _name, string memory _description, string memory _agentType) public {
        az.updateAgent(_id,_name, _description, _agentType);
    }

    function toggleAgentPublicity(uint256 _id) public {
        az.toggleAgentPublicity(_id);
    }

    function addTrainingData(uint256 _agentId, string memory _ipfsHash) public {
        az.addTrainingData(_agentId, _ipfsHash);
    }

    function getAgent(uint256 _id) public view returns (AgentRegistry_zc.Agent memory) {
        return az.getAgent(_id);
    }

    function getAgentTrainingData(uint256 _agentId) public view returns (AgentRegistry_zc.TrainingData[] memory) {
        return az.getAgentTrainingData(_agentId);
    }

    function getAgentCount() public view returns (uint256) {
        return az.getAgentCount();
    }
}