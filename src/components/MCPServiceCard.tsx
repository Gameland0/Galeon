import React from 'react';

interface MCPServiceCardProps {
  service: {
    id: string;
    name: string;
    description: string;
    capabilities: string[];
  };
  enabled: boolean;
  loading?: boolean;
  onToggle: (enabled: boolean) => void;
}

const MCPServiceCard: React.FC<MCPServiceCardProps> = ({ service, enabled, loading, onToggle }) => {
  return (
    <div className={`mcp-service-card ${enabled ? 'enabled' : 'disabled'}`}>
      <div className="mcp-card-header">
        <h4 className="mcp-service-name">{service.name}</h4>
        <label className="mcp-switch">
          <input 
            type="checkbox" 
            checked={enabled}
            disabled={loading}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="mcp-slider"></span>
        </label>
      </div>
      <p className="mcp-service-description">{service.description}</p>
      <div className="mcp-capabilities">
        {service.capabilities.slice(0, 6).map(cap => (
          <span key={cap} className="mcp-capability-tag">{cap}</span>
        ))}
        {service.capabilities.length > 6 && (
          <span className="mcp-capability-more">+{service.capabilities.length - 6} more</span>
        )}
      </div>
    </div>
  );
};

export default MCPServiceCard;