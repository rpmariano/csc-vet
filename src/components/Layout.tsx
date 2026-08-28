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
  Shield
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const Layout: React.FC = () => {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isRole = (roles: string[]) => {
    return profile && roles.includes(profile.role)
  }

  const isAdmin = profile?.role === 'admin'
  const isCoach = profile?.role === 'coach'

  const desktopMenuItems = [
    { name: 'Home', path: '/', icon: Home, roles: ['player', 'coach', 'admin'] },
    { name: 'Agenda', path: '/calendar', icon: Calendar, roles: ['player', 'coach', 'admin'] },
    { name: 'Estatísticas', path: '/stats', icon: BarChart3, roles: ['player', 'coach', 'admin'] },
    { name: 'Comunicados', path: '/announcements', icon: FileText, roles: ['coach', 'admin'] },
    { name: 'Criar Eventos', path: '/events', icon: PlusCircle, roles: ['coach', 'admin'] },
    { name: 'Backoffice', path: '/admin', icon: Shield, roles: ['coach', 'admin'] },
    { name: 'Gestão Plantel', path: '/team-management', icon: Users, roles: ['coach', 'admin'] },
    { name: 'Financeiro', path: '/finance', icon: Landmark, roles: ['admin'] },
    { name: 'Definições', path: '/settings', icon: Settings, roles: ['player', 'coach', 'admin'] },
  ]

  const filteredDesktopMenu = desktopMenuItems.filter(item => isRole(item.roles))

  return (
    <div className="min-h-screen bg-gray-150 flex flex-col md:flex-row">
      {/* Mobile Header (Limpo e elegante) */}
      <header className="bg-white text-csc-dark flex items-center justify-between px-4 py-2.5 md:hidden border-b-4 border-csc-gold shadow-sm sticky top-0 z-30">
        <Link to="/" className="flex items-center gap-2">
          <img src="/csc-vet/logo-clube-horizontal.svg" alt="Logo" className="h-10 object-contain" />
        </Link>
        
        <div className="flex items-center gap-2">
          {/* Badge de Cargo */}
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded font-black text-white ${
            isAdmin ? 'bg-csc-gold text-csc-dark' : isCoach ? 'bg-blue-600' : 'bg-csc-dark'
          }`}>
            {isAdmin ? 'Admin' : isCoach ? 'Treinador' : 'Jogador'}
          </span>
          {profile?.photo_url ? (
            <img src={profile.photo_url} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-csc-gold" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-csc-dark text-white text-xs flex items-center justify-center font-bold">
              {profile?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
          )}
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
                    <span className="text-[10px] bg-csc-gold text-csc-dark font-black px-1.5 py-0.5 rounded capitalize">
                      {isAdmin ? 'Administrador' : isCoach ? 'Treinador' : 'Jogador'}
                    </span>
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

                {/* 2. Informação & Comunicação */}
                <div>
                  <p className="text-[10px] uppercase font-black text-gray-400 tracking-wider mb-1.5 px-2">
                    Informação & Desporto
                  </p>
                  <div className="space-y-1">
                    {(isAdmin || isCoach) && (
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
                    )}

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
      <aside className="bg-csc-dark text-white w-64 flex-shrink-0 flex-col justify-between hidden md:flex border-r-2 border-csc-light/20">
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
                <span className="text-[10px] bg-csc-light px-2 py-0.5 rounded capitalize font-bold">
                  {profile.role === 'admin' ? 'Administrador' : profile.role === 'coach' ? 'Treinador' : 'Jogador'}
                </span>
              </div>
            </div>
          )}

          <nav className="space-y-1">
            {filteredDesktopMenu.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`
                    flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors font-bold text-sm
                    ${isActive ? 'bg-csc-light text-white shadow-md' : 'text-gray-300 hover:bg-csc-light/40 hover:text-white'}
                  `}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </Link>
              )
            })}
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
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-lg md:max-w-7xl mx-auto w-full pb-24 md:pb-8">
        <Outlet />
      </main>

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

        {/* 4. Plantel */}
        <Link 
          to="/team-management" 
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
            ${location.pathname === '/team-management' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Users size={19} />
          <span className="text-[9px] font-bold mt-0.5">Plantel</span>
        </Link>

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
    </div>
  )
}

export default Layout
