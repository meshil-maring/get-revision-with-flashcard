# Testing

## Automated tests

```powershell
npm test            # run all tests once
npx jest --watch    # re-run tests when files change
```

| Area | File | What it checks |
|---|---|---|
| Decks data | `src/data/__tests__/decks.test.ts` | create, list with card counts, update, soft delete, migrations |
| Cards data | `src/data/__tests__/cards.test.ts` | create, list per deck, update, delete, rejects unknown deck |
| Shuffle | `src/lib/__tests__/shuffle.test.ts` | keeps all items, doesn't change the input |
| Home screen | `src/__tests__/screens/home.test.tsx` | empty state, deck list, create deck, name required |
| Study screen | `src/__tests__/screens/study.test.tsx` | flip, next/previous, finish, study again, shuffle |

Data tests run the app's real SQL on Node's built-in SQLite (`src/test-utils/test-db.ts`).
Screen tests replace the data layer and router with mocks.

Before every commit: `npx tsc --noEmit && npx expo lint && npm test`

## Manual checklist (on a phone, before a release)

**Decks**
- [ ] With no decks, Home shows "No decks yet"
- [ ] Create a deck: it appears at the top of the list
- [ ] Save is disabled while the name is empty
- [ ] Edit a deck's name and description: the changes show
- [ ] Delete a deck: a confirmation appears; Cancel keeps it, Delete removes it

**Cards**
- [ ] Tap a deck: the Deck screen opens with its name in the header
- [ ] Add a card: Save is disabled until both front and back are filled
- [ ] Edit and delete a card
- [ ] Go back to Home: the deck's card count is correct

**Study**
- [ ] The Study button only shows when the deck has cards
- [ ] Tap the card: it flips to the answer and back
- [ ] Next/Previous work, and every new card starts on the question
- [ ] Shuffle on: the order changes and starts again at 1
- [ ] After the last card, "Well done!" shows; Study again restarts

**Data and device**
- [ ] Close the app completely and reopen it: decks and cards are still there
- [ ] Long text in a card wraps and stays readable
- [ ] The keyboard doesn't cover the form fields
- [ ] Android back button closes forms and goes back between screens
