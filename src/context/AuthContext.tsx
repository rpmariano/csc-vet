import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { INITIAL_PLAYERS_DATA } from '../data/initialPlayers'

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

export const formatDisplayName = (name: string, _shirtName?: string | null): string => {
  if (!name) return ''
  return name.trim()
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
  toggleClinicalStatus: (overrideStatus?: 'active' | 'injured') => Promise<ProfileStatus | undefined>
  refreshProfile: () => Promise<void>
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
        fetchProfile(session.user.id, session.user.email, session.user.phone, session.user)
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
          await fetchProfile(currentUser.id, currentUser.email, currentUser.phone, currentUser)
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

  const fetchProfile = async (
    userId: string, 
    userEmail?: string | null, 
    userPhone?: string | null, 
    currentUser?: User | null
  ) => {
    try {
      // 1. Procurar perfil pelo ID do utilizador (auth.uid)
      let { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      // 2. Se temos o email do utilizador autenticado, procurar ficha de atleta existente no plantel (DB ou Seed)
      if (userEmail) {
        const cleanEmail = userEmail.trim().toLowerCase()

        // A. Procurar ficha no Supabase com este email (mas com ID diferente/antigo)
        const { data: matchByEmail } = await supabase
          .from('profiles')
          .select('*')
          .ilike('email', cleanEmail)
          .neq('id', userId)
          .maybeSingle()

        // B. Se não estiver no Supabase, procurar na lista de sementes (INITIAL_PLAYERS_DATA)
        const seedMatch = !matchByEmail 
          ? INITIAL_PLAYERS_DATA.find(p => p.email && p.email.toLowerCase().trim() === cleanEmail)
          : null

        const targetCard = matchByEmail || seedMatch

        if (targetCard) {
          const oldId = matchByEmail?.id

          // PRESERVAR 100% dos dados da ficha de atleta (nome, número, posição, alcunha, camisola, notas, foto do atleta)
          // NUNCA substituir o nome ou a foto do atleta pelos metadados do Google
          const athletePhoto = targetCard.photo_url || data?.photo_url || null
          const googleAvatar = currentUser?.user_metadata?.avatar_url || currentUser?.user_metadata?.picture

          const mergedData: Partial<Profile> = {
            ...targetCard,
            id: userId,
            email: cleanEmail,
            name: targetCard.name, // MANTER O NOME DO ATLETA (ex: Bruno Raul / Tochê)
            shirt_name: targetCard.shirt_name || targetCard.nickname || null,
            nickname: targetCard.nickname || null,
            photo_url: athletePhoto || googleAvatar || null, // Preservar foto do atleta se existir
          }

          if (data) {
            // Atualizar o perfil do utilizador na BD com os dados completos do atleta
            const { data: updated } = await supabase
              .from('profiles')
              .update(mergedData)
              .eq('id', userId)
              .select()
              .single()
            if (updated) data = updated
          } else {
            // Criar o registo com o ID do auth contendo os dados do atleta
            const { data: inserted } = await supabase
              .from('profiles')
              .insert([mergedData])
              .select()
              .single()
            if (inserted) data = inserted
          }

          // Se existia um registo separado anterior no Supabase, migrar referências e eliminar placeholder
          if (oldId) {
            await Promise.allSettled([
              supabase.from('callups').update({ player_id: userId }).eq('player_id', oldId),
              supabase.from('dues').update({ player_id: userId }).eq('player_id', oldId),
              supabase.from('stats').update({ player_id: userId }).eq('player_id', oldId),
              supabase.from('profiles').delete().eq('id', oldId)
            ])
          }
        }
      }

      // 3. Se ainda não existir perfil (nem no DB nem associado a atleta), criar novo membro base
      if (!data) {
        const googleName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name
        const googleAvatar = currentUser?.user_metadata?.avatar_url || currentUser?.user_metadata?.picture

        const newProfile: Partial<Profile> = {
          id: userId,
          name: googleName || (userEmail ? userEmail.split('@')[0] : 'Novo Atleta'),
          email: userEmail ? userEmail.trim().toLowerCase() : '',
          phone: userPhone || null,
          photo_url: googleAvatar || null,
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

  const toggleClinicalStatus = async (overrideStatus?: 'active' | 'injured') => {
    if (!actualProfile) return
    const currentStatus = actualProfile.status
    const newStatus: ProfileStatus = overrideStatus || (currentStatus === 'injured' ? 'active' : 'injured')

    try {
      // 1. Atualizar perfil no Supabase
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', actualProfile.id)

      if (error) throw error

      // 2. Sincronizar convocatórias de treinos futuros
      const nowIso = new Date().toISOString()
      const { data: upcomingPractices } = await supabase
        .from('events')
        .select('id')
        .eq('type', 'practice')
        .gte('date_time', nowIso)

      if (upcomingPractices && upcomingPractices.length > 0) {
        const practiceIds = upcomingPractices.map(p => p.id)
        if (newStatus === 'active') {
          const { data: existingCallups } = await supabase
            .from('callups')
            .select('event_id')
            .eq('player_id', actualProfile.id)
            .in('event_id', practiceIds)

          const alreadyCalledEventIds = new Set((existingCallups || []).map(c => c.event_id))
          const toCallEventIds = practiceIds.filter(id => !alreadyCalledEventIds.has(id))

          if (toCallEventIds.length > 0) {
            const insertPayload = toCallEventIds.map(eventId => ({
              event_id: eventId,
              player_id: actualProfile.id,
              status: 'called'
            }))
            await supabase.from('callups').insert(insertPayload)
          }
        } else if (newStatus === 'injured') {
          await supabase
            .from('callups')
            .delete()
            .eq('player_id', actualProfile.id)
            .in('event_id', practiceIds)
        }
      }

      // 3. Atualizar estado local
      setActualProfile(prev => prev ? { ...prev, status: newStatus } : null)
      return newStatus
    } catch (err) {
      console.error('Erro ao alternar estado clínico:', err)
      throw err
    }
  }

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id, user.email, user.phone)
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
      toggleClinicalStatus,
      refreshProfile,
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
