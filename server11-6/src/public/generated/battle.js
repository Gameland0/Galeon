const { ethers } = require("ethers");
require('dotenv').config(); // To load environment variables

// Initialize provider and signer securely
const provider = new ethers.providers.JsonRpcProvider(process.env.INFURA_URL);
const signer = provider.getSigner();

const cardGameAddress = process.env.CONTRACT_ADDRESS; // Use environment variables
const cardGameABI = [
    "function getCard(uint256 cardId) view returns (string, uint8, uint8)"
];

const cardGameContract = new ethers.Contract(cardGameAddress, cardGameABI, signer);

async function battle(cardId1, cardId2) {
    try {
        const card1 = await cardGameContract.getCard(cardId1);
        const card2 = await cardGameContract.getCard(cardId2);

        console.log(`Battle between ${card1[0]} and ${card2[0]}`);
        const card1Power = card1[1] + card1[2];
        const card2Power = card2[1] + card2[2];

        if (card1Power > card2Power) {
            console.log(`${card1[0]} wins!`);
        } else if (card2Power > card1Power) {
            console.log(`${card2[0]} wins!`);
        } else {
            console.log("It's a draw!");
        }
    } catch (error) {
        console.error("An error occurred during the battle:", error);
    }
}

// Example usage
battle(0, 1);
