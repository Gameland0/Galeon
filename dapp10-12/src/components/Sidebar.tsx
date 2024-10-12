import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Sidebar: React.FC = () => {
  const location = useLocation();

  return (
    <div className="sidebar">
      <nav>
        <ul>
          <li className={location.pathname === '/chat' ? 'active' : ''}>
            <Link to="/chat">Chat</Link>
          </li>
          <li className={location.pathname === '/marketplace' ? 'active' : ''}>
            <Link to="/marketplace">Agent Marketplace</Link>
          </li>
          <li className={location.pathname === '/team-management' ? 'active' : ''}>
            <Link to="/team-management">Team Management</Link>
          </li>
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
