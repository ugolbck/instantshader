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
