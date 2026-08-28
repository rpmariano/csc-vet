import React from 'react'
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
  PlusCircle
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const Layout: React.FC = () => {
  const { profile, signOut } = useAuth()
  const location = useLocation()

  const isRole = (roles: string[]) => {

    return profile && roles.includes(profile.role)
  }

  const menuItems = [
    { name: 'Home', path: '/', icon: Home, roles: ['player', 'coach', 'admin'] },
    { name: 'Agenda', path: '/calendar', icon: Calendar, roles: ['player', 'coach', 'admin'] },
    { name: 'Estatísticas', path: '/stats', icon: BarChart3, roles: ['player', 'coach', 'admin'] },
    { name: 'Comunicados', path: '/announcements', icon: FileText, roles: ['coach', 'admin'] },
    { name: 'Criar Eventos', path: '/events', icon: PlusCircle, roles: ['coach', 'admin'] },
    { name: 'Backoffice', path: '/admin', icon: Settings, roles: ['coach', 'admin'] },
    { name: 'Gestão Equipa', path: '/team-management', icon: Users, roles: ['admin'] },
    { name: 'Financeiro', path: '/finance', icon: Landmark, roles: ['admin'] },
    { name: 'Definições', path: '/settings', icon: Settings, roles: ['player', 'coach', 'admin'] },
  ]

  const filteredMenu = menuItems.filter(item => isRole(item.roles))

  return (
    <div className="min-h-screen bg-gray-150 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="bg-white text-csc-dark flex items-center justify-between p-3 md:hidden border-b-4 border-csc-gold shadow-sm">
        <img src="/csc-vet/logo-clube-horizontal.svg" alt="Logo" className="h-12 object-contain" />
        <div className="flex items-center gap-3">
          <Link to="/settings" className="text-csc-dark hover:text-csc-light transition-colors" title="Definições">
            <Settings size={20} />
          </Link>
          <span className="text-xs bg-csc-dark text-white px-2 py-0.5 rounded capitalize font-bold">
            {profile?.role === 'admin' ? 'Admin' : profile?.role === 'coach' ? 'Treinador' : 'Jogador'}
          </span>
        </div>
      </div>

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

      {/* Mobile Bottom Navigation (Home, Agenda, Dashboards, Quotas, Contactos, Eventos) */}
      <div className="fixed bottom-0 left-0 right-0 bg-csc-dark border-t-2 border-csc-light/20 px-1 py-2 flex justify-around items-center md:hidden z-40 shadow-lg">
        {/* Home */}
        <Link 
          to="/" 
          className={`flex flex-col items-center justify-center w-12 py-1 rounded-xl transition-all
            ${location.pathname === '/' ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Home size={20} />
          <span className="text-[9px] font-bold mt-0.5">Home</span>
        </Link>

        {/* Agenda */}
        <Link 
          to="/calendar" 
          className={`flex flex-col items-center justify-center w-12 py-1 rounded-xl transition-all
            ${location.pathname === '/calendar' ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Calendar size={20} />
          <span className="text-[9px] font-bold mt-0.5">Agenda</span>
        </Link>

        {/* Dashboards */}
        <Link 
          to="/stats" 
          className={`flex flex-col items-center justify-center w-12 py-1 rounded-xl transition-all
            ${location.pathname === '/stats' ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <BarChart3 size={20} />
          <span className="text-[9px] font-bold mt-0.5">Dashboards</span>
        </Link>

        {/* Quotas */}
        <Link 
          to={profile?.role === 'admin' ? '/finance' : '/settings'} 
          className={`flex flex-col items-center justify-center w-12 py-1 rounded-xl transition-all
            ${location.pathname === '/finance' ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Landmark size={20} />
          <span className="text-[9px] font-bold mt-0.5">Quotas</span>
        </Link>

        {/* Contactos */}
        <Link 
          to="/team-management" 
          className={`flex flex-col items-center justify-center w-12 py-1 rounded-xl transition-all
            ${location.pathname === '/team-management' ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'}
          `}
        >
          <Users size={20} />
          <span className="text-[9px] font-bold mt-0.5">Contactos</span>
        </Link>

        {/* Eventos (Apenas visível para Treinador e Admin) */}
        {profile && ['coach', 'admin'].includes(profile.role) && (
          <Link 
            to="/events" 
            className={`flex flex-col items-center justify-center w-12 py-1 rounded-xl transition-all
              ${location.pathname === '/events' ? 'text-csc-gold bg-csc-light/30 shadow-sm' : 'text-gray-400 hover:text-gray-200'}
            `}
          >
            <PlusCircle size={20} />
            <span className="text-[9px] font-bold mt-0.5">Eventos</span>
          </Link>
        )}
      </div>
    </div>
  )
}

export default Layout
