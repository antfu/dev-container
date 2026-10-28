import type { GenerateOptions } from './generate'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { Diagnostic } from 'nostics'
import { diagnostics } from './diagnostics'
import { createLookup, generate, gpgSources } from './generate'
import { enableSigning, signingStatus } from './git'
import { lookupEnv, resolveSource } from './secrets'

export interface ComposeOptions {
  /** The `.dev-container` directory. */
  dir: string
  /** Docker CLI binary. Defaults to `docker`. */
  docker?: string
}

export function composeArgs(dir: string, args: string[]): string[] {
  return [
    'compose',
    '-f',
    join(dir, 'compose.yml'),
    ...args,
  ]
}

/** Runs `docker compose <args>` against the generated stack, inheriting stdio. Resolves to the exit code. */
export function compose(args: string[], { dir, docker = 'docker' }: ComposeOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, composeArgs(dir, args), { stdio: 'inherit' })
    child.on('error', error => reject(dockerFailure(error, docker)))
    child.on('close', code => resolve(code ?? 1))
  })
}

/** Maps a failed docker invocation to a diagnostic: missing CLI, or the command's own error output. */
export function dockerFailure(error: Error, docker: string): Diagnostic {
  if ('code' in error && error.code === 'ENOENT')
    return diagnostics.DEV_CONTAINER_D4001({ docker, cause: error })
  const stderr = 'stderr' in error && typeof error.stderr === 'string'
    ? error.stderr.trim()
    : ''
  return diagnostics.DEV_CONTAINER_D4002({ output: stderr || error.message, cause: error })
}

/** Generates `.dev-container/` and starts the stack; `onWarnings` sees non-fatal findings before docker runs. */
export function up(options: GenerateOptions & { args?: string[], docker?: string, onWarnings?: (warnings: Diagnostic<unknown>[]) => void }): Promise<number> {
  const { dir, warnings } = generate(options)
  options.onWarnings?.(warnings)
  return compose([
    'up',
    '-d',
    '--build',
    '--remove-orphans',
    ...options.args ?? [],
  ], { dir, docker: options.docker }).then(async (code) => {
    if (code === 0) {
      options.onWarnings?.(await setupSigning(options, dir).catch(error => [
        error instanceof Diagnostic
          ? error
          : signingFailure('every service', error),
      ]))
    }
    return code
  })
}

/**
 * Imports the `gpg` builtin's key into each running service that has gpg. A failure is a warning, since the
 * stack is already up. The `auto` setting and the default sources are off when `GPG_PRIVATE_KEY` is unset.
 */
async function setupSigning(options: GenerateOptions & { docker?: string }, dir: string): Promise<Diagnostic<unknown>[]> {
  const setting = options.config.builtins.gpg
  const sources = gpgSources(options.config)
  if (!setting || !sources)
    return []
  const given = setting === 'auto'
    ? {}
    : setting
  const lookup = createLookup(options)
  if (!given.privateKey && !lookupEnv(lookup, 'GPG_PRIVATE_KEY'))
    return []

  const keys = [
    resolveSource(sources.privateKey, lookup, 'builtins.gpg.privateKey'),
  ]
  if (given.publicKey || lookupEnv(lookup, 'GPG_PUBLIC_KEY'))
    keys.push(resolveSource(sources.publicKey, lookup, 'builtins.gpg.publicKey'))

  const problems: Diagnostic<unknown>[] = []
  for (const service of given.services ?? Object.keys(options.config.services)) {
    const target = {
      dir,
      service,
      user: given.user,
      docker: options.docker,
    }
    try {
      // Services without gpg, such as a static server, are left alone unless they were named.
      if (given.services || (await signingStatus(target)).installed)
        await enableSigning(target, ...keys)
    }
    catch (error) {
      problems.push(signingFailure(service, error))
    }
  }
  return problems
}

function signingFailure(service: string, error: unknown): Diagnostic<unknown> {
  const stderr = error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
    ? error.stderr.trim()
    : ''
  const output = stderr || (error instanceof Error
    ? error.message
    : String(error))
  return diagnostics.DEV_CONTAINER_D4005({ service, output, cause: error })
}
