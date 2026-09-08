import React from 'react'

/**
 * A faixa geométrica do topo dos ecrãs.
 *
 * É a assinatura visual do manual de normas: um gradiente verde na diagonal,
 * dois blocos inclinados que se cruzam e a palavra CASCAIS em marca de água,
 * tudo a esbater-se para o fundo antes de o conteúdo começar.
 *
 * Fica **atrás** do conteúdo (`-z-10` no seu contentor), não em `background`
 * do ecrã: é assim que os cartões de vidro por cima têm alguma coisa para
 * deixar passar. Por isso o ecrã que a usa tem de ser `relative`.
 *
 * A marca de água é decorativa — `aria-hidden`, para não aparecer no leitor
 * de ecrã como uma palavra solta a meio da página.
 */

export interface FaixaTopoProps {
  /** Altura da faixa em pixels. 250 nos ecrãs de lista, mais nas capas. */
  altura?: number
  /** Texto da marca de água. Vazio para não a mostrar. */
  marca?: string
  className?: string
}

export const FaixaTopo: React.FC<FaixaTopoProps> = ({
  altura = 250,
  marca = 'CASCAIS',
  className = '',
}) => (
  <div
    aria-hidden="true"
    className={`absolute top-0 left-0 right-0 overflow-hidden pointer-events-none -z-10 ${className}`}
    style={{ height: `${altura}px` }}
  >
    <div
      className="absolute inset-0"
      style={{ background: 'linear-gradient(155deg,#22691f,#17452a 62%,#262d2b)' }}
    />
    <div
      className="absolute"
      style={{
        top: '-60px',
        left: '-80px',
        width: '270px',
        height: '270px',
        background: 'rgba(0,150,98,.3)',
        transform: 'skewY(-14deg)',
        borderRadius: '44px',
      }}
    />
    <div
      className="absolute"
      style={{
        top: '20px',
        right: '-100px',
        width: '230px',
        height: '230px',
        background: 'rgba(23,69,42,.55)',
        transform: 'skewY(12deg)',
        borderRadius: '44px',
      }}
    />

    {marca && (
      <div className="marca-agua absolute bottom-0 whitespace-nowrap" style={{ left: '-14px' }}>
        {marca}
      </div>
    )}

    {/* Sem este esbatimento a faixa acaba a direito e vê-se o corte. */}
    <div
      className="absolute inset-0"
      style={{
        background: 'linear-gradient(to top,#262d2b 2%,rgba(38,45,43,.4) 58%,transparent)',
      }}
    />
  </div>
)

export default FaixaTopo
