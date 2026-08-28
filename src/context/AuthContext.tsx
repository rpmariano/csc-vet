import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export type UserRole = 'player' | 'coach' | 'admin'
export type ProfileStatus = 'active' | 'inactive' | 'injured'

export interface Profile {
  id: string
  name: string
  nickname?: string | null
  email: string
  phone?: string | null
  photo_url?: string | null
  role: UserRole
  status: ProfileStatus
  jersey_number?: number | null
  birth_date?: string | null
  nationality?: string | null
  position?: string | null
  id_number?: string | null
  member_number?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  medical_notes?: string | null
  id_document_url?: string | null
  insurance_doc_url?: string | null
  medical_exam_doc_url?: string | null
  created_at?: string
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  actualRole: UserRole | null
  isSimulatingRole: boolean
  setSimulatedRole: (role: UserRole | null) => void
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [actualProfile, setActualProfile] = useState<Profile | null>(null)
  const [simulatedRole, setSimulatedRoleState] = useState<UserRole | null>(() => {
    return (localStorage.getItem('csc_simulated_role') as UserRole) || null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 1. Get current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // 2. Listen to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const currentUser = session?.user ?? null
        setUser(currentUser)
        
        if (currentUser) {
          await fetchProfile(currentUser.id)
        } else {
          setActualProfile(null)
          setLoading(false)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Erro ao obter perfil:', error)
      } else if (data) {
        setActualProfile(data as Profile)
      }
    } catch (err) {
      console.error('Erro de rede ao obter perfil:', err)
    } finally {
      setLoading(false)
    }
  }

  const setSimulatedRole = (role: UserRole | null) => {
    if (actualProfile?.role !== 'admin') return

    if (role && role !== 'admin') {
      localStorage.setItem('csc_simulated_role', role)
      setSimulatedRoleState(role)
    } else {
      localStorage.removeItem('csc_simulated_role')
      setSimulatedRoleState(null)
    }
  }

  const signOut = async () => {
    setLoading(true)
    localStorage.removeItem('csc_simulated_role')
    setSimulatedRoleState(null)
    await supabase.auth.signOut()
    setUser(null)
    setActualProfile(null)
    setLoading(false)
  }

  const actualRole = actualProfile?.role ?? null
  const isSimulatingRole = actualRole === 'admin' && simulatedRole !== null && simulatedRole !== 'admin'

  const effectiveProfile: Profile | null = actualProfile
    ? {
        ...actualProfile,
        role: isSimulatingRole && simulatedRole ? simulatedRole : actualProfile.role
      }
    : null

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile: effectiveProfile, 
      actualRole, 
      isSimulatingRole, 
      setSimulatedRole, 
      loading, 
      signOut 
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider')
  }
  return context
}
