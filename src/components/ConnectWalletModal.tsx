import React, { useContext, useState, useEffect, useCallback } from 'react';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import '../styles/ConnectWalletModal.css';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnected?: () => void;
}

const ConnectWalletModal: React.FC<ConnectWalletModalProps> = ({ isOpen, onClose, onConnected }) => {
  const { connectMetaMask, connectPhantom, isConnecting } = useContext(MultiWalletContext);
  const [isLoading, setIsLoading] = useState<'metamask' | 'phantom' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (!isLoading && !isConnecting) {
      setError(null);
      onClose();
    }
  }, [isLoading, isConnecting, onClose]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEsc);
      return () => document.removeEventListener('keydown', handleEsc);
    }
  }, [isOpen, handleClose]);

  const handleConnectMetaMask = async () => {
    setIsLoading('metamask');
    setError(null);

    const ethereum = (window as any).ethereum;
    if (!ethereum) {
      setError('No Ethereum wallet found. Please install MetaMask.');
      setIsLoading(null);
      return;
    }

    if (ethereum.isOKX && !ethereum.isMetaMask) {
      setError('OKX wallet detected instead of MetaMask. Please set MetaMask as default wallet.');
      setIsLoading(null);
      return;
    }

    try {
      await connectMetaMask();
      onClose();
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect MetaMask');
    } finally {
      setIsLoading(null);
    }
  };

  const handleConnectPhantom = async () => {
    setIsLoading('phantom');
    setError(null);
    try {
      await connectPhantom();
      onClose();
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Phantom');
    } finally {
      setIsLoading(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="wallet-modal-overlay" onClick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}>
      <div className="wallet-modal">
        <div className="wallet-modal-header">
          <h2>Connect Wallet</h2>
          <button className="wallet-modal-close" onClick={handleClose}>&times;</button>
        </div>
        <div className="wallet-modal-subtitle">Choose your preferred wallet to continue</div>

        {error && <div className="wallet-modal-error">{error}</div>}

        <div className="wallet-modal-body">
          <div
            className={`wallet-modal-option ${isLoading ? 'disabled' : ''}`}
            onClick={!isLoading ? handleConnectMetaMask : undefined}
          >
            <div className="wallet-modal-option-icon metamask">MM</div>
            <div className="wallet-modal-option-info">
              <div className="wallet-modal-option-name">MetaMask</div>
              <div className="wallet-modal-option-desc">Connect for BSC, Base, and Ethereum</div>
            </div>
            {isLoading === 'metamask' ? (
              <div className="wallet-modal-spinner" />
            ) : (
              <div className="wallet-modal-option-arrow">&rarr;</div>
            )}
          </div>

          <div className="wallet-modal-divider"><span>or</span></div>

          <div
            className={`wallet-modal-option ${isLoading ? 'disabled' : ''}`}
            onClick={!isLoading ? handleConnectPhantom : undefined}
          >
            <div className="wallet-modal-option-icon phantom">PH</div>
            <div className="wallet-modal-option-info">
              <div className="wallet-modal-option-name">Phantom</div>
              <div className="wallet-modal-option-desc">Connect for Solana</div>
            </div>
            {isLoading === 'phantom' ? (
              <div className="wallet-modal-spinner" />
            ) : (
              <div className="wallet-modal-option-arrow">&rarr;</div>
            )}
          </div>
        </div>

        <div className="wallet-modal-footer">
          By connecting, you agree to Galeon's Terms of Service.
        </div>
      </div>
    </div>
  );
};

export default ConnectWalletModal;
