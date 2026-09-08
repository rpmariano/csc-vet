import React, { useEffect, useState } from 'react'
import { useNavigate, Navigate, useSearchParams } from 'react-router-dom'
import { Info, Check } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { useClub } from '../context/ClubContext'
import { MolduraEntrada, CampoEntrada, Botao, CartaoSimples } from '../components/ui'
import { caminhoNovaPalavraPasse } from '../lib/rotas'
import { CLUBE_NOME } from '../lib/clube'

/**
 * A entrada na app: entrar (10a), registar (10b) e recuperar a palavra-passe
 * (10c). São três estados do mesmo ecrã e não três rotas — o que muda é o
 * formulário, e a moldura, o emblema e o nome do clube ficam onde estão.
 *
 * A recuperação de palavra-passe não existia. Pede o link ao Supabase
 * (`resetPasswordForEmail`), que o envia por email; o link traz de volta a
 * `/nova-palavra-passe`, onde se escolhe a nova. Quem entrou com o Google não
 * tem palavra-passe nenhuma para recuperar, e o ecrã diz-lho.
 *
 * O nome do clube deixa de estar fixo em código e vem do `club_settings`.
 */

type Modo = 'entrar' | 'registar' | 'recuperar'

const TEXTOS: Record<Modo, { legenda: string; accao: string }> = {
  entrar: { legenda: 'Entra para ver a tua agenda', accao: 'Entrar' },
  registar: { legenda: 'Cria a tua conta de atleta', accao: 'Criar conta' },
  recuperar: { legenda: 'Enviamos-te um link para a mudar', accao: 'Enviar link' },
}

