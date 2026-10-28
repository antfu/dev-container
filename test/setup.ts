import process from 'node:process'

// Git hooks export GIT_DIR, GIT_INDEX_FILE and friends; inherited, they would point the tests' scratch repos at this one.
for (const key of Object.keys(process.env).filter(key => key.startsWith('GIT_')))
  delete process.env[key]
