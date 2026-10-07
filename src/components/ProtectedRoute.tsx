import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../context/AuthContext'
import { ACarregar } from './ui'
import {
  guardarDestinoAutenticacao,
  obterDestinoAutenticacao,
  limparDestinoAutenticacao,
} from '../lib/rotas'

interface ProtectedRouteProps {
  allowedRoles?: UserRole[]
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ allowedRoles }) => {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <ACarregar className="min-h-screen" />
    )
  }

  if (!user) {
    const destinoRelativo = `${location.pathname}${location.search || ''}${location.hash || ''}`
    let caminhoLogin = '/login'
    if (destinoRelativo && destinoRelativo !== '/' && destinoRelativo !== '/login') {
      guardarDestinoAutenticacao(destinoRelativo)
      const params = new URLSearchParams()
      params.set('redirect', destinoRelativo)
      caminhoLogin = `/login?${params.toString()}`
    }
    return <Navigate to={caminhoLogin} state={{ from: location }} replace />
  }

  // Se o utilizador tem sessão e chegou à raiz '/', verificar se há algum redirecionamento pendente
  // (por exemplo após login com Google OAuth ou recarga do browser).
  if (location.pathname === '/') {
    const searchParams = new URLSearchParams(location.search)
    const pendente = obterDestinoAutenticacao(searchParams.get('redirect'))
    if (pendente && pendente !== '/' && pendente !== '/login') {
      limparDestinoAutenticacao()
      return <Navigate to={pendente} replace />
    }
  }

  // Sem perfil carregado não há como validar o cargo: negar em vez de deixar passar.
  if (allowedRoles && (!profile || !allowedRoles.includes(profile.role))) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
