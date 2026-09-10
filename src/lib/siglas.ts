/**
 * As siglas dos clubes nos placares apertados.
 *
 * Viviam na `CalendarPage`, que é uma página: qualquer bloco que precisasse
 * delas — a Home, agora — arrastava a Agenda inteira para o seu pedaço de
 * bundle. A `CalendarPage` continua a exportá-las, para quem já as importava
 * de lá não ter de mudar.
 */

export const formatClubSigla = (initials?: string | null): string => {
  if (!initials) return 'CSC'
  const trimmed = initials.trim()
  if (trimmed === 'GDS CASCAIS' || trimmed === 'GDSCASCAIS' || trimmed.length > 5 || trimmed.includes(' ')) {
    return 'CSC'
  }
  return trimmed.toUpperCase()
}

export const formatOpponentSigla = (opp?: { name?: string; initials?: string | null } | null): string => {
  if (!opp) return 'ADV'
  if (opp.initials && opp.initials.trim().length <= 6 && !opp.initials.trim().includes(' ')) {
    return opp.initials.trim().toUpperCase()
  }
  if (opp.name) {
    const words = opp.name.trim().split(/\s+/).filter(w => w.length > 1)
    if (words.length > 1) {
      return words.map(w => w[0].toUpperCase()).join('').substring(0, 5)
    }
    return opp.name.substring(0, 4).toUpperCase()
  }
  return 'ADV'
}
