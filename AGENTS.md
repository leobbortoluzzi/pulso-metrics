# Repository Guidelines

## Project Structure & Module Organization

This repository is a Vite app built with React 19 and TypeScript. `src/main.tsx` mounts the app and theme provider; `src/App.tsx` contains the dashboard. Shared calculations and demo data live in `src/lib/`, with reusable UI in `src/components/ui/`. The Hono API and Cloudflare Queue handlers live in `worker/`; D1 schema changes belong in `migrations/`. Tests are in `tests/`. Put static files served as-is in `public/` and imported assets in `src/assets/`.

## Build, Test, and Development Commands

- `npm ci` installs the locked dependencies.
- `npm run dev` starts the local Vite development server.
- `npm run build` runs TypeScript project checks and creates a production build in `dist/`.
- `npm run preview` serves the production build locally.
- `npm run lint` checks TypeScript and TSX files with ESLint.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm test` runs the Vitest suite for shared metrics and gateway event parsing.
- `npm run format` formats TypeScript and TSX files with Prettier; review the diff because this command writes files.

## Coding Style & Naming Conventions

Use two spaces, LF endings, no semicolons, double quotes, and ES5 trailing commas. Prettier enforces an 80-character print width and sorts Tailwind classes. Keep TypeScript strict and resolve unused variables or parameters. Use PascalCase for React component names, kebab-case for reusable component filenames, and the `@/` alias for imports from `src/`. Follow existing `cn` and `cva` patterns for class composition and component variants.

## Testing Guidelines

Vitest tests use `*.test.ts`; no coverage threshold is configured. Run `npm test` for formulas and gateway normalization. Before submitting, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. For UI behavior, use `npm run dev` for a local browser check and describe the manual verification in the pull request.

## Commit & Pull Request Guidelines

The available Git history uses a Conventional Commit prefix (`feat: initial commit`). Use concise `type: summary` messages, such as `feat: add dashboard filters` or `fix: align metric labels`. Pull requests should explain the change, link a related issue when applicable, list validation commands run, and include screenshots for visual changes.
