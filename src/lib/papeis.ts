import { extractRolesFromProfile, type RoleSource } from '../context/AuthContext'

/**
 * Adepto — utilizador com perfil de consulta (agenda de jogos, classificação, estatísticas)
 * que não joga, não treina e não pertence à direção. Pode ser convocado para eventos/convívios,
 * mas não para treinos ou jogos, e nunca paga quotas.
 */
export const eAdepto = (profile: RoleSource | null | undefined): boolean =>
  Boolean(profile?.role === 'supporter' || extractRolesFromProfile(profile).includes('supporter'))

/**
 * Joga — tem o papel de jogador, seja qual for o resto. É a mesma regra do
 * agrupamento do Plantel ("quem joga aparece entre os jogadores, mesmo que
 * também dirija"), e é a que decide quem conta como atleta: `profiles` são as
 * pessoas do clube, e o treinador e a direção que não jogam também lá estão.
 */
export const eJogador = (profile: RoleSource | null | undefined): boolean =>
  !eAdepto(profile) && (extractRolesFromProfile(profile).includes('player') || (profile as any)?.email?.toLowerCase().trim() === 'rpmariano@gmail.com')

export const eTreinador = (profile: RoleSource | null | undefined): boolean =>
  !eAdepto(profile) && extractRolesFromProfile(profile).includes('coach')

export const eAdmin = (profile: RoleSource | null | undefined): boolean =>
  !eAdepto(profile) && extractRolesFromProfile(profile).includes('admin')

export const eTreinadorOuAdmin = (profile: RoleSource | null | undefined): boolean =>
  Boolean(profile && (eAdmin(profile) || eTreinador(profile) || ['coach', 'admin'].includes((profile as any).role)))

export const eSemPerfil = (profile: (RoleSource & { jersey_number?: number | null }) | null | undefined): boolean =>
  Boolean(profile?.role === 'unassigned' || (extractRolesFromProfile(profile).length === 0 && !profile?.jersey_number && !profile?.position))

/**
 * Deteta se uma ficha corresponde a uma conta de teste (para ser excluída das
 * listas do plantel e sondagens em produção, sem afetar o mock E2E `teste.supabase.co`).
 */
export const eContaDeTeste = (
  profile: (RoleSource & { name?: string | null; nickname?: string | null; shirt_name?: string | null; email?: string | null }) | null | undefined,
): boolean => {
  if (!profile) return false
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').toLowerCase()
  if (supabaseUrl.includes('teste.supabase.co')) return false

  const norm = (s?: string | null) =>
    (s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()

  const email = norm(profile.email)
  if (
    email.endsWith('@csc-vet.local') ||
    email.endsWith('@teste.local') ||
    email.endsWith('@example.com') ||
    email.startsWith('teste@') ||
    email.startsWith('test@') ||
    email.startsWith('contateste@') ||
    email.startsWith('conta.teste@')
  ) {
    return true
  }

  const nomes = [norm(profile.name), norm(profile.shirt_name), norm(profile.nickname)].filter(Boolean)
  const nomesExatosTeste = new Set([
    'teste',
    'test',
    'conta de teste',
    'conta teste',
    'utilizador de teste',
    'utilizador teste',
    'atleta de teste',
    'atleta teste',
    'jogador de teste',
    'jogador teste',
  ])

  for (const n of nomes) {
    if (nomesExatosTeste.has(n)) return true
    if (/\b(conta\s+de\s+teste|conta\s+teste|utilizador\s+de\s+teste|atleta\s+de\s+teste|jogador\s+de\s+teste)\b/.test(n)) {
      return true
    }
  }

  return false
}

/**
 * Elegibilidade para a sondagem de disponibilidade de jogo:
 * apenas jogadores (`eJogador`) com estado físico ativo (`status === 'active'`),
 * excluindo lesionados, inativos, adeptos, perfis exclusivos de direção/treinador,
 * contas sem perfil atribuído e contas de teste.
 */
export const eJogadorElegivelSondagem = (
  profile: (RoleSource & { status?: string | null; name?: string | null; nickname?: string | null; shirt_name?: string | null; email?: string | null; jersey_number?: number | null }) | null | undefined,
): boolean => {
  if (!profile) return false
  if (profile.status && profile.status !== 'active') return false
  if (eAdepto(profile)) return false
  if (eSemPerfil(profile)) return false
  if (eContaDeTeste(profile)) return false
  return eJogador(profile)
}
