# InstantShader

Animated WebGL gradient shaders, zero dependencies, by [InstantGradient](https://instantgradient.com).

## Packages

| Package | Description |
| --- | --- |
| [`instantshader`](https://www.npmjs.com/package/instantshader) | Core zero-dependency WebGL shader engine |
| [`@instantshader/react`](https://www.npmjs.com/package/@instantshader/react) | React bindings for InstantShader |
| `playground` | Local dev playground (not published) |

```bash
npm install instantshader
# or, for React:
npm install @instantshader/react
```

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

Both packages were bootstrapped by hand at 0.1.0 (npm cannot create a package
through trusted publishing), so that step is done. What remains to hand
releases over to CI:

1. For each package on npmjs.com: **Settings → Trusted Publisher → GitHub
   Actions**, owner `ugolbck`, repo `instantshader`, workflow filename
   `release.yml`, and tick the **`npm publish`** allowed action.
2. Set the repository variable `RELEASE_ENABLED=true` (Settings → Secrets and
   variables → Actions → Variables).

### Publishing by hand

Still the fallback until the above is wired up:

```bash
pnpm changeset version   # applies pending changesets, writes CHANGELOGs
pnpm build
cd packages/core  && pnpm publish
cd ../react       && pnpm publish
```

Use **`pnpm publish`, never `npm publish`**: only pnpm rewrites
`@instantshader/react`'s `"instantshader": "workspace:*"` into a real version
range. `npm publish` ships the literal `workspace:*` and the package is
uninstallable. Both set `publishConfig.access: public`, so no `--access` flag
is needed.

Expect a few minutes between a successful publish and the version becoming
installable — npm scans every publish for malware before releasing it.
