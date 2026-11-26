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
    summary: 'What StudyMe does and the fastest way to begin.',
    body: `StudyMe helps you remember what you learn with **flashcards**: a question on the front, the answer on the back.

## Your first five minutes
1. Open the **Flashcards** tab and tap **New deck**. Give it a subject name, like "Biology – Cells".
2. Open the deck and tap **Add card**. Write a question and its answer.
3. Add a few more cards, then tap **Study**.
4. Try to answer in your head, tap **Show answer**, and rate the card **Hard**, **OK** or **Easy**.

## Finding your way
- **Home**: continue your last deck, your subjects, and your study streak
- **Notes**: study notes in folders, like Class 10 › Physics › Chapter 1
- **Flashcards**: all your decks, Create revision and Favourites
- **+ button**: quick shortcuts to make a new deck, a revision or a note
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

StudyMe picks an icon from the name, so a deck called "Chemistry" gets a flask and "Maths" gets a sigma.

## Change or delete a deck
- Tap the **pencil** on a deck to rename it or change its description.
- Tap the **bin** to delete it. You will be asked first, because ==deleting a deck also deletes all its cards==.

## Inside a deck
The blue panel at the top is the deck itself. Your cards are listed under **Cards**.
- **Cards**: how many cards the deck has
- **Studied**: your total study time on this deck, like "1 h 05 min studied"
- **Rating bar**: how your cards are rated, from Easy (teal) to Hard (red). Faint white means New, not rated yet
- **Study**: start going through the cards
- **Timer**: the clock button next to Study, for a time limit on each card

==Goal:== turn the whole bar teal. Study the Hard and New cards until they feel Easy.

## Study a deck
Tap the orange **▶** next to a deck, or open the deck and tap **Study**. A clock at the top of the study screen shows how long you have been studying. The time is added to the deck's total when you finish or leave.

## Time per card
Give each card a time limit, so you practise answering quickly, like in an exam.
1. Open the deck and tap the **clock** next to **Study**.
2. Choose a time, like **30 sec** or **1 min**. Choose **Off** to turn it off.
3. For any other time, tap **Custom**, type the minutes and seconds, and tap **Set**. Anything from 5 seconds to 30 minutes works.
4. Tap **Study**. A countdown shows next to the card number, and the next card shows by itself when it reaches zero.

Tap the countdown to **pause** it if you need longer on a card, and tap again to carry on. Turn on **Pause on answer** in the same popup to stop the countdown while you read each answer. Each deck keeps its own time, and your last custom time is offered first next time.`,
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
- **H1 / H2**: a heading (shown in blue) or subheading
- **H3 / H4**: smaller headings
- **B**: bold, *I*: italic, __U__: underline
- **Marker**: ==highlight== the key words
- **Lists**: bullet points or numbered steps
- **Table**: adds a small table. Type in the cells between the | marks; add a row by copying a line

Tap **Preview** to see how the answer will look on the card. Tap it again to keep writing.

## Edit or delete a card
In the deck, each card has buttons along the bottom:
- **Star**: add it to your favourites
- **Pencil**: change the card
- **Bin**: delete it (you will be asked first)

## Answers stay hidden
In the card list the answers are covered, so you can test yourself just by reading the questions. Tap **Tap to show answer** to see one, and tap again to hide it.

