# DEV_CONTAINER_G6005: Unsupported platform for sync --install

`dev-container sync --install` writes a systemd user service on Linux and a launchd agent on macOS. Other platforms have no installer.

## Fix

Run `dev-container sync --watch` under the platform's own process supervisor, from inside the config repo.

**Where:** Fix on the host.
