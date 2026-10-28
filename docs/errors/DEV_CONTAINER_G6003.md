# DEV_CONTAINER_G6003: Pull failed

`git pull --ff-only` failed. Common causes: the local branch has commits the remote doesn't (not a fast-forward), the branch has no upstream, or the remote needs credentials that git would have to prompt for. Sync never prompts. The diagnostic carries git's own output. No stack is touched; they keep running as they were.

## Fix

- **Not a fast-forward:** the checkout should only follow the remote. Drop local commits with `git reset --hard @{u}`.
- **No upstream:** `git branch --set-upstream-to=origin/main`.
- **Credentials:** use an SSH key or a credential helper that works without a terminal, as the background service has none.

**Where:** Fix on the host, in the checkout `dev-container sync` runs from.
