import React from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ClubProvider } from './context/ClubContext'
import { ToastProvider } from './context/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

// Pages
import Login from './pages/Login'
import Home from './pages/Home'
import CalendarPage from './pages/CalendarPage'
import StatsPage from './pages/StatsPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import TeamManagementPage from './pages/TeamManagementPage'
import FinancePage from './pages/FinancePage'
import SettingsPage from './pages/SettingsPage'
import EventsPage from './pages/EventsPage'
import AdminDashboard from './pages/AdminDashboard'

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ClubProvider>
        <ToastProvider>
          <Router basename={import.meta.env.BASE_URL}>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />

            {/* Protected Routes (Everyone logged in) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Coach and Admin Only */}
                <Route element={<ProtectedRoute allowedRoles={['coach', 'admin']} />}>
                  <Route path="/announcements" element={<AnnouncementsPage />} />
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
        </Router>
        </ToastProvider>
      </ClubProvider>
    </AuthProvider>
  )
}


export default App
