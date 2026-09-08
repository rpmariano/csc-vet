import { supabase } from './supabaseClient'

/**
 * Subscrição de notificações push, do lado do browser.
 *
 * Uma pessoa tem uma subscrição por dispositivo e por browser: o `endpoint`
 * que o browser devolve identifica a instalação, e é ele a chave em
 * `push_subscriptions`. Voltar a subscrever no mesmo telemóvel devolve o mesmo
 * endpoint e atualiza a linha, em vez de criar outra — sem isso a pessoa
 * recebia o mesmo aviso uma vez por cada arranque da app.
 *
 * **No iPhone só funciona com a app instalada no ecrã principal.** O Safari só
 * dá `PushManager` a uma PWA instalada (iOS 16.4+), por isso `podeSubscrever()`
 * devolve `false` num Safari normal e o ecrã de avisos explica-o em vez de
 * mostrar um botão que não faz nada.
 */

/** A chave pública VAPID. É pública por desenho — vai no bundle. */
const CHAVE_PUBLICA = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** base64url → bytes, que é o que o `PushManager` quer. */
function chaveParaBytes(base64: string): ArrayBuffer {
  const preenchida = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bruto = atob(preenchida)
  /* Um `ArrayBuffer` e não um `Uint8Array`: o tipo de `applicationServerKey` é
     `BufferSource`, e o `Uint8Array` do TypeScript 5.7 em diante é genérico
     no buffer, o que já não encaixa lá. */
  return Uint8Array.from([...bruto].map(c => c.charCodeAt(0))).buffer as ArrayBuffer
}

/** Uma chave do `PushSubscription` em base64, para guardar na base. */
function chaveEmBase64(sub: PushSubscription, nome: 'p256dh' | 'auth'): string {
  const bytes = sub.getKey(nome)
  if (!bytes) return ''
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

export type EstadoPush =
  | 'sem-suporte'      // o browser não sabe o que isto é (ou é Safari sem app instalada)
  | 'por-configurar'   // falta a chave VAPID no build
  | 'recusado'         // a pessoa disse que não, e só nas definições do browser volta atrás
  | 'desligado'        // dá, mas ainda não subscreveu
  | 'ligado'

export const podeSubscrever = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

export async function estadoDoPush(): Promise<EstadoPush> {
  if (!podeSubscrever()) return 'sem-suporte'
  if (!CHAVE_PUBLICA) return 'por-configurar'
  if (Notification.permission === 'denied') return 'recusado'

  const registo = await navigator.serviceWorker.getRegistration()
  const sub = await registo?.pushManager.getSubscription()
  return sub ? 'ligado' : 'desligado'
}

/**
 * Pede autorização, subscreve e guarda a caixa de correio.
 *
 * Devolve o estado em que ficou — quem chama mostra a mensagem, porque a
 * razão de não ter ligado interessa: recusado não é o mesmo que não suportado.
 */
export async function ligarAvisos(profileId: string): Promise<EstadoPush> {
  if (!podeSubscrever()) return 'sem-suporte'
  if (!CHAVE_PUBLICA) return 'por-configurar'

  const permissao = await Notification.requestPermission()
  if (permissao !== 'granted') return permissao === 'denied' ? 'recusado' : 'desligado'

  const registo = await navigator.serviceWorker.ready
  const sub =
    (await registo.pushManager.getSubscription()) ??
    (await registo.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: chaveParaBytes(CHAVE_PUBLICA),
    }))

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: profileId,
      endpoint: sub.endpoint,
      p256dh: chaveEmBase64(sub, 'p256dh'),
      auth: chaveEmBase64(sub, 'auth'),
      user_agent: navigator.userAgent.slice(0, 300),
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  return 'ligado'
}

/** Desliga neste dispositivo — os outros continuam a receber. */
export async function desligarAvisos(): Promise<void> {
  const registo = await navigator.serviceWorker.getRegistration()
  const sub = await registo?.pushManager.getSubscription()
  if (!sub) return

  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}
