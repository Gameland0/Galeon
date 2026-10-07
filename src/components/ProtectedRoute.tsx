import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { MultiWalletContext } from '../contexts/MultiWalletContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { getCurrentAccount, isAuthenticated } = useContext(MultiWalletContext);
  
  const account = getCurrentAccount();

  if (!account || !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;


