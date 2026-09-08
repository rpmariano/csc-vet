import React from 'react'

/**
 * A moldura dos ecrãs de entrada — entrar, registar, recuperar a palavra-passe
 * e escolher uma nova.
 *
 * Ao contrário do resto da app, estes não vivem dentro do `Layout`: não há
 * barra de navegação nem fotografia de perfil, porque ainda não há ninguém
 * identificado. Por isso a faixa geométrica é aqui mais alta — ocupa o ecrã
 * todo em vez dos 250px do topo — e a marca de água é maior.
 *
 * O conteúdo fica centrado na vertical: são formulários curtos, e encostá-los
 * ao topo deixava metade do ecrã vazia por baixo.
 */

export interface MolduraEntradaProps {
  children: React.ReactNode
}

export const MolduraEntrada: React.FC<MolduraEntradaProps> = ({ children }) => (
  <div className="relative min-h-dvh flex flex-col overflow-hidden">
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden -z-10">
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(165deg,#22691f,#17452a 58%,#262d2b)' }}
      />
      <div
        className="absolute"
        style={{
          top: '-70px',
          left: '-90px',
          width: '300px',
          height: '300px',
          background: 'rgba(0,150,98,.28)',
          transform: 'skewY(-14deg)',
          borderRadius: '44px',
        }}
      />
      <div
        className="absolute"
        style={{
          top: '60px',
          right: '-110px',
          width: '250px',
          height: '250px',
          background: 'rgba(23,69,42,.6)',
          transform: 'skewY(12deg)',
          borderRadius: '44px',
        }}
      />
      <div
        className="marca-agua absolute whitespace-nowrap"
        style={{ bottom: '40px', left: '-20px', fontSize: '96px', color: 'rgba(255,255,255,.05)' }}
      >
        CASCAIS
      </div>
    </div>

    <main className="relative flex-1 flex flex-col justify-center gap-4 px-[22px] py-6 pt-safe pb-safe">
      {children}
    </main>
  </div>
)

export default MolduraEntrada
