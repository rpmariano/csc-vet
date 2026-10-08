import React, { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'
import { sincronizarTreinosFuturos } from '../lib/treinosFuturos'

export type UserRole = 'player' | 'coach' | 'admin' | 'supporter' | 'unassigned'
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
  /** "Direito" | "Esquerdo" | "Ambos" — atribuído pela equipa técnica. */
  preferred_foot?: string | null
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
  /** Cônjuge, Pai, Irmão/ã… — lista fechada, ver RELACOES_EMERGENCIA. */
  emergency_contact_relation?: string | null
  medical_notes?: string | null
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

const VALID_ROLES: UserRole[] = ['player', 'coach', 'admin', 'supporter']

/**
 * Emails autorizados a utilizar as ferramentas de desenvolvimento e simulação de papéis.
 * Apenas o desenvolvedor principal tem acesso a alternar entre perfis para testes.
 */
const DEVELOPER_EMAILS = ['rpmariano@gmail.com']

export const isDeveloperEmail = (email?: string | null): boolean => {
  if (!email) return false
  const clean = email.toLowerCase().trim()
  return DEVELOPER_EMAILS.includes(clean) || clean.endsWith('@csc-vet.local')
}

/**
 * Forma mínima de que `extractRolesFromProfile` precisa — um `Profile` completo
 * cumpre isto sempre, mas também permite passar-lhe projeções mais estreitas
 * (ex.: a lista de jogadores da Página Financeira, que não busca o perfil
 * inteiro) sem ter de simular um `Profile` completo só para o tipo bater certo.
 */
export interface RoleSource {
  role?: UserRole | string | null
  roles?: (UserRole | string)[] | null
  status?: string | null
  medical_notes?: string | null
  position?: string | null
}

export const extractRolesFromProfile = (profile: RoleSource | null | undefined): UserRole[] => {
  if (!profile) return []

  if (profile.status === 'inactive') return []

  const rawRole = profile.role as UserRole | undefined
  if (rawRole === 'unassigned') return []

  if (Array.isArray(profile.roles) && profile.roles.length === 0) {
    return []
  }

  const defaultRole: UserRole | undefined = rawRole && VALID_ROLES.includes(rawRole) ? rawRole : undefined

  // Adepto é um perfil exclusivo de consulta — nunca joga, não treina e não paga quotas.
  if (defaultRole === 'supporter' || rawRole === 'supporter') {
    return ['supporter']
  }

  // 1. Coluna `roles` do Supabase — a fonte de verdade. É escrita apenas por
  //    administradores (a RLS impede que cada um altere os seus próprios papéis).
  if (Array.isArray(profile.roles) && profile.roles.length > 0) {
    const fromColumn = profile.roles.filter((r): r is UserRole => VALID_ROLES.includes(r as UserRole))
    if (fromColumn.includes('supporter')) {
      return ['supporter']
    }
    if (fromColumn.length > 0) {
      // O papel real tem sempre de constar, mesmo que a coluna esteja incompleta.
      return defaultRole && !fromColumn.includes(defaultRole) ? [...fromColumn, defaultRole] : fromColumn
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
    if (parsed.includes('supporter')) return ['supporter']
    if (parsed.length > 0) return parsed
  }

  // 3. Derivar da coluna `role`
  if (profile.role === 'admin') return ['admin', 'coach', 'player']
  if (profile.role === 'coach') return ['coach', 'player']
  if (profile.role === 'supporter') return ['supporter']
  if (profile.role === 'player') return ['player']
  return []
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  assignedRoles: UserRole[]
  actualRole: UserRole | null
  isUnassigned: boolean
  canSimulateRoles: boolean
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
  const [isUnassigned, setIsUnassigned] = useState(false)
  const [simulatedRole, setSimulatedRoleState] = useState<UserRole | null>(() => {
    return (localStorage.getItem('csc_simulated_role') as UserRole) || null
  })
  const [loading, setLoading] = useState(true)


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

      // 2. Ligar esta conta à ficha que o clube já lhe tinha criado.
      //
      // **A identidade é o email, e mais nada.** Se não houver ficha com o
      // email do registo, a conta fica por ligar e é a direção que resolve no
      // ecrã 3d — ver `supabase_identidade_por_email_migration.sql`. Antes
      // valiam também o telefone e o primeiro-e-último nome, e o telefone da
      // própria ficha é auto-editável: dava para reclamar a ficha de outra
      // pessoa, com o NIF e o IBAN lá dentro.
      //
      // As duas operações correm no servidor: `find_my_profile_match` (que só
      // devolve campos não sensíveis) e `associate_my_profile`, que faz a
      // cópia, transfere as referências e apaga a ficha antiga numa transação
      // só. Com a RLS fechada o cliente já não lê as fichas dos outros — e
      // ainda bem, que elas têm NIF e IBAN.
      //
      // `p_email_only` continua a ser passado porque a função ainda o aceita,
      // mas é ignorado: hoje a correspondência é sempre só por email.
      const jaTemFichaDoClube = Boolean(data?.jersey_number || data?.shirt_name)
      let fichaLigadaAgora = false
      if (userEmail && !jaTemFichaDoClube) {
        const { data: matches } = await supabase.rpc('find_my_profile_match', { p_email_only: true })
        const alvo = Array.isArray(matches) ? matches[0] : matches

        if (alvo?.id) {
          const { data: associado, error: assocErr } = await supabase.rpc('associate_my_profile', { target_id: alvo.id })
          if (assocErr) {
            console.error('Erro ao ligar a conta à ficha do clube:', assocErr.message)
          } else if (associado) {
            data = (Array.isArray(associado) ? associado[0] : associado) as Profile
            fichaLigadaAgora = true
          }
        }
      }

      // 3. Se ainda não existir perfil (nem no DB nem associado a atleta), criar novo membro base
      if (!data) {
        const googleName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name

        const newProfile: Partial<Profile> = {
          id: userId,
          name: googleName || (userEmail ? userEmail.split('@')[0] : 'Novo Membro'),
          email: userEmail ? userEmail.trim().toLowerCase() : '',
          phone: userPhone || null,
          photo_url: null,
          role: 'player',
          roles: ['player'],
          status: 'active'
        }

        const { data: created, error: createErr } = await supabase
          .from('profiles')
          .insert([newProfile])
          .select()
          .single()

        if (!createErr && created) {
          data = created
        } else {
          if (createErr) {
            console.error('Erro ao criar perfil base:', createErr.message)
          }
          // Garante fallback imediato para nunca deixar o utilizador sem objeto de perfil
          data = {
            ...newProfile,
            role: 'unassigned',
            roles: [],
          } as Profile
        }
      }

      let unassigned = false
      if (data) {
        // Se o perfil está marcado como inativo ou já tem role unassigned, o comportamento é sempre sem perfil
        if (data.status === 'inactive' || data.role === 'unassigned') {
          unassigned = true
        } else if (!fichaLigadaAgora) {
          // Se a conta não acabou de ser ligada a uma ficha do clube:
          const temPapelReconhecido =
            ['admin', 'coach', 'supporter'].includes(data.role) ||
            (Array.isArray(data.roles) && data.roles.some((r: string) => ['admin', 'coach', 'supporter'].includes(r)))

          const temAtributosDeAtleta = Boolean(
            data.jersey_number ||
            data.shirt_name ||
            (data.position && data.position.trim().length > 0)
          )

          if (!temPapelReconhecido && !temAtributosDeAtleta) {
            // Conta nova sem ficha desportiva atribuída: se nunca foi convocada, não tem perfil atribuído
            try {
              const { data: callupsList } = await supabase
                .from('callups')
                .select('id')
                .eq('player_id', data.id)
                .limit(1)

              if (!callupsList || callupsList.length === 0) {
                unassigned = true
              }
            } catch {
              unassigned = true
            }
          }
        }
      } else {
        unassigned = true
      }

      setIsUnassigned(unassigned)

      if (data) {
        if (unassigned) {
          // Quando é criado um registo novo e não existe correspondência na BD,
          // deixa de ser associado ao perfil Jogador.
          setActualProfile({
            ...data,
            role: 'unassigned',
            roles: []
          } as Profile)
        } else {
          setActualProfile(data as Profile)
        }
      }
    } catch (err) {
      console.error('Erro ao obter perfil:', err)
    } finally {
      setLoading(false)
    }
  }

  /* O efeito fica **depois** do `fetchProfile`: em cima referia uma `const`
     ainda por inicializar, o que só funciona porque o corpo do componente
     corre inteiro antes de o efeito disparar. Nenhum hook mudou de ordem —
     entre um sítio e o outro só há declarações de funções. */
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

  const assignedRoles = extractRolesFromProfile(actualProfile)

  // Apenas o desenvolvedor (rpmariano@gmail.com) tem permissão para ver as ferramentas
  // de simulação e alternar perfis.
  const canSimulateRoles = Boolean(
    isDeveloperEmail(actualProfile?.email || user?.email)
  )

  // Limpeza de segurança: utilizadores normais (como outros membros da direção) não devem
  // ter papéis simulados ativos. Se existirem resíduos em localStorage, são eliminados.
  useEffect(() => {
    if (!canSimulateRoles && localStorage.getItem('csc_simulated_role')) {
      localStorage.removeItem('csc_simulated_role')
      setSimulatedRoleState(null)
    }
  }, [canSimulateRoles])

  const setSimulatedRole = (role: UserRole | null) => {
    if (!actualProfile || !canSimulateRoles) return

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

      // 2. Acertar os treinos futuros — só quem joga é convocado para eles.
      //    O estado já ficou gravado; uma falha aqui não o desfaz.
      try {
        await sincronizarTreinosFuturos(
          actualProfile.id,
          newStatus,
          extractRolesFromProfile(actualProfile).includes('player'),
        )
      } catch (syncErr) {
        console.error('Erro ao sincronizar convocatórias de treino:', syncErr)
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
    setIsUnassigned(false)
    await supabase.auth.signOut()
    setUser(null)
    setActualProfile(null)
    setLoading(false)
  }

  const actualRole = actualProfile?.role ?? null
  const isSimulatingRole = Boolean(
    canSimulateRoles &&
    simulatedRole &&
    simulatedRole !== actualRole
  )

  const isEffectivelyUnassigned = Boolean(
    isUnassigned ||
    actualProfile?.role === 'unassigned' ||
    actualProfile?.status === 'inactive' ||
    simulatedRole === 'unassigned'
  )

  const effectiveRoles: UserRole[] = isEffectivelyUnassigned
    ? []
    : isSimulatingRole && simulatedRole
    ? [simulatedRole]
    : assignedRoles

  const effectiveProfile: Profile | null = actualProfile
    ? {
        ...actualProfile,
        role: isEffectivelyUnassigned
          ? 'unassigned'
          : isSimulatingRole && simulatedRole
          ? simulatedRole
          : actualProfile.role,
        roles: effectiveRoles
      }
    : null

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile: effectiveProfile, 
      assignedRoles,
      actualRole, 
      isUnassigned: isEffectivelyUnassigned,
      canSimulateRoles,
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
