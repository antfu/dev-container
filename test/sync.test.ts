import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sync } from '../src'

const docker = fileURLToPath(new URL('fixtures/fake-docker.mjs', import.meta.url))
const stackConfig = (image: string) => `export default { envFile: ['.env'], builtins: { github: false, npm: false }, services: { agent: { image: '${image}' } } }\n`

let tmp: string
/** Where the remote's history is written, as from another machine. */
let work: string
/** The always-on checkout that syncs. */
let host: string

function git(cwd: string, ...args: string[]) {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', ...args], { cwd, encoding: 'utf8', stdio: 'pipe' }).trim()
}

function commit(cwd: string, files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(cwd, file)), { recursive: true })
    writeFileSync(join(cwd, file), content)
  }
  git(cwd, 'add', '.')
  git(cwd, 'commit', '-m', 'change')
}

/** Stacks `docker compose up` ran for since the last call, by directory. */
function ups() {
  const log = join(tmp, 'log')
  if (!existsSync(log))
    return []
  const lines = readFileSync(log, 'utf8').trim().split('\n')
  writeFileSync(log, '')
  return lines.filter(Boolean).map(line => line.split(' ')[2]!.slice(host.length + 1).replace('/.dev-container/compose.yml', ''))
}

const statuses = async () => (await sync({ cwd: host, docker })).stacks.map(({ root, status }) => [root.slice(host.length + 1), status])

beforeEach(() => {
  tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dev-container-sync-')))
  vi.stubEnv('FAKE_DOCKER_LOG', join(tmp, 'log'))
  git(tmp, 'init', '--bare', '-b', 'main', 'remote.git')
  git(tmp, 'clone', 'remote.git', 'work')
  work = join(tmp, 'work')
  commit(work, { 'a/dev-container.config.ts': stackConfig('alpine'), 'b/dev-container.config.ts': stackConfig('alpine'), 'README.md': 'configs\n' })
  git(work, 'push', 'origin', 'main')
  git(tmp, 'clone', 'remote.git', 'host')
  host = join(tmp, 'host')
  writeFileSync(join(host, 'a/.env'), '')
  writeFileSync(join(host, 'b/.env'), '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sync', () => {
  it('starts every stack once, then only the ones a pull changed', async () => {
    expect(await statuses()).toEqual([['a', 'updated'], ['b', 'updated']])
    expect(ups()).toEqual(['a', 'b'])

    expect(await statuses()).toEqual([['a', 'unchanged'], ['b', 'unchanged']])
    expect(ups()).toEqual([])

    commit(work, { 'b/dev-container.config.ts': stackConfig('node:24'), 'README.md': 'more configs\n' })
    git(work, 'push')
    const result = await sync({ cwd: join(host, 'a'), docker })
    expect(result.to).toBe(git(work, 'rev-parse', 'HEAD'))
    expect(result.from).not.toBe(result.to)
    expect(result.stacks.map(stack => stack.status)).toEqual(['unchanged', 'updated'])
    expect(ups()).toEqual(['b'])
    expect(readFileSync(join(host, 'b/.dev-container/compose.yml'), 'utf8')).toContain('image: node:24')
  })

  it('updates a stack when its host-only env file changes', async () => {
    await sync({ cwd: host, docker })
    ups()
    writeFileSync(join(host, 'a/.env'), 'MODE=fast\n')
    expect(await statuses()).toEqual([['a', 'updated'], ['b', 'unchanged']])
  })

  it('leaves a stack that fails to come up for the next run to retry', async () => {
    vi.stubEnv('FAKE_DOCKER_FAIL', '/b/')
    const [a, b] = (await sync({ cwd: host, docker })).stacks
    expect(a!.status).toBe('updated')
    expect(b).toMatchObject({ status: 'failed', error: { name: 'DEV_CONTAINER_G6004' } })

    vi.stubEnv('FAKE_DOCKER_FAIL', '')
    ups()
    expect(await statuses()).toEqual([['a', 'unchanged'], ['b', 'updated']])
  })

  it('reports a broken config without touching that stack', async () => {
    await sync({ cwd: host, docker })
    ups()
    commit(work, { 'a/dev-container.config.ts': `export default { services: {} }\n` })
    git(work, 'push')
    const [a] = (await sync({ cwd: host, docker })).stacks
    expect(a).toMatchObject({ status: 'failed', error: { errors: [expect.objectContaining({ name: 'DEV_CONTAINER_C1002' })] } })
    expect(ups()).toEqual([])
  })

  it('refuses to pull over local edits to tracked files', async () => {
    writeFileSync(join(host, 'README.md'), 'edited\n')
    await expect(sync({ cwd: host, docker })).rejects.toMatchObject({ name: 'DEV_CONTAINER_G6002' })
    expect(ups()).toEqual([])
  })

  it('refuses a pull that is not a fast-forward', async () => {
    commit(work, { 'README.md': 'remote\n' })
    git(work, 'push')
    commit(host, { 'README.md': 'local\n' })
    await expect(sync({ cwd: host, docker })).rejects.toMatchObject({ name: 'DEV_CONTAINER_G6003' })
    expect(ups()).toEqual([])
  })

  it('needs a git checkout', async () => {
    await expect(sync({ cwd: tmp, docker })).rejects.toMatchObject({ name: 'DEV_CONTAINER_G6001' })
  })
})
