/*
 * Receção de notificações push.
 *
 * Este ficheiro é importado pelo service worker que o `vite-plugin-pwa` gera
 * (`workbox.importScripts`), e não substitui esse — a app usa `generateSW`,
 * que trata do cache e das atualizações; isto só acrescenta os dois eventos
 * que o Workbox não conhece.
 *
 * `push` desenha o aviso. `notificationclick` leva ao sítio certo da app: se
 * já houver uma janela aberta, é essa que navega, em vez de abrir outra por
 * cima — quem toca num aviso não quer duas cópias da app.
 */

/* global self, clients */

const BASE = '/csc-vet/'

self.addEventListener('push', event => {
  if (!event.data) return

  let aviso
  try {
    aviso = event.data.json()
  } catch {
    aviso = { titulo: 'GDS Cascais', corpo: event.data.text() }
  }

  const titulo = aviso.titulo || 'GDS Cascais — Veteranos'
  const opcoes = {
    body: aviso.corpo || '',
    icon: BASE + 'pwa-192x192.png',
    badge: BASE + 'pwa-192x192.png',
    // Uma notificação por assunto: um segundo aviso da mesma convocatória
    // substitui o primeiro em vez de encher a gaveta.
    tag: aviso.tipo && aviso.origem_id ? `${aviso.tipo}:${aviso.origem_id}` : undefined,
    data: { destino: aviso.destino || '/' },
    lang: 'pt-PT',
  }

  event.waitUntil(self.registration.showNotification(titulo, opcoes))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  const destino = (event.notification.data && event.notification.data.destino) || '/'
  const url = new URL(BASE.replace(/\/$/, '') + destino, self.location.origin).href

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin + BASE) && 'navigate' in janela) {
          return janela.navigate(url).then(j => j && j.focus())
        }
      }
      return clients.openWindow(url)
    }),
  )
})
