import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ClubProvider } from './context/ClubContext'
import { ToastProvider } from './context/ToastContext'
import { AnnouncementsProvider } from './context/AnnouncementsContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

// Páginas carregadas a pedido.
//
// O bundle era um único ficheiro de ~1 MB: quem abria a Home descarregava também
// a Agenda, os Eventos, o Plantel e o Backoffice. Numa app usada no telemóvel à
// beira do relvado, com rede fraca, isso pesa. Com React.lazy cada rota vem no
// seu próprio pedaço, e o Login — a primeira coisa que qualquer pessoa vê — fica
// no arranque, para não haver um spinner a preceder o ecrã de entrada.
import Login from './pages/Login'

const Home = React.lazy(() => import('./pages/Home'))
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'))
const AnnouncementsPage = React.lazy(() => import('./pages/AnnouncementsPage'))
const TeamManagementPage = React.lazy(() => import('./pages/TeamManagementPage'))
const FinancePage = React.lazy(() => import('./pages/FinancePage'))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'))
const EventsPage = React.lazy(() => import('./pages/EventsPage'))
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'))
const CompeticaoPage = React.lazy(() => import('./pages/CompeticaoPage'))
const ClubePage = React.lazy(() => import('./pages/ClubePage'))

/**
 * As classificações, as fichas de jogo e as estatísticas deixaram de ser três
 * sítios e passaram a ser três separadores da Competição. Os endereços antigos
 * continuam a abrir — há links partilhados no grupo do clube — e trazem a
 * query consigo, para um `?jogo=<id>` continuar a abrir a ficha certa.
 */
const ParaCompeticao: React.FC<{ ver: string }> = ({ ver }) => {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  params.set('ver', ver)
  return <Navigate to={`/competicao?${params.toString()}`} replace />
}

/** Mostrado enquanto o pedaço de código da rota é descarregado. */
const EcraACarregar: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark" />
    <span className="sr-only">A carregar…</span>
  </div>
)

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ClubProvider>
        <ToastProvider>
        <AnnouncementsProvider>
          <Router basename={import.meta.env.BASE_URL}>
          <React.Suspense fallback={<EcraACarregar />}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes (Everyone logged in) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/calendar" element={<CalendarPage />} />
                {/* Competição junta classificações, fichas de jogo e
                    estatísticas em separadores — é o terceiro lugar da barra
                    do jogador. As três páginas mantêm endereço próprio: são
                    ligadas de outros sítios e são o alvo de links partilhados. */}
                <Route path="/competicao" element={<CompeticaoPage />} />
                <Route path="/match-reports" element={<ParaCompeticao ver="fichas" />} />
                <Route path="/stats" element={<ParaCompeticao ver="estatisticas" />} />
                <Route path="/standings" element={<ParaCompeticao ver="classificacoes" />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Coach and Admin Only */}
                <Route element={<ProtectedRoute allowedRoles={['coach', 'admin']} />}>
                  <Route path="/events" element={<EventsPage />} />
                  {/* Comunicados é o ecrã de *gestão*: publicar, editar, apagar.
                      Quem só lê tem-nos na persiana do sino, na Home — que é
                      onde o handoff os põe. Deixá-lo aberto a todos dava uma
                      página sem nenhum link para o jogador. */}
                  <Route path="/announcements" element={<AnnouncementsPage />} />
                  {/* O Clube é a porta de entrada da gestão. O `/admin` fica a
                      servir os torneios, adversários e campos até a fase 6 os
                      trazer para aqui — por isso ainda não é um redirecionamento. */}
                  <Route path="/clube" element={<ClubePage />} />
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/team-management" element={<TeamManagementPage />} />
                </Route>

                {/* Admin Only */}
                <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                  <Route path="/finance" element={<FinancePage />} />
                </Route>
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </React.Suspense>
        </Router>
        </AnnouncementsProvider>
        </ToastProvider>
      </ClubProvider>
    </AuthProvider>
  )
}


export default App
