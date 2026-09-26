import React from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../context/AuthContext'
import { ACarregar } from './ui'

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <ACarregar className="min-h-screen" />
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  // Sem perfil carregado não há como validar o cargo: negar em vez de deixar passar.
  if (allowedRoles && (!profile || !allowedRoles.includes(profile.role))) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
