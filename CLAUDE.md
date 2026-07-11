# Octaview Studio - Development Guidelines

## Project Overview

Octaview Studio (formerly Foxglove Studio) is an open-source robotics data visualization platform. It's a React/TypeScript monorepo that runs as a web app, Electron desktop app, and can be served by a Go backend.

## Architecture Quick Reference

- **Monorepo** with packages under `packages/`
- **Core UI**: `packages/studio-base/src/` — all panels, components, providers
- **Desktop wrapper**: `desktop/` — Electron shell (`main.js`, `preload.js`)
- **Go server**: `cmd/foxglove-server/` — serves web app + MCAP API endpoints
- **Web entry**: `packages/studio-web/` and `web/`
- **Panel API**: `packages/studio-base/src/PanelAPI/` — hooks for panels to access topics, messages, data source info

### Key Contexts & State
- `CurrentLayoutContext` — layout tree (mosaic), panel configs, global variables
- `WorkspaceContext` — sidebar state, dialogs, UI preferences (Zustand + persistence)
- `MessagePipeline` — player state, topics, subscriptions, playback control
- `AppConfigurationContext` — persistent app settings (localStorage)
- `PanelCatalogContext` — registry of available panel types

### Panel Types
`3D`, `Image`, `Plot`, `RawMessages`, `map`, `DiagnosticStatusPanel`, `DiagnosticSummary`, `Indicator`, `Gauge`, `Teleop`, `Parameters`, `Publish`, `CallService`, `RosOut`, `StateTransitions`, `Table`, `TopicGraph`, `SourceInfo`, `GlobalVariableSliderPanel`, `Tab`

### Layout Manipulation
```typescript
import { useCurrentLayoutActions } from "@foxglove/studio-base/context/CurrentLayoutContext";
import { getPanelIdForType } from "@foxglove/studio-base/util/layout";

const { addPanel, changePanelLayout, savePanelConfigs } = useCurrentLayoutActions();
const id = getPanelIdForType("Plot"); // "Plot!abc123"
addPanel({ id, config: { paths: [{ value: "/topic.field", enabled: true }] } });
```

### Sidebar Tabs
- Defined in `WorkspaceContext.ts` → `RightSidebarItemKeys` / `LeftSidebarItemKeys`
- Registered in `Workspace.tsx` → `rightSidebarItems` / `leftSidebarItems` maps
- Each entry: `{ title, component, badge? }`

### Settings
- `AppSetting` enum in `src/AppSetting.ts`
- Read/write via `useAppConfigurationValue<T>(AppSetting.KEY)`
- Persisted to localStorage

## Development Rules

### Red-Green-Refactor TDD

All new features MUST follow strict Red-Green TDD:

1. **RED** — Write a failing test first. Run it. Confirm it fails for the right reason.
2. **GREEN** — Write the *minimum* code to make the test pass. No more.
3. **REFACTOR** — Clean up duplication, improve naming, extract helpers — while keeping tests green.

Repeat for each small increment of functionality. Do NOT write implementation code without a corresponding failing test driving it.

### Testing
- Test runner: **Jest** (config in each package's `jest.config.json`)
- Run tests: `npx jest --testPathPattern=<pattern>` from repo root
- Test files: colocated as `*.test.ts` or `*.test.tsx`
- Pure logic → unit test. React hooks/components → test with `@testing-library/react`

### TypeScript Best Practices (2026)

- Use `satisfies` for type-safe object literals without widening
- Prefer `using` declarations for resource cleanup (Explicit Resource Management)
- Use `const` type parameters where appropriate
- Prefer `Map`/`Set` over plain objects for dynamic keys
- Use template literal types for string pattern enforcement
- Avoid `any` — use `unknown` + narrowing, or generics
- Prefer discriminated unions over optional fields for state
- Use `import type` for type-only imports
- Avoid enums in new code — prefer `as const` objects (existing `AppSetting` enum is an exception for consistency)

### DRY (Don't Repeat Yourself)

- Extract shared logic into hooks or utility functions
- If you write the same 3+ lines twice, extract it
- Prefer composition over inheritance
- Reuse existing utilities (`packages/den/`, `packages/studio-base/src/util/`)
- Check for existing hooks in `PanelAPI/` and `hooks/` before writing new data-access code

### Code Style

- Imports: `@foxglove/studio-base/...` paths (mapped in tsconfig + jest)
- Components: function components with hooks, no class components
- Styling: `tss-react/mui` (`makeStyles`) or MUI's `sx` prop
- i18n: use `useTranslation()` for user-facing strings
- No default exports for named components (except Panel HOC pattern)

## Documentation

- **URL Parameters**: See `docs/url-parameters.md` for all query params, API endpoints, CLI flags, and Docker usage
- **PanelAPI**: See `packages/studio-base/src/PanelAPI/README.md`

## Build & Run

```bash
# Install dependencies
yarn install

# Run web dev server
yarn run web:serve

# Run desktop (Electron)
cd desktop && yarn start

# Type check
npx tsc --noEmit --project packages/studio-base/tsconfig.json

# Run tests
npx jest
npx jest --testPathPattern="AgentChat"  # run specific tests

# Build production web
yarn run web:build
```

## Git & Releases

- Main branch: `main`
- Remote: `git@github.com:o16s/octaview-studio.git`
- Desktop version tracked in `desktop/package.json`
- Docker image: `ghcr.io/o16s/octaview-studio`
- GitHub Actions builds desktop installers on tag pushes

## Important Notes

- Electron code (`desktop/`) and Go server code should rarely change — prefer browser-side solutions
- Self-signed TLS certs are accepted for localhost/private IPs in Electron (see `desktop/main.js`)
- External links use `window.open()` + Electron's `setWindowOpenHandler` pattern to work in both web and desktop
- The `FOXGLOVE_STUDIO_VERSION` global is injected at build time
