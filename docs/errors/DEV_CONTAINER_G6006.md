# DEV_CONTAINER_G6006: Service manager failed

`dev-container sync --install` or `--uninstall` wrote or removed the service file, but `systemctl --user` (Linux) or `launchctl` (macOS) failed. The diagnostic carries its output.

## Fix

- **Linux:** `systemctl --user` needs a user session. Over SSH, check `systemctl --user status`; if it can't connect to the bus, log in once or run `loginctl enable-linger $USER`.
- **macOS:** launch agents load into the GUI session, so the user has to be logged in at the machine.

Then run `dev-container sync --install` again.

**Where:** Fix on the host.
