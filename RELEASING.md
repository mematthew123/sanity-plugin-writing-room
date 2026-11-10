# Releasing

Versions are managed with [Changesets](https://changesets.dev) and stay 0.x until the API settles.

## Day to day

1. In a pull request that changes the plugin, run `pnpm changeset`. Choose **patch** (fixes) or **minor** (features, and anything breaking while we're on 0.x), and write one line for the changelog. Commit the file it creates in `.changeset/`.
2. When that lands on `main`, the **Release** workflow opens (or updates) a pull request called **Release sanity-plugin-writing-room**, which bumps the version and writes `CHANGELOG.md`.
3. Merging that pull request publishes the new version to npm, with provenance, and creates its git tag and GitHub release.

The release pull request is opened by the workflow, so GitHub doesn't run CI on it. Its changes are only the version and the changelog, and the Release workflow checks the plugin again before it publishes.

## How it publishes

The workflow uses [npm trusted publishing](https://docs.npmjs.com/trusted-publishers): GitHub proves to npm which repository and workflow is publishing, so no npm token is stored anywhere, and npm adds a provenance statement to each version. pnpm 11 (11.1.3 or newer; `packageManager` pins it) does the exchange itself. Provenance needs this repository to be **public**.

One-time setup, already done for this repository:

1. On npmjs.com, the package's **Settings** → **Trusted Publisher**: **GitHub Actions**, user `mematthew123`, repository `sanity-plugin-writing-room`, workflow `release.yml`, no environment, allowed to **publish** (not stage only).
2. In the same settings, **Publishing access**: **Require two-factor authentication and disallow tokens**.
3. This repository's **Settings** → **Secrets and variables** → **Actions** → **Variables**: `NPM_PUBLISH` = `true`. Until it's `true`, the workflow opens the release pull request but never publishes.
4. **Settings** → **Actions** → **General**: tick **Allow GitHub Actions to create and approve pull requests**, so the workflow can open the release pull request.

## Publishing by hand

You shouldn't need to. If you do, publish from an up-to-date `main`:

```sh
npm login
pnpm publish --access public
```

npm asks for your one-time password (2FA). Use `pnpm publish`, not `npm publish`: pnpm applies `publishConfig`, which points `exports` at `dist` instead of `src`. The `prepack` script builds `dist` first. To see exactly what would be published, run `pnpm pack` and look inside the tarball. A hand-published version has no provenance.

## Why not a token?

npm is phasing out tokens that publish without 2FA: since 31 July 2026 they can't manage packages, and GitHub is [targeting January 2027](https://github.blog/changelog/2026-07-31-restricting-npm-bypass-2fa-granular-access-tokens) for removing their direct publish. An ordinary token can't publish from CI at all when the account has 2FA, because npm asks for a one-time password (`ERR_PNPM_OTP_NON_INTERACTIVE`).
