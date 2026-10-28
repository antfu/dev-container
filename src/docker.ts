import type { GenerateOptions } from './generate'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { generate } from './generate'

export interface ComposeOptions {
  /** The `.dev-container` directory. */
  dir: string
  /** Docker CLI binary. Defaults to `docker`. */
  docker?: string
}

function composeArgs(dir: string, args: string[]): string[] {
  return ['compose', '-f', join(dir, 'compose.yml'), ...args]
}

/** Runs `docker compose <args>` against the generated stack, inheriting stdio. Resolves to the exit code. */
export function compose(args: string[], { dir, docker = 'docker' }: ComposeOptions): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(docker, composeArgs(dir, args), { stdio: 'inherit' })
    child.on('error', reject)
    child.on('close', code => resolve(code ?? 1))
  })
}

/** Generates `.dev-container/` and starts the stack. */
export function up(options: GenerateOptions & { args?: string[], docker?: string }): Promise<number> {
  const { dir } = generate(options)
  return compose(['up', '-d', '--build', '--remove-orphans', ...options.args ?? []], { dir, docker: options.docker })
}
