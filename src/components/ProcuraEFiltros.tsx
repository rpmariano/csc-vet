import React from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { CLASSE_CAMPO } from './ui/formulario'
import { triggerHaptic } from '../utils/haptics'

/**
 * A cabeça de um ecrã de lista: procura à vista, e o funil que abre a
 * persiana dos filtros. É a regra do CLAUDE.md ("procura à vista, tudo o
 * resto atrás do funil"), e estava escrita à mão em cada ecrã — com o ícone
 * da procura a 14, 15 ou 17px, "Pesquisar…" nuns e "Procurar…" noutros, e o
 * ícone branco sobre o campo branco nas três Gestões do Clube.
 *
 * **O funil acende quando alguém mexeu no que estava**, e o que ele esconde
 * escreve-se por baixo, com o "Limpar" à mão: um filtro que não se vê é um
 * filtro que se esquece. A procura conta como filtro — escreve-se na linha
 * de resumo como os outros.
 *
 * Os ecrãs que já tinham o padrão (Agenda, Eventos, Fichas, Plantel, Contas)
 * mantêm por agora a sua cópia; este nasceu na vaga 5 da auditoria de design
 * para os que não o tinham.
 */
export interface ProcuraEFiltrosProps {
  procura: string
  aoProcurar: (texto: string) => void
  placeholder: string
  /** Nome acessível do campo ("Procurar nos comunicados"). */
  rotulo: string
  /** Sem ele não há funil — há ecrãs cuja lista só se procura. */
  aoAbrirFiltros?: () => void
  /** Há algum filtro na persiana diferente do ponto de partida. */
  filtrosAtivos?: boolean
  /** O que os filtros da persiana dizem, em texto ("Inativos"). */
  resumo?: string[]
  /** "3 comunicados" — o que sobra depois de filtrar. */
  contagem: string
  aoLimpar: () => void
  /** Um botão ao lado do funil — o [+] de criar, nas Gestões. */
  acao?: React.ReactNode
}

export const ProcuraEFiltros: React.FC<ProcuraEFiltrosProps> = ({
  procura,
  aoProcurar,
  placeholder,
  rotulo,
  aoAbrirFiltros,
  filtrosAtivos = false,
  resumo = [],
  contagem,
  aoLimpar,
  acao,
}) => {
  const texto = procura.trim()
  const algo = filtrosAtivos || texto !== ''
  const linha = [texto ? `"${texto}"` : null, ...resumo].filter(Boolean).join(' · ')

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" aria-hidden="true" />
          <input
            type="search"
            value={procura}
            onChange={e => aoProcurar(e.target.value)}
            placeholder={placeholder}
            aria-label={rotulo}
            className={`${CLASSE_CAMPO} pl-9.5 ${texto ? 'pr-11' : ''}`}
          />
          {texto && (
            <button
              type="button"
              onClick={() => aoProcurar('')}
              aria-label="Limpar a procura"
              className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-[14px] text-black/40 hover:text-black/70 cursor-pointer"
            >
              <X size={15} aria-hidden="true" />
            </button>
          )}
        </div>
        {aoAbrirFiltros && (
          <button
            type="button"
            onClick={() => { triggerHaptic('light'); aoAbrirFiltros() }}
            aria-label={filtrosAtivos ? 'Filtros (ativos)' : 'Filtros'}
            className={`w-11 h-11 rounded-full border flex items-center justify-center shrink-0 cursor-pointer
              transition-transform duration-150 active:scale-97
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold ${
                filtrosAtivos
                  ? 'bg-csc-gold border-csc-gold text-csc-tinta'
                  : 'bg-white/10 border-white/15 text-white/75'
              }`}
          >
            <SlidersHorizontal size={16} aria-hidden="true" />
          </button>
        )}
        {acao}
      </div>

      {algo && (
        <button
          type="button"
          onClick={aoLimpar}
          className="cartao-simples w-full min-h-11 flex items-center gap-2.5 px-4 py-2.5 text-left cursor-pointer
            bg-csc-gold/10 border-csc-gold/30 transition-transform duration-150 active:scale-97"
        >
          <SlidersHorizontal size={14} className="text-csc-gold shrink-0" aria-hidden="true" />
          <span className="flex-1 font-display font-bold text-[11px] text-white/80">
            {linha || 'Filtrado'} · {contagem}
          </span>
          <span className="font-display font-bold text-[11px] text-csc-gold">Limpar</span>
        </button>
      )}
    </div>
  )
}

export default ProcuraEFiltros
