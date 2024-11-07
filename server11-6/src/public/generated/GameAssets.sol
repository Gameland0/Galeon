// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract GameAssets is Ownable, ReentrancyGuard {
    // Define a structure for game assets
    struct Asset {
        uint256 id;
        address owner;
        string name;
        uint256 level;
    }

    // Mapping from asset ID to Asset
    mapping(uint256 => Asset) public assets;

    // Event to log asset creation
    event AssetCreated(uint256 indexed assetId, address indexed owner, string name);
    // Event to log asset transfers
    event AssetTransferred(uint256 indexed assetId, address indexed previousOwner, address indexed newOwner);

    // Counter for asset IDs
    uint256 private assetCounter;

    // Function to create a new asset
    function createAsset(string memory _name) external nonReentrant {
        assetCounter++;
        assets[assetCounter] = Asset(assetCounter, msg.sender, _name, 1);
        emit AssetCreated(assetCounter, msg.sender, _name);
    }

    // Function to transfer asset ownership
    function transferAsset(uint256 _assetId, address _newOwner) external nonReentrant {
        require(assets[_assetId].owner == msg.sender, "Not the asset owner");
        require(_newOwner != address(0), "Invalid new owner address");
        
        address previousOwner = assets[_assetId].owner;
        assets[_assetId].owner = _newOwner;
        emit AssetTransferred(_assetId, previousOwner, _newOwner);
    }

    // Function to get asset details
    function getAsset(uint256 _assetId) external view returns (Asset memory) {
        return assets[_assetId];
    }
}
