import React, { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Home, Calendar, Trophy, Shield } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { FaixaTopo } from './ui'
import { BarraNavegacao, type ItemNavegacao } from './nav/BarraNavegacao'
import { FolhaCriar } from './nav/FolhaCriar'

/**
 * A moldura da app depois do redesenho de 2026.
 *
 * O que era duas navegações — sidebar de 256px no computador, cabeçalho mais
 * gaveta de traços no telemóvel — passou a ser uma só. A app é de telemóvel;
 * num ecrã largo é a mesma coisa ao meio (ver o `#root` em `index.css`), sem
 * uma segunda estrutura a manter em paralelo.
 *
 * O que a moldura dá é a faixa do topo, a barra inferior com os lugares do
 * perfil de quem está a ver, e a folha do [+] para quem cria. O cabeçalho não
 * é dela: cada ecrã tem o seu título, e o que se repete é só a fotografia que
 * abre o Perfil (`<CabecalhoEcra>`, ou a saudação no caso da Home).
 *
 * Tudo o resto — Financeiro, Torneios, Adversários, Campos — vive dentro do
 * ecrã Clube, como o handoff manda, e não numa lista lateral.
 */

/** Barra de três lugares: quem só consulta. */
const ITENS_JOGADOR: readonly ItemNavegacao[] = [
  { to: '/', etiqueta: 'Hoje', Icone: Home },
  { to: '/calendar', etiqueta: 'Agenda', Icone: Calendar },
  { to: '/competicao', etiqueta: 'Competição', Icone: Trophy },
]

/**
 * Barra de quatro lugares com [+] ao meio: treinador e direção.
 *
 * A Competição ocupa aqui o lugar que era do Plantel. Quem gere chegava às
 * classificações e às estatísticas um nível mais fundo do que o jogador, que
 * as tem na barra — e não há razão para isso: são os mesmos ecrãs, e quem
 * treina consulta-os tanto ou mais. O Plantel passou para a lista do Clube,
 * que é onde vive o resto da gestão.
 */
const ITENS_GESTAO: readonly ItemNavegacao[] = [
  { to: '/', etiqueta: 'Hoje', Icone: Home },
  { to: '/calendar', etiqueta: 'Agenda', Icone: Calendar },
  { to: '/competicao', etiqueta: 'Competição', Icone: Trophy },
  {
    to: '/clube',
    etiqueta: 'Clube',
    Icone: Shield,
    // Os destinos de gestão que ainda têm rota própria — o Plantel e o
    // Financeiro — abrem-se a partir do Clube, e para a barra pertencem-lhe.
    // O backoffice deixou de existir como página: as suas áreas são secções
    // deste mesmo ecrã.
    tambemEm: ['/team-management', '/finance'],
  },
]

const Layout: React.FC = () => {
  const { profile } = useAuth()
  const location = useLocation()

  const [criarAberto, setCriarAberto] = useState(false)

  const eAdmin = profile?.role === 'admin'
  const eTreinador = profile?.role === 'coach'
  const gere = eAdmin || eTreinador

  // A barra flutua sobre o conteúdo, por isso o fim da coluna tem de acabar
  // acima dela — com `margin-bottom`, não `padding-bottom`: com padding, o
  // último cartão fica dentro da caixa de scroll mas por baixo da barra.
  const margemFinal = gere ? 110 : 104

  return (
    <div className="relative min-h-dvh flex flex-col">
      {/* A faixa é da moldura, não de cada ecrã: passa por trás do cabeçalho
          e sangra até às margens da coluna, como no protótipo.

          Na Home é mais alta porque lá o confronto do próximo jogo é o título
          do ecrã — 44px de "GDPCC vs CSC" e a linha do que falta —, e a capa
          tem de o cobrir até ao cartão de vidro, que começa aos ~260px e é
          translúcido de propósito para a deixar passar. A altura vem daqui e
          não de uma segunda faixa desenhada pela Home: duas faixas seriam dois
          conjuntos de blocos inclinados sobrepostos. */}
      <FaixaTopo altura={location.pathname === '/' ? 340 : 250} />

      <main className="flex-1 px-[18px] pt-3" style={{ marginBottom: `${margemFinal}px` }}>
        <Outlet />
      </main>

      {/* O conteúdo passa por trás da barra translúcida; sem este esbatimento
          a barra deixa de se ler quando lhe passa texto por baixo. */}
      <div
        aria-hidden="true"
        className="fixed bottom-0 h-30 z-30 pointer-events-none esbate-fundo"
        style={{
          left: 'max(0px, calc(50vw - 240px))',
          right: 'max(0px, calc(50vw - 240px))',
        }}
      />

      <BarraNavegacao
        itens={gere ? ITENS_GESTAO : ITENS_JOGADOR}
        caminho={location.pathname}
        aoCriar={gere ? () => setCriarAberto(true) : undefined}
      />

      <FolhaCriar isOpen={criarAberto} onClose={() => setCriarAberto(false)} />

    </div>
  )
}

export default Layout
