import React from 'react'
import { createBrowserRouter, RouterProvider, Outlet, Navigate, useLocation, useRouteError } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ClubProvider } from './context/ClubContext'
import { ToastProvider } from './context/ToastContext'
import { AnnouncementsProvider } from './context/AnnouncementsContext'
import { SaidaGuardadaProvider } from './context/SaidaGuardadaContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import { SubirAoTopo } from './components/SubirAoTopo'
import { Botao } from './components/ui'
import { ePedacoEmFalta, recarregarUmaVez } from './lib/atualizacaoDaApp'

// Páginas carregadas a pedido.
//
// O bundle era um único ficheiro de ~1 MB: quem abria a Home descarregava também
// a Agenda, os Eventos, o Plantel e o Clube. Numa app usada no telemóvel à
// beira do relvado, com rede fraca, isso pesa. Com React.lazy cada rota vem no
// seu próprio pedaço, e o Login — a primeira coisa que qualquer pessoa vê — fica
// no arranque, para não haver um spinner a preceder o ecrã de entrada.
import Login from './pages/Login'

// As cinco páginas que abrem um detalhe pelo endereço estiveram fora daqui,
// carregadas de uma vez, porque com `React.lazy` o retroceder do browser
// deixava a persiana aberta. A causa era outra — as persianas guardavam a sua
// própria abertura em estado, sincronizado do endereço por um efeito — e
// desde que passaram a derivá-la do endereço o `lazy` voltou sem trazer o bug:
// 126 execuções de `vista-detalhe` e `dialogos` sem uma falha, com
// `--retries=0 --repeat-each=3`. O arranque desceu de 157 kB para 64 kB
// comprimidos.
const CalendarPage = React.lazy(() => import('./pages/CalendarPage'))
const EventsPage = React.lazy(() => import('./pages/EventsPage'))
const TeamManagementPage = React.lazy(() => import('./pages/TeamManagementPage'))
const ClubePage = React.lazy(() => import('./pages/ClubePage'))
const CompeticaoPage = React.lazy(() => import('./pages/CompeticaoPage'))
const Home = React.lazy(() => import('./pages/Home'))
const AnnouncementsPage = React.lazy(() => import('./pages/AnnouncementsPage'))
const FinancePage = React.lazy(() => import('./pages/FinancePage'))
const SettingsPage = React.lazy(() => import('./pages/SettingsPage'))
const NovaPalavraPasse = React.lazy(() => import('./pages/NovaPalavraPasse'))

/**
 * As classificações, as fichas de jogo e as estatísticas deixaram de ser três
 * sítios e passaram a ser três separadores da Competição. Os endereços antigos
 * continuam a abrir — há links partilhados no grupo do clube — e trazem a
 * query consigo, para um `?jogo=<id>` continuar a abrir a ficha certa.
 */
const ParaCompeticao: React.FC<{ ver: string }> = ({ ver }) => {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  params.set('ver', ver)
  return <Navigate to={`/competicao?${params.toString()}`} replace />
}

/**
 * O backoffice era uma página com quatro separadores; hoje as suas áreas são
 * secções do ecrã Clube. O endereço antigo continua a abrir — anda em links
 * partilhados e no histórico de quem usa a app — e traz consigo o separador em
 * que estava, mais o `?adversario=`/`?campo=` de uma ficha aberta.
 */
const SEPARADORES_DO_BACKOFFICE: Record<string, string> = {
  club: 'dados',
  fields: 'campos',
  opponents: 'adversarios',
  tournaments: 'torneios',
}

const ParaClube: React.FC = () => {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const antigo = params.get('ver')
  const seccao = antigo ? SEPARADORES_DO_BACKOFFICE[antigo] : null
  if (seccao) params.set('ver', seccao)
  else params.delete('ver')
  const query = params.toString()
  return <Navigate to={query ? `/clube?${query}` : '/clube'} replace />
}

/** Mostrado enquanto o pedaço de código da rota é descarregado. */
const EcraACarregar: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center" role="status" aria-live="polite">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-csc-dark" />
    <span className="sr-only">A carregar…</span>
  </div>
)

/**
 * O que se vê quando uma rota rebenta.
 *
 * Sem isto o React Router mostrava a sua página — "Unexpected Application
 * Error!", em inglês, com um aceno ao programador. O caso de longe mais comum
 * é um pedaço de código que já não existe no servidor, porque houve um deploy
 * com a app aberta (ver `src/lib/atualizacaoDaApp.ts`): recarrega-se uma vez,
 * em silêncio, e só se o recarregar não resolver é que se mostra este ecrã,
 * com o botão à mão.
 */
