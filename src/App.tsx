import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
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
const StatsPage = React.lazy(() => import('./pages/StatsPage'))
const AnnouncementsPage = React.lazy(() => import('./pages/AnnouncementsPage'))
const TeamManagementPage = React.lazy(() => import('./pages/TeamManagementPage'))
const FinancePage = React.lazy(() => import('./pages/FinancePage'))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'))
const EventsPage = React.lazy(() => import('./pages/EventsPage'))
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'))
const MatchReportsPage = React.lazy(() => import('./pages/MatchReportsPage'))
const StandingsPage = React.lazy(() =>
  import('./pages/StandingsPage').then(m => ({ default: m.StandingsPage })),
)

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
                <Route path="/match-reports" element={<MatchReportsPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/standings" element={<StandingsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                {/* Comunicados: leitura aberta a todos (a própria página restringe a
                    criação/edição a coach e admin); a RLS já protege a escrita. */}
                <Route path="/announcements" element={<AnnouncementsPage />} />

                {/* Coach and Admin Only */}
                <Route element={<ProtectedRoute allowedRoles={['coach', 'admin']} />}>
                  <Route path="/events" element={<EventsPage />} />
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
