import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Info } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { MolduraEntrada, CampoEntrada, Botao, CartaoSimples } from '../components/ui'
import { toast } from '../context/ToastContext'

/**
 * Nova palavra-passe (ecrã 10d) — o fim do caminho começado em "Esqueci-me da
 * palavra-passe".
 *
 * Chega-se aqui pelo link do email e por mais lado nenhum: o Supabase abre uma
 * sessão de recuperação ao seguir o link e emite `PASSWORD_RECOVERY`. Sem essa
 * sessão não há nada a fazer neste ecrã — é o que acontece quando o link
 * expira (vale uma hora) ou quando alguém escreve o endereço à mão — e o ecrã
 * diz-lho e manda-o pedir outro.
 *
 * Fica fora do `ProtectedRoute` de propósito: quem vem do link ainda não é uma
 * sessão normal, e o `Layout` (com barra de navegação e fotografia) não faz
 * sentido a meio de recuperar o acesso.
 */

const MINIMO = 8

const NovaPalavraPasse: React.FC = () => {
  const navegar = useNavigate()

  const [temSessaoDeRecuperacao, setTemSessaoDeRecuperacao] = useState<boolean | null>(null)
  const [palavraPasse, setPalavraPasse] = useState('')
  const [confirmacao, setConfirmacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let cancelado = false

    // O evento pode chegar depois de montarmos (o Supabase lê o token do
    // endereço de forma assíncrona), por isso escutamos e também perguntamos.
    const { data: subscricao } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (cancelado) return
      if (evento === 'PASSWORD_RECOVERY' || sessao) setTemSessaoDeRecuperacao(true)
    })

    supabase.auth.getSession().then(({ data }) => {
      if (!cancelado) setTemSessaoDeRecuperacao(prev => prev ?? !!data.session)
    })

    return () => {
      cancelado = true
      subscricao.subscription.unsubscribe()
    }
  }, [])

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)

    if (palavraPasse.length < MINIMO) {
      setErro(`A palavra-passe tem de ter pelo menos ${MINIMO} caracteres.`)
      return
    }
    if (palavraPasse !== confirmacao) {
      setErro('As duas palavras-passe não são iguais.')
      return
    }

    setOcupado(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: palavraPasse })
      if (error) throw error
      toast.success('Palavra-passe alterada. Já estás dentro.')
      navegar('/', { replace: true })
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível guardar a palavra-passe.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <MolduraEntrada>
      <div className="pb-1.5">
        <h1 className="font-display font-black text-[22px] leading-tight text-white tracking-[-0.02em]">
          Nova palavra-passe
        </h1>
        <p className="text-[11px] text-white/55 mt-1">
          Escolhe uma que só tu saibas. Ficas logo com sessão iniciada.
        </p>
      </div>

      {temSessaoDeRecuperacao === false ? (
        <>
          <CartaoSimples className="flex items-start gap-2.5 p-3.5">
            <span className="w-5.5 h-5.5 rounded-[7px] bg-white/15 flex items-center justify-center text-white/75 shrink-0 mt-0.5">
              <Info size={12} />
            </span>
            <p className="flex-1 text-[10.5px] leading-relaxed text-white/70">
              Este link já não serve — vale uma hora a partir do momento em que é enviado. Pede
              outro e volta a abri-lo pelo email.
            </p>
          </CartaoSimples>
          <Botao largo onClick={() => navegar('/login?modo=recuperar')} className="h-13 rounded-[26px] text-[13.5px]">
            Pedir outro link
          </Botao>
        </>
      ) : (
        <form onSubmit={guardar} className="flex flex-col gap-4">
          <CampoEntrada
            etiqueta="Nova palavra-passe"
            type="password"
            required
            autoComplete="new-password"
            value={palavraPasse}
            onChange={e => setPalavraPasse(e.target.value)}
            placeholder="••••••••"
            nota={`Pelo menos ${MINIMO} caracteres.`}
          />
          <CampoEntrada
            etiqueta="Repete a palavra-passe"
            type="password"
            required
            autoComplete="new-password"
            value={confirmacao}
            onChange={e => setConfirmacao(e.target.value)}
            placeholder="••••••••"
          />

          {erro && (
            <CartaoSimples className="p-3.5 bg-csc-red/12 border-csc-red/30">
              <p className="text-[10.5px] leading-relaxed text-csc-vermelho-suave">{erro}</p>
            </CartaoSimples>
          )}

          <Botao
            type="submit"
            largo
            disabled={ocupado || temSessaoDeRecuperacao === null}
            className="h-13 rounded-[26px] text-[13.5px]"
          >
            {ocupado ? 'A guardar…' : 'Guardar e entrar'}
          </Botao>
        </form>
      )}
    </MolduraEntrada>
  )
}

export default NovaPalavraPasse