const EcraDeErro: React.FC = () => {
  const erro = useRouteError()
  const versaoVelha = ePedacoEmFalta(erro)
  /* Só se decide uma vez por montagem: `recarregarUmaVez()` grava a hora e
     um segundo render (StrictMode) não pode voltar a decidir com ela. */
  const [aRecarregar] = React.useState(() => versaoVelha && recarregarUmaVez())

  if (aRecarregar) return <EcraACarregar />

  const mensagem = erro instanceof Error ? erro.message : String(erro ?? '')
  return (
    <main
      className="min-h-[100dvh] flex flex-col items-center justify-center gap-5 px-6 text-center text-white"
      role="alert"
    >
      <p className="font-display font-black text-lg">
        {versaoVelha ? 'A app tem uma versão nova' : 'Algo correu mal'}
      </p>
      <p className="text-sm text-white/70 max-w-xs">
        {versaoVelha
          ? 'Esta janela ficou com uma versão antiga. Recarrega para continuar.'
          : 'Ocorreu um erro inesperado. Recarregar a app costuma resolver.'}
      </p>
      <Botao onClick={() => window.location.reload()}>Recarregar</Botao>
      {!versaoVelha && mensagem && (
        <pre className="mt-4 max-w-full overflow-x-auto text-left text-[10px] text-white/40 whitespace-pre-wrap break-words">
          {mensagem}
        </pre>
      )}
    </main>
  )
}

/**
 * A moldura de dentro do router.
 *
 * O `SaidaGuardadaProvider` tem de estar aqui, e não à volta do
 * `<RouterProvider>`: é ele que chama o `useBlocker`, e esse hook só existe
 * dentro do contexto de um data router. Por isso é uma rota-moldura sem
 * caminho, que embrulha todas as outras.
 */
const MolduraDoRouter: React.FC = () => (
  <SaidaGuardadaProvider>
    <SubirAoTopo />
    <React.Suspense fallback={<EcraACarregar />}>
      <Outlet />
    </React.Suspense>
  </SaidaGuardadaProvider>
)

/*
  As rotas são um data router (`createBrowserRouter`) e não o `<BrowserRouter>`
  com `<Routes>`. A troca não foi por gosto: o `useBlocker` — a única forma
  suportada de perguntar antes de o retroceder do browser deitar fora um
  formulário por gravar — só existe num data router.

  O router fica fora do componente de propósito: criá-lo dentro do `App`
  fá-lo-ia de novo a cada render, e com ele todo o estado de navegação.
*/
const router = createBrowserRouter(
  [
    {
      element: <MolduraDoRouter />,
      /* Um erro em qualquer rota — o mais comum, um pedaço de código de uma
         versão antiga — sobe até aqui. */
      errorElement: <EcraDeErro />,
      children: [
        // Públicas
        { path: '/login', element: <Login /> },
        /* O link de recuperação vem do email e traz uma sessão de recuperação,
           não uma sessão normal — por isso fica fora do ProtectedRoute e fora
           do Layout. */
        { path: '/nova-palavra-passe', element: <NovaPalavraPasse /> },

        // Com sessão
        {
          element: <ProtectedRoute />,
          children: [
            {
              element: <Layout />,
              children: [
                { path: '/', element: <Home /> },
                { path: '/calendar', element: <CalendarPage /> },
                /* A Competição junta classificações, fichas de jogo e
                   estatísticas em separadores. As três páginas mantêm endereço
                   próprio: são ligadas de outros sítios e são o alvo de links
                   partilhados. */
                { path: '/competicao', element: <CompeticaoPage /> },
                { path: '/match-reports', element: <ParaCompeticao ver="fichas" /> },
                { path: '/stats', element: <ParaCompeticao ver="estatisticas" /> },
                { path: '/standings', element: <ParaCompeticao ver="classificacoes" /> },
                { path: '/settings', element: <SettingsPage /> },

                // Treinador e direção
                {
                  element: <ProtectedRoute allowedRoles={['coach', 'admin']} />,
                  children: [
                    { path: '/events', element: <EventsPage /> },
                    /* Comunicados é o ecrã de *gestão*: publicar, editar,
                       apagar. Quem só lê tem-nos na persiana do sino, que é
                       onde o handoff os põe. */
                    { path: '/announcements', element: <AnnouncementsPage /> },
                    /* O Clube é a gestão inteira: o índice, e as quatro secções
                       que o `?ver=` abre — dados, campos, adversarios,
                       torneios. */
                    { path: '/clube', element: <ClubePage /> },
                    /* O backoffice deixou de ser página; o endereço antigo
                       redireciona porque anda em links já partilhados. */
                    { path: '/admin', element: <ParaClube /> },
                    { path: '/team-management', element: <TeamManagementPage /> },
                  ],
                },

                // Só direção
                {
                  element: <ProtectedRoute allowedRoles={['admin']} />,
                  children: [
                    { path: '/finance', element: <FinancePage /> },
                  ],
                },
              ],
            },
          ],
        },

        { path: '*', element: <Navigate to="/" replace /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)

const App: React.FC = () => {
  return (
    <AuthProvider>
      <ClubProvider>
        <ToastProvider>
          <AnnouncementsProvider>
            <RouterProvider router={router} />
          </AnnouncementsProvider>
        </ToastProvider>
      </ClubProvider>
    </AuthProvider>
  )
}

export default App
