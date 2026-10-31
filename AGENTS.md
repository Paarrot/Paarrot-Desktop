# Checks backlog

Lint and typecheck fix commits carry `[skip build]` in the commit message while
the `ci-checks` issues are being worked down across the cinny repos. The checks
workflow still runs; the Electron and mobile builds do not.

Honored in `cinny-desktop/.gitea/workflows/build.yml` and
`cinny-mobile/.gitea/workflows/build.yml`.

Do not use `[skip ci]` for these commits. It also suppresses the version bump.
