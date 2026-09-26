import React from 'react'

/**
 * Os dois estados de uma lista que ainda não é lista: a carregar, e vazia.
 *
 * Havia quatro rodopios diferentes — de 32 a 48px, dourados, verde-escuro
 * sobre o fundo escuro (o das Estatísticas quase não se via) e azul-marinho
 * no `ProtectedRoute` —, e só o da Agenda dizia a um leitor de ecrã que
 * estava a carregar. Os vazios eram seis: o da Agenda, um cartão verde com um
 * ícone de 48px no Plantel, caixas tracejadas soltas nos Eventos e nos
 * Comunicados, uma linha em itálico nas Estatísticas. (Auditoria de design,
 * vaga 4.) Fica o desenho da Agenda nos dois.
 */

export const ACarregar: React.FC<{
  /** Uma frase por baixo ("A carregar fichas de jogo…"). Sem ela, só o leitor de ecrã a ouve. */
  texto?: string
  className?: string
}> = ({ texto, className = 'py-12' }) => (
  <div className={`flex flex-col items-center justify-center gap-2.5 ${className}`} role="status" aria-live="polite">
    <div className="animate-spin rounded-full h-9 w-9 border-2 border-csc-gold border-t-transparent" aria-hidden="true" />
    {texto
      ? <p className="text-[11px] font-bold text-white/62">{texto}</p>
      : <span className="sr-only">A carregar…</span>}
  </div>
)

/**
 * A lista vazia. **Com filtros ligados, diz que são os filtros** — uma lista
 * filtrada que diz "Nenhum jogo" faz crer que não há jogos, e o filtro que a
 * esvaziou está escondido atrás do funil.
 */
export const EstadoVazio: React.FC<{
  icone: React.ComponentType<{ size?: number; className?: string }>
  titulo: string
  texto?: React.ReactNode
  /** Uma ação, por baixo do texto ("Ver realizados", "Limpar filtros"). */
  children?: React.ReactNode
  className?: string
}> = ({ icone: Icone, titulo, texto, children, className = '' }) => (
  <div className={`cartao-simples border-dashed text-center px-5 py-10 ${className}`}>
    <Icone size={32} className="mx-auto text-white/25 mb-2.5" />
    <p className="font-display font-extrabold text-sm text-white">{titulo}</p>
    {texto && <p className="text-[11px] leading-relaxed text-white/62 mt-1.5">{texto}</p>}
    {children && <div className="mt-3.5">{children}</div>}
  </div>
)
