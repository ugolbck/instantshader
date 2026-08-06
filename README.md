# InstantShader

Animated WebGL gradient shaders, zero dependencies, by [InstantGradient](https://instantgradient.com).

## Packages

| Package | Description |
| --- | --- |
| `instantshader` | Core zero-dependency WebGL shader engine |
| `@instantshader/react` | React bindings for InstantShader |
| `playground` | Local dev playground for testing packages |

Not yet published to npm.

## Development

```bash
pnpm i
pnpm exec playwright install chromium # first time only, for core's browser tests
pnpm build
pnpm test
pnpm playground
```

## Releasing

Every user-visible change needs a changeset:

```bash
pnpm changeset
```

Once `.github/workflows/release.yml` is active, merging to `main` opens a
version PR; merging that PR publishes both packages from CI via npm trusted
publishing (OIDC — no npm token is stored anywhere).

### One-time bootstrap

npm cannot create a package through trusted publishing, so the first version
of each package must be published by hand:

1. Create the `instantshader` npm org (required for `@instantshader/react`).
2. `npm login` (session tokens are short-lived; classic tokens no longer exist).
3. `pnpm changeset version` to cut 0.1.0, then commit the result.
4. `pnpm build`, then **`pnpm publish`** in `packages/core` first and
   `packages/react` second. Use `pnpm publish`, never `npm publish`: only pnpm
   rewrites `@instantshader/react`'s `"instantshader": "workspace:*"` into a
   real version range. `npm publish` ships the literal `workspace:*` and the
   package is uninstallable. Both set `publishConfig.access: public`, so no
   `--access` flag is needed.
5. For each package on npmjs.com: **Settings → Trusted Publisher → GitHub
   Actions**, owner `ugolbck`, repo `instantshader`, workflow filename
   `release.yml`, and tick the **`npm publish`** allowed action.
6. Set the repository variable `RELEASE_ENABLED=true` (Settings → Secrets and
   variables → Actions → Variables).

Expect a few minutes between a successful publish and the version becoming
installable — npm scans every publish for malware before releasing it.
