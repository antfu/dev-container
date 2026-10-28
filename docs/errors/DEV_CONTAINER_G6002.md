# DEV_CONTAINER_G6002: Uncommitted changes

The checkout has changes to tracked files. `dev-container sync` treats the remote as the source of truth, so it refuses to pull over local edits. No stack is touched; they keep running as they were.

Untracked and ignored files, such as `.env.secret` and `.dev-container/`, do not count.

## Fix

Commit the change and push it, then let the next sync pull it. Or drop the local edits:

```sh
git status
git restore .
```

**Where:** Fix on the host, in the checkout `dev-container sync` runs from.
