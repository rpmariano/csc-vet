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
  !eAdepto(profile) && extractRolesFromProfile(profile).includes('player')

export const eTreinador = (profile: RoleSource | null | undefined): boolean =>
  !eAdepto(profile) && extractRolesFromProfile(profile).includes('coach')

export const eAdmin = (profile: RoleSource | null | undefined): boolean =>
  !eAdepto(profile) && extractRolesFromProfile(profile).includes('admin')

