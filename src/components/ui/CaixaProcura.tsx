import React from 'react'
import { Search, X } from 'lucide-react'
import { CLASSE_CAMPO } from './formulario'

export interface CaixaProcuraProps {
  valor: string
  aoMudar: (texto: string) => void
  placeholder: string
  /** Nome acessível do campo ("Procurar na agenda"). */
  rotulo: string
  className?: string
}

/**
 * A caixa de procura da app: lupa à esquerda, a cruz para limpar quando há
 * texto, e o campo de formulário de sempre (`CLASSE_CAMPO`).
 *
 * É a do `<ProcuraEFiltros>`, e usa-se sozinha onde se procura dentro de um
 * bloco — a convocatória, a convocatória do editar evento, fundir fichas.
 * Havia lá três caixas escritas à mão, cada uma com o seu cinzento.
 */
export const CaixaProcura: React.FC<CaixaProcuraProps> = ({ valor, aoMudar, placeholder, rotulo, className = '' }) => {
  const texto = valor.trim()
  return (
    <div className={`relative flex-1 min-w-0 ${className}`}>
      <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/35 pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        value={valor}
        onChange={e => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={rotulo}
        className={`${CLASSE_CAMPO} pl-9.5 ${texto ? 'pr-11' : ''}`}
      />
      {texto && (
        <button
          type="button"
          onClick={() => aoMudar('')}
          aria-label="Limpar a procura"
          className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center rounded-[14px] text-black/40 hover:text-black/70 cursor-pointer"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
