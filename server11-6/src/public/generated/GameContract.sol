// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract GameContract {
    mapping(address => uint256) public highScores;

    event PlayerRegistered(address indexed player);
    event HighScoreUpdated(address indexed player, uint256 newScore);

    function registerPlayer() public {
        require(highScores[msg.sender] == 0, "Player already registered.");
        highScores[msg.sender] = 0;
        emit PlayerRegistered(msg.sender);
    }

    function updateHighScore(uint256 newScore) public {
        require(highScores[msg.sender] != 0, "Player not registered.");
        if (newScore > highScores[msg.sender]) {
            highScores[msg.sender] = newScore;
            emit HighScoreUpdated(msg.sender, newScore);
        }
    }

    function getHighScore(address player) public view returns (uint256) {
        return highScores[player];
    }
}
