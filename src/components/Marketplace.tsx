import { useContext, useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChatContext } from './ChatContext';
import { getMarketplaceAgents } from '../services/api';
import '../styles/Marketplace.css';
import agent_avatar from '../image/agent_avatar.png'
import icon_description from '../image/icon_description.png'
import chatbot from '../image/chatbot.png'
import task from '../image/task.png'

const Marketplace = () => {
  const { showMarketplace, selectedAgent, setSelectedAgent, marketplaceAgents, setMarketplaceAgents } = useContext(ChatContext);
  const navigate = useNavigate();

  // 筛选和排序状态
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'price-asc' | 'price-desc' | 'rating' | 'calls'>('default');

  useEffect(() => {
    if (showMarketplace) {
      fetchMarketplaceAgents();
    }
  }, [showMarketplace]);

  const fetchMarketplaceAgents = async () => {
    try {
      const agents = await getMarketplaceAgents();
      setMarketplaceAgents(agents);
    } catch (error) {
      console.error('Error fetching marketplace agents:', error);
    }
  };

  // 筛选和排序逻辑
  const filteredAndSortedAgents = useMemo(() => {
    let filtered = [...marketplaceAgents];

    // 价格筛选
    if (priceFilter === 'free') {
      filtered = filtered.filter(agent => !agent.price || agent.price === 0);
    } else if (priceFilter === 'paid') {
      filtered = filtered.filter(agent => agent.price && agent.price > 0);
    }

    // 排序
    switch (sortBy) {
      case 'price-asc':
        filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price-desc':
        filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'rating':
        filtered.sort((a, b) => (b.average_rating || 0) - (a.average_rating || 0));
        break;
      case 'calls':
        filtered.sort((a, b) => (b.total_calls || 0) - (a.total_calls || 0));
        break;
      default:
        // 默认排序：免费在前，然后按创建时间
        filtered.sort((a, b) => {
          if ((a.price || 0) === 0 && (b.price || 0) > 0) return -1;
          if ((a.price || 0) > 0 && (b.price || 0) === 0) return 1;
          return 0;
        });
    }

    return filtered;
  }, [marketplaceAgents, priceFilter, sortBy]);

  if (!showMarketplace) return null;

  return (
    <div className="marketplace">
      <h2>Agent Marketplace</h2>

      {/* Filter and Sort Controls */}
      <div className="marketplace-controls" style={{
        background: '#F6F7F9',
        padding: '16px 20px',
        borderRadius: '12px',
        marginBottom: '25px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px'
      }}>
        <div className="filter-section" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flex: 1
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6B7280',
            minWidth: 'fit-content'
          }}>Filter:</span>
          <div className="filter-buttons" style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => setPriceFilter('all')}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: '500',
                border: priceFilter === 'all' ? '2px solid #3b82f6' : '1px solid #D1D5DB',
                background: priceFilter === 'all' ? '#EFF6FF' : '#FFFFFF',
                color: priceFilter === 'all' ? '#3b82f6' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
            >
              All
            </button>
            <button
              onClick={() => setPriceFilter('free')}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: '500',
                border: priceFilter === 'free' ? '2px solid #10b981' : '1px solid #D1D5DB',
                background: priceFilter === 'free' ? '#ECFDF5' : '#FFFFFF',
                color: priceFilter === 'free' ? '#10b981' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
            >
              🆓 Free
            </button>
            <button
              onClick={() => setPriceFilter('paid')}
              style={{
                padding: '6px 16px',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: '500',
                border: priceFilter === 'paid' ? '2px solid #f59e0b' : '1px solid #D1D5DB',
                background: priceFilter === 'paid' ? '#FFFBEB' : '#FFFFFF',
                color: priceFilter === 'paid' ? '#f59e0b' : '#6B7280',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                outline: 'none'
              }}
            >
              💰 Paid
            </button>
          </div>
        </div>

        <div className="sort-section" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#6B7280',
            minWidth: 'fit-content'
          }}>Sort By:</span>
          <select
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '14px',
              border: '1px solid #D1D5DB',
              background: '#FFFFFF',
              color: '#374151',
              cursor: 'pointer',
              outline: 'none',
              fontWeight: '500'
            }}
          >
            <option value="default">Default</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Highest Rating</option>
            <option value="calls">Most Popular</option>
          </select>
        </div>
      </div>

      {/* Official Agents Section */}
      <div className="agent-section" style={{ marginBottom: '30px' }}>
        <h3 className="section-title" style={{
          color: '#3b82f6',
          fontSize: '20px',
          fontWeight: 'bold',
          marginBottom: '15px',
          paddingBottom: '10px',
          borderBottom: '2px solid rgba(59, 130, 246, 0.3)'
        }}>Official Agents</h3>

        <div className="agent-grid">
          {/* Alpha Auto Agent */}
          <div
            className="agent-card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/alpha-agent')}
          >
            <div
              className="price-badge"
              style={{
                background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
                color: '#000',
                fontWeight: 'bold'
              }}
            >
              ⭐ Official Agent
            </div>

            <div className="agent-header">
              <div style={{ fontSize: '48px' }}>🤖</div>
              <h3>Alpha Auto Agent</h3>
            </div>

            <div className="agent-description">
              <img src={icon_description} alt="agent-description" title='Description'/>
              <p>24/7 AI-powered trading signal generator for Binance Alpha tokens with 7D analysis.</p>
            </div>

            <div className="agent-price">
              <strong>Access:</strong>
              <span style={{ color: '#22c55e', fontWeight: 'bold' }}>All signals FREE</span>
            </div>

            <div className="agent-stats">
              <div className="stat-item">
                <span className="stat-icon">📊</span>
                <span className="stat-label">7D Analysis</span>
              </div>
              <div className="stat-item">
                <span className="stat-icon">🎯</span>
                <span className="stat-label">70%+ Accuracy</span>
              </div>
            </div>

            <div className="agent-actions">
              <button
                className="Market-select-btn"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                  border: 'none',
                  fontWeight: 'bold'
                }}
              >
                🚀 View Alpha Agent
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Community Agents Section */}
      <div className="agent-section">
        <h3 className="section-title" style={{
          color: '#8b5cf6',
          fontSize: '20px',
          fontWeight: 'bold',
          marginBottom: '15px',
          paddingBottom: '10px',
          borderBottom: '2px solid rgba(139, 92, 246, 0.3)'
        }}>Community Agents</h3>

        <div className="agent-grid">
        {filteredAndSortedAgents.map((agent: any) => (
          <div key={agent.id} className="agent-card">
            {/* Price Badge */}
            <div className={`price-badge ${agent.price && agent.price > 0 ? 'paid-badge' : 'free-badge'}`}>
              {agent.price && agent.price > 0 ? '💰 Paid' : '🆓 Free'}
            </div>

            <div className="agent-header">
              <img src={agent.image_url? agent.image_url : agent_avatar} alt={agent.name} className="agent-image" />
              <h3>{agent.name}</h3>
            </div>
            <div className="agent-description">
              <img src={icon_description} alt="agent-description" title='Description'/>
              <p>{agent.description}</p >
            </div>
            <div className="agent-owner Hash">
              <strong>Owner:</strong>
              <div>{agent.owner}</div>
            </div >
            <div className="agent-price">
              <strong>Price:</strong>
              <span className={agent.price > 0 ? 'price-paid' : 'price-free'}>
                {agent.price > 0 ? `${agent.price} Credits/call` : 'Free'}
              </span>
            </div>
            <div className="agent-stats">
              <div className="stat-item">
                <span className="stat-icon">⭐</span>
                <span className="stat-value">
                  {(Number(agent.average_rating) || 0).toFixed(1)}
                </span>
                <span className="stat-label">({Number(agent.rating_count) || 0})</span>
              </div>
              <div className="stat-item">
                <span className="stat-icon">📞</span>
                <span className="stat-value">{Number(agent.total_calls) || 0}</span>
                <span className="stat-label">calls</span>
              </div>
            </div>
            <div className="flex align-items space-between">
              <p className="agent-type">
                {agent.type === 'chatbot' ? (
                  <img src={chatbot} alt="chatbot" title='chatbot' />
                ) : (
                  <img src={task} alt="task" title='task' />
                )}
              </p >
              <p className="agent-created"><strong>Created:</strong> {new Date(agent.created_at).toLocaleDateString()}</p >
            </div>
            <div className="agent-actions">
              {selectedAgent && selectedAgent.id === agent.id ? (
                <button onClick={() => setSelectedAgent(null)} className="Market-deselect-btn">Deselect Agent</button>
              ) : (
                <button onClick={() => setSelectedAgent(agent)} className="Market-select-btn">Use This Agent</button>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
};

export default Marketplace;
