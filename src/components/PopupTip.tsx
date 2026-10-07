import React from 'react';
import './PopupTip.css';

interface PopupTipProps {
  text: string;
  icon?: string;
  onClose: () => void;
  bgColor?: string;
  borderColor?: string;
  arrowPosition?: 'left' | 'center' | 'right';
  position?: 'top' | 'bottom'; // 气泡位置：上方或下方
}

export const PopupTip: React.FC<PopupTipProps> = ({
  text,
  icon = '💡',
  onClose,
  bgColor = '#E3F2FD',
  borderColor = '#90CAF9',
  arrowPosition = 'center',
  position = 'top'
}) => {
  return (
    <div className={`popup-tip ${position === 'bottom' ? 'popup-tip-bottom' : ''}`}>
      <div
        className="popup-tip-content"
        style={{
          background: bgColor,
          borderColor: borderColor
        }}
      >
        <span className="popup-tip-icon">{icon}</span>
        <span className="popup-tip-text">{text}</span>
        <span className="popup-tip-close" onClick={onClose}>×</span>
      </div>
      <div
        className={`popup-tip-arrow popup-tip-arrow-${arrowPosition}`}
        style={{
          borderTopColor: position === 'top' ? borderColor : 'transparent',
          borderBottomColor: position === 'bottom' ? borderColor : 'transparent'
        }}
      />
    </div>
  );
};
