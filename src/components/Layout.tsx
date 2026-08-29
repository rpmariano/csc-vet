import React, { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { 
  Home, 
  Calendar, 
  BarChart3, 
  Settings, 
  Users, 
  LogOut, 
  FileText, 
  Landmark,
  PlusCircle,
  Menu,
  X,
  Shield,
  ChevronDown,
  Sparkles,
  Check,
  Eye
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../context/AuthContext'
import { AutoAssociationModal } from './AutoAssociationModal'

const Layout: React.FC = () => {
  const { profile, actualRole, isSimulatingRole, setSimulatedRole, assignedRoles, toggleClinicalStatus, signOut } = useAuth()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)

  const isAdmin = profile?.role === 'admin'
  const isCoach = profile?.role === 'coach'
  const canSwitchRoles = (assignedRoles?.length ?? 1) > 1

  const handleSelectRole = (role: UserRole) => {
    if (role === actualRole) {
      setSimulatedRole(null)
    } else {
      setSimulatedRole(role)
    }
    setIsRoleModalOpen(false)
  }

  return (
    <div className="min-h-screen bg-gray-150 flex flex-col md:flex-row">
      {/* Banner Superior de Simulação de Papel */}
      {isSimulatingRole && (
        <div className="bg-amber-500 text-csc-dark px-4 py-1.5 text-xs font-black flex items-center justify-between shadow-md z-40 sticky top-0 md:fixed md:top-0 md:left-0 md:right-0">
          <div className="flex items-center gap-1.5">
            <Eye size={14} className="text-csc-dark" />
            <span>
              A visualizar perfil: <strong className="uppercase underline">{profile?.role === 'coach' ? 'Treinador' : profile?.role === 'admin' ? 'Administrador' : 'Jogador'}</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canSwitchRoles && (
              <button
                onClick={() => setIsRoleModalOpen(true)}
                className="bg-csc-dark text-white text-[10px] px-2 py-0.5 rounded font-bold hover:bg-black transition-colors"
              >
                Alternar Perfil
              </button>
            )}
            <button
              onClick={() => setSimulatedRole(null)}
              className="bg-white text-csc-dark text-[10px] px-2 py-0.5 rounded font-bold hover:bg-gray-100 transition-colors shadow-xs"
            >
              Voltar ao Principal
            </button>
          </div>
        </div>
      )}

      {/* Mobile Header (Limpo e elegante) */}
      <header className={`bg-white text-csc-dark flex items-center justify-between px-3.5 py-2.5 md:hidden border-b-4 border-csc-gold shadow-sm sticky ${isSimulatingRole ? 'top-8' : 'top-0'} z-30`}>
        <Link to="/" className="flex items-center gap-2">
          <img src="/csc-vet/logo-clube-horizontal.svg" alt="Logo" className="h-9 object-contain" />
        </Link>
        
        <div className="flex items-center gap-2">
          {/* Toggle Clínico no Canto Superior: Disponível / Lesionado */}
          {profile && (
            <button
              type="button"
              onClick={() => toggleClinicalStatus()}
              className={`text-[10px] font-black px-2.5 py-1 rounded-full flex items-center gap-1 transition-all border shadow-2xs cursor-pointer active:scale-95 ${
                profile.status === 'injured'
                  ? 'bg-red-50 text-red-700 border-red-300 animate-pulse ring-1 ring-red-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 ring-1 ring-emerald-200'
              }`}
              title="Clique para alternar entre Disponível e Lesionado"
            >
              <span>{profile.status === 'injured' ? '🔴' : '🟢'}</span>
              <span>{profile.status === 'injured' ? 'Lesionado' : 'Disponível'}</span>
            </button>
          )}

          {/* Pílula de Cargo (Clicável se tiver múltiplos perfis) */}
          <button
            type="button"
            onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
            className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full font-black text-white flex items-center gap-1 transition-all ${
              isAdmin ? 'bg-csc-gold text-csc-dark shadow-xs' : isCoach ? 'bg-blue-600' : 'bg-csc-dark'
            } ${canSwitchRoles ? 'cursor-pointer hover:ring-2 hover:ring-csc-gold/50 active:scale-95' : ''}`}
            title={canSwitchRoles ? "Clique para alternar entre os seus perfis" : undefined}
          >
            <span>{isAdmin ? 'Admin' : isCoach ? 'Treinador' : 'Jogador'}</span>
            {canSwitchRoles && <ChevronDown size={12} className="opacity-70" />}
          </button>

          <Link to="/settings" title="Ver Perfil">
            {profile?.photo_url ? (
              <img src={profile.photo_url} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-csc-gold" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-csc-dark text-white text-xs flex items-center justify-center font-bold">
                {profile?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
            )}
          </Link>
        </div>
      </header>

      {/* Mobile Drawer (Menu dos Traços ☰) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex justify-end">
          {/* Overlay de fundo */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Painel do Menu */}
          <div className="relative w-4/5 max-w-xs bg-csc-dark text-white h-full flex flex-col justify-between p-5 z-10 shadow-2xl overflow-y-auto">
            <div>
              {/* Topo do Menu */}
              <div className="flex items-center justify-between pb-3 border-b border-csc-light/30">
                <div className="flex items-center gap-2">
                  <Menu size={18} className="text-csc-gold" />
                  <span className="text-sm font-black uppercase tracking-wider text-white">Menu Principal</span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Cartão do Utilizador */}
              {profile && (
                <div className="mt-4 p-3 bg-black/30 rounded-xl border border-csc-light/30 flex items-center space-x-3">
                  {profile.photo_url ? (
                    <img src={profile.photo_url} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-csc-gold" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-csc-light text-white flex items-center justify-center font-bold text-sm">
                      {profile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="font-bold text-sm truncate text-white">{profile.name}</p>
                    <button
                      type="button"
                      onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
                      className={`text-[10px] px-2 py-0.5 rounded font-black flex items-center gap-1 mt-0.5 ${
                        isAdmin ? 'bg-csc-gold text-csc-dark' : isCoach ? 'bg-blue-500 text-white' : 'bg-csc-light text-white'
                      } ${canSwitchRoles ? 'cursor-pointer hover:opacity-90 active:scale-95' : ''}`}
                      title={canSwitchRoles ? "Clique para alternar entre os seus perfis" : undefined}
                    >
                      <span>{isAdmin ? 'Administrador' : isCoach ? 'Treinador' : 'Jogador'}</span>
                      {canSwitchRoles && <ChevronDown size={11} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Secções de Acessos Restantes */}
              <div className="mt-4 space-y-4">
                {/* 1. Administração & Clube (Apenas Admin/Treinador) */}
                {(isAdmin || isCoach) && (
                  <div>
                    <p className="text-[10px] uppercase font-black text-csc-gold tracking-wider mb-1.5 px-2">
                      Administração & Clube
                    </p>
                    <div className="space-y-1">
                      <Link
                        to="/admin"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                          location.pathname === '/admin' ? 'bg-csc-gold text-csc-dark' : 'text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <Shield size={16} className="text-csc-gold" />
                        <span>Backoffice & Clube</span>
                      </Link>
                      
                      {isAdmin && (
                        <Link
                          to="/finance"
                          onClick={() => setIsMobileMenuOpen(false)}
                          className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                            location.pathname === '/finance' ? 'bg-csc-gold text-csc-dark' : 'text-gray-200 hover:bg-white/10'
                          }`}
                        >
                          <Landmark size={16} className="text-emerald-400" />
                          <span>Financeiro & Quotas</span>
                        </Link>
                      )}

                      <Link
                        to="/events"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                          location.pathname === '/events' ? 'bg-csc-gold text-csc-dark' : 'text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <PlusCircle size={16} className="text-blue-400" />
                        <span>Criar Eventos & Jogos</span>
                      </Link>
                    </div>
                  </div>
                )}

                {/* 2. Informação & Comunicação (Apenas Admin/Treinador) */}
                {(isAdmin || isCoach) && (
                  <div>
                    <p className="text-[10px] uppercase font-black text-gray-400 tracking-wider mb-1.5 px-2">
                      Informação & Desporto
                    </p>
                    <div className="space-y-1">
                      <Link
                        to="/announcements"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                          location.pathname === '/announcements' ? 'bg-csc-gold text-csc-dark' : 'text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <FileText size={16} className="text-amber-400" />
                        <span>Comunicados & Avisos</span>
                      </Link>

                      <Link
                        to="/stats"
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                          location.pathname === '/stats' ? 'bg-csc-gold text-csc-dark' : 'text-gray-200 hover:bg-white/10'
                        }`}
                      >
                        <BarChart3 size={16} className="text-purple-400" />
                        <span>Estatísticas & Desempenho</span>
                      </Link>
                    </div>
                  </div>
                )}

                {/* 3. Conta & Definições */}
                <div>
                  <p className="text-[10px] uppercase font-black text-gray-400 tracking-wider mb-1.5 px-2">
                    Conta
                  </p>
                  <div className="space-y-1">
                    <Link
                      to="/settings"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors ${
                        location.pathname === '/settings' ? 'bg-csc-gold text-csc-dark' : 'text-gray-200 hover:bg-white/10'
                      }`}
                    >
                      <Settings size={16} className="text-gray-300" />
                      <span>Definições do Perfil</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Logout no rodapé do menu */}
            <div className="pt-4 mt-6 border-t border-csc-light/30">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  signOut()
                }}
                className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-red-300 hover:bg-red-900/40 hover:text-red-200 transition-colors font-bold text-xs"
              >
                <LogOut size={16} />
                <span>Terminar Sessão</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar Navigation */}
      <aside className={`bg-csc-dark text-white w-64 flex-shrink-0 flex-col justify-between hidden md:flex border-r-2 border-csc-light/20 ${isSimulatingRole ? 'pt-8' : ''}`}>
        <div className="bg-white p-6 border-b-4 border-csc-gold">
          <img src="/csc-vet/logo-clube-horizontal.svg" alt="Logo" className="h-16 w-full object-contain" />
        </div>
        
        <div className="p-6 pt-6 flex-1">
          {profile && (
            <div className="flex items-center space-x-3 mb-6 bg-black/20 p-3 rounded-xl border border-csc-light/30">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-csc-light flex items-center justify-center font-bold">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="font-semibold truncate text-sm">{profile.name}</p>
                <button
                  type="button"
                  onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
                  className={`text-[10px] px-2 py-0.5 rounded font-black flex items-center gap-1 mt-0.5 ${
                    isAdmin ? 'bg-csc-gold text-csc-dark' : isCoach ? 'bg-blue-500 text-white' : 'bg-csc-light text-white'
                  } ${canSwitchRoles ? 'cursor-pointer hover:opacity-90 active:scale-95' : ''}`}
                  title={canSwitchRoles ? "Clique para alternar entre os seus perfis" : undefined}
                >
                  <span>{isAdmin ? 'Administrador' : isCoach ? 'Treinador' : 'Jogador'}</span>
                  {canSwitchRoles && <ChevronDown size={11} />}
                </button>
              </div>
            </div>
          )}

          {/* Navegação Desktop Estruturada (Mesma Lógica da App) */}
          <nav className="space-y-4 overflow-y-auto pr-1">
            {/* 1. SECÇÃO PRINCIPAL / SACOS */}
            <div>
              <p className="text-[10px] uppercase font-black text-gray-400 tracking-wider mb-1.5 px-3">
                Principal
              </p>
              <div className="space-y-1">
                <Link
                  to="/"
                  className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                    location.pathname === '/' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Home size={17} className={location.pathname === '/' ? 'text-csc-dark' : 'text-csc-gold'} />
                  <span>Home</span>
                </Link>

                <Link
                  to="/calendar"
                  className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                    location.pathname === '/calendar' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Calendar size={17} className={location.pathname === '/calendar' ? 'text-csc-dark' : 'text-blue-400'} />
                  <span>Agenda</span>
                </Link>

                {(isAdmin || isCoach) && (
                  <Link
                    to="/team-management"
                    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                      location.pathname === '/team-management' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Users size={17} className={location.pathname === '/team-management' ? 'text-csc-dark' : 'text-emerald-400'} />
                    <span>Plantel</span>
                  </Link>
                )}

                {(isAdmin || isCoach) ? (
                  <Link
                    to="/events"
                    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                      location.pathname === '/events' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <PlusCircle size={17} className={location.pathname === '/events' ? 'text-csc-dark' : 'text-amber-400'} />
                    <span>Criar Evento</span>
                  </Link>
                ) : (
                  <Link
                    to="/stats"
                    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                      location.pathname === '/stats' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <BarChart3 size={17} className={location.pathname === '/stats' ? 'text-csc-dark' : 'text-purple-400'} />
                    <span>Estatísticas</span>
                  </Link>
                )}
              </div>
            </div>

            {/* 2. ADMINISTRAÇÃO & CLUBE (Apenas Admin/Treinador) */}
            {(isAdmin || isCoach) && (
              <div>
                <p className="text-[10px] uppercase font-black text-csc-gold tracking-wider mb-1.5 px-3">
                  Administração & Clube
                </p>
                <div className="space-y-1">
                  <Link
                    to="/admin"
                    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                      location.pathname === '/admin' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <Shield size={17} className={location.pathname === '/admin' ? 'text-csc-dark' : 'text-csc-gold'} />
                    <span>Backoffice & Clube</span>
                  </Link>

                  {isAdmin && (
                    <Link
                      to="/finance"
                      className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                        location.pathname === '/finance' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Landmark size={17} className={location.pathname === '/finance' ? 'text-csc-dark' : 'text-emerald-400'} />
                      <span>Financeiro & Quotas</span>
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* 3. INFORMAÇÃO & DESPORTO (Apenas Admin/Treinador) */}
            {(isAdmin || isCoach) && (
              <div>
                <p className="text-[10px] uppercase font-black text-gray-400 tracking-wider mb-1.5 px-3">
                  Informação & Desporto
                </p>
                <div className="space-y-1">
                  <Link
                    to="/announcements"
                    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                      location.pathname === '/announcements' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <FileText size={17} className={location.pathname === '/announcements' ? 'text-csc-dark' : 'text-amber-400'} />
                    <span>Comunicados & Avisos</span>
                  </Link>

                  <Link
                    to="/stats"
                    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                      location.pathname === '/stats' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <BarChart3 size={17} className={location.pathname === '/stats' ? 'text-csc-dark' : 'text-purple-400'} />
                    <span>Estatísticas & Desempenho</span>
                  </Link>
                </div>
              </div>
            )}

            {/* 4. CONTA & DEFINIÇÕES */}
            <div>
              <p className="text-[10px] uppercase font-black text-gray-400 tracking-wider mb-1.5 px-3">
                Conta
              </p>
              <div className="space-y-1">
                <Link
                  to="/settings"
                  className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
                    location.pathname === '/settings' ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Settings size={17} className={location.pathname === '/settings' ? 'text-csc-dark' : 'text-gray-300'} />
                  <span>Definições do Perfil</span>
                </Link>
              </div>
            </div>
          </nav>
        </div>

        <div className="p-6 border-t border-csc-light/30">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-red-300 hover:bg-black/20 hover:text-red-400 transition-colors font-bold text-sm"
          >
            <LogOut size={18} />
            <span>Sair da Conta</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Desktop Top Header Bar (Disponível/Lesionado Toggle, Cargo e Perfil) */}
        <header className="hidden md:flex items-center justify-between px-8 py-3 bg-white border-b border-gray-200 shadow-2xs sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Painel Oficial</span>
            <span className="text-gray-300">•</span>
            <span className="text-xs font-black text-csc-dark">Veteranos GDS Cascais</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Toggle Clínico no Canto Superior: Disponível / Lesionado */}
            {profile && (
              <button
                type="button"
                onClick={() => toggleClinicalStatus()}
                className={`text-xs font-black px-3.5 py-1.5 rounded-full flex items-center gap-2 transition-all border shadow-xs cursor-pointer active:scale-95 ${
                  profile.status === 'injured'
                    ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100 animate-pulse ring-2 ring-red-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 ring-2 ring-emerald-100'
                }`}
                title="Clique para alternar o seu estado entre Disponível e Lesionado"
              >
                <span className="text-sm">{profile.status === 'injured' ? '🔴' : '🟢'}</span>
                <span>{profile.status === 'injured' ? 'Lesionado (Dep. Médico)' : 'Disponível / Apto'}</span>
              </button>
            )}

            {/* Pílula de Cargo */}
            <button
              type="button"
              onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
              className={`text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full font-black text-white flex items-center gap-1.5 transition-all ${
                isAdmin ? 'bg-csc-gold text-csc-dark shadow-xs' : isCoach ? 'bg-blue-600' : 'bg-csc-dark'
              } ${canSwitchRoles ? 'cursor-pointer hover:ring-2 hover:ring-csc-gold/50 active:scale-95' : ''}`}
            >
              <span>{isAdmin ? '🛡️ Admin' : isCoach ? '📋 Treinador' : '⚽ Jogador'}</span>
              {canSwitchRoles && <ChevronDown size={13} className="opacity-70" />}
            </button>

            {/* Link para Perfil / Settings */}
            <Link
              to="/settings"
              className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors"
              title="Editar o Meu Perfil"
            >
              {profile?.photo_url ? (
                <img src={profile.photo_url} alt="Profile" className="w-7 h-7 rounded-full object-cover border border-csc-gold" />
              ) : (
                <div className="w-7 h-7 rounded-full bg-csc-dark text-white text-xs flex items-center justify-center font-bold">
                  {profile?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
              )}
              <span className="text-xs font-bold text-gray-800 max-w-[140px] truncate">{profile?.name || 'Perfil'}</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-lg md:max-w-7xl mx-auto w-full pb-24 md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation: "Sacos" dos Jogadores/Treinadores + Menu dos Traços (☰) no Rodapé */}
      <div className="fixed bottom-0 left-0 right-0 bg-csc-dark border-t-2 border-csc-light/20 px-1 py-1.5 flex justify-around items-center md:hidden z-40 shadow-2xl">
        {/* 1. Home */}
        <Link 
          to="/" 
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
            ${location.pathname === '/' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Home size={19} />
          <span className="text-[9px] font-bold mt-0.5">Home</span>
        </Link>

        {/* 2. Agenda */}
        <Link 
          to="/calendar" 
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
            ${location.pathname === '/calendar' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Calendar size={19} />
          <span className="text-[9px] font-bold mt-0.5">Agenda</span>
        </Link>

        {/* 3. Ação do Saco: "Criar Evento" (se Coach/Admin) OU "Estatísticas" (se Jogador) */}
        {(isAdmin || isCoach) ? (
          <Link 
            to="/events" 
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
              ${location.pathname === '/events' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <PlusCircle size={19} />
            <span className="text-[9px] font-bold mt-0.5">Criar</span>
          </Link>
        ) : (
          <Link 
            to="/stats" 
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
              ${location.pathname === '/stats' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <BarChart3 size={19} />
            <span className="text-[9px] font-bold mt-0.5">Stats</span>
          </Link>
        )}

        {/* 4. Plantel (Apenas para Treinadores/Admins) */}
        {(isAdmin || isCoach) && (
          <Link 
            to="/team-management" 
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
              ${location.pathname === '/team-management' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <Users size={19} />
            <span className="text-[9px] font-bold mt-0.5">Plantel</span>
          </Link>
        )}

        {/* 5. Menu dos Traços (☰ Menu) */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
            isMobileMenuOpen ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Menu size={19} />
          <span className="text-[9px] font-bold mt-0.5">Menu</span>
        </button>
      </div>

      {/* Modal de Alternância de Papel / Role Switcher */}
      {isRoleModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-scale-up border border-gray-100">
            <button
              onClick={() => setIsRoleModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2.5 bg-csc-gold/20 rounded-xl text-csc-dark">
                <Sparkles size={22} className="text-csc-dark" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900">Alternar Perfil de Acesso</h3>
                <p className="text-xs text-gray-500 font-medium">Selecione o perfil com o qual deseja utilizar a aplicação</p>
              </div>
            </div>

            <div className="mt-5 space-y-2.5">
              {/* 1. Administrador */}
              {assignedRoles?.includes('admin') && (
                <button
                  type="button"
                  onClick={() => handleSelectRole('admin')}
                  className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    profile?.role === 'admin'
                      ? 'border-csc-gold bg-csc-gold/15 ring-2 ring-csc-gold/50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-csc-gold text-csc-dark font-black flex items-center justify-center text-lg shadow-xs shrink-0">
                      🛡️
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">Administrador / Direção</p>
                        {profile?.role === 'admin' && (
                          <span className="text-[10px] bg-csc-gold text-csc-dark font-black px-1.5 py-0.5 rounded">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Acesso total, finanças e administração app</p>
                    </div>
                  </div>
                  {profile?.role === 'admin' && <Check size={18} className="text-csc-dark shrink-0 ml-2" />}
                </button>
              )}

              {/* 2. Treinador */}
              {assignedRoles?.includes('coach') && (
                <button
                  type="button"
                  onClick={() => handleSelectRole('coach')}
                  className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    profile?.role === 'coach'
                      ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-400/50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-black flex items-center justify-center text-lg shadow-xs shrink-0">
                      📋
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">Treinador</p>
                        {profile?.role === 'coach' && (
                          <span className="text-[10px] bg-blue-600 text-white font-black px-1.5 py-0.5 rounded">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Equipa técnica, criação de treinos e jogos</p>
                    </div>
                  </div>
                  {profile?.role === 'coach' && <Check size={18} className="text-blue-600 shrink-0 ml-2" />}
                </button>
              )}

              {/* 3. Jogador */}
              {assignedRoles?.includes('player') && (
                <button
                  type="button"
                  onClick={() => handleSelectRole('player')}
                  className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    profile?.role === 'player'
                      ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-400/50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-700 text-white font-black flex items-center justify-center text-lg shadow-xs shrink-0">
                      ⚽
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-900">Jogador (Atleta)</p>
                        {profile?.role === 'player' && (
                          <span className="text-[10px] bg-emerald-700 text-white font-black px-1.5 py-0.5 rounded">
                            Ativo
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">Atleta nas convocatórias e estatísticas</p>
                    </div>
                  </div>
                  {profile?.role === 'player' && <Check size={18} className="text-emerald-700 shrink-0 ml-2" />}
                </button>
              )}
            </div>

            <div className="mt-5 pt-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setIsRoleModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Associação Inteligente Automática para novos atletas */}
      <AutoAssociationModal />
    </div>
  )
}

export default Layout