const Login: React.FC = () => {
  const { user, loading: aCarregarSessao } = useAuth()
  const { clubSettings } = useClub()
  const navegar = useNavigate()
  const [params] = useSearchParams()

  // `?modo=recuperar` para o ecrã de nova palavra-passe poder mandar de volta
  // para aqui quando o link expira.
  const modoInicial = (params.get('modo') as Modo) || 'entrar'
  const [modo, setModo] = useState<Modo>(
    ['entrar', 'registar', 'recuperar'].includes(modoInicial) ? modoInicial : 'entrar',
  )

  const [email, setEmail] = useState('')
  const [palavraPasse, setPalavraPasse] = useState('')
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (user && !aCarregarSessao) navegar('/', { replace: true })
  }, [user, aCarregarSessao, navegar])

  const mudarModo = (seguinte: Modo) => {
    setModo(seguinte)
    setErro(null)
    setAviso(null)
  }

  const submeter = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)

    try {
      if (modo === 'registar') {
        const { error } = await supabase.auth.signUp({
          email,
          password: palavraPasse,
          options: { data: { name: nome } },
        })
        if (error) throw error
        setAviso('Conta criada. Confirma o email antes de entrares.')
      } else if (modo === 'recuperar') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}${caminhoNovaPalavraPasse()}`,
        })
        if (error) throw error
        setAviso(`Link enviado para ${email}. Válido por uma hora.`)
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password: palavraPasse })
        if (error) throw error
        navegar('/', { replace: true })
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Ocorreu um erro inesperado.')
    } finally {
      setOcupado(false)
    }
  }

  const entrarComGoogle = async () => {
    setErro(null)
    setOcupado(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}${import.meta.env.BASE_URL || '/'}` },
      })
      if (error) throw error
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao entrar com o Google.')
      setOcupado(false)
    }
  }

  if (user && !aCarregarSessao) return <Navigate to="/" replace />

  const configurado =
    !!import.meta.env.VITE_SUPABASE_URL && !import.meta.env.VITE_SUPABASE_URL.includes('placeholder')

  return (
    <MolduraEntrada>
      <div className="flex flex-col items-center gap-3.5 pb-1.5">
        <img
          src={clubSettings?.logo_url || '/csc-vet/cascais-emblem.png'}
          alt=""
          className="w-22 h-22 rounded-full bg-white object-contain p-2 flex-none"
          style={{ width: 88, height: 88, boxShadow: '0 14px 34px -12px rgba(0,0,0,.8)' }}
        />
        <div className="text-center">
          <h1 className="font-display font-black text-2xl leading-tight text-white tracking-[-0.02em] text-balance">
            {clubSettings?.name ?? CLUBE_NOME}
          </h1>
          <p className="text-[11.5px] text-white/60 mt-1.5">{TEXTOS[modo].legenda}</p>
        </div>
      </div>

      {!configurado && (
        <CartaoSimples className="flex items-start gap-2.5 p-3.5 bg-csc-gold/12 border-csc-gold/30">
          <Info size={16} className="text-csc-gold shrink-0 mt-0.5" />
          <p className="text-[10.5px] leading-relaxed text-white/75">
            O site foi compilado sem ligação ao Supabase. Faltam os segredos
            <code className="mx-1">VITE_SUPABASE_URL</code> e
            <code className="mx-1">VITE_SUPABASE_ANON_KEY</code> nas definições do repositório.
          </p>
        </CartaoSimples>
      )}

      <form onSubmit={submeter} className="flex flex-col gap-4">
        {modo === 'registar' && (
          <CampoEntrada
            etiqueta="Nome completo"
            type="text"
            required
            autoComplete="name"
            value={nome}
            onChange={e => setNome(e.target.value)}
            placeholder="Ex.: João Silva"
          />
        )}

        <CampoEntrada
          etiqueta={modo === 'recuperar' ? 'Email da conta' : 'Email'}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="seuemail@exemplo.com"
        />

        {modo !== 'recuperar' && (
          <CampoEntrada
            etiqueta="Palavra-passe"
            type="password"
            required
            autoComplete={modo === 'registar' ? 'new-password' : 'current-password'}
            value={palavraPasse}
            onChange={e => setPalavraPasse(e.target.value)}
            placeholder="••••••••"
          />
        )}

        {modo === 'entrar' && (
          <button
            type="button"
            onClick={() => mudarModo('recuperar')}
            className="self-end min-h-11 px-1 font-display font-bold text-[11px] text-csc-gold cursor-pointer
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            Esqueci-me da palavra-passe
          </button>
        )}

        {erro && (
          <CartaoSimples className="flex items-start gap-2.5 p-3.5 bg-csc-red/12 border-csc-red/30">
            <p className="text-[10.5px] leading-relaxed text-csc-vermelho-suave">{erro}</p>
          </CartaoSimples>
        )}

        {aviso && (
          <CartaoSimples className="flex items-start gap-2.5 p-3.5 bg-csc-light/10 border-csc-light/25">
            <span className="w-5.5 h-5.5 rounded-[7px] bg-csc-light flex items-center justify-center text-white shrink-0 mt-0.5">
              <Check size={12} strokeWidth={3} />
            </span>
            <p className="flex-1 text-[10.5px] leading-relaxed text-white/70">{aviso}</p>
          </CartaoSimples>
        )}

        <Botao type="submit" largo disabled={ocupado} className="h-13 rounded-[26px] text-[13.5px]">
          {ocupado ? 'Um momento…' : TEXTOS[modo].accao}
        </Botao>
      </form>

      {modo === 'recuperar' ? (
        <>
          <CartaoSimples className="flex items-start gap-2.5 p-3.5">
            <span className="w-5.5 h-5.5 rounded-[7px] bg-white/15 flex items-center justify-center text-white/75 shrink-0 mt-0.5">
              <Info size={12} />
            </span>
            <p className="flex-1 text-[10.5px] leading-relaxed text-white/70">
              Se entraste com o Google não tens palavra-passe: usa outra vez o botão do Google no
              ecrã de entrada.
            </p>
          </CartaoSimples>
          <button
            type="button"
            onClick={() => mudarModo('entrar')}
            className="min-h-11 font-display font-bold text-[11.5px] text-white/75 cursor-pointer
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            Voltar a <span className="text-csc-gold">entrar</span>
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 py-1">
            <span className="flex-1 h-px bg-white/15" />
            <span className="font-display font-bold text-[9px] tracking-[0.14em] text-white/62">
              OU CONTINUA COM
            </span>
            <span className="flex-1 h-px bg-white/15" />
          </div>

          <Botao aparencia="vidro" largo disabled={ocupado} onClick={entrarComGoogle} className="h-13 rounded-[26px]">
            <svg viewBox="0 0 24 24" className="w-5 h-5 flex-none" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span>{modo === 'registar' ? 'Registar com o Google' : 'Entrar com o Google'}</span>
          </Botao>

          <button
            type="button"
            onClick={() => mudarModo(modo === 'registar' ? 'entrar' : 'registar')}
            className="min-h-11 font-display font-bold text-[11.5px] text-white/75 cursor-pointer
              focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-csc-gold"
          >
            {modo === 'registar' ? (
              <>Já tens conta? <span className="text-csc-gold">Entrar</span></>
            ) : (
              <>Não tens conta? <span className="text-csc-gold">Registar</span></>
            )}
          </button>
        </>
      )}
    </MolduraEntrada>
  )
}

export default Login
