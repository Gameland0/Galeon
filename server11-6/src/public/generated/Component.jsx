import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import GameContractABI from './GameContractABI.json'; // ABI JSON file

const GameApp = () => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [highScore, setHighScore] = useState(0);
  const [loading, setLoading] = useState(false);

  const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS;

  useEffect(() => {
    const init = async () => {
      if (window.ethereum) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        setProvider(provider);

        const signer = provider.getSigner();
        setSigner(signer);

        const contract = new ethers.Contract(contractAddress, GameContractABI, signer);
        setContract(contract);
      }
    };
    init();
  }, [contractAddress]);

  const registerPlayer = async () => {
    try {
      if (contract) {
        setLoading(true);
        await contract.registerPlayer();
        alert("Player registered successfully!");
      }
    } catch (error) {
      console.error("Error registering player:", error);
      alert("Failed to register player. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateHighScore = async (newScore) => {
    try {
      if (contract) {
        setLoading(true);
        await contract.updateHighScore(newScore);
        alert("High score updated successfully!");
      }
    } catch (error) {
      console.error("Error updating high score:", error);
      alert("Failed to update high score. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fetchHighScore = async () => {
    try {
      if (contract) {
        setLoading(true);
        const score = await contract.getHighScore(await signer.getAddress());
        setHighScore(score.toNumber());
      }
    } catch (error) {
      console.error("Error fetching high score:", error);
      alert("Failed to fetch high score. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Semi On-Chain Game</h1>
      <button onClick={registerPlayer} disabled={loading}>Register Player</button>
      <button onClick={() => updateHighScore(100)} disabled={loading}>Update High Score</button>
      <button onClick={fetchHighScore} disabled={loading}>Fetch High Score</button>
      {loading && <p>Loading...</p>}
      <p>Your High Score: {highScore}</p>
    </div>
  );
};

export default GameApp;
