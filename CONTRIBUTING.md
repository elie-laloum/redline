# Contributing to Redline

## Source of truth

The [GitLab origin](https://gitlab.elielaloum.com/elielaloum/redline) is private. The
[GitHub mirror](https://github.com/elie-laloum/redline) provides public access to the source and
the documentation.

Open bug reports, proposals and pull requests on GitHub. Maintainers review them, integrate
accepted changes into GitLab, and publish them through the mirror. Do not merge directly into the
mirror's main branch: git mirroring does not synchronize issues or pull requests. You do not need
access to the private origin to propose a change.

## Making a change

Follow [docs/setup.md](docs/setup.md) and [docs/architecture.md](docs/architecture.md). Before
opening a pull request, run:

```
bun run typecheck
bun run test
bun run test:workflow
```

A change to a brief in `src/prompts/` changes what an agent does and invalidates the cached tasks
of that role: describe the behaviour you expect and, when you can, the run that showed it.

Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for any change a user would
notice. Write documentation in English. In a report, give a reproducible example and sanitized
logs; never include credentials or private customer data.

The project uses the MIT license.
