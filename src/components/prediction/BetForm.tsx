import React, { useState, useEffect } from 'react';
import { InputNumber, Button, Alert, Steps, Segmented } from 'antd';
import { LoadingOutlined, StarOutlined, DollarOutlined } from '@ant-design/icons';
import type { PredictionEvent, PlaceBetRequest } from '../../types/prediction';
import { PREDICTION_CONFIG } from '../../types/prediction';
import type { BetStep } from '../../hooks/usePredictionBet';
import { BET_STEP_LABELS } from '../../hooks/usePredictionBet';
import * as predictionApi from '../../services/predictionMarketService';

interface Props {
  event: PredictionEvent;
  onSubmit: (data: PlaceBetRequest) => Promise<void>;
  onCancel: () => void;
  loading: boolean;
  step: BetStep;
}

function getStepIndex(step: BetStep): number {
  switch (step) {
    case 'switching_chain': case 'checking': return 0;
    case 'approving': return 1;
    case 'betting': case 'confirming': return 2;
    case 'done': return 3;
    default: return -1;
  }
}

const POINTS_MIN_BET = 100;
const POINTS_MAX_BET = 50000;

const BetForm: React.FC<Props> = ({ event, onSubmit, onCancel, loading, step }) => {
  const [pnlPct, setPnlPct] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState<number | null>(20);
  const [betType, setBetType] = useState<'USDC' | 'POINTS'>('POINTS');
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);

  const gate = event.qualification_gate || PREDICTION_CONFIG.GATE_LONG;
  const inProgress = loading && step !== 'idle' && step !== 'done' && step !== 'error';
  const isDone = step === 'done';
  const isError = step === 'error';
  const showSteps = step !== 'idle';
  const stepIndex = getStepIndex(step);

  const isPoints = betType === 'POINTS';
  const minBet = isPoints ? POINTS_MIN_BET : PREDICTION_CONFIG.MIN_BET;
  const maxBet = isPoints ? POINTS_MAX_BET : PREDICTION_CONFIG.MAX_BET;

  // 加载积分余额
  useEffect(() => {
    predictionApi.getPointsBalance().then(data => {
      if (data) setPointsBalance(data.balance);
    }).catch(() => {});
  }, []);

  // 切换betType时重置下注金额
  useEffect(() => {
    setBetAmount(isPoints ? 1000 : 20);
  }, [betType]);

  const isValid =
    pnlPct !== null &&
    pnlPct >= PREDICTION_CONFIG.PREDICT_MIN &&
    pnlPct <= PREDICTION_CONFIG.PREDICT_MAX &&
    betAmount !== null &&
    betAmount >= minBet &&
    betAmount <= maxBet &&
    (!isPoints || (pointsBalance !== null && betAmount <= pointsBalance));

  const handleSubmit = async () => {
    if (!isValid || pnlPct === null || betAmount === null) return;
    await onSubmit({ eventId: event.event_id, predictedPnlPct: pnlPct, betAmount, betType });
  };

  const stepsItems = isPoints
    ? [
        { title: 'Submit', description: 'Place bet', icon: stepIndex >= 0 && !isDone && !isError ? <LoadingOutlined /> : undefined },
      ]
    : [
        { title: 'Connect', description: 'Base', icon: stepIndex === 0 && !isDone && !isError ? <LoadingOutlined /> : undefined },
        { title: 'Approve', description: 'USDC allowance', icon: stepIndex === 1 && !isDone && !isError ? <LoadingOutlined /> : undefined },
        { title: 'Submit',  description: 'On-chain', icon: stepIndex === 2 && !isDone && !isError ? <LoadingOutlined /> : undefined },
      ];

  return (
    <div className="pm-bet-form">
      <div className="pm-bet-form-header">
        Predict final PnL for{' '}
        <span>{event.symbol} {event.direction} {event.leverage}x</span>
      </div>

      {!showSteps ? (
        <>
          {/* 积分/USDC 切换 */}
          <div style={{ marginBottom: 14 }}>
            <Segmented
              value={betType}
              onChange={(v) => setBetType(v as 'USDC' | 'POINTS')}
              options={[
                { label: <span><StarOutlined /> Points (Free)</span>, value: 'POINTS' },
                { label: <span><DollarOutlined /> USDC</span>, value: 'USDC' },
              ]}
              block
              style={{ borderRadius: 8 }}
            />
            {isPoints && pointsBalance !== null && (
              <div style={{ fontSize: 12, color: '#6366f1', marginTop: 6, fontWeight: 600 }}>
                Balance: {pointsBalance.toLocaleString()} pts
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                Final PnL% Prediction
              </div>
              <InputNumber
                style={{ width: '100%', fontFamily: "'JetBrains Mono', monospace" }}
                placeholder="e.g. -5.0 or +4.5"
                min={PREDICTION_CONFIG.PREDICT_MIN}
                max={PREDICTION_CONFIG.PREDICT_MAX}
                step={0.1}
                precision={1}
                addonAfter="%"
                value={pnlPct}
                onChange={v => setPnlPct(v)}
              />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                Positive = profit, Negative = loss (e.g. -5.0 = lose 5%)
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                {isPoints ? 'Bet Amount (Points)' : 'Bet Amount (USDC)'}
              </div>
              <InputNumber
                style={{ width: '100%', fontFamily: "'JetBrains Mono', monospace" }}
                min={minBet}
                max={isPoints && pointsBalance !== null ? Math.min(maxBet, pointsBalance) : maxBet}
                step={isPoints ? 100 : 1}
                addonBefore={isPoints ? '★' : '$'}
                value={betAmount}
                onChange={v => setBetAmount(v)}
                controls
              />
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                {isPoints
                  ? `Min ${POINTS_MIN_BET.toLocaleString()} · Max ${POINTS_MAX_BET.toLocaleString()} pts`
                  : `Min $${PREDICTION_CONFIG.MIN_BET} · Max $${PREDICTION_CONFIG.MAX_BET} · 2% fee`
                }
              </div>
            </div>
          </div>

          <Alert
            type={isPoints ? 'info' : 'warning'}
            showIcon={false}
            style={{ marginBottom: 16, fontSize: 12, padding: '8px 12px', borderRadius: 8 }}
            message={
              isPoints ? (
                <span>
                  Free to play with points! Points pool is settled separately from USDC.
                  Predictions outside ±{gate}% of actual PnL are eliminated.
                </span>
              ) : (
                <span>
                  One bet per address. 2% platform fee charged at bet time.
                  Predictions outside ±{gate}% of actual PnL are eliminated — non-winners lose stake.
                </span>
              )
            }
          />
        </>
      ) : (
        <div style={{ marginBottom: 16 }}>
          <Steps
            size="small"
            current={isDone ? stepsItems.length : stepIndex}
            status={isError ? 'error' : isDone ? 'finish' : 'process'}
            items={stepsItems}
            style={{ marginBottom: 14 }}
          />
          <div style={{
            textAlign: 'center',
            fontSize: 13,
            color: isError ? '#dc2626' : isDone ? '#16a34a' : '#6b7280',
          }}>
            {BET_STEP_LABELS[step]}
          </div>
          {isDone && (
            <Alert
              type="success"
              message={isPoints
                ? 'Points bet placed! Payout distributed automatically after settlement.'
                : 'Bet placed on-chain! Payout distributed automatically after settlement.'
              }
              style={{ marginTop: 12, fontSize: 13, borderRadius: 8 }}
            />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        {!showSteps && (
          <Button
            type="primary"
            disabled={!isValid || loading}
            onClick={handleSubmit}
            style={{ background: '#6366f1', borderColor: '#6366f1', borderRadius: 8, fontWeight: 600, height: 38 }}
          >
            {isPoints ? 'Bet with Points' : 'Confirm Bet'}
          </Button>
        )}
        <Button
          disabled={inProgress}
          onClick={onCancel}
          style={{ borderRadius: 8, height: 38 }}
        >
          {isDone ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </div>
  );
};

export default BetForm;
