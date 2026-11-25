# NoteMe

A study app for students: notes (plain or Cornell, in nested folders) and flashcard decks with a flip-to-study
screen. Use it as a guest on the device, or sign in to back up and sync. AI apps (Claude, ChatGPT) will connect
through MCP to write notes and flashcards for you.

```
mobile/    the app: Expo (React Native) + TypeScript, for Android, iOS and web
backend/   the server: sign-in, backup/sync, and (next) the MCP server for AI apps
```

Each folder has its own README with how to run it.

## Roadmap

1. ✅ Decks, cards, study, notes, tags, as a guest on the device
2. ✅ Accounts (email + Google) and backup/sync across devices
3. ⏳ MCP server so AI apps can create notes and flashcards in your account
