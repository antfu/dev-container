# paseo-browser

[`paseo`](../paseo) plus a caged Chromium desktop that you sign in to by hand. Agents drive that browser over CDP. Chromium serves CDP on its own localhost only, so Paseo joins the browser's network namespace.

```sh
npx @antfu/dev-container setup
dev-container up
```

Besides the variables `paseo` needs, set `BROWSER_PASSWORD` in `.env.secret`. Open the desktop on your tailnet at port 6900 and sign in to the sites agents should use. The browser profile is kept in `.dev-container/state/browser/`.

The GitHub token is brokered as usual, with a rule that denies deleting a repo.
