import React, { useState, useEffect, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';
import { getCreatorEarnings } from '../services/api';
import '../styles/CreatorDashboard.css';

interface AgentEarning {
  id: number;
  name: string;
  price: number;
  totalCalls: number;
  totalEarnings: number;
}

interface EarningsData {
  totalEarnings: number;
  totalCalls: number;
  agents: AgentEarning[];
}

const CreatorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { getCurrentAccount } = useContext(MultiWalletContext);
  const currentAccount = getCurrentAccount();

  const [earningsData, setEarningsData] = useState<EarningsData>({
    totalEarnings: 0,
    totalCalls: 0,
    agents: []
  });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      const data = await getCreatorEarnings();
      setEarningsData(data);
    } catch (error) {
      console.error('Error fetching creator earnings:', error);
    }
  };

  // Pagination logic
  const totalPages = Math.ceil(earningsData.agents.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentAgents = earningsData.agents.slice(startIndex, endIndex);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="creator-dashboard">
      <div className="dashboard-header">
        <Link to="/chat" className="back-button">
          ← Back to Chat
        </Link>
        <h1>Creator Center</h1>
      </div>

      {/* Earnings Summary */}
      <div className="earnings-summary">
        <div className="summary-card">
          <div className="card-title">Total Earnings</div>
          <div className="card-value">{earningsData.totalEarnings} Credits</div>
        </div>
        <div className="summary-card">
          <div className="card-title">Total Calls</div>
          <div className="card-value">{earningsData.totalCalls}</div>
        </div>
        <div className="summary-card">
          <div className="card-title">Total Agents</div>
          <div className="card-value">{earningsData.agents.length}</div>
        </div>
      </div>

      {/* Withdraw to USDT Button */}
      <div className="withdraw-section">
        <button
          className="withdraw-button"
          onClick={() => navigate('/creator/withdrawals')}
          style={{ background: 'linear-gradient(45deg, #52c41a 0%, #73d13d 100%)' }}
        >
          💵 Withdraw to USDT
        </button>
      </div>

      {/* Agent Earnings List */}
      <div className="agents-earnings-list">
        <h2>Agent Earnings Details</h2>
        {earningsData.agents.length === 0 ? (
          <div className="no-earnings">
            <p>You haven't created any agents yet</p>
          </div>
        ) : (
          <table className="earnings-table">
            <thead>
              <tr>
                <th>Agent Name</th>
                <th>Price</th>
                <th>Total Calls</th>
                <th>Total Earnings</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currentAgents.map((agent) => (
                <tr key={agent.id}>
                  <td>{agent.name}</td>
                  <td>
                    {agent.price > 0
                      ? `${agent.price} Credits`
                      : 'Free'}
                  </td>
                  <td>{agent.totalCalls}</td>
                  <td className="earnings-amount">
                    {agent.totalEarnings} Credits
                  </td>
                  <td>
                    <Link
                      to={`/agent/${agent.id}`}
                      className="view-details-link"
                    >
                      View Details →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {earningsData.agents.length > itemsPerPage && (
          <div className="pagination">
            <button
              className="pagination-button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              ← Previous
            </button>
            <div className="pagination-info">
              Page {currentPage} of {totalPages}
            </div>
            <button
              className="pagination-button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorDashboard;
