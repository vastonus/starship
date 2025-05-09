# Starship Documentation

This directory contains the documentation for Starship. The documentation is automatically synced to the [hyperweb-io/docs.hyperweb.io](https://github.com/hyperweb-io/docs.hyperweb.io) repository using GitHub Actions.

## Directory Structure

```
docs/
├── advanced/         # Advanced usage and concepts
├── cli/             # CLI documentation
├── config/          # Configuration documentation
├── development/     # Development guides
├── get-started/     # Getting started guides
├── _meta.json       # Navigation metadata
├── index.mdx        # Main documentation page
└── using-starship.md # Usage guide
```

## Documentation Workflow

1. All documentation is written in Markdown (`.md`) or MDX (`.mdx`) format
2. The documentation is organized into logical sections using directories
3. Each section can have its own `_meta.json` file to control navigation
4. When changes are pushed to the `main` branch, a GitHub Action automatically:
   - Clones the docs repository
   - Syncs the contents of the `docs/` directory to `external-docs/pages/starship/`
   - Commits and pushes any changes

## Learn Directory

The `learn/` directory at the root of the repository contains educational content that is synced to the [hyperweb-io/hyperweb.io](https://github.com/hyperweb-io/hyperweb.io) repository. This content is separate from the main documentation and is used for tutorials and learning materials.

## Contributing

1. Make changes to the documentation in the appropriate directory
2. Ensure all new files are properly linked in the navigation (using `_meta.json` files)
3. Commit and push your changes to the `main` branch
4. The GitHub Action will automatically sync your changes to the respective repositories

## GitHub Actions

The documentation sync is handled by the `.github/workflows/docs.yaml` workflow, which:
- Triggers on pushes to the `main` branch that affect the `docs/` or `learn/` directories
- Uses GitHub tokens to authenticate with the target repositories
- Syncs the documentation using `rsync` to ensure clean updates
- Automatically commits and pushes changes to the target repositories

For more details about the workflow, see the workflow file at `.github/workflows/docs.yaml`. 