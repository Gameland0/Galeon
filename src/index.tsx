import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { MultiWalletProvider } from './contexts/MultiWalletContext';
import reportWebVitals from './reportWebVitals';
import { Buffer } from 'buffer';

// Polyfill Buffer for Privy Session Signers
window.Buffer = Buffer;

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <>
    <MultiWalletProvider>
      <App />
    </MultiWalletProvider>
  </>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();

// Suppress Web3 block timeout unhandled promise rejections globally
window.addEventListener('unhandledrejection', event => {
  const reason = (event.reason as any);
  if (reason && typeof reason.message === 'string' && reason.message.includes('not mined within')) {
    console.warn('Suppressed block timeout error in App:', reason.message);
    event.preventDefault();
  }
});

