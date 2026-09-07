import React from 'react'

/**
 * Os dois cartões do redesenho.
 *
 * `CartaoVidro` é o cartão principal de um ecrã — translúcido, com blur, para
 * deixar passar a faixa verde do topo. `CartaoSimples` é tudo o resto: linhas
 * de lista, blocos secundários, agrupamentos. A diferença não é só de opacidade:
 * o simples não tem `backdrop-filter`, porque há dezenas por ecrã e o blur
 * repetido é do que mais custa a pintar num telemóvel antigo.
 *
 * Os valores (fundos, bordas, raios, sombra) estão em `src/index.css`, nas
 * classes `.cartao-vidro` e `.cartao-simples`.
 */

type PropsCartao<T extends React.ElementType> = {
  /** Elemento a renderizar. `div` por omissão; `button`, `li`, `section`… */
  como?: T
  className?: string
  children?: React.ReactNode
} & Omit<React.ComponentPropsWithoutRef<T>, 'className' | 'children'>

export function CartaoVidro<T extends React.ElementType = 'div'>({
  como,
  className = '',
  children,
  ...resto
}: PropsCartao<T>) {
  const Elemento = (como ?? 'div') as React.ElementType
  return (
    <Elemento className={`cartao-vidro ${className}`} {...resto}>
      {children}
    </Elemento>
  )
}

export function CartaoSimples<T extends React.ElementType = 'div'>({
  como,
  className = '',
  children,
  ...resto
}: PropsCartao<T>) {
  const Elemento = (como ?? 'div') as React.ElementType
  return (
    <Elemento className={`cartao-simples ${className}`} {...resto}>
      {children}
    </Elemento>
  )
}
