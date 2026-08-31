import React, { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import {
  Home,
  Calendar,
  BarChart3,
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
  ArrowRight,
  Check,
  ClipboardList,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../context/AuthContext'
import { AutoAssociationModal } from './AutoAssociationModal'
import { triggerHaptic } from '../utils/haptics'
import { useModalA11y } from '../hooks/useModalA11y'
import { ClinicalStatusChip, RoleChip, RoleAvatar } from './StatusChip'

/**
 * Itens de navegação — fonte única para a gaveta do telemóvel e para a sidebar
 * do desktop. As duas superfícies mostram conjuntos diferentes (a gaveta
 * complementa a barra de baixo, a sidebar mostra tudo), por isso não há uma
 * lista única a percorrer nas duas; o que estava mesmo duplicado — o bloco de
 * className com o ternário do estado ativo, repetido em cada link — passa a
 * viver só em `DrawerLink`/`SidebarLink`, com a cor do ícone lida daqui.
 */
interface NavItem {
  to: string
  label: string
  Icon: LucideIcon
  /** Cor do ícone quando o link não está ativo (ativo é sempre text-csc-dark, sobre fundo dourado). */
  color: string
}

const NAV_HOME: NavItem = { to: '/', label: 'Home', Icon: Home, color: 'text-csc-gold' }
const NAV_CALENDAR: NavItem = { to: '/calendar', label: 'Agenda', Icon: Calendar, color: 'text-blue-400' }
const NAV_MATCH_REPORTS: NavItem = { to: '/match-reports', label: 'Fichas de Jogo', Icon: ClipboardList, color: 'text-emerald-400' }
const NAV_STATS: NavItem = { to: '/stats', label: 'Estatísticas', Icon: BarChart3, color: 'text-purple-400' }
const NAV_STANDINGS: NavItem = { to: '/standings', label: 'Classificações', Icon: Trophy, color: 'text-yellow-400' }
const NAV_TEAM: NavItem = { to: '/team-management', label: 'Plantel', Icon: Users, color: 'text-emerald-400' }
// Cor unificada: o desktop já usava amber-400; a gaveta mobile usava blue-400 (igual à Agenda) — divergência que a duplicação escondia.
const NAV_EVENTS: NavItem = { to: '/events', label: 'Gestão de Eventos', Icon: PlusCircle, color: 'text-amber-400' }
const NAV_ADMIN: NavItem = { to: '/admin', label: 'Backoffice & Clube', Icon: Shield, color: 'text-csc-gold' }
const NAV_FINANCE: NavItem = { to: '/finance', label: 'Financeiro & Quotas', Icon: Landmark, color: 'text-emerald-400' }
const NAV_ANNOUNCEMENTS: NavItem = { to: '/announcements', label: 'Comunicados & Avisos', Icon: FileText, color: 'text-amber-400' }

/** Link da gaveta mobile — mesmas classes que já existiam em cada bloco. */
const DrawerLink: React.FC<{ item: NavItem; active: boolean; onNavigate: () => void }> = ({ item, active, onNavigate }) => (
  <Link
    to={item.to}
    onClick={onNavigate}
    className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl font-bold text-xs transition-colors ${
      active ? 'bg-csc-gold text-csc-dark' : 'text-gray-200 hover:bg-white/10'
    }`}
  >
    <item.Icon size={16} className={active ? 'text-csc-dark' : item.color} />
    <span>{item.label}</span>
  </Link>
)

/** Link da sidebar desktop — mesmas classes que já existiam em cada bloco. */
const SidebarLink: React.FC<{ item: NavItem; active: boolean }> = ({ item, active }) => (
  <Link
    to={item.to}
    className={`flex items-center space-x-3 px-3.5 py-2.5 rounded-xl transition-all font-bold text-xs ${
      active ? 'bg-csc-gold text-csc-dark shadow-sm' : 'text-gray-200 hover:bg-white/10 hover:text-white'
    }`}
  >
    <item.Icon size={17} className={active ? 'text-csc-dark' : item.color} />
    <span>{item.label}</span>
  </Link>
)

/**
 * Grupo de navegação — mesmos 4 grupos (rótulo, ordem, composição) na gaveta
 * mobile e na sidebar desktop: Geral / Gestão da Equipa / Administração &
 * Clube / Comunicação. Um grupo sem itens (ex.: tudo já está na barra de
 * baixo, no caso da gaveta) não se desenha — não fica um título pendurado
 * sem nada por baixo.
 */
const DrawerSection: React.FC<{ label: string; items: NavItem[]; gold?: boolean; pathname: string; onNavigate: () => void }> = ({
  label,
  items,
  gold,
  pathname,
  onNavigate,
}) => {
  if (items.length === 0) return null
  return (
    <div>
      <p className={`text-[10px] uppercase font-black tracking-wider mb-1.5 px-2 ${gold ? 'text-csc-gold' : 'text-gray-400'}`}>{label}</p>
      <div className="space-y-1">
        {items.map(item => (
          <DrawerLink key={item.to} item={item} active={pathname === item.to} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  )
}

const SidebarSection: React.FC<{ label: string; items: NavItem[]; gold?: boolean; pathname: string }> = ({ label, items, gold, pathname }) => {
  if (items.length === 0) return null
  return (
    <div>
      <p className={`text-[10px] uppercase font-black tracking-wider mb-1.5 px-3 ${gold ? 'text-csc-gold' : 'text-gray-400'}`}>{label}</p>
      <div className="space-y-1">
        {items.map(item => (
          <SidebarLink key={item.to} item={item} active={pathname === item.to} />
        ))}
      </div>
    </div>
  )
}

const Layout: React.FC = () => {
  const { profile, actualRole, setSimulatedRole, assignedRoles, toggleClinicalStatus, signOut } = useAuth()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false)

  // Escape, prisão de foco e bloqueio de scroll para a gaveta e para o seletor de perfil.
  const gavetaRef = useModalA11y({ isOpen: isMobileMenuOpen, onClose: () => setIsMobileMenuOpen(false) })
  const perfilRef = useModalA11y({ isOpen: isRoleModalOpen, onClose: () => setIsRoleModalOpen(false) })
  const perfilTituloId = 'titulo-alternar-perfil'
  const gavetaTituloId = 'titulo-menu-principal'

  const isAdmin = profile?.role === 'admin'
  const isCoach = profile?.role === 'coach'
  const isPlayer = !isAdmin && !isCoach
  const canSwitchRoles = (assignedRoles?.length ?? 1) > 1

  // Os 4 grupos de navegação — mesma composição na gaveta e na sidebar.
  const secaoGeral: NavItem[] = [NAV_HOME, NAV_CALENDAR, NAV_MATCH_REPORTS, NAV_STATS, NAV_STANDINGS]
  const secaoGestaoEquipa: NavItem[] = (isAdmin || isCoach) ? [NAV_TEAM, NAV_EVENTS] : []
  const secaoAdminClube: NavItem[] = (isAdmin || isCoach) ? [NAV_ADMIN, ...(isAdmin ? [NAV_FINANCE] : [])] : []
  const secaoComunicacao: NavItem[] = (isAdmin || isCoach) ? [NAV_ANNOUNCEMENTS] : []

  // A gaveta complementa a barra de baixo — omite o que já lá está, por perfil,
  // para o mesmo link não aparecer duas vezes.
  const caminhosBarraInferior = (isAdmin || isCoach)
    ? ['/', '/calendar', '/events', '/team-management']
    : ['/', '/calendar', '/match-reports', '/stats']
  const paraGaveta = (items: NavItem[]) => items.filter(item => !caminhosBarraInferior.includes(item.to))

  const handleSelectRole = (role: UserRole) => {
    triggerHaptic('medium')
    if (role === actualRole) {
      setSimulatedRole(null)
    } else {
      setSimulatedRole(role)
    }
    setIsRoleModalOpen(false)
  }

  const handleToggleClinical = () => {
    triggerHaptic('medium')
    toggleClinicalStatus()
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Mobile Header (Limpo e elegante) */}
      <header className="bg-white text-csc-dark flex items-center justify-between px-3.5 py-2.5 md:hidden border-b-4 border-csc-gold shadow-sm sticky top-0 z-30">
        <Link to="/" className="flex items-center gap-2">
          <img src="/csc-vet/logo-clube-horizontal.svg" alt="Logo" className="h-9 object-contain" />
        </Link>
        
        <div className="flex items-center gap-2">
          {/* Toggle Clínico no Canto Superior: Apto / Lesionado */}
          {profile && (
            <button
              type="button"
              onClick={handleToggleClinical}
              className={`transition-all cursor-pointer active:scale-95 rounded-full ${profile.status === 'injured' ? 'ring-1 ring-red-300' : 'ring-1 ring-emerald-200'}`}
              title="Clique para alternar entre Apto e Lesionado"
            >
              <ClinicalStatusChip status={profile.status} size="sm" />
            </button>
          )}

          {/* Pílula de Cargo (Clicável se tiver múltiplos perfis) */}
          <button
            type="button"
            onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
            className={`transition-all rounded-full ${canSwitchRoles ? 'cursor-pointer hover:ring-2 hover:ring-csc-gold/50 active:scale-95' : ''}`}
            title={canSwitchRoles ? "Clique para alternar entre os seus perfis" : undefined}
          >
            <RoleChip role={profile?.role ?? 'player'} size="sm" className={canSwitchRoles ? 'pr-1.5' : ''} />
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
          <div
            ref={gavetaRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={gavetaTituloId}
            tabIndex={-1}
            className="relative w-4/5 max-w-xs bg-csc-dark text-white h-full flex flex-col justify-between p-5 z-10 shadow-2xl overflow-y-auto outline-none"
          >
            <div>
              {/* Topo do Menu */}
              <div className="flex items-center justify-between pb-3 border-b border-csc-light/30">
                <div className="flex items-center gap-2">
                  <Menu size={18} className="text-csc-gold" />
                  <span id={gavetaTituloId} className="text-sm font-black uppercase tracking-wider text-white">Menu Principal</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  aria-label="Fechar menu"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* 1. CARD DO PERFIL DO UTILIZADOR (PARA OS 3 PERFIS: JOGADOR, TREINADOR, ADMIN) */}
              {profile && (
                <div className="mt-4 p-4 bg-gradient-to-br from-black/60 to-black/30 rounded-2xl border-2 border-csc-gold/40 shadow-md">
                  <div className="flex items-center space-x-3">
                    {profile.photo_url ? (
                      <img src={profile.photo_url} alt="Profile" className="w-12 h-12 rounded-2xl object-cover border-2 border-csc-gold shadow-xs" />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl bg-csc-light text-white flex items-center justify-center font-black text-base border border-csc-gold shadow-xs">
                        {profile.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="overflow-hidden flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="font-extrabold text-sm truncate text-white">{profile.name}</p>
                        {isPlayer && profile.jersey_number && (
                          <span className="bg-csc-gold text-csc-dark font-black text-[10px] px-1.5 py-0.2 rounded">
                            #{profile.jersey_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
                          className={canSwitchRoles ? 'cursor-pointer active:scale-95' : ''}
                          title={canSwitchRoles ? "Clique para alternar entre os seus perfis" : undefined}
                        >
                          <RoleChip role={profile.role} size="sm" className={canSwitchRoles ? 'pr-1' : ''} />
                          {canSwitchRoles && <ChevronDown size={10} className="inline ml-0.5 opacity-70" />}
                        </button>

                        {/* Estado Clínico (Apenas Jogador) */}
                        {isPlayer && (
                          <button type="button" onClick={() => toggleClinicalStatus()} className="cursor-pointer">
                            <ClinicalStatusChip status={profile.status} size="sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <Link
                    to="/settings"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="mt-3 w-full py-2 px-3.5 bg-csc-gold hover:bg-yellow-400 text-csc-dark rounded-xl text-xs font-black transition-all flex items-center justify-between shadow-sm cursor-pointer active:scale-95"
                  >
                    <span>Editar Ficha / Perfil</span>
                    <ArrowRight size={14} className="text-csc-dark" />
                  </Link>
                </div>
              )}

              {/* 2. CARD DAS QUOTAS (APENAS PARA PERFIL JOGADOR NO TOPO DO MENU EXPANDIDO) */}
              {profile && isPlayer && (
                <div className="mt-3 p-3.5 bg-black/40 rounded-2xl border border-csc-light/30 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <Landmark size={15} className="text-emerald-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-white">Quotas & Mensalidades</span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                      Regularizadas
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-snug">
                    {profile.iban ? 'Débito direto ativo na conta do clube.' : 'Consulte os dados bancários para regularização.'}
                  </p>
                  <Link
                    to="/settings"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="mt-2.5 w-full py-1.5 px-3 bg-emerald-700/40 hover:bg-emerald-700/60 text-emerald-200 rounded-xl text-xs font-bold transition-all flex items-center justify-between border border-emerald-500/30 cursor-pointer"
                  >
                    <span>Consultar IBAN & Quotas</span>
                    <ArrowRight size={13} className="text-emerald-300" />
                  </Link>
                </div>
              )}

              {/* Secções de Acessos Restantes — mesmos 4 grupos da sidebar desktop */}
              <div className="mt-4 space-y-4">
                <DrawerSection
                  label="Geral"
                  items={paraGaveta(secaoGeral)}
                  pathname={location.pathname}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
                <DrawerSection
                  label="Gestão da Equipa"
                  items={paraGaveta(secaoGestaoEquipa)}
                  pathname={location.pathname}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
                <DrawerSection
                  label="Administração & Clube"
                  items={paraGaveta(secaoAdminClube)}
                  gold
                  pathname={location.pathname}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
                <DrawerSection
                  label="Comunicação"
                  items={paraGaveta(secaoComunicacao)}
                  pathname={location.pathname}
                  onNavigate={() => setIsMobileMenuOpen(false)}
                />
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
      <aside className="bg-csc-dark text-white w-64 flex-shrink-0 flex-col justify-between hidden md:flex border-r-2 border-csc-light/20">
        <div className="bg-white p-6 border-b-4 border-csc-gold">
          <img src="/csc-vet/logo-clube-horizontal.svg" alt="Logo" className="h-16 w-full object-contain" />
        </div>
        
        <div className="p-6 pt-6 flex-1">
          {profile && (
            <div className="space-y-3 mb-5">
              {/* Card de Perfil Sidebar */}
              <div className="bg-black/30 p-3.5 rounded-2xl border border-csc-light/30">
                <div className="flex items-center space-x-3">
                  {profile.photo_url ? (
                    <img src={profile.photo_url} alt="Profile" className="w-10 h-10 rounded-xl object-cover border border-csc-gold" />
                  ) : (
                    <div className="w-10 h-10 rounded-xl bg-csc-light flex items-center justify-center font-bold text-white">
                      {profile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden flex-1">
                    <p className="font-bold truncate text-xs text-white">{profile.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <button
                        type="button"
                        onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
                        className={canSwitchRoles ? 'cursor-pointer active:scale-95' : ''}
                        title={canSwitchRoles ? "Clique para alternar entre os seus perfis" : undefined}
                      >
                        <RoleChip role={profile.role} size="sm" className={canSwitchRoles ? 'pr-1' : ''} />
                        {canSwitchRoles && <ChevronDown size={10} className="inline ml-0.5 opacity-70" />}
                      </button>
                    </div>
                  </div>
                </div>

                <Link
                  to="/settings"
                  className="mt-2.5 w-full py-1.5 px-3 bg-csc-gold hover:bg-yellow-400 text-csc-dark rounded-xl text-[11px] font-black transition-all flex items-center justify-between shadow-xs cursor-pointer active:scale-95"
                >
                  <span>Editar Ficha / Perfil</span>
                  <ArrowRight size={12} className="text-csc-dark" />
                </Link>
              </div>

              {/* Card Quotas Sidebar (Apenas para Jogador) */}
              {isPlayer && (
                <div className="bg-black/20 p-2.5 rounded-xl border border-csc-light/20 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Landmark size={13} className="text-emerald-400" />
                    <span className="text-[11px] font-bold text-gray-200">Quotas</span>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[9.5px] font-black px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    Regularizadas
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Navegação Desktop Estruturada — mesmos 4 grupos da gaveta mobile */}
          <nav className="space-y-4 overflow-y-auto pr-1">
            <SidebarSection label="Geral" items={secaoGeral} pathname={location.pathname} />
            <SidebarSection label="Gestão da Equipa" items={secaoGestaoEquipa} pathname={location.pathname} />
            <SidebarSection label="Administração & Clube" items={secaoAdminClube} gold pathname={location.pathname} />
            <SidebarSection label="Comunicação" items={secaoComunicacao} pathname={location.pathname} />

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
            {/* Toggle Clínico no Canto Superior: Apto / Lesionado */}
            {profile && (
              <button type="button" onClick={() => toggleClinicalStatus()} className="cursor-pointer active:scale-95" title="Clique para alternar o seu estado entre Apto e Lesionado">
                <ClinicalStatusChip status={profile.status} />
              </button>
            )}

            {/* Pílula de Cargo */}
            <button
              type="button"
              onClick={() => canSwitchRoles && setIsRoleModalOpen(true)}
              className={canSwitchRoles ? 'cursor-pointer active:scale-95' : ''}
            >
              <RoleChip role={profile?.role ?? 'player'} className={canSwitchRoles ? 'pr-1.5' : ''} />
              {canSwitchRoles && <ChevronDown size={13} className="inline ml-0.5 opacity-70" />}
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

        <main className="flex-1 p-4 md:p-8 max-w-lg md:max-w-7xl mx-auto w-full pb-[calc(6rem+env(safe-area-inset-bottom,0px))] md:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile Bottom Navigation: "Sacos" dos Jogadores/Treinadores + Menu dos Traços (☰) no Rodapé */}
      <nav
        aria-label="Navegação principal"
        className="fixed bottom-0 left-0 right-0 bg-csc-dark border-t-2 border-csc-light/20 px-1 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] flex justify-around items-center md:hidden z-40 shadow-2xl"
      >
        {/* 1. Home */}
        <Link 
          to="/" 
          onClick={() => triggerHaptic('selection')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all
            ${location.pathname === '/' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Home size={19} />
          <span className="text-[10px] font-bold mt-0.5">Home</span>
        </Link>

        {/* 2. Agenda */}
        <Link 
          to="/calendar" 
          onClick={() => triggerHaptic('selection')}
          className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all
            ${location.pathname === '/calendar' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Calendar size={19} />
          <span className="text-[10px] font-bold mt-0.5">Agenda</span>
        </Link>

        {/* 3. Fichas de Jogo (Apenas Jogador — dá-lhe as mesmas 5 posições que Treinador/Admin têm) */}
        {isPlayer && (
          <Link
            to="/match-reports"
            onClick={() => triggerHaptic('selection')}
            className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all
              ${location.pathname === '/match-reports' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <ClipboardList size={19} />
            <span className="text-[10px] font-bold mt-0.5">Fichas</span>
          </Link>
        )}

        {/* 4. Ação do Saco: "Criar Evento" (se Coach/Admin) OU "Estatísticas" (se Jogador) */}
        {(isAdmin || isCoach) ? (
          <Link 
            to="/events" 
            onClick={() => triggerHaptic('selection')}
            className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all
              ${location.pathname === '/events' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <PlusCircle size={19} />
            <span className="text-[10px] font-bold mt-0.5">Gestão</span>
          </Link>
        ) : (
          <Link 
            to="/stats" 
            onClick={() => triggerHaptic('selection')}
            className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all
              ${location.pathname === '/stats' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <BarChart3 size={19} />
            <span className="text-[10px] font-bold mt-0.5">Stats</span>
          </Link>
        )}

        {/* 5. Plantel (Apenas para Treinadores/Admins) */}
        {(isAdmin || isCoach) && (
          <Link 
            to="/team-management" 
            onClick={() => triggerHaptic('selection')}
            className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all
              ${location.pathname === '/team-management' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <Users size={19} />
            <span className="text-[10px] font-bold mt-0.5">Plantel</span>
          </Link>
        )}

        {/* 6. Menu dos Traços (☰ Menu) */}
        <button
          onClick={() => {
            triggerHaptic('selection')
            setIsMobileMenuOpen(true)
          }}
          className={`flex flex-col items-center justify-center flex-1 min-h-[44px] py-1 rounded-xl transition-all ${
            isMobileMenuOpen ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <Menu size={19} />
          <span className="text-[10px] font-bold mt-0.5">Menu</span>
        </button>
      </nav>

      {/* Modal de Alternância de Papel / Role Switcher */}
      {isRoleModalOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in"
          onMouseDown={e => { if (e.target === e.currentTarget) setIsRoleModalOpen(false) }}
        >
          <div
            ref={perfilRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={perfilTituloId}
            tabIndex={-1}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative animate-scale-up border border-gray-100 outline-none"
          >
            <button
              type="button"
              onClick={() => setIsRoleModalOpen(false)}
              aria-label="Fechar"
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2.5 mb-2">
              <div className="p-2.5 bg-csc-gold/20 rounded-xl text-csc-dark">
                <Sparkles size={22} className="text-csc-dark" />
              </div>
              <div>
                <h3 id={perfilTituloId} className="text-lg font-black text-gray-900">Alternar Perfil de Acesso</h3>
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
<RoleAvatar role="admin" />
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
<RoleAvatar role="coach" />
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
<RoleAvatar role="player" />
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
