import { extractRolesFromProfile, type RoleSource } from '../context/AuthContext'

/**
 * Joga — tem o papel de jogador, seja qual for o resto. É a mesma regra do
 * agrupamento do Plantel ("quem joga aparece entre os jogadores, mesmo que
 * também dirija"), e é a que decide quem conta como atleta: `profiles` são as
 * pessoas do clube, e o treinador e a direção que não jogam também lá estão.
 */
export const eJogador = (profile: RoleSource | null | undefined): boolean =>
  extractRolesFromProfile(profile).includes('player')
