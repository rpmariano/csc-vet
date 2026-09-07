import React, { useEffect, useState } from 'react'
import { Unlink } from 'lucide-react'
import type { Profile } from '../context/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { CartaoVidro, CartaoSimples, EtiquetaSeccao } from './ui'

/**
 * Conta criada, ficha por ligar (ecrã 11a).
 *
 * Neste clube as fichas do plantel são criadas pela direção **antes** de as
 * pessoas se registarem. Quando alguém se regista, o `AuthContext` tenta ligar
 * sozinho por email (`find_my_profile_match({ p_email_only: true })`), e o
 * `AutoAssociationModal` propõe a ficha quando bate o telefone ou o nome.
 *
 * O caso que faltava é o terceiro: registou-se com um email que não está na
 * ficha, e nem o telefone nem o nome deram correspondência. Aí não aparecia
 * mensagem nenhuma — a pessoa via a app normal, sem convocatórias e sem
 * aparecer no plantel, sem uma linha que explicasse porquê. Hoje não há
 * nenhuma conta assim, mas o caso repete-se sempre que a associação
 * automática falhar.
 *
 * **Sem ação nenhuma para o próprio**, e em especial sem o "Preencher o meu
 * perfil" que o handoff desenhava: preencher dados numa ficha órfã cria uma
 * segunda ficha da mesma pessoa, que é precisamente o que o ecrã 3d existe
 * para desfazer. O que se pode fazer é dizer o email do registo a quem liga as
 * contas — daí ele estar aqui, em texto que se lê e se copia.
 */

/**
 * Esta conta ficou por ligar a alguma pessoa do clube?
 *
 * É a mesma pergunta da RPC `admin_contas_por_ligar()`, feita do lado do
 * próprio — e com o mesmo cuidado, por uma razão que se aprendeu à custa:
 * **`profiles` são as pessoas do clube e não os atletas.** Há quem jogue, quem
 * jogue e treine ou dirija, e quem não jogue de todo. Uma ficha sem camisola
 * nem posição pode ser a de um treinador, e listá-lo a mais num ecrã de admin
 * é um incómodo — substituir-lhe a Home é tirar-lhe a app.
 *
 * A condição olha **só para colunas que o próprio não pode escrever**:
 *
 * - `role` e `roles` — a política de UPDATE da própria ficha impede mudá-los.
 *   Quem tem papel atribuído para lá do `player` por omissão é alguém que a
 *   direção reconheceu.
 * - `jersey_number` e `position` — o bloco desportivo das Definições é só de
 *   leitura; nenhum dos dois vai no que o próprio guarda.
 *
 * Ficaram de fora `birth_date` e `member_number`, que a condição antiga usava:
 * as Definições deixam o próprio escrevê-los, e com eles aqui bastava preencher
 * o aniversário para o aviso desaparecer sem nada estar resolvido.
 *
 * O `useFichaPorLigar` acrescenta a última verificação, que precisa da rede: se
 * a pessoa já foi convocada alguma vez, o clube conta com ela e a ficha está
 * ligada, digam as colunas o que disserem.
 */
function pareceFichaPorLigar(
  perfil: Profile | null | undefined,
  papeis: readonly string[],
): boolean {
  if (!perfil) return false
  if (perfil.role !== 'player') return false
  if (papeis.some(p => p !== 'player')) return false
  return !perfil.jersey_number && !perfil.position?.trim()
}

/**
 * O estado da conta, para a Home decidir o que mostrar.
 *
 * `'a-verificar'` só acontece a quem passa no teste das colunas — para toda a
 * gente é `'ligada'` de imediato, sem ir à rede. A Home espera nesse instante
 * em vez de piscar entre os dois ecrãs.
 */
export type EstadoDaFicha = 'ligada' | 'por-ligar' | 'a-verificar'

export function useFichaPorLigar(
  perfil: Profile | null | undefined,
  papeis: readonly string[],
): EstadoDaFicha {
  const candidata = pareceFichaPorLigar(perfil, papeis)
  // Pelo id e não pelo objeto: o `profile` do contexto muda de identidade a
  // cada render, e no array de dependências repetia a consulta sem fim.
  const idDoPerfil = perfil?.id ?? null
  const [estado, setEstado] = useState<EstadoDaFicha>(candidata ? 'a-verificar' : 'ligada')

  useEffect(() => {
    if (!candidata || !idDoPerfil) {
      setEstado('ligada')
      return
    }
    let cancelado = false
    setEstado('a-verificar')

    supabase
      .from('callups')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', idDoPerfil)
      .then(({ count, error }) => {
        if (cancelado) return
        // Perante um erro, dar a ficha por ligada: é o estado que deixa a app
        // funcionar, e o aviso volta a aparecer no carregamento seguinte.
        setEstado(!error && (count ?? 0) === 0 ? 'por-ligar' : 'ligada')
      })

    return () => { cancelado = true }
  }, [candidata, idDoPerfil])

  return estado
}

const ENTRETANTO = [
  'Ver a agenda e as classificações',
  'Ler os comunicados do clube',
  'Consultar as fichas dos jogos e as estatísticas',
] as const

export const FichaPorLigar: React.FC<{ perfil: Profile }> = ({ perfil }) => (
  <div className="space-y-4">
    <CartaoVidro className="p-[17px]">
      <div className="flex items-center gap-3">
        <span
          className="w-[34px] h-[34px] rounded-xl bg-csc-gold/20 border border-csc-gold/40
            flex items-center justify-center text-csc-gold flex-none"
        >
          <Unlink size={16} />
        </span>
        <p className="flex-1 font-display font-extrabold text-[15px] text-white text-pretty">
          A tua ficha existe, mas não está ligada
        </p>
      </div>

      <p className="text-[11.5px] leading-relaxed text-white/70 mt-3">
        Há uma ficha tua no plantel, mas a app não conseguiu ligá-la a esta conta — quase
        sempre porque o email do registo é diferente do que está na ficha. Até estar ligada
        não recebes convocatórias nem apareces no plantel.
      </p>

      {/*
        O email do registo, em texto e não numa imagem: é a única coisa que
        esta pessoa pode fazer — dizê-lo a quem liga as contas no 3d.
      */}
      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-black/28 border border-csc-gold/25 mt-3.5">
        <EtiquetaSeccao como="p" className="text-csc-gold/85 text-[8.5px] flex-none">
          Registaste-te com
        </EtiquetaSeccao>
        <span className="flex-1 min-w-0 font-mono text-[11px] text-white text-right truncate">
          {perfil.email || 'sem email'}
        </span>
      </div>

      <p className="text-[11.5px] leading-relaxed text-white/70 mt-3">
        Diz este email a alguém da direção: liga a ficha em dois toques, e a app fica
        normal logo a seguir.
      </p>
    </CartaoVidro>

    <CartaoSimples className="p-[17px]">
      <EtiquetaSeccao como="p">Entretanto podes</EtiquetaSeccao>
      <ul className="flex flex-col gap-2.5 mt-3">
        {ENTRETANTO.map(linha => (
          <li key={linha} className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-csc-gold flex-none" aria-hidden="true" />
            <span className="flex-1 text-[11.5px] text-white/70">{linha}</span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-normal text-white/40 mt-3.5 pt-3 border-t border-white/8">
        Não preenchas os teus dados neste estado: criava uma segunda ficha tua, e depois é
        a direção que tem de as juntar.
      </p>
    </CartaoSimples>
  </div>
)

export default FichaPorLigar
