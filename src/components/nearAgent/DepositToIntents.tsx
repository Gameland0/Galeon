/**
 * Step 4: Deposit to Intents Balance
 * User selects source chain, enters amount, deposits USDC into intents.near balance
 */

import React, { useState } from 'react';
import { Select, InputNumber, Button, Steps, Typography, Alert, Space, Tag, message } from 'antd';
import { USDC_ASSETS } from '../../config/near';
import {
  commitDepositToIntents,
  pollStatus,
  getIntentsBalance,
  IntentsStatus,
} from '../../services/nearIntentsService';

const { Text, Paragraph } = Typography;

interface DepositToIntentsProps {
  accountId: string;
  onDepositComplete?: () => void;
}

type DepositPhase = 'input' | 'quoted' | 'waiting_deposit' | 'processing' | 'done' | 'error';

const DepositToIntents: React.FC<DepositToIntentsProps> = ({ accountId, onDepositComplete }) => {
  const [chain, setChain] = useState<string>('base');
  const [amount, setAmount] = useState<number>(100);
  const [phase, setPhase] = useState<DepositPhase>('input');
  const [depositAddress, setDepositAddress] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [deadline, setDeadline] = useState('');
  const [statusText, setStatusText] = useState('');
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);

  // Fetch current Intents balance
  const refreshBalance = async () => {
    try {
      const asset = USDC_ASSETS[chain];
      const bal = await getIntentsBalance(accountId, asset.assetId);
      setBalance(bal);
    } catch {
      // ignore
    }
  };

  // Get deposit address
  const handleGetQuote = async () => {
    setLoading(true);
    try {
      const asset = USDC_ASSETS[chain];
      const rawAmount = (BigInt(Math.round(amount * (10 ** asset.decimals)))).toString();

      const quote = await commitDepositToIntents({
        originAsset: asset.assetId,
        amount: rawAmount,
        recipient: accountId,
        refundTo: accountId, // for NEAR-based refunds; user provides chain address in production
      });

      setDepositAddress(quote.quote.depositAddress);
      setAmountOut(quote.quote.amountOutFormatted);
      setDeadline(quote.quote.deadline);
      setPhase('quoted');
    } catch (err: any) {
      message.error(`Quote failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Start polling after user sends deposit
  const handleConfirmDeposit = async () => {
    setPhase('processing');
    setStatusText('Waiting for deposit confirmation...');
    try {
      const result = await pollStatus(depositAddress, (status: IntentsStatus) => {
        setStatusText(`Status: ${status.status}`);
      });

      if (result.status === 'SUCCESS') {
        setPhase('done');
        message.success('Deposit successful! Intents Balance updated.');
        await refreshBalance();
        onDepositComplete?.();
      } else {
        setPhase('error');
        setStatusText(`Deposit ended with status: ${result.status}`);
      }
    } catch (err: any) {
      setPhase('error');
      setStatusText(`Error: ${err.message}`);
    }
  };

  const chainOptions = Object.entries(USDC_ASSETS)
    .filter(([key]) => key !== 'hyperliquid')
    .map(([key, val]) => ({
      value: key,
      label: val.label,
    }));

  return (
    <div>
      {/* Chain & Amount Input */}
      {phase === 'input' && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text strong>Source Chain</Text>
            <Select
              value={chain}
              onChange={setChain}
              options={chainOptions}
              style={{ width: '100%', marginTop: 8 }}
              size="large"
            />
          </div>
          <div>
            <Text strong>Amount (USDC)</Text>
            <InputNumber
              value={amount}
              onChange={v => setAmount(v || 0)}
              min={1}
              max={100000}
              step={10}
              style={{ width: '100%', marginTop: 8 }}
              size="large"
              addonAfter="USDC"
            />
          </div>
          {balance !== null && (
            <Text type="secondary">Current Intents Balance: {balance} USDC</Text>
          )}
          <Button
            type="primary"
            size="large"
            loading={loading}
            onClick={handleGetQuote}
            block
          >
            Get Deposit Address
          </Button>
        </Space>
      )}

      {/* Deposit Address */}
      {phase === 'quoted' && (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message={`Send ${amount} USDC on ${USDC_ASSETS[chain].label}`}
            description={
              <div>
                <Paragraph copyable={{ text: depositAddress }} style={{ marginBottom: 8 }}>
                  <Text strong>Deposit Address:</Text><br />
                  <Text code style={{ fontSize: 12, wordBreak: 'break-all' }}>{depositAddress}</Text>
                </Paragraph>
                <Text type="secondary">
                  Deadline: {new Date(deadline).toLocaleString()} (approx 10 min)
                </Text>
              </div>
            }
          />
          <Alert
            type="warning"
            showIcon
            message="Send the exact amount from your wallet on the selected chain, then click confirm below."
          />
          <Button
            type="primary"
            size="large"
            onClick={handleConfirmDeposit}
            block
          >
            I've Sent the Deposit — Start Tracking
          </Button>
          <Button type="link" onClick={() => setPhase('input')}>
            ← Back to change amount
          </Button>
        </Space>
      )}

      {/* Processing */}
      {phase === 'processing' && (
        <Alert
          type="info"
          showIcon
          message="Processing your deposit..."
          description={statusText}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* Done */}
      {phase === 'done' && (
        <Alert
          type="success"
          showIcon
          message="Deposit Complete!"
          description={`Your Intents Balance has been funded. The Agent can now execute trades.${balance ? ` Balance: ${balance} USDC` : ''}`}
        />
      )}

      {/* Error */}
      {phase === 'error' && (
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert type="error" showIcon message="Deposit Issue" description={statusText} />
          <Button onClick={() => setPhase('input')}>Try Again</Button>
        </Space>
      )}
    </div>
  );
};

export default DepositToIntents;
