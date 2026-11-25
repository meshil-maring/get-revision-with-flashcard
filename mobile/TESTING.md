# Testing

## Automated tests

```powershell
npm test            # run all tests once
npx jest --watch    # re-run tests when files change
```

| Area | File | What it checks |
|---|---|---|
| Decks data | `src/data/__tests__/decks.test.ts` | create, list with card counts, update, soft delete, last studied / continue deck, migrations |
| Cards data | `src/data/__tests__/cards.test.ts` | create, list per deck, list for several decks, update, delete, rejects unknown deck |
| Shuffle | `src/lib/__tests__/shuffle.test.ts` | keeps all items, doesn't change the input |
| Streaks and dates | `src/lib/__tests__/dates.test.ts` | local day keys, current streak (incl. not-yet-studied today), best streak |
| Study activity | `src/data/__tests__/activity.test.ts` | cards reviewed per local day |
| Activity grid | `src/components/__tests__/activity-heatmap.test.ts` | shade level per number of cards |
| Home screen | `src/__tests__/screens/home.test.tsx` | continue studying, subjects, empty state, coming-soon links |
| Flashcards screen | `src/__tests__/screens/flashcards.test.tsx` | empty state, deck list, create deck, name required, open form from + menu |
| Study screen | `src/__tests__/screens/study.test.tsx` | flip, next/previous, finish, study again, shuffle |
| Create Revision screen | `src/__tests__/screens/new-revision.test.tsx` | select decks, unselect, select all skips empty decks, start |

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

**Home and navigation**
- [ ] Bottom tabs: Home, Notes, Flashcards, More switch screens; the active tab is a blue pill
- [ ] The + button opens the Create menu; New deck opens the form on Flashcards
- [ ] Continue Studying shows the last deck you studied; ▶ starts it
- [ ] Your Subjects shows your decks with matching icons; Add opens the new-deck form
- [ ] Consistency: after studying a few cards, today's square fills in and the streak shows 1-day
- [ ] Next day without studying: streak still shows, with "Study today to keep your streak going"
- [ ] The grid fits the screen width with month labels on top and Mon/Wed/Fri on the left
- [ ] Ask AI, bell, profile avatar, Notes, and Profile/AI Study/Notifications/Settings in More show "Coming soon"; Create revision in More opens it
- [ ] Nothing is hidden under the status bar or the phone's bottom bar

**Create Revision**
- [ ] Flashcards → Create revision: decks with no cards can't be selected; Select all / Clear work
- [ ] Start revision: cards from all picked decks appear, shuffled, with the deck name above each card
- [ ] Back from the revision keeps the deck selection

**Data and device**
- [ ] Close the app completely and reopen it: decks and cards are still there
- [ ] Long text in a card wraps and stays readable
- [ ] The keyboard doesn't cover the form fields
- [ ] Android back button closes forms and goes back between screens
