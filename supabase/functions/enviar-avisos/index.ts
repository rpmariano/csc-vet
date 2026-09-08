// Envio dos avisos por notificação push.
// ======================================
//
// Corre de fora (ver `.github/workflows/avisos.yml`), lê a fila que a base
// calcula e entrega a cada dispositivo subscrito.
//
// **As regras não estão aqui.** Quem decide o que se envia a quem é o
// `avisos_pendentes()`, em SQL: são regras sobre os dados — quem foi
// convocado, quem não leu, quem deve — e em SQL testam-se com uma consulta.
// Esta função é só o carteiro.
//
// Uma subscrição que o serviço rejeita com 404 ou 410 é uma app desinstalada
// ou um browser que apagou os dados: apaga-se, senão fica a falhar para sempre
// em todas as corridas.
//
// `verify_jwt` está desligado de propósito: quem chama é um cron sem sessão de
// utilizador. A autorização é o `AVISOS_TOKEN`, verificado aqui em baixo.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'jsr:@supabase/supabase-js@2'

interface Aviso {
  profile_id: string
  tipo: string
  titulo: string
  corpo: string
  destino: string
  origem_id: string | null
}

interface Caixa {
  id: string
  profile_id: string
  endpoint: string
  p256dh: string
  auth: string
}

const env = (nome: string): string => {
  const valor = Deno.env.get(nome)
  if (!valor) throw new Error(`Falta a variável ${nome}`)
  return valor
}

/*
  Quem chama tem de provar que é o relógio, e não a internet: a função está
  exposta (`verify_jwt` desligado, porque quem chama é um cron sem sessão).

  A prova é o `AVISOS_TOKEN`, um segredo só para isto, igual dos dois lados.
  Era a chave de serviço do Supabase, e isso deu 401 sem se perceber porquê:
  a chave que a plataforma injeta na função e a que se copia do painel podem
  não ser a mesma — o Supabase está a passar as chaves antigas em JWT para o
  formato novo `sb_secret_…`, e um projeto pode ter as duas coisas à vista.
  Um segredo próprio não depende dessa migração.

  Os valores são aparados: uma quebra de linha colada ao fim de um segredo do
  GitHub é o engano mais fácil de cometer e o mais difícil de ver.
*/
function autorizado(req: Request): { ok: true } | { ok: false; porque: string } {
  const esperado = (Deno.env.get('AVISOS_TOKEN') ?? '').trim()
  if (!esperado) {
    return {
      ok: false,
      porque: 'O segredo AVISOS_TOKEN não está definido nesta função. ' +
        'Cria-o em Project Settings > Edge Functions > Secrets, com o mesmo valor ' +
        'que puseres no segredo AVISOS_TOKEN do GitHub.',
    }
  }

  const cabecalho = (req.headers.get('Authorization') ?? '').trim()
  const enviado = cabecalho.replace(/^Bearer\s+/i, '').trim()
  if (!enviado) {
    return { ok: false, porque: 'Veio sem cabeçalho Authorization.' }
  }
  if (enviado !== esperado) {
    return {
      ok: false,
      porque: `O token não corresponde (recebido: ${enviado.length} caracteres; ` +
        `esperado: ${esperado.length}). Confirma que o AVISOS_TOKEN é igual no ` +
        'GitHub e no Supabase, sem espaços nem quebras de linha.',
    }
  }
  return { ok: true }
}

Deno.serve(async (req: Request) => {
  const permissao = autorizado(req)
  if (!permissao.ok) {
    return new Response(permissao.porque, { status: 401 })
  }

  webpush.setVapidDetails(
    env('VAPID_SUBJECT'),          // 'mailto:...' — quem responde por estes envios
    env('VAPID_PUBLIC_KEY'),
    env('VAPID_PRIVATE_KEY'),
  )

  const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

  const { data: avisos, error: erroFila } = await supabase.rpc('avisos_pendentes')
  if (erroFila) return new Response(erroFila.message, { status: 500 })

  const fila = (avisos ?? []) as Aviso[]
  if (fila.length === 0) {
    return Response.json({ enviados: 0, falhados: 0, caixas_apagadas: 0 })
  }

  // As caixas de quem tem alguma coisa para receber, numa consulta só.
  const pessoas = [...new Set(fila.map(a => a.profile_id))]
  const { data: caixasData, error: erroCaixas } = await supabase
    .from('push_subscriptions')
    .select('id, profile_id, endpoint, p256dh, auth')
    .in('profile_id', pessoas)
  if (erroCaixas) return new Response(erroCaixas.message, { status: 500 })

  const caixasPorPessoa = new Map<string, Caixa[]>()
  for (const c of (caixasData ?? []) as Caixa[]) {
    caixasPorPessoa.set(c.profile_id, [...(caixasPorPessoa.get(c.profile_id) ?? []), c])
  }

  let enviados = 0
  let falhados = 0
  const mortas: string[] = []

  for (const aviso of fila) {
    const caixas = caixasPorPessoa.get(aviso.profile_id) ?? []
    if (caixas.length === 0) continue

    const carga = JSON.stringify({
      titulo: aviso.titulo,
      corpo: aviso.corpo,
      destino: aviso.destino,
      tipo: aviso.tipo,
      origem_id: aviso.origem_id,
    })

    let chegouAAlgures = false
    for (const caixa of caixas) {
      try {
        await webpush.sendNotification(
          { endpoint: caixa.endpoint, keys: { p256dh: caixa.p256dh, auth: caixa.auth } },
          carga,
        )
        chegouAAlgures = true
      } catch (err) {
        const estado = (err as { statusCode?: number }).statusCode
        if (estado === 404 || estado === 410) mortas.push(caixa.endpoint)
        else console.error('falha a enviar', caixa.endpoint, estado, err)
        falhados++
      }
    }

    /* Só se marca como enviado o que chegou a algum lado: se falhou em todos os
       dispositivos, a próxima corrida tenta outra vez. */
    if (chegouAAlgures) {
      enviados++
      const { error } = await supabase.rpc('registar_envio', {
        p_profile_id: aviso.profile_id,
        p_tipo: aviso.tipo,
        p_titulo: aviso.titulo,
        p_corpo: aviso.corpo,
        p_destino: aviso.destino,
        p_origem_id: aviso.origem_id,
      })
      if (error) console.error('falha a registar o envio', error.message)
    }
  }

  if (mortas.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', mortas)
  }

  return Response.json({ enviados, falhados, caixas_apagadas: mortas.length })
})
