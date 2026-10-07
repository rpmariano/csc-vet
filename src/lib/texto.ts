/**
 * Normaliza um texto para comparação e pesquisa insensível a maiúsculas,
 * minúsculas e acentos / diacríticos (ex.: "Sónia" -> "sonia", "João" -> "joao").
 */
export function normalizarTexto(texto?: string | null): string {
  if (!texto) return ''
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/**
 * Verifica se um texto de origem contém o termo pesquisado,
 * de forma completamente insensível a acentos, maiúsculas e espaços excedentes.
 */
export function contemTexto(fonte?: string | null, termoPesquisa?: string | null): boolean {
  if (!termoPesquisa || !termoPesquisa.trim()) return true
  if (!fonte) return false
  return normalizarTexto(fonte).includes(normalizarTexto(termoPesquisa))
}
