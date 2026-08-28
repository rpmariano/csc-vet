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
  MoreHorizontal
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const Layout: React.FC = () => {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const isRole = (roles: string[]) => {
    return profile && roles.includes(profile.role)
  }

  const menuItems = [
    { name: 'Home', path: '/', icon: Home, roles: ['player', 'coach', 'admin'] },
    { name: 'Agenda', path: '/calendar', icon: Calendar, roles: ['player', 'coach', 'admin'] },
    { name: 'Estatísticas', path: '/stats', icon: BarChart3, roles: ['player', 'coach', 'admin'] },
    { name: 'Comunicados', path: '/announcements', icon: FileText, roles: ['coach', 'admin'] },
    { name: 'Criar Eventos', path: '/events', icon: PlusCircle, roles: ['coach', 'admin'] },
    { name: 'Administrador', path: '/admin', icon: Shield, roles: ['coach', 'admin'] },
    { name: 'Gestão Plantel', path: '/team-management', icon: Users, roles: ['coach', 'admin'] },
    { name: 'Financeiro', path: '/finance', icon: Landmark, roles: ['admin'] },
    { name: 'Definições', path: '/settings', icon: Settings, roles: ['player', 'coach', 'admin'] },
  ]

  const filteredMenu = menuItems.filter(item => isRole(item.roles))

  const isAdmin = profile?.role === 'admin'
  const isCoach = profile?.role === 'coach'

  return (
    <div className="min-h-screen bg-gray-150 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <header className="bg-white text-csc-dark flex items-center justify-between px-3 py-2.5 md:hidden border-b-4 border-csc-gold shadow-sm sticky top-0 z-30">
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

          {/* Atalho direto para Admin/Backoffice se for admin ou coach */}
          {(isAdmin || isCoach) && (
            <Link 
              to="/admin" 
              className={`p-1.5 rounded-lg border transition-colors ${
                location.pathname === '/admin' ? 'bg-csc-dark text-csc-gold border-csc-dark' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
              }`}
              title="Painel Administrador"
            >
              <Shield size={18} />
            </Link>
          )}

          {/* Botão Hambúrguer para abrir Gaveta / Menu Completo */}
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-1.5 rounded-lg bg-gray-50 text-gray-800 border border-gray-200 hover:bg-gray-100 transition-colors"
            title="Menu Completo"
          >
            <Menu size={20} />
          </button>
        </div>
      </header>

      {/* Mobile Drawer (Menu Lateral Deslizante) */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Overlay escuro de fundo */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Painel da Gaveta */}
          <div className="relative w-4/5 max-w-xs bg-csc-dark text-white h-full flex flex-col justify-between p-5 z-10 shadow-2xl animate-slide-in">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-csc-light/30">
                <img src="/csc-vet/logo-clube-horizontal.svg" alt="Logo" className="h-10 bg-white p-1 rounded object-contain" />
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Info do Utilizador */}
              {profile && (
                <div className="mt-4 p-3 bg-black/30 rounded-xl border border-csc-light/30 flex items-center space-x-3">
                  {profile.photo_url ? (
                    <img src={profile.photo_url} alt="Profile" className="w-10 h-10 rounded-full object-cover border border-csc-gold" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-csc-light text-white flex items-center justify-center font-bold">
                      {profile.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="overflow-hidden">
                    <p className="font-bold text-sm truncate text-white">{profile.name}</p>
                    <span className="text-[10px] bg-csc-light px-2 py-0.5 rounded capitalize font-bold text-white">
                      {profile.role === 'admin' ? 'Administrador' : profile.role === 'coach' ? 'Treinador' : 'Jogador'}
                    </span>
                  </div>
                </div>
              )}

              {/* Lista Completa de Navegação Mobile */}
              <nav className="mt-5 space-y-1.5 overflow-y-auto max-h-[calc(100vh-280px)]">
                {filteredMenu.map((item) => {
                  const Icon = item.icon
                  const isActive = location.pathname === item.path
                  return (
                    <Link
                      key={item.name}
                      to={item.path}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`
                        flex items-center space-x-3 px-3.5 py-2.5 rounded-xl font-bold text-sm transition-colors
                        ${isActive ? 'bg-csc-gold text-csc-dark shadow-md' : 'text-gray-200 hover:bg-csc-light/30 hover:text-white'}
                      `}
                    >
                      <Icon size={18} />
                      <span>{item.name}</span>
                    </Link>
                  )
                })}
              </nav>
            </div>

            {/* Logout no fundo do menu */}
            <div className="pt-4 border-t border-csc-light/30">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  signOut()
                }}
                className="w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-red-300 hover:bg-red-900/40 hover:text-red-200 transition-colors font-bold text-sm"
              >
                <LogOut size={18} />
                <span>Sair da Conta</span>
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
            {filteredMenu.map((item) => {
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

      {/* Mobile Bottom Navigation Adaptativa com Botão Admin Direto */}
      <div className="fixed bottom-0 left-0 right-0 bg-csc-dark border-t-2 border-csc-light/20 px-1 py-1.5 flex justify-around items-center md:hidden z-40 shadow-lg">
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

        {/* 3. Plantel / Gestão Equipa */}
        <Link 
          to="/team-management" 
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
            ${location.pathname === '/team-management' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Users size={19} />
          <span className="text-[9px] font-bold mt-0.5">Plantel</span>
        </Link>

        {/* 4. Botão Administrador / Backoffice Direto para Admin e Treinador */}
        {(isAdmin || isCoach) ? (
          <Link 
            to="/admin" 
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all
              ${location.pathname === '/admin' ? 'text-csc-gold bg-csc-light/30 shadow-sm font-black' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <Shield size={19} />
            <span className="text-[9px] font-bold mt-0.5">Admin</span>
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

        {/* 5. Botão "Mais" (Abre Drawer com todas as outras opções) */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all text-gray-400 hover:text-gray-200`}
        >
          <MoreHorizontal size={19} />
          <span className="text-[9px] font-bold mt-0.5">Mais</span>
        </button>
      </div>
    </div>
  )
}

export default Layout