## Coloured edges
The coloured strip down the left of each card shows how it felt last time: teal for **Easy**, amber for **OK**, red for **Hard** and grey for **New**. Scan the list for red to see what needs more practice.`,
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

Files are copied into StudyMe, so they stay even if you delete the original from your phone.`,
  },
  {
    id: 'notes',
    section: 'Basics',
    icon: 'document-text-outline',
    title: 'Notes and folders',
    summary: 'Write study notes and keep them in folders inside folders.',
    body: `The **Notes** tab keeps your study notes in **folders**. A folder can hold other folders, as many levels deep as you need.

## Set up your folders
For school, one way that works well:
1. **Class**: make a folder like "Class 10".
2. **Subject**: open it and add a folder for each subject, like "Physics".
3. **Chapter**: inside a subject, add a folder for each chapter.
4. **Topic**: inside a chapter, add a folder for each topic, then write notes in it.

You can use any names and any number of levels, like Semester › Course › Unit.

## Write a note
1. Open a folder and tap **New note**.
2. Give it a title and write. Use the toolbar for headings, **bold**, highlights and lists.
3. Add pictures, PDFs or a voice note under **Attachments**, then tap **Save**.

## Read a note
- Tap the **speaker** at the top to hear the note read aloud. Tap it again to stop.
- Use **Previous** and **Next** at the bottom to move between the notes in the same folder.
- Tap **⋮** at the top for **Make flashcards**, favourites, **Edit note** and **Delete note**.

## Rename, delete and search
- Tap **⋮** on a folder to rename or delete it. ==Deleting a folder also deletes everything in it.==
- Use the search box at the top of the Notes tab to find any note, folder or tag.`,
  },
  {
    id: 'note-tags',
    section: 'Basics',
    icon: 'pricetags-outline',
    title: 'Favourites and tags',
    summary: 'Keep important notes close, and group notes from different folders.',
    body: `## Favourites
Star the notes and folders you use most, like the chapter you are studying this week. They show under **Favourites** at the top of the Notes tab.
- **Note**: open it, tap **⋮** at the top and choose **Add to favourites**.
- **Folder**: tap **⋮** on the folder and choose **Add to favourites**.

## Tags
A **tag** is a coloured label, like "Exam 1", "Important" or "Revise again". A note can have several tags, and notes from any folder can share a tag.
1. Open a note, tap **⋮** at the top and choose **Edit note**.
2. Under **Tags**, tap a tag to add it, or type a new one and tap **Add**.
3. Tap **Save**.

All your tags show at the top of the Notes tab. Tap one to see every note with it. From there you can rename the tag, change its colour or delete it. ==Deleting a tag keeps the notes.==

==Tip:== before a test, tag every note you need with the test's name. Then one tap shows everything to revise.`,
  },
  {
    id: 'cornell',
    section: 'Basics',
    icon: 'grid-outline',
    title: 'Cornell notes',
    summary: 'A note-taking layout that is made for revising.',
    body: `**Cornell notes** split a page into three parts:
- **Cues** on the left: keywords or questions
- **Notes** on the right: the details for each cue
- **Summary** at the bottom: the main ideas in a few lines, in your own words

## Use them
1. In a new note, choose **Cornell** at the top.
2. Write a cue and its notes in each row. Tap **Add row** for more.
3. Write the summary after class, while it is fresh.

==Tip:== to revise, cover the notes side and answer each cue from memory.

You can switch a note between Plain and Cornell at any time. Nothing you wrote is lost.`,
  },
  {
    id: 'notes-to-cards',
    section: 'Basics',
    icon: 'copy-outline',
    title: 'Turn notes into flashcards',
    summary: 'Make cards from a note in a few taps.',
    body: `Open a note, tap **⋮** at the top and choose **Make flashcards**. StudyMe finds cards in your note:
- **Cornell notes**: each cue becomes a question, and its notes become the answer.
- **Plain notes**: a line like "Speed: distance ÷ time" becomes a card, and so does each heading with the text under it.

Check the cards, change any you like, and untick the ones you do not want. You can also add cards of your own. Then choose a deck (or make a new one) and tap **Add**.`,
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
- **Prev**: go to the previous card
- **Next**: skip a card without rating it (on the last card it says **Finish**)
- **Shuffle**: cards come in a random order by default. Tap it to go through them in order instead, and again to mix them
- **Timer**: in a deck, tap the clock next to **Study** to give each card a time limit, or choose **Custom** to type your own. When it runs out, the next card shows by itself. Tap the countdown to pause it.
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
    body: `After you see an answer, tell StudyMe how it went:
- **Hard**: you did not know it, or it took a long time
- **OK**: you got it, but had to think
- **Easy**: you knew it straight away

StudyMe remembers the **latest** rating of every card. Cards you have not rated yet are called **New**.

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
- How many cards you rated **Easy**, **OK** and **Hard**, and how many you skipped (**Unmarked**)
- Your cards, grouped as **Unmarked**, **Easy**, **OK** and **Hard**
- How long each card took, kept hidden until you ask for it

## Time per card
StudyMe times how long each card is on screen. Tap **Show** on the **Time per card** box to see your cards from slowest to fastest, with your average. Slow cards are often the ones you are unsure of: tick them, or tap **Select slowest 3**, to add them to your next round.

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
    summary: 'Where your decks and notes are kept, and how backup works.',
    body: `As a **guest**, your decks, cards, notes, files and progress are saved ==only on this device==.
- They stay when you close the app or restart your phone.
- They are deleted if you uninstall the app or clear its data.

## Sign in to back up
Open **More → Account** and sign in. Everything you made as a guest moves into your account and is kept the same on every device you sign in on.
- Decks, cards, notes, folders and tags are backed up.
- Pictures and recordings stay on the device for now.`,
  },
  {
    id: 'ai-apps',
    section: 'Good to know',
    icon: 'sparkles-outline',
    title: 'AI apps (ChatGPT, Claude)',
    summary: 'Let ChatGPT or Claude make notes and flashcards for you.',
    body: `You can connect **ChatGPT** or **Claude** to your StudyMe account. Then ask it in a chat to make a deck or write notes, and they appear in StudyMe on the next sync.

## Set it up
1. Sign in to StudyMe (**More → Account**).
2. Open **More → Connect AI** and copy the connector link.
3. Add it as a custom connector in ChatGPT or Claude. The Connect AI screen shows the steps.
4. Sign in with your StudyMe account and tap **Allow**.

## What it can do
- See your decks, notes, folders and tags
- Make new decks, add cards to a deck, and write notes (plain or Cornell) in any folder
- It **can't** change or delete what you already have. The one exception is each folder's **Good to know** note.

Notes an AI writes show its name, like **ChatGPT**, so you can tell them apart.

## Good to know
Each time an AI writes a note in a folder, it also adds that note's key points to the folder's **Good to know** note, under the note's title. It is made with the first note and always sits last in the folder, as a yellow card with a bulb. Read it before a test to revise the whole folder from one page.

For notes you already have, ask your AI app: "Add good to know for the notes in my Traffic folder."

==Tip:== be specific. "Make 15 cards on the French Revolution for my History deck" works better than "make some cards".

## Stop it
Remove StudyMe from the AI app's connector settings.`,
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
StudyMe needs permission to use the microphone. Allow it when asked, or turn it on in your phone's settings for StudyMe.

## Can I change a rating?
Yes. Study the card again and pick a new rating. StudyMe keeps the latest one.

## How do I see the welcome tour again?
Go to **More → App tour**.

## How do I get the tips back?
Each screen shows a short tip until you tap **Got it**. To see them all again, go to **More → Help & guide** and tap **Show tips again**.

## I deleted a deck by mistake
Deleting cannot be undone yet, which is why StudyMe always asks first.`,
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
