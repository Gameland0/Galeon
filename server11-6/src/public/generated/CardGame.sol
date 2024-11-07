// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CardGame is ERC721, Ownable {
    uint256 public nextCardId;
    mapping(uint256 => Card) public cards;

    struct Card {
        string name;
        uint8 attack; // Changed to uint8 for gas optimization
        uint8 defense; // Changed to uint8 for gas optimization
    }

    event CardCreated(uint256 cardId, string name, uint8 attack, uint8 defense);
    event CardBurned(uint256 cardId);

    constructor() ERC721("CardGame", "CARD") {}

    /// @notice Creates a new card with specified attributes
    /// @param name The name of the card
    /// @param attack The attack value of the card
    /// @param defense The defense value of the card
    function createCard(string memory name, uint8 attack, uint8 defense) external onlyOwner {
        cards[nextCardId] = Card(name, attack, defense);
        _safeMint(msg.sender, nextCardId);
        emit CardCreated(nextCardId, name, attack, defense);
        nextCardId++;
    }

    /// @notice Retrieves the details of a card
    /// @param cardId The ID of the card to retrieve
    /// @return name The name of the card
    /// @return attack The attack value of the card
    /// @return defense The defense value of the card
    function getCard(uint256 cardId) external view returns (string memory name, uint8 attack, uint8 defense) {
        Card memory card = cards[cardId];
        return (card.name, card.attack, card.defense);
    }

    /// @notice Burns a card, effectively removing it
    /// @param cardId The ID of the card to burn
    function burnCard(uint256 cardId) external onlyOwner {
        require(_exists(cardId), "Card does not exist");
        _burn(cardId);
        delete cards[cardId];
        emit CardBurned(cardId);
    }
}
