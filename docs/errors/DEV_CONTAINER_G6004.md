# DEV_CONTAINER_G6004: Stack not updated

`dev-container sync` found a changed stack, and `docker compose up` for it failed, for example because an image build broke. Docker's output is printed above the diagnostic.

The stack keeps running with its previous containers. Sync records a stack as synced only after a successful `up`, so the next run retries it.

## Fix

Read docker's output, fix the stack's config or Dockerfile in the repo and push. Run `dev-container up` in the stack's directory to see the error again directly.

**Where:** Fix in the config repo, then push; the next sync picks it up.
