// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AgentRegistry_zc {
    struct Agent {
        uint256 id;
        address owner;
        string name;
        string description;
        string agentType;
        string ipfsHash;
        bool isPublic;
    }

    struct TrainingData {
        string ipfsHash;
        uint256 timestamp;
    }
    address governance;
    modifier onlyGove() {
        require(msg.sender == governance, "Not governance");
        _;
    }
    function setgove(address _gove) public {
        require(msg.sender == owner, 'not is owner!');
        governance = _gove;
    }
    mapping(uint256 => Agent) public agents;
    mapping(uint256 => TrainingData[]) public agentTrainingData;
    uint256 public agentCount;

    event AgentRegistered(uint256 indexed id, address indexed owner, string name);
    event AgentUpdated(uint256 indexed id, string name, string description, string agentType);
    event AgentPublicityToggled(uint256 indexed id, bool isPublic);
    event TrainingDataAdded(uint256 indexed agentId, string ipfsHash, uint256 timestamp);

    address owner;
    constructor(
        )
    {
        owner = msg.sender;
    }

    function registerAgent(string memory _name, string memory _description, string memory _agentType, string memory _ipfsHash) public onlyGove returns (uint256) {
        agentCount++;
        agents[agentCount] = Agent(agentCount, msg.sender, _name, _description, _agentType, _ipfsHash, true);
        emit AgentRegistered(agentCount, msg.sender, _name);
        return agentCount;
    }

    function updateAgent(uint256 _id, string memory _name, string memory _description, string memory _agentType) public onlyGove{
        require(agents[_id].owner == msg.sender, "Only the owner can update the agent");
        agents[_id].name = _name;
        agents[_id].description = _description;
        agents[_id].agentType = _agentType;
        emit AgentUpdated(_id, _name, _description, _agentType);
    }

    function toggleAgentPublicity(uint256 _id) public onlyGove{
        require(agents[_id].owner == msg.sender, "Only the owner can toggle agent publicity");
        agents[_id].isPublic = !agents[_id].isPublic;
        emit AgentPublicityToggled(_id, agents[_id].isPublic);
    }

    function addTrainingData(uint256 _agentId, string memory _ipfsHash) public onlyGove{
        require(agents[_agentId].owner == msg.sender, "Only the owner can add training data");
        TrainingData memory newTrainingData = TrainingData(_ipfsHash, block.timestamp);
        agentTrainingData[_agentId].push(newTrainingData);
        emit TrainingDataAdded(_agentId, _ipfsHash, block.timestamp);
    }

    function getAgent(uint256 _id) public view returns (Agent memory) {
        return agents[_id];
    }

    function getAgentTrainingData(uint256 _agentId) public view returns (TrainingData[] memory) {
        return agentTrainingData[_agentId];
    }

    function getAgentCount() public view returns (uint256) {
        return agentCount;
    }
}