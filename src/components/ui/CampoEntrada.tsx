import React, { useId } from 'react'

/**
 * Campo de formulário dos ecrãs de entrada: etiqueta pequena em maiúsculas por
 * cima, caixa branca de 50px por baixo.
 *
 * A caixa é branca e não translúcida como o resto do redesenho — é a única
 * exceção, e é do handoff: são os campos onde se escreve o email e a
 * palavra-passe antes de haver sessão, e o contraste máximo ajuda quem está a
 * escrever num telemóvel ao sol.
 */

export interface CampoEntradaProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> {
  etiqueta: string
  /** Texto de ajuda ou de erro por baixo do campo. */
  nota?: React.ReactNode
  /** Marca a nota como erro para o leitor de ecrã. */
  temErro?: boolean
}

export const CampoEntrada: React.FC<CampoEntradaProps> = ({
  etiqueta,
  nota,
  temErro = false,
  className = '',
  ...resto
}) => {
  const id = useId()
  const idNota = `${id}-nota`

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block font-display font-bold text-[9px] tracking-[0.1em] uppercase text-white/60 mb-1.5"
      >
        {etiqueta}
      </label>
      <input
        id={id}
        aria-describedby={nota ? idNota : undefined}
        aria-invalid={temErro || undefined}
        className={`w-full h-[50px] px-3.5 rounded-[15px] bg-white text-csc-tinta text-[12.5px]
          placeholder:text-black/40 outline-none
          focus-visible:ring-2 focus-visible:ring-csc-gold focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
          ${temErro ? 'ring-2 ring-csc-red' : ''}`}
        {...resto}
      />
      {nota && (
        <p id={idNota} className={`text-[10.5px] leading-snug mt-1.5 ${temErro ? 'text-csc-vermelho-suave' : 'text-white/55'}`}>
          {nota}
        </p>
      )}
    </div>
  )
}

export default CampoEntrada
