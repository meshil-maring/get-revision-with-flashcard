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
| Sync | `src/data/__tests__/sync.test.ts` | outbox triggers, guest data moves into the account, only changes are sent, newest edit wins, soft deletes, clear on sign-out, failed request keeps the outbox |
| Activity grid | `src/components/study/__tests__/activity-heatmap.test.ts` | shade level per number of cards |
| Account screen | `src/__tests__/screens/account.test.tsx` | sign in, server errors, sign-up checks, Google only when available, sync on sign-in, sync errors, sign out clears the device, warns about unsent changes |
| Home screen | `src/__tests__/screens/home.test.tsx` | continue studying, subjects, empty state, coming-soon links |
| Flashcards screen | `src/__tests__/screens/flashcards.test.tsx` | empty state, deck list, create deck, name required, open form from + menu |
| Study screen | `src/__tests__/screens/study.test.tsx` | flip, next/previous, finish, study again, shuffle |
| Create Revision screen | `src/__tests__/screens/new-revision.test.tsx` | select decks, unselect, select all skips empty decks, start |
| Maths in text | `src/lib/__tests__/math-text.test.ts` | finding `$…$` / `\(…\)` (prices stay text), LaTeX as readable plain text |
| Note format: maths and textbook blocks | `src/lib/__tests__/rich-text-math.test.ts` | inline and displayed equations, align, code fences, `:::definition`/`:::exercise [hard]`…, `$|x|$` in tables, old syntax unchanged |
| Textbook model | `src/lib/__tests__/textbook.test.ts` | chapter titles, section / definition / example / equation / figure numbering, worked-example steps, when a note opens as a textbook |
| Textbook reader | `src/components/textbook/__tests__/textbook-view.test.tsx` | KaTeX output (fractions, matrices, integrals, cases, align, \ce…), broken LaTeX fallback, nothing from a note runs, light / dark tokens, layouts, tables, code, diagrams, images, a whole sample chapter |
| Note screen views | `src/__tests__/screens/notes.test.tsx` | maths notes open as a textbook, ordinary notes stay standard, the choice is remembered, Cornell notes as chapters, next chapter |

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
- [ ] Add a card: Save is disabled until both question and answer are filled
- [ ] Edit and delete a card
- [ ] Answers in the card list are hidden until you tap "Tap to show answer"
- [ ] Star a card in the list: the star turns amber
- [ ] Card editor toolbar: heading, subheading, bold, italic, underline, highlight, bullet and numbered list work; Preview shows the formatting
- [ ] Attach an image, a PDF, a recorded voice note and an audio file to the question and to the answer; remove one before saving
- [ ] After saving, the card shows small icons for its attachments
- [ ] Go back to Home: the deck's card count is correct

**Study**
- [ ] The Study button only shows when the deck has cards
- [ ] Only the question shows (no answer showing through) until Show answer or a tap on the card
- [ ] After showing the answer, Hard / OK / Easy appear; rating moves to the next question
- [ ] Previous works, and every new card starts on the question
- [ ] Images open full screen, PDFs open in a viewer, audio plays and pauses
- [ ] The star marks the card as a favourite
- [ ] Shuffle on: the order changes and starts again at 1
- [ ] After the last card, the summary shows Hard/OK/Easy counts and the cards grouped by rating
- [ ] Hard cards are pre-selected; Revise selected starts a round with just the picked cards; Study all again restarts
- [ ] The deck list shows each card's latest rating

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
- [ ] Fresh install: the welcome tour opens by itself; Next/Back/dots move between the 4 steps
- [ ] Skip or Get started closes it, and it doesn't come back after restarting the app
- [ ] More → App tour opens the tour again
- [ ] More → Help & guide lists topics under Basics, Studying and Good to know
- [ ] Search (e.g. "pdf", "streak") narrows the list; a nonsense word shows "Nothing found"
- [ ] A topic shows headings, lists, bold and highlights; Previous/Next move through topics; back returns to the list
- [ ] Tips show on Home, Flashcards, a deck, the card editor, Study, the end-of-session summary, Create Revision and Favourites
- [ ] Got it (or ×) hides a tip and it stays hidden after restarting; Learn more opens the matching guide topic
- [ ] Help & guide → Show tips again brings every tip back, including on the Home and Flashcards tabs

**Create Revision**
- [ ] Flashcards → Create revision: decks with no cards can't be selected; Select all / Clear work
- [ ] Start revision: cards from all picked decks appear, shuffled, with the deck name above each card
- [ ] Back from the revision keeps the deck selection
- [ ] Which cards? Turning ratings off (e.g. only Hard) and Favourites only change the card count and the cards in the revision
- [ ] Flashcards → Favourites (and More → Favourite cards) lists starred cards grouped by deck; unstar removes one; Revise favourites starts them

**Textbook notes** (on a phone and in a browser; `src/test-utils/sample-chapter.ts` is a good note to paste)
- [ ] A note with `$…$` or `$$…$$` opens as a textbook; an ordinary note looks as before
- [ ] ⋮ → Read as a standard note / Read as a textbook switches, and stays after reopening the note
- [ ] Equations are typeset and centred; a very long one scrolls sideways inside its box, the page doesn't
- [ ] Contents (☰) jumps to a section; the bookmark button marks it; bookmarks list in Contents
- [ ] Aa: text size, theme (App / Light / Dark); on a wide screen also page width, with contents and tools at the sides
- [ ] Hints and solutions in exercises open and close; diagrams enlarge; attached images open full screen
- [ ] Previous / Next at the end of a chapter opens the next note in the folder
- [ ] Android: the first textbook note opens within a second or two (it runs in a web view)

**Data and device**
- [ ] Close the app completely and reopen it: decks and cards are still there
- [ ] Long text in a card wraps and stays readable
- [ ] The keyboard doesn't cover the form fields
- [ ] Android back button closes forms and goes back between screens
