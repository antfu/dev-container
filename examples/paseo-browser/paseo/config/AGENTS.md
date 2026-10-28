# Environment

Copied into each agent's global instructions on every container start; edit the copy in the image, not this one.

- Only `/workspace` and the home directory persist.
- There is no Docker in this container.
- A shared Chromium is signed in to sites by hand. Drive it with the `agent-browser` CLI, already connected through `AGENT_BROWSER_CDP`; the `playwright` MCP server reaches the same browser. Dev servers on `localhost` are reachable from it.
- Others use that browser too: pass your own `--session <name>` and close the tabs you opened. Do not sign out, change account settings or passwords, or make purchases.
- Tokens such as `$GH_TOKEN` are placeholders swapped in by a broker. A `403` with an `x-dev-container-diagnostic` header explains why a request was refused.
