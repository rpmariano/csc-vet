import React from 'react'

/**
 * A escala tipográfica do redesenho, nos três sítios onde é fácil divergir:
 * o título de um ecrã, a etiqueta que abre uma secção e os números grandes.
 *
 * O handoff dá-lhes valores exatos (peso, tamanho, entrelinha, espaçamento
 * entre letras) que não são os da escala do Tailwind — `text-4xl` não é 36px
 * com `letter-spacing:-.035em`. Ficam aqui para não andarem escritos à mão
 * em quarenta ecrãs com meio pixel de diferença entre eles.
 */

type PropsComElemento<T extends React.ElementType> = {
  como?: T
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, 'className' | 'children'>

/** Título de ecrã: o nome da página, em cima de tudo. */
export function TituloEcra<T extends React.ElementType = 'h1'>({
  como,
  className = '',
  children,
  ...resto
}: PropsComElemento<T>) {
  const Elemento = (como ?? 'h1') as React.ElementType
  return (
    <Elemento
      className={`font-display font-black text-white text-4xl leading-none tracking-[-0.035em] ${className}`}
      {...resto}
    >
      {children}
    </Elemento>
  )
}

/**
 * Etiqueta de secção — a linha pequena e espaçada que anuncia um bloco.
 * Sempre em maiúsculas: o espaçamento entre letras do handoff só assenta bem
 * assim, e é a caixa que a distingue de uma frase.
 */
export function EtiquetaSeccao<T extends React.ElementType = 'h2'>({
  como,
  className = '',
  children,
  ...resto
}: PropsComElemento<T>) {
  const Elemento = (como ?? 'h2') as React.ElementType
  return (
    <Elemento
      className={`font-display font-extrabold uppercase text-[9.5px] tracking-[0.18em] text-white/55 ${className}`}
      {...resto}
    >
      {children}
    </Elemento>
  )
}

/**
 * Número grande — saldos, contagens, resultados. `tabular-nums` para os
 * dígitos não dançarem quando o valor muda.
 */
export function NumeroGrande<T extends React.ElementType = 'span'>({
  como,
  className = '',
  children,
  ...resto
}: PropsComElemento<T>) {
  const Elemento = (como ?? 'span') as React.ElementType
  return (
    <Elemento
      className={`font-display font-black text-white text-[28px] leading-none tracking-[-0.03em] tabular-nums ${className}`}
      {...resto}
    >
      {children}
    </Elemento>
  )
}
