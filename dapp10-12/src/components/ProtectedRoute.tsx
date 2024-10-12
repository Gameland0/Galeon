import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { Web3Context } from '../contexts/Web3Context';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { account, isAuthenticated } = useContext(Web3Context);

  if (!account || !isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;


