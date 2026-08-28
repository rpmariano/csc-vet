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
  Menu,
  X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const Layout: React.FC = () => {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

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
    <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      {/* Mobile Navbar */}
      <div className="bg-blue-900 text-white flex items-center justify-between p-4 md:hidden">
        <h1 className="text-xl font-bold tracking-wider">VETERANOS F.C.</h1>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-1 focus:outline-none">
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={`
        bg-blue-900 text-white w-full md:w-64 flex-shrink-0 flex flex-col justify-between
        ${mobileMenuOpen ? 'block' : 'hidden'} md:block
      `}>
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-wider hidden md:block border-b border-blue-800 pb-4 mb-6">
            VETERANOS F.C.
          </h1>
          
          {profile && (
            <div className="flex items-center space-x-3 mb-6 bg-blue-950 p-3 rounded-lg">
              {profile.photo_url ? (
                <img src={profile.photo_url} alt="Profile" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center font-bold">
                  {profile.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="font-semibold truncate">{profile.name}</p>
                <span className="text-xs bg-blue-800 px-2 py-0.5 rounded capitalize">
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
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors
                    ${isActive ? 'bg-blue-800 text-white' : 'text-blue-200 hover:bg-blue-850 hover:text-white'}
                  `}
                >
                  <Icon size={20} />
                  <span className="font-medium">{item.name}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="p-6 border-t border-blue-800">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-red-300 hover:bg-blue-800 hover:text-red-100 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair da Conta</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
