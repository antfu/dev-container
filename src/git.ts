import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { composeArgs, dockerFailure } from './docker'

export interface GitTarget {
  /** The `.dev-container` directory. */
  dir: string
  service: string
  /** The container user that owns the git and gpg config; defaults to the image's user. */
  user?: string
  /** Docker CLI binary. Defaults to `docker`. */
  docker?: string
}

export interface GpgStatus {
  /** Whether `gpg` exists in the container. */
  installed: boolean
  /** Whether `commit.gpgsign` is on for the user. */
  signing: boolean
  keys: { fingerprint: string, uid: string }[]
}

// The key arrives on stdin, never in the environment or the compose file.
const IMPORT = `set -e
gpg --batch --quiet --import
fpr="$(gpg --batch --list-secret-keys --with-colons | awk -F: '/^fpr:/ { print $10; exit }')"
[ -n "$fpr" ] || { echo 'no secret key was imported' >&2; exit 1; }
git config --global user.signingkey "$fpr"
git config --global commit.gpgsign true
git config --global tag.gpgsign true
echo "$fpr"`

const STATUS = `if command -v gpg >/dev/null 2>&1; then echo 'installed:1'; gpg --batch --list-secret-keys --with-colons 2>/dev/null || true; else echo 'installed:0'; fi
echo "signing:$(git config --global --get commit.gpgsign 2>/dev/null || echo false)"`

const EXPORT = `key="$(git config --global --get user.signingkey || true)"
[ -z "$key" ] || gpg --batch --armor --export "$key"`

const DISABLE = `git config --global commit.gpgsign false
git config --global tag.gpgsign false`

/** Accepts an armored key as is, or base64 of one, which fits a single dotenv line. */
function decodeKey(value: string): string {
  const text = value.trim()
  return text.includes('-----BEGIN')
    ? text
    : Buffer.from(text, 'base64').toString('utf8')
}

/** Imports the key into the container user's keyring and turns on commit and tag signing. Resolves to the fingerprint. */
export async function enableSigning(target: GitTarget, ...keys: string[]): Promise<string> {
  const stdout = await exec(target, IMPORT, `${keys.map(decodeKey).join('\n')}\n`)
  return stdout.trim().split('\n').pop() ?? ''
}

export async function signingStatus(target: GitTarget): Promise<GpgStatus> {
  const lines = (await exec(target, STATUS)).split('\n')
  const keys: GpgStatus['keys'] = []
  let fingerprint = ''
  for (const line of lines) {
    const fields = line.split(':')
    if (fields[0] === 'fpr' && !fingerprint) {
      fingerprint = fields[9] ?? ''
    }
    else if (fields[0] === 'uid' && fingerprint) {
      keys.push({ fingerprint, uid: fields[9] ?? '' })
      fingerprint = ''
    }
  }
  return {
    installed: lines.includes('installed:1'),
    signing: lines.includes('signing:true'),
    keys,
  }
}

/** The armored public key of the signing key, for adding to GitHub; empty when no key is set up. */
export async function publicKey(target: GitTarget): Promise<string> {
  return (await exec(target, EXPORT)).trim()
}

/** Turns signing off; the key stays in the keyring. */
export async function disableSigning(target: GitTarget): Promise<void> {
  await exec(target, DISABLE)
}

function exec({ dir, service, user, docker = 'docker' }: GitTarget, script: string, stdin = ''): Promise<string> {
  const args = composeArgs(dir, [
    'exec',
    '-T',
    ...user
      ? ['-u', user]
      : [],
    service,
    'sh',
    '-c',
    script,
  ])
  return new Promise((resolve, reject) => {
    const child = spawn(docker, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', error => reject(dockerFailure(error, docker)))
    child.on('close', (code) => {
      if (code === 0)
        resolve(stdout)
      else
        reject(dockerFailure(Object.assign(new Error(`${service} exited with ${code}`), { stderr }), docker))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(stdin)
  })
}
