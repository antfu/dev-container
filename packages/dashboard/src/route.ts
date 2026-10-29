import { ref } from 'vue'

export type Route
  = | { view: 'overview' }
    | { view: 'network', host?: string }
    | { view: 'service', name: string }

/** Reads `#/`, `#/network`, `#/network/<host:port>` and `#/services/<name>`. */
function parseRoute(hash: string): Route {
  const [, view = '', id] = hash.replace(/^#/, '').split('/').map(decodeURIComponent)
  if (view === 'network')
    return { view, host: id || undefined }
  if (view === 'services' && id)
    return { view: 'service', name: id }
  return { view: 'overview' }
}

export function routeHref(target: Route): string {
  if (target.view === 'network') {
    return target.host
      ? `#/network/${encodeURIComponent(target.host)}`
      : '#/network'
  }
  if (target.view === 'service')
    return `#/services/${encodeURIComponent(target.name)}`
  return '#/'
}

/** The page shown, kept in the hash so a reload or a shared link lands on the same view. */
export const route = ref<Route>(parseRoute(location.hash))

window.addEventListener('hashchange', () => {
  route.value = parseRoute(location.hash)
})

export function navigate(target: Route): void {
  location.hash = routeHref(target)
}
