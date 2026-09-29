# Repository Guidelines

## Project Structure

Pulso Metrics is a React 19, TypeScript, and Vite dashboard deployed as a Cloudflare Worker. The dashboard entry points are `src/main.tsx` and `src/App.tsx`; shared calculations and data helpers live in `src/lib/`. Dashboard-specific components are in `src/components/dashboard/`, with reusable UI components in `src/components/ui/`. The Hono API, Meta integration, gateway webhooks, and sync queue processing are in `worker/`. D1 schema migrations belong in `migrations/`, and Vitest cases are in `tests/`. Place imported assets in `src/assets/` and static files in `public/`.

## Development and Deployment

- `npm ci` installs the locked dependencies.
- `npm run dev` starts the local app for development; `npm run preview` serves the production build.
- `npm run build` runs TypeScript project checks and builds the app into `dist/`.
- `npm run lint` runs ESLint; `npm run typecheck` checks TypeScript without emitting build output.
- `npm test` runs the Vitest suite.
- `npm run db:local` applies D1 migrations locally; `npm run db:remote` applies them to the configured remote database.
- `npm run deploy` builds, applies remote D1 migrations, and deploys the Worker with Wrangler.

## Style and Naming

Use two-space indentation, LF endings, no semicolons, double quotes, and ES5 trailing commas. Prettier uses an 80-character print width and sorts Tailwind classes. Keep TypeScript strict and resolve lint warnings. Name React components in PascalCase, reusable component files in kebab-case, and tests as `*.test.ts`. Use the `@/` alias for imports from `src/` and follow existing `cn`/`cva` patterns for class composition.

## Testing and Review

Tests use Vitest with Cloudflare's test plugin and cover dashboard controls, sales queries, and metric calculations. There is no configured coverage threshold. Before submitting, run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. For UI changes, verify the relevant flow locally and include screenshots in the pull request. Pull requests should describe user-visible behavior, link a related issue when applicable, and list validation performed.

## Commits and Configuration

Git history uses Conventional Commit prefixes such as `feat:` and `fix:`; keep summaries short and specific (for example, `fix: normalize foreign currency sales`). Do not commit API credentials or webhook tokens. Configure integrations in the dashboard; the Worker encrypts stored secrets.
