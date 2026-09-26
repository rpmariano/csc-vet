/**
 * Endereços que a app tem de saber montar por inteiro, com o `base` do Vite.
 *
 * A app é servida em `/csc-vet/` (ver `vite.config.ts`), e o `BrowserRouter`
 * tem esse prefixo por `basename` — dentro da app escreve-se `/settings` e o
 * router trata do resto. Mas há sítios que saem da app e têm de voltar: o link
 * de recuperação de palavra-passe vai por email e o Supabase precisa do
 * endereço completo, prefixo incluído. Escrito à mão, dava um link para
 * `/nova-palavra-passe` que em produção não existe.
 */

/** Prefixo com que a app é servida, sempre com barra no fim. */
export const BASE = import.meta.env.BASE_URL || '/'

/** Caminho absoluto (sem domínio) do ecrã de nova palavra-passe. */
export const caminhoNovaPalavraPasse = (): string => `${BASE}nova-palavra-passe`

/**
 * O nome do ecrã em que se está, para o "‹" de quem se abrir a partir dele.
 *
 * Uma ficha aberta de fora da sua lista — o jogo tocado na Home, a ficha de
 * jogo aberta na Classificação — volta para onde se estava, e não para a
 * lista a que pertence: é o que o retroceder do browser já fazia, e o "‹"
 * dizia outra coisa. Quem abre passa este nome no `state` da navegação
 * (`{ origem }`), e a ficha lê-o no `useVoltarDaFicha`.
 */
export const nomeDoEcra = (pathname: string, search: string): string => {
  const p = new URLSearchParams(search)
  switch (pathname) {
    case '/': return 'Hoje'
    case '/calendar': return p.has('event') ? 'Evento' : 'Agenda'
    case '/competicao':
      if (p.has('jogo')) return 'Ficha de jogo'
      if (p.get('ver') === 'fichas') return 'Fichas de Jogo'
      if (p.get('ver') === 'estatisticas') return 'Estatísticas'
      return 'Classificações'
    case '/events': return p.has('convocatoria') ? 'Convocatória' : 'Eventos'
    case '/team-management': return p.has('atleta') ? 'Ficha do atleta' : 'Plantel'
    case '/finance': return 'Financeiro'
    case '/announcements': return 'Comunicados'
    case '/settings': return 'Perfil'
    case '/clube': return 'Clube'
    default: return 'Voltar'
  }
}

/**
 * Há, nesta visita à app, uma entrada anterior no histórico?
 *
 * O data router guarda em `history.state.idx` a posição de cada entrada, a
 * contar da primeira que a app viu. Um `replace` mantém-na — por isso um
 * redirecionamento à chegada (o `/admin`) continua a contar como a primeira,
 * o que o `location.key === 'default'` não garantia.
 */
export const haEntradaAnterior = (): boolean => {
  const estado = window.history.state as { idx?: number } | null
  return (estado?.idx ?? 0) > 0
}
