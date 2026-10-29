import type { HostSummary, NetworkRequest } from './types'

/** The pattern for `egress.allow`: the host, plus the port when it is not an ordinary web port. */
export function hostPattern({ host, port }: { host: string, port: number }): string {
  return port === 443 || port === 80
    ? host
    : `${host}:${port}`
}

export function summarize(requests: NetworkRequest[]): HostSummary[] {
  const groups = new Map<string, HostSummary>()
  for (const request of requests) {
    const key = `${request.host}:${request.port}`
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        host: request.host,
        port: request.port,
        services: [],
        allowed: 0,
        blocked: 0,
        lastSeen: '',
        requests: [],
      }
      groups.set(key, group)
    }
    group.requests.push(request)
    if (request.outcome === 'allowed')
      group.allowed++
    else
      group.blocked++
    if (request.service && !group.services.includes(request.service))
      group.services.push(request.service)
    if (request.time > group.lastSeen)
      group.lastSeen = request.time
  }
  return [
    ...groups.values(),
  ].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}

export interface Suggestion {
  /** What the change does, in a sentence. */
  title: string
  /** Config to paste into dev-container.config.ts; empty when the change needs no code. */
  snippet: string
  /** A message to hand to an agent that edits the config. */
  prompt: string
}

const APPLY = 'Then run `dev-container up` on the host to apply it.'

/** The newest blocked request, whose diagnostic says which part of the config to change. */
function lastBlocked(host: HostSummary): NetworkRequest | undefined {
  return host.requests.findLast(request => request.outcome === 'blocked')
}

export function allowSuggestion(host: HostSummary): Suggestion {
  const pattern = hostPattern(host)
  const blocked = lastBlocked(host)
  const who = host.services.length
    ? `the service ${host.services.map(s => `\`${s}\``).join(', ')}`
    : 'a service'
  const reason = blocked?.why
    ? ` It was blocked: ${blocked.why} (${blocked.code})`
    : ''
  const check = ' Check that the host is one you trust before allowing it.'

  if (blocked?.code === 'DEV_CONTAINER_B5004') {
    const secret = blocked.why?.match(/^(\w+) is not bound/)?.[1] ?? 'SECRET_NAME'
    return {
      title: `Bind ${secret} to ${host.host}`,
      snippet: `// A builtin such as github or npm is replaced by an entry like this; turn the builtin off with \`builtins: { github: false }\`.
secrets: [
  { env: '${secret}', hosts: ['${host.host}'] },
],`,
      prompt: `In dev-container.config.ts, let the broker send the secret ${secret} to \`${host.host}\`: add the host to that secret's \`hosts\` (declare it under \`secrets\` if it comes from a builtin, and turn that builtin off).${reason}${check} ${APPLY}`,
    }
  }
  if (blocked?.code === 'DEV_CONTAINER_B5007') {
    return {
      title: `Permit this request in the secret's rules`,
      snippet: `// In the secret's \`rules\`, before any deny rule that matches it:
{ action: 'allow', method: '${blocked.method}', path: '${blocked.path || '/**'}' },`,
      prompt: `In dev-container.config.ts, change the \`rules\` of the secret that the broker refused so that ${blocked.method} ${blocked.path || '/'} on \`${host.host}\` is allowed. Rules are checked in order and the first match wins.${reason}${check} ${APPLY}`,
    }
  }
  if (blocked && blocked.code !== 'DEV_CONTAINER_B5001') {
    return {
      title: 'Fix the blocked request',
      snippet: '',
      prompt: `${who} sent a request to \`${host.host}\` that the dev-container broker refused.${reason} Read the diagnostic's docs page, \`docs/errors/${blocked.code}.md\`, and fix the cause in dev-container.config.ts or in the service.`,
    }
  }
  return {
    title: `Allow ${pattern} through egress`,
    snippet: `egress: {
  policy: 'allowlist',
  // Add to the list you already have.
  allow: ['${pattern}'],
},`,
    prompt: `In dev-container.config.ts, allow ${who} to reach \`${pattern}\`: add \`'${pattern}'\` to \`egress.allow\`, and set \`egress.policy\` to \`'allowlist'\` if it is not already.${reason}${check} ${APPLY}`,
  }
}

/** Turns the egress allowlist on for just the hosts seen so far, minus this one. */
export function blockSuggestion(host: HostSummary, all: HostSummary[]): Suggestion {
  const patterns = [
    ...new Set(all
      .filter(other => other.key !== host.key && other.allowed > 0)
      .map(hostPattern)),
  ].sort()
  const list = patterns.map(pattern => `    '${pattern}',`).join('\n')
  return {
    title: `Block ${hostPattern(host)}`,
    snippet: `// Everything not listed is refused, including ${hostPattern(host)}. Hosts bound to a secret stay reachable.
egress: {
  policy: 'allowlist',
  allow: [
${list}
  ],
},`,
    prompt: `In dev-container.config.ts, stop services from reaching \`${hostPattern(host)}\`. Egress has no deny list, so set \`egress.policy\` to \`'allowlist'\` and list only the hosts the services need, leaving this one out. These hosts were seen so far: ${patterns.map(pattern => `\`${pattern}\``).join(', ') || 'none'}. Drop any of them that are not needed. ${APPLY}`,
  }
}
