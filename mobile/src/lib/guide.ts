// The in-app user guide (More → Help & guide). Each topic's body uses the same light
// formatting as card answers (see src/lib/rich-text.ts): ## subheading, - bullets,
// 1. steps, **bold**, ==highlight==. Keep it short and in plain words for students.
// When a feature changes, update its topic here too.
import type { IconName } from '@/components/ui';
import { toPlainText } from '@/lib/rich-text';

export type GuideTopic = {
  id: string;
  section: 'Basics' | 'Studying' | 'Good to know';
  icon: IconName;
  title: string;
  summary: string;
  body: string;
};

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'getting-started',
    section: 'Basics',
    icon: 'rocket-outline',
    title: 'Getting started',
    summary: 'What NoteMe does and the fastest way to begin.',
    body: `NoteMe helps you remember what you learn with **flashcards**: a question on the front, the answer on the back.

## Your first five minutes
1. Open the **Flashcards** tab and tap **New deck**. Give it a subject name, like "Biology – Cells".
2. Open the deck and tap **Add card**. Write a question and its answer.
3. Add a few more cards, then tap **Study**.
4. Try to answer in your head, tap **Show answer**, and rate the card **Hard**, **OK** or **Easy**.

## Finding your way
- **Home**: continue your last deck, your subjects, and your study streak
- **Flashcards**: all your decks, Create revision and Favourites
- **+ button**: quick shortcuts to make a new deck or a revision
- **More**: favourites, the app tour, and this guide

==Tip:== short, focused cards work best. One fact per card is easier to remember than a long paragraph.`,
  },
  {
    id: 'decks',
    section: 'Basics',
    icon: 'layers-outline',
    title: 'Decks',
    summary: 'Group your cards by subject or topic.',
    body: `A **deck** is a set of cards about one subject or topic.

## Make a deck
1. Go to the **Flashcards** tab (or tap the **+** button and choose **New deck**).
2. Tap **New deck**, type a name and, if you like, a short description.
3. Tap **Save**.

NoteMe picks an icon from the name, so a deck called "Chemistry" gets a flask and "Maths" gets a sigma.

## Change or delete a deck
- Tap the **pencil** on a deck to rename it or change its description.
- Tap the **bin** to delete it. You will be asked first, because ==deleting a deck also deletes all its cards==.

## Study a deck
Tap the orange **▶** next to a deck, or open the deck and tap **Study**.`,
  },
  {
    id: 'cards',
    section: 'Basics',
    icon: 'copy-outline',
    title: 'Cards and formatting',
    summary: 'Write questions and well-formatted answers.',
    body: `Open a deck and tap **Add card**. A card has a **question** and an **answer**; both are needed before you can save.

## Format your answer
The toolbar above the answer box can make your answers easier to read. Select some text, then tap a button:
- **H1 / H2**: a heading or subheading
- **B**: bold, *I*: italic, __U__: underline
- **Marker**: ==highlight== the key words
- **Lists**: bullet points or numbered steps

Tap **Preview** to see how the answer will look on the card. Tap it again to keep writing.

## Edit or delete a card
In the deck, each card has buttons along the bottom:
- **Star**: add it to your favourites
- **Pencil**: change the card
- **Bin**: delete it (you will be asked first)

## Answers stay hidden
In the card list the answers are covered, so you can test yourself just by reading the questions. Tap **Tap to show answer** to see one, and tap again to hide it.`,
  },
  {
    id: 'attachments',
    section: 'Basics',
    icon: 'attach-outline',
    title: 'Pictures, PDFs and audio',
    summary: 'Add images, documents and voice notes to cards.',
    body: `Cards can hold more than text. You can add files to the **question**, the **answer**, or both.

## Add a file
In the card editor, under the question or the answer, tap:
- **Image**: a photo or diagram from your gallery
- **PDF**: a document, such as class notes
- **Record**: record a voice note with your microphone, then tap stop
- **Audio file**: a sound file already on your phone

Remove one before saving with the red **×** next to it. Tap **Save** to keep your changes.

## While studying
- Tap a **picture** to see it full screen.
- Tap a **PDF** to open it in your phone's viewer.
- Tap **▶** on an **audio** clip to play it, and again to pause.

==Ideas:== label a diagram as the question, record how to pronounce a word in a new language, or attach the page of notes the card comes from.

Files are copied into NoteMe, so they stay even if you delete the original from your phone.`,
  },
  {
    id: 'studying',
    section: 'Studying',
    icon: 'play-circle-outline',
    title: 'Studying a deck',
    summary: 'Go through cards one by one and test yourself.',
    body: `Studying shows your cards one at a time, ==question first==.

## How it works
1. Read the question and try to answer it in your head (or out loud).
2. Tap **Show answer**, or tap the card, to turn it over.
3. Rate how well you knew it: **Hard**, **OK** or **Easy**. The next card appears.

## Other controls
- **← (back)**: go to the previous card
- **Shuffle**: mix the cards into a random order and start again
- **Star**: add the card to your favourites
- The bar at the top shows how far you are.

Every card starts on its question, so you never see the answer by accident.`,
  },
  {
    id: 'rating',
    section: 'Studying',
    icon: 'speedometer-outline',
    title: 'Hard, OK and Easy',
    summary: 'Rate each card so you can focus on what you find hard.',
    body: `After you see an answer, tell NoteMe how it went:
- **Hard**: you did not know it, or it took a long time
- **OK**: you got it, but had to think
- **Easy**: you knew it straight away

NoteMe remembers the **latest** rating of every card. Cards you have not rated yet are called **New**.

## Why rate?
Ratings let you revise smarter. In **Create revision** you can choose only the Hard cards, so you spend your time where it matters. In a deck, each card shows its latest rating as a small coloured tag.

Be honest. Rating a card Easy when it was Hard only hides it from the practice you need.`,
  },
  {
    id: 'revision',
    section: 'Studying',
    icon: 'git-merge-outline',
    title: 'Create revision',
    summary: 'Mix decks and choose exactly which cards to revise.',
    body: `A **revision** mixes cards from several decks into one shuffled session. It is great before an exam.

## Make a revision
1. Tap **Create revision** in the Flashcards tab (or from the **+** button).
2. Under **Which cards?**, choose the ratings to include: **Hard**, **OK**, **Easy** and **New**. Tap a chip to turn it on or off.
3. Turn on **Favourites only** if you just want your starred cards.
4. Tick the decks to include, or tap **Select all**.
5. Check the count at the bottom, then tap **Start revision**.

The name of the deck appears above each card, so you know which subject it is from.

==Try this:== turn on only **Hard** and **New** for a quick session on what you do not know yet.`,
  },
  {
    id: 'summary',
    section: 'Studying',
    icon: 'stats-chart-outline',
    title: 'End of a session',
    summary: 'See how it went and revise the cards you pick again.',
    body: `When you finish the last card you see a summary:
- How many cards you rated **Hard**, **OK** and **Easy**
- Your cards, grouped by rating

## Revise again straight away
Your **Hard** cards are already ticked. Tick or untick any card, or tap **Select all** / **Clear** on a group. Then tap **Revise selected** to start a new round with just those cards.

Other choices:
- **Study all again**: go through the same cards once more
- **Back**: return to where you started`,
  },
  {
    id: 'favourites',
    section: 'Studying',
    icon: 'star-outline',
    title: 'Favourites',
    summary: 'Star important cards and find them in one place.',
    body: `Star a card to keep it in your **Favourites**. You can do this while studying (the star at the top) or in a deck's card list.

## See your favourites
Open **Flashcards → Favourites**, or **More → Favourite cards**. Your starred cards are ==grouped by the deck they come from==. Tap a deck's name to open that deck.

- Tap **Revise favourites** to study all of them in one session.
- Tap the star on a card to remove it from your favourites.

Favourites are also a filter in **Create revision**, so you can mix "Favourites only" with ratings like Hard.`,
  },
  {
    id: 'streak',
    section: 'Good to know',
    icon: 'flame-outline',
    title: 'Streak and consistency',
    summary: 'Build a habit by studying a little every day.',
    body: `On **Home**, the **Consistency** box shows your study habit.
- **Streak**: how many days in a row you have studied. Study at least one card today to keep it going.
- **Best**: your longest streak so far.
- **Grid**: one square per day. The darker the square, the more cards you studied that day.

A card counts once per session when you rate it.

==Tip:== ten minutes a day beats two hours the night before a test.`,
  },
  {
    id: 'your-data',
    section: 'Good to know',
    icon: 'phone-portrait-outline',
    title: 'Your data',
    summary: 'Where your decks are kept, and what is coming next.',
    body: `Right now you use NoteMe as a **guest**. Your decks, cards, files and progress are saved ==only on this device==.
- They stay when you close the app or restart your phone.
- They are deleted if you uninstall the app or clear its data.

## Coming soon
- **Sign in** to back up your decks and use them on other devices
- **AI**: ask Claude, ChatGPT or Gemini to make notes and flashcards for you
- **Notes**: write study notes next to your flashcards`,
  },
  {
    id: 'faq',
    section: 'Good to know',
    icon: 'chatbubbles-outline',
    title: 'Questions and answers',
    summary: 'Quick answers to common questions.',
    body: `## The Save button is grey
A card needs both a question and an answer. A deck needs a name.

## A PDF will not open
Your phone needs an app that can show PDFs. Most phones have one; if not, install a PDF reader.

## Recording does not start
NoteMe needs permission to use the microphone. Allow it when asked, or turn it on in your phone's settings for NoteMe.

## Can I change a rating?
Yes. Study the card again and pick a new rating. NoteMe keeps the latest one.

## How do I see the welcome tour again?
Go to **More → App tour**.

## How do I get the tips back?
Each screen shows a short tip until you tap **Got it**. To see them all again, go to **More → Help & guide** and tap **Show tips again**.

## I deleted a deck by mistake
Deleting cannot be undone yet, which is why NoteMe always asks first.`,
  },
];

export const GUIDE_SECTIONS: GuideTopic['section'][] = ['Basics', 'Studying', 'Good to know'];

export function findTopic(id: string): GuideTopic | undefined {
  return GUIDE_TOPICS.find((t) => t.id === id);
}

/** Topics whose title, summary or text contain every word of the query (ignoring case). */
export function searchGuide(query: string): GuideTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return GUIDE_TOPICS;
  return GUIDE_TOPICS.filter((topic) => {
    const haystack = `${topic.title}\n${topic.summary}\n${toPlainText(topic.body)}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}
