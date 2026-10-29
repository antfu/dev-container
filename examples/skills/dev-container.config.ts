import { defineConfig } from '@antfu/dev-container'

/**
 * Installs the global skills listed in `skills.txt` for Claude Code and Codex, and keeps them.
 * Interactive: `dev-container up`, then `dev-container compose exec skills claude` (or `codex`).
 */
export default defineConfig({
  services: {
    skills: {
      build: '.',
      command: ['sleep', 'infinity'],
      env: {
        // Which agents `skills add` installs for; see `skills add --help` for the names.
        SKILLS_AGENTS: 'claude-code codex',
        // The CLI reports installs to its own service, which the cage has no need to reach.
        DISABLE_TELEMETRY: '1',
      },
      volumes: [
        // Read on every start, so editing it needs a restart, not a rebuild.
        './skills.txt:/home/node/skills.txt:ro',
        './projects:/home/node/projects',
      ],
      persist: [
        // The skills and their lock file, `~/.agents/.skill-lock.json`. Claude Code and Codex
        // link to the skills from their own directories, so persist those too.
        '/home/node/.agents',
        '/home/node/.claude',
        '/home/node/.codex',
      ],
    },
  },
})
