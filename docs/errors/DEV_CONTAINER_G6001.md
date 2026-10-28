# DEV_CONTAINER_G6001: Not a git checkout

`dev-container sync` pulls the repo that holds your configs, so it has to run inside a git checkout. Either the directory is not in one, or `git` is not installed. The diagnostic carries git's own output.

## Fix

Clone the config repo on the host and run `dev-container sync` (or `sync --install`) from inside the clone. Make sure `git` is on `PATH`, including the `PATH` of the background service.

**Where:** Fix on the host, in the checkout `dev-container sync` runs from.
