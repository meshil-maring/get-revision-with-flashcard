# StudyMe app

Expo (React Native) + TypeScript, Expo Router, Uniwind (Tailwind), expo-sqlite.

## Run it

```bash
cd mobile
npm install
cp .env.example .env     # set EXPO_PUBLIC_API_URL if the server isn't on localhost
npx expo start           # needs a development build: eas build --profile development
```

The app works without the server (guest mode). Sign-in and sync need `backend/` running.

```bash
npm test                 # Jest (see TESTING.md)
npx tsc --noEmit         # typecheck
npx expo lint            # lint
```

## Folders

```
src/
  app/          screens; each file is a route (Expo Router). (tabs)/ is the bottom tab bar
  components/
    ui/         the shared kit: buttons, icons, colours (index.tsx), sheets, forms, rich text, tips
    cards/      flashcard pieces: flip card, attachments, audio recorder
    study/      study session, auto-next picker, activity grid
    notes/      folder browser
    tags/       tag chip, form and picker
    help/       the in-app guide
  data/         everything stored on the device (SQLite): one file per table, db.ts = migrations,
                sync.ts = sync with the account
  lib/          plain helpers with no React: dates, shuffle, revision, rich text, guide content…
  hooks/        React hooks
  services/     talking to the server: API URL, sign-in client, sync requests
  providers/    app-wide React context: the signed-in account and its sync
  test-utils/   in-memory database and router mock for tests
  __tests__/screens/   screen tests (tests can't live in app/, every file there is a route)
```

Unit tests sit next to their code in `__tests__/` folders. Import with the `@/` alias (`@/components/ui`,
`@/data/decks`), not relative paths.
