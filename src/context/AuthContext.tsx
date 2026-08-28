import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

export type UserRole = 'player' | 'coach' | 'admin'
export type ProfileStatus = 'active' | 'inactive' | 'injured'

export interface Profile {
  id: string
  name: string
  nickname?: string | null
  shirt_name?: string | null
  email: string
  phone?: string | null
  photo_url?: string | null
  role: UserRole
  roles?: UserRole[]
  status: ProfileStatus
  jersey_number?: number | null
  kit_size?: string | null
  birth_date?: string | null
  nationality?: string | null
  position?: string | null
  address?: string | null
  postal_code?: string | null
  city?: string | null
  nif?: string | null
  id_number?: string | null
  id_card_expiry?: string | null
  iban?: string | null
  gdpr_consent?: boolean | null
  member_number?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  medical_notes?: string | null
  id_document_url?: string | null
  insurance_doc_url?: string | null
  medical_exam_doc_url?: string | null
  created_at?: string
}

export const encodeRolesToNotes = (notes: string | null | undefined, roles: UserRole[]): string | null => {
  const clean = (notes || '').replace(/<!--roles:[^>]+-->/g, '').trim()
  const tag = `<!--roles:${roles.join(',')}-->`
  return clean ? `${clean} ${tag}` : tag
}

export const formatDisplayName = (name: string, nickname?: string | null): string => {
  if (!name) return ''
  if (!nickname || !nickname.trim()) return name
  const cleanNick = nickname.trim().replace(/^["']|["']$/g, '')
  const parts = name.trim().split(/\s+/)
  if (parts.length > 1) {
    return `${parts[0]} "${cleanNick}" ${parts.slice(1).join(' ')}`
  }
  return `${parts[0]} "${cleanNick}"`
}

export const cleanNotesFromRolesTag = (notes: string | null | undefined): string | null => {
  if (!notes) return null
  const cleaned = notes.replace(/<!--roles:[^>]+-->/g, '').trim()
  return cleaned || null
}

export const extractRolesFromProfile = (profile: Profile | null | undefined): UserRole[] => {
  if (!profile) return ['player']
  
  // 1. Check if encoded in medical_notes or position
  const source = `${profile.medical_notes || ''} ${profile.position || ''}`
  const match = source.match(/<!--roles:([^>]+)-->/)
  if (match && match[1]) {
    const parsed = match[1]
      .split(',')
      .map(r => r.trim() as UserRole)
      .filter(r => ['player', 'coach', 'admin'].includes(r))
    if (parsed.length > 0) return parsed
  }

  // 2. Fallback to base role
  if (profile.role === 'admin') return ['admin', 'coach', 'player']
  if (profile.role === 'coach') return ['coach', 'player']
  return ['player']
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  assignedRoles: UserRole[]
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
        fetchProfile(session.user.id, session.user.email, session.user.phone)
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
          await fetchProfile(currentUser.id, currentUser.email, currentUser.phone)
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

  const fetchProfile = async (userId: string, userEmail?: string | null, userPhone?: string | null) => {
    try {
      // 1. Procurar perfil pelo ID do utilizador
      let { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      // 2. Se não encontrar pelo ID mas tivermos o email, procurar ficha criada previamente
      if (!data && userEmail) {
        const { data: matchByEmail } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', userEmail)
          .maybeSingle()

        if (matchByEmail) {
          const oldId = matchByEmail.id
          // Migrar os dados para o novo ID do auth
          const { error: updateErr } = await supabase
            .from('profiles')
            .update({ id: userId })
            .eq('id', oldId)

          if (!updateErr) {
            // Atualizar referências de convocatórias e quotas
            await Promise.allSettled([
              supabase.from('callups').update({ player_id: userId }).eq('player_id', oldId),
              supabase.from('dues').update({ player_id: userId }).eq('player_id', oldId)
            ])
            data = { ...matchByEmail, id: userId }
          } else {
            data = matchByEmail
          }
        }
      }

      // 3. Se ainda não existir perfil, criar um registo base
      if (!data) {
        const newProfile: Partial<Profile> = {
          id: userId,
          name: user?.user_metadata?.name || (userEmail ? userEmail.split('@')[0] : 'Novo Atleta'),
          email: userEmail || '',
          phone: userPhone || null,
          role: 'player',
          status: 'active'
        }

        const { data: created, error: createErr } = await supabase
          .from('profiles')
          .insert([newProfile])
          .select()
          .single()

        if (!createErr && created) {
          data = created
        }
      }

      if (data) {
        setActualProfile(data as Profile)
      }
    } catch (err) {
      console.error('Erro ao obter perfil:', err)
    } finally {
      setLoading(false)
    }
  }

  const assignedRoles = extractRolesFromProfile(actualProfile)

  const setSimulatedRole = (role: UserRole | null) => {
    if (!actualProfile) return
    if (role && !assignedRoles.includes(role)) return

    if (role && role !== actualProfile.role) {
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
  const isSimulatingRole = Boolean(simulatedRole && simulatedRole !== actualRole && assignedRoles.includes(simulatedRole))

  const effectiveProfile: Profile | null = actualProfile
    ? {
        ...actualProfile,
        role: isSimulatingRole && simulatedRole ? simulatedRole : actualProfile.role,
        roles: assignedRoles
      }
    : null

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile: effectiveProfile, 
      assignedRoles,
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
