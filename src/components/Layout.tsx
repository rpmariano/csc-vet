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
  Landmark
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
    { name: 'Calendário', path: '/calendar', icon: Calendar, roles: ['player', 'coach', 'admin'] },
    { name: 'Estatísticas', path: '/stats', icon: BarChart3, roles: ['player', 'coach', 'admin'] },
    { name: 'Comunicados', path: '/announcements', icon: FileText, roles: ['coach', 'admin'] },
    { name: 'Gestão Equipa', path: '/team-management', icon: Users, roles: ['admin'] },
    { name: 'Financeiro', path: '/finance', icon: Landmark, roles: ['admin'] },
    { name: 'Definições', path: '/settings', icon: Settings, roles: ['player', 'coach', 'admin'] },
  ]

  const filteredMenu = menuItems.filter(item => isRole(item.roles))

  return (
    <div className="min-h-screen bg-gray-150 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="bg-blue-900 text-white flex items-center justify-between p-4 md:hidden border-b-2 border-gray-800">
        <h1 className="text-xl font-black tracking-wider">VETERANOS F.C.</h1>
        <span className="text-xs bg-blue-800 px-2 py-0.5 rounded capitalize">
          {profile?.role === 'admin' ? 'Admin' : profile?.role === 'coach' ? 'Treinador' : 'Jogador'}
        </span>
      </div>

      {/* Desktop Sidebar Navigation */}
      <aside className="bg-blue-900 text-white w-64 flex-shrink-0 flex-col justify-between hidden md:flex border-r-2 border-gray-800">
        <div className="p-6">
          <h1 className="text-2xl font-black tracking-wider border-b border-blue-800 pb-4 mb-6">
            VETERANOS F.C.
          </h1>
          
          {profile && (
            <div className="flex items-center space-x-3 mb-6 bg-blue-950 p-3 rounded-xl border border-blue-800">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center font-bold">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="font-semibold truncate text-sm">{profile.name}</p>
                <span className="text-[10px] bg-blue-800 px-2 py-0.5 rounded capitalize font-bold">
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
                    ${isActive ? 'bg-blue-800 text-white border-2 border-gray-800' : 'text-blue-200 hover:bg-blue-850 hover:text-white'}
                  `}
                >
                  <Icon size={18} />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="p-6 border-t border-blue-800">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-red-300 hover:bg-blue-800 hover:text-red-150 transition-colors font-bold text-sm"
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

      {/* Mobile Bottom Navigation (Matching Wireframe) */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-gray-800 p-3 flex justify-around items-center md:hidden z-40 shadow-lg">
        <Link 
          to="/" 
          className={`w-10 h-10 border-2 rounded-xl flex items-center justify-center font-bold text-lg transition-all
            ${location.pathname === '/' ? 'border-green-600 bg-green-100 text-green-800 shadow-sm' : 'border-green-500 text-green-700 hover:bg-green-50'}
          `}
        >
          A
        </Link>
        <Link 
          to="/stats" 
          className={`w-10 h-10 border-2 rounded-xl flex items-center justify-center font-bold text-lg transition-all
            ${location.pathname === '/stats' ? 'border-green-600 bg-green-100 text-green-800 shadow-sm' : 'border-green-500 text-green-700 hover:bg-green-50'}
          `}
        >
          D
        </Link>
        <Link 
          to={profile?.role === 'admin' ? '/finance' : '/settings'} 
          className={`w-10 h-10 border-2 rounded-xl flex items-center justify-center font-bold text-lg transition-all
            ${location.pathname === '/finance' ? 'border-green-600 bg-green-100 text-green-800 shadow-sm' : 'border-green-500 text-green-700 hover:bg-green-50'}
          `}
        >
          Q
        </Link>
        <Link 
          to="/calendar" 
          className={`w-10 h-10 border-2 rounded-xl flex items-center justify-center font-bold text-lg transition-all
            ${location.pathname === '/calendar' ? 'border-green-600 bg-green-100 text-green-800 shadow-sm' : 'border-green-500 text-green-700 hover:bg-green-50'}
          `}
        >
          E
        </Link>
        <Link 
          to={profile?.role === 'admin' || profile?.role === 'coach' ? '/announcements' : '/'} 
          className={`w-10 h-10 border-2 rounded-xl flex items-center justify-center font-bold text-lg transition-all
            ${location.pathname === '/announcements' ? 'border-green-600 bg-green-100 text-green-800 shadow-sm' : 'border-green-500 text-green-700 hover:bg-green-50'}
          `}
        >
          C
        </Link>
        <Link 
          to="/settings" 
          className={`px-2 h-10 border-2 rounded-xl flex items-center justify-center font-bold text-xs transition-all
            ${location.pathname === '/settings' ? 'border-green-600 bg-green-100 text-green-800 shadow-sm' : 'border-green-500 text-green-700 hover:bg-green-50'}
          `}
        >
          Perfil
        </Link>
      </div>
    </div>
  )
}

export default Layout
