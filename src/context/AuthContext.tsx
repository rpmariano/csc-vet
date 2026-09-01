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
  /** Coluna `roles` do Supabase, protegida por RLS. É a fonte de verdade dos papéis. */
  roles?: UserRole[] | null
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
  /** Janela em que o jogador deve pagar quota — ver src/lib/finance.ts. */
  quota_start_date?: string | null
  quota_end_date?: string | null
  created_at?: string
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

const VALID_ROLES: UserRole[] = ['player', 'coach', 'admin']

export const extractRolesFromProfile = (profile: Profile | null | undefined): UserRole[] => {
  if (!profile) return ['player']

  // 1. Coluna `roles` do Supabase — a fonte de verdade. É escrita apenas por
  //    administradores (a RLS impede que cada um altere os seus próprios papéis).
  if (Array.isArray(profile.roles) && profile.roles.length > 0) {
    const fromColumn = profile.roles.filter(r => VALID_ROLES.includes(r))
    if (fromColumn.length > 0) {
      // O papel real tem sempre de constar, mesmo que a coluna esteja incompleta.
      return fromColumn.includes(profile.role) ? fromColumn : [...fromColumn, profile.role]
    }
  }

  // 2. Etiqueta <!--roles:...--> escondida em medical_notes/position: formato
  //    legado, mantido apenas para o intervalo entre este deploy e a migração
  //    supabase_roles_migration.sql. Assim que a migração correr, deixa de ter uso.
  const source = `${profile.medical_notes || ''} ${profile.position || ''}`
  const match = source.match(/<!--roles:([^>]+)-->/)
  if (match && match[1]) {
    const parsed = match[1]
      .split(',')
      .map(r => r.trim() as UserRole)
      .filter(r => VALID_ROLES.includes(r))
    if (parsed.length > 0) return parsed
  }

  // 3. Derivar da coluna `role`
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

      // 2. Se o utilizador ainda não tem dados de atleta, procurar a ficha do
      // plantel que lhe corresponde e reclamá-la.
      //
      // Isto era feito aqui: lia-se a tabela `profiles` inteira à procura do
      // email, copiavam-se os dados no cliente e apagava-se a ficha órfã. Com a
      // RLS fechada o cliente já não lê as fichas dos outros — e ainda bem, que
      // elas têm NIF e IBAN. As duas operações passaram para o servidor:
      // find_my_profile_match (só campos não sensíveis) e associate_my_profile,
      // que faz a cópia, transfere as referências e apaga a ficha numa
      // transação só. Aqui a correspondência é estritamente por email
      // (p_email_only), porque é automática e sem confirmação de ninguém; o
      // modal de associação é que oferece também telefone e nome.
      const jaTemDadosDeAtleta = Boolean(data?.jersey_number || data?.shirt_name)
      if (userEmail && !jaTemDadosDeAtleta) {
        const { data: matches } = await supabase.rpc('find_my_profile_match', { p_email_only: true })
        const alvo = Array.isArray(matches) ? matches[0] : matches

        if (alvo?.id) {
          const { data: associado, error: assocErr } = await supabase.rpc('associate_my_profile', { target_id: alvo.id })
          if (assocErr) {
            console.error('Erro ao associar a ficha de atleta:', assocErr.message)
          } else if (associado) {
            data = (Array.isArray(associado) ? associado[0] : associado) as Profile
          }
        }
      }

      // 3. Se ainda não existir perfil (nem no DB nem associado a atleta), criar novo membro base
      if (!data) {
        const googleName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name

        const newProfile: Partial<Profile> = {
          id: userId,
          name: googleName || (userEmail ? userEmail.split('@')[0] : 'Novo Atleta'),
          email: userEmail ? userEmail.trim().toLowerCase() : '',
          phone: userPhone || null,
          photo_url: null,
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
