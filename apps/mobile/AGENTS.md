# Mobile app guidelines

`apps/mobile` is the Sydia iOS/Android app, built with Expo (SDK 58), Expo Router, React Native, TanStack Query, Axios, and the Better Auth Expo client. Follow the root [AGENTS.md](../../AGENTS.md) as well.

## Expo changes quickly — do not trust training data

Expo ships breaking changes every SDK release. Before writing code that touches an Expo, EAS, or React Native API, read the `expo` major version in `package.json` and check the matching docs at `https://docs.expo.dev/versions/v<major>.0.0/` (index: https://docs.expo.dev/llms.txt).

## Commands

Run these from `apps/mobile`:

```bash
bunx expo install <package>  # ALWAYS use instead of `bun add` — picks SDK-compatible versions
bun run start                # Metro dev server (scan the QR code with Expo Go or a dev build)
bun run lint                 # ESLint (eslint-config-expo), zero warnings
bun run check-types          # tsc --noEmit
bun run test                 # Bun unit tests
bun run build:editor         # rebuild the embedded Tiptap HTML after editing editor/
bun run doctor               # expo-doctor
```

The app has no `dev` script on purpose: the root `bun run dev` starts only the web frontend and backend. Start Metro separately, either here with `bun run start` or from the repository root with `bun run mobile`.

Do not start Metro through `bun --filter mobile start` or `turbo run`. They run it without an interactive terminal, so Expo shows no QR code and ignores shortcut keys. The app has no web target (`react-native-web` is not installed), so any web bundle request then fails with `Unable to resolve "react-native-web/dist/index"`.

## Local setup

1. Run `bun run setup-env` from the repository root; it symlinks `apps/mobile/.env` to the shared root `.env`. Only `EXPO_PUBLIC_*` variables are inlined into the app bundle. Set `EXPO_PUBLIC_API_URL` in the root `.env` to the backend URL **as seen from the device**: your computer's LAN IP on a phone, `http://10.0.2.2:5000` on the Android emulator. `localhost` works only in the iOS simulator. On WSL2, the phone cannot reach WSL directly unless mirrored networking or a Windows port proxy is set up.
2. Run the backend with `NODE_ENV=development` so it trusts the Expo Go `exp://` origins (see `apps/backend/src/shared/mobile-origins.ts`).
3. Set `EXPO_PUBLIC_WEB_URL` to your device-reachable web URL for Google Calendar consent and Google account reauthentication. Set `EXPO_PUBLIC_WHATSAPP_ENABLED=true` when the backend has WhatsApp enabled.

## Structure

- `src/app/` — Expo Router routes only. Every file is a screen; `_layout.tsx` defines navigators. Route files use a default export because Expo Router requires it.
- `src/components/` — shared native UI components (named exports).
- `src/lib/` — auth client, API client, env, and theme tokens.
- Imports use the configured `@/*` alias for `src/*`.

## Auth and API

- `src/lib/auth-client.ts` is the only Better Auth client. The Expo plugin stores the session cookie in SecureStore; never store tokens yourself.
- Auth gating happens in `src/app/_layout.tsx` with `Stack.Protected`. Add signed-in screens inside the `isSignedIn` guard.
- `src/lib/services/api/api.ts` is the Axios client for the REST API. It attaches the session cookie manually because React Native has no cookie jar. Mirror the frontend's service conventions (`apps/frontend/src/lib/services/api/AGENTS.md`) and its `toApiError` fallback messages.
- The app scheme is `sydia`. If you change it in `app.json`, update `MOBILE_APP_SCHEME` in the backend too.

## Native code and dependencies

- `ios/` and `android/` are generated (Continuous Native Generation) and git-ignored. Configure native behavior in `app.json` and config plugins; never edit generated native folders.
- Expo Go includes only its bundled native modules. After adding a library with native code, use a development build (`bunx expo run:android|ios` or `bunx eas-cli build --profile development`).
- The workspace uses Bun's isolated linker, so this app keeps its own React version. `expo-doctor` reports "duplicate" Expo packages because Bun creates peer-dependency variants on disk; Metro still bundles one copy of each. To verify, export a bundle with source maps and check the sources. `expo-doctor` checks that shell out to `npm explain` also fail because the root `devEngines` requires Bun; ignore those.

## Before finishing

Run `bun run lint` and `bun run check-types`. For runtime changes, also run `bunx expo export --platform android` to confirm the bundle builds.
