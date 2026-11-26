import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

import NoteScreen from '@/app/note/[id]';
import NotesScreen from '@/app/(tabs)/notes';
import NoteCardsScreen from '@/app/note-cards';
import NoteEditorScreen from '@/app/note-editor';
import * as cards from '@/data/cards';
import * as decks from '@/data/decks';
import * as folders from '@/data/folders';
import * as notes from '@/data/notes';
import * as settings from '@/data/settings';
import * as tags from '@/data/tags';
import type { FolderWithCounts, Note, Tag } from '@/data/types';
import { mockRouter } from '@/test-utils/mock-router';

jest.mock('expo-router', () => jest.requireActual('@/test-utils/mock-router').mockRouter);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-sqlite', () => {
  const db = {};
  return { useSQLiteContext: () => db };
});
jest.mock('@/data/folders', () => ({
  ...jest.requireActual('@/data/folders'),
  listFolders: jest.fn(),
  getFolderPath: jest.fn(),
  createFolder: jest.fn(),
  countFolderContents: jest.fn(),
  deleteFolder: jest.fn(),
  setFolderFavorite: jest.fn(),
}));
jest.mock('@/data/notes', () => ({
  ...jest.requireActual('@/data/notes'),
  listNotes: jest.fn(),
  getNote: jest.fn(),
  createNote: jest.fn(),
  listNoteAttachments: jest.fn(),
  searchNotes: jest.fn(),
  listFavorites: jest.fn(),
  setNoteFavorite: jest.fn(),
}));
jest.mock('@/data/tags', () => ({
  ...jest.requireActual('@/data/tags'),
  listTags: jest.fn(),
  listTagsForNotes: jest.fn(),
  searchTags: jest.fn(),
  setNoteTags: jest.fn(),
  createTag: jest.fn(),
  findTagByName: jest.fn(),
}));
jest.mock('@/data/decks');
jest.mock('@/data/cards');
jest.mock('@/data/settings', () => ({
  ...jest.requireActual('@/data/settings'),
  isTipDismissed: jest.fn(),
  getNoteFocusSize: jest.fn(),
  setNoteFocusSize: jest.fn(),
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
  maxSpeechInputLength: 4000,
}));
jest.mock('@/lib/confirm', () => ({ confirm: jest.fn(() => Promise.resolve(true)) }));
// The recorder needs the microphone; it isn't opened in these tests.
jest.mock('@/components/cards/audio-recorder', () => ({ AudioRecorderModal: () => null }));

const NOW = '2026-01-01T00:00:00.000Z';

function folder(overrides: Partial<FolderWithCounts>): FolderWithCounts {
  return {
    id: 'f-1',
    parentId: null,
    name: 'Class 10',
    favoritedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    folderCount: 0,
    noteCount: 0,
    ...overrides,
  };
}

function tag(overrides: Partial<Tag>): Tag {
  return { id: 't-1', name: 'Exam 1', color: 'red', createdAt: NOW, updatedAt: NOW, deletedAt: null, ...overrides };
}

function note(overrides: Partial<Note>): Note {
  return {
    id: 'n-1',
    folderId: null,
    title: 'Speed',
    style: 'plain',
    body: '',
    rows: [],
    summary: '',
    createdBy: null,
    favoritedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.useLocalSearchParams.mockReturnValue({});
  jest.mocked(settings.isTipDismissed).mockResolvedValue(true);
  jest.mocked(settings.getNoteFocusSize).mockResolvedValue('lg');
  jest.mocked(settings.setNoteFocusSize).mockResolvedValue();
  jest.mocked(folders.listFolders).mockResolvedValue([]);
  jest.mocked(folders.getFolderPath).mockResolvedValue([]);
  jest.mocked(notes.listNotes).mockResolvedValue([]);
  jest.mocked(notes.listNoteAttachments).mockResolvedValue([]);
  jest.mocked(notes.searchNotes).mockResolvedValue({ folders: [], notes: [] });
  jest.mocked(decks.listDecks).mockResolvedValue([]);
  jest.mocked(notes.listFavorites).mockResolvedValue({ folders: [], notes: [] });
  jest.mocked(tags.listTags).mockResolvedValue([]);
  jest.mocked(tags.listTagsForNotes).mockResolvedValue(new Map());
  jest.mocked(tags.searchTags).mockResolvedValue([]);
  jest.mocked(tags.findTagByName).mockResolvedValue(null);
});

describe('Notes tab', () => {
  it('explains how to start when there is nothing yet', async () => {
    await render(<NotesScreen />);
    expect(await screen.findByText('Nothing here yet')).toBeOnTheScreen();
  });

  it('ends the notes with a Good to know card that says how to fill it', async () => {
    jest.mocked(notes.listNotes).mockResolvedValue([note({ id: 'n-1' }), note({ id: 'n-2', title: 'Velocity' })]);

    await render(<NotesScreen />);

    expect(await screen.findByLabelText('Good to know, not made yet')).toBeOnTheScreen();
    expect(screen.getByText(/these 2 notes will collect here/)).toBeOnTheScreen();

    // Tapping it makes the (empty) note there and opens it.
    jest.mocked(notes.createNote).mockResolvedValue('n-gtk');
    await fireEvent.press(screen.getByLabelText('Good to know, not made yet'));
    expect(notes.createNote).toHaveBeenCalledWith(expect.anything(), null, { title: 'Good to know', style: 'plain' });
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-gtk' } });
  });

  it('shows the Good to know note as its own card, not counted with the notes', async () => {
    jest.mocked(notes.listNotes).mockResolvedValue([
      note({ id: 'n-1' }),
      note({ id: 'n-gtk', title: 'Good to know', body: '## Speed\n- Fast\n\n## Velocity\n- Speed with direction' }),
    ]);

    await render(<NotesScreen />);

    expect(await screen.findByText('Key points from 2 notes in one place')).toBeOnTheScreen();
    expect(screen.getByText('1')).toBeOnTheScreen(); // the Notes count leaves it out
    await fireEvent.press(screen.getByLabelText('Good to know: key points from this folder'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-gtk' } });
  });

  it('lists top-level folders with what is in them, then notes', async () => {
    jest.mocked(folders.listFolders).mockResolvedValue([folder({ folderCount: 3, noteCount: 1 })]);
    jest.mocked(notes.listNotes).mockResolvedValue([note({ style: 'cornell', rows: [{ cue: 'Inertia', notes: 'Keeps moving' }] })]);

    await render(<NotesScreen />);

    expect(await screen.findByText('Class 10')).toBeOnTheScreen();
    expect(screen.getByText('3 folders · 1 note')).toBeOnTheScreen();
    expect(screen.getByText('Speed')).toBeOnTheScreen();
    expect(screen.getByText('Cornell')).toBeOnTheScreen();
    expect(screen.getByText('Inertia: Keeps moving')).toBeOnTheScreen();
    expect(screen.queryByText(/^AI ·/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Class 10, 3 folders · 1 note'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/folder/[id]', params: { id: 'f-1' } });
  });

  it('creates a folder at the top level', async () => {
    await render(<NotesScreen />);
    await fireEvent.press(await screen.findByText('New folder'));
    await fireEvent.changeText(screen.getByPlaceholderText(/e\.g\. Class 10/), 'Class 10');
    await fireEvent.press(screen.getByText('Save'));

    expect(folders.createFolder).toHaveBeenCalledWith(expect.anything(), { parentId: null, name: 'Class 10' });
  });

  it('shows tags and favourites at the top', async () => {
    jest.mocked(tags.listTags).mockResolvedValue([{ ...tag({}), noteCount: 3 }]);
    jest.mocked(notes.listFavorites).mockResolvedValue({
      folders: [{ ...folder({ id: 'f-9', name: 'Physics', favoritedAt: NOW, noteCount: 2 }), path: [{ id: 'f-1', name: 'Class 10' }] }],
      notes: [{ ...note({ id: 'n-9', title: 'Inertia', favoritedAt: NOW }), path: [] }],
    });
    jest.mocked(tags.listTagsForNotes).mockResolvedValue(new Map([['n-9', [tag({ name: 'Hard', id: 't-2' })]]]));

    await render(<NotesScreen />);

    expect(await screen.findByText('Favourites')).toBeOnTheScreen();
    expect(screen.getByText('Notes › Class 10 · 2 notes')).toBeOnTheScreen();
    expect(screen.getByText('Inertia')).toBeOnTheScreen();
    expect(screen.getByText('Hard')).toBeOnTheScreen(); // the favourite note's tag

    await fireEvent.press(screen.getByLabelText('Open tag Exam 1'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/tag/[id]', params: { id: 't-1' } });
  });

  it('stars a folder from its menu', async () => {
    jest.mocked(folders.listFolders).mockResolvedValue([folder({})]);
    await render(<NotesScreen />);
    await fireEvent.press(await screen.findByLabelText('More options for Class 10'));
    await fireEvent.press(screen.getByText('Add to favourites'));
    await waitFor(() => expect(folders.setFolderFavorite).toHaveBeenCalledWith(expect.anything(), 'f-1', true));
  });

  it('marks notes an AI app wrote', async () => {
    jest.mocked(notes.listNotes).mockResolvedValue([note({ createdBy: 'Claude' })]);
    await render(<NotesScreen />);
    expect(await screen.findByText('AI · Claude')).toBeOnTheScreen();
  });

  it('keeps the form open when the folder name is already used', async () => {
    const { FolderNameTakenError } = jest.requireActual('@/data/folders');
    jest.mocked(folders.createFolder).mockRejectedValue(new FolderNameTakenError('Class 10'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    await render(<NotesScreen />);
    await fireEvent.press(await screen.findByText('New folder'));
    await fireEvent.changeText(screen.getByPlaceholderText(/e\.g\. Class 10/), 'class 10');
    await fireEvent.press(screen.getByText('Save'));

    await waitFor(() =>
      expect(alert).toHaveBeenCalledWith('Name already used', 'There is already a folder called "Class 10" here.'),
    );
    expect(screen.getByDisplayValue('class 10')).toBeOnTheScreen();
  });

  it('warns how much is inside before deleting a folder', async () => {
    jest.mocked(folders.listFolders).mockResolvedValue([folder({})]);
    jest.mocked(folders.countFolderContents).mockResolvedValue({ folders: 4, notes: 9 });
    const { confirm } = jest.requireMock('@/lib/confirm');

    await render(<NotesScreen />);
    await fireEvent.press(await screen.findByLabelText('More options for Class 10'));
    await fireEvent.press(screen.getByText('Delete'));

    await waitFor(() => expect(folders.deleteFolder).toHaveBeenCalledWith(expect.anything(), 'f-1'));
    expect(confirm).toHaveBeenCalledWith(
      'Delete folder?',
      '"Class 10" and everything in it (4 folders and 9 notes) will be deleted.',
    );
  });

  it('searches every note and shows where each one is', async () => {
    jest.useFakeTimers();
    jest.mocked(notes.searchNotes).mockResolvedValue({
      folders: [],
      notes: [{ ...note({ body: 'Velocity has a direction' }), path: [{ id: 'f-1', name: 'Class 10' }, { id: 'f-2', name: 'Physics' }] }],
    });

    await render(<NotesScreen />);
    await fireEvent.changeText(screen.getByLabelText('Search notes'), 'velocity');
    await act(async () => {
      jest.advanceTimersByTime(200);
    });

    expect(await screen.findByText('Notes › Class 10 › Physics')).toBeOnTheScreen();
    expect(screen.getByText('Velocity has a direction')).toBeOnTheScreen();
    expect(notes.searchNotes).toHaveBeenCalledWith(expect.anything(), 'velocity');
    jest.useRealTimers();
  });
});

describe('Note editor', () => {
  it('saves a new Cornell note in the folder it was opened from', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ folderId: 'f-2' });
    jest.mocked(notes.createNote).mockResolvedValue('n-new');
    jest.mocked(tags.listTags).mockResolvedValue([{ ...tag({}), noteCount: 0 }]);
    jest.mocked(tags.createTag).mockResolvedValue('t-new');

    await render(<NoteEditorScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Forces');
    await fireEvent.press(screen.getByLabelText('Cornell notes: Cues, notes and a summary'));
    await fireEvent.changeText(screen.getByLabelText('Cue 1'), 'What is inertia?');
    await fireEvent.changeText(screen.getByLabelText('Notes 1'), 'Objects keep moving');
    await fireEvent.press(screen.getByText('Add row'));
    await fireEvent.changeText(screen.getByLabelText('Cue 2'), 'F = ?');
    await fireEvent.changeText(screen.getByLabelText('Summary'), 'Newton');
    // Pick an existing tag and make a new one.
    await fireEvent.press(screen.getByLabelText('Tag Exam 1'));
    await fireEvent.changeText(screen.getByLabelText('New tag'), 'Hard');
    await fireEvent.press(screen.getByLabelText('Add tag'));
    expect(screen.getByLabelText('Tag Hard')).toBeChecked();
    await fireEvent.press(screen.getByLabelText('Save'));

    await waitFor(() =>
      expect(notes.createNote).toHaveBeenCalledWith(expect.anything(), 'f-2', {
        title: 'Forces',
        style: 'cornell',
        body: '',
        rows: [
          { cue: 'What is inertia?', notes: 'Objects keep moving' },
          { cue: 'F = ?', notes: '' },
        ],
        summary: 'Newton',
      }),
    );
    expect(tags.createTag).toHaveBeenCalledWith(expect.anything(), { name: 'Hard', color: 'teal' }); // next colour after the one tag
    expect(tags.setNoteTags).toHaveBeenCalledWith(expect.anything(), 'n-new', ['t-1', 't-new']);
    expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-new' } });
  });

  it('needs a title to save', async () => {
    await render(<NoteEditorScreen />);
    expect(await screen.findByText('Add a title to save this note')).toBeOnTheScreen();
    expect(screen.getByLabelText('Save')).toBeDisabled();
  });
});

describe('Note screen', () => {
  it('shows the tags on a note and opens one', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Speed: distance ÷ time' }));
    jest.mocked(tags.listTagsForNotes).mockResolvedValue(new Map([['n-1', [tag({})]]]));

    await render(<NoteScreen />);

    expect(await screen.findByText('Exam 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Open tag Exam 1'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/tag/[id]', params: { id: 't-1' } });
  });

  it('opens focus mode with only the note, resizes text, and exits', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Speed: distance ÷ time' }));
    jest.mocked(tags.listTagsForNotes).mockResolvedValue(new Map([['n-1', [tag({})]]]));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByText('Focus'));

    expect(await screen.findByLabelText('Exit focus mode')).toBeOnTheScreen();
    expect(screen.getByText('Speed: distance ÷ time')).toBeOnTheScreen();
    expect(screen.queryByText('Exam 1')).toBeNull();
    expect(screen.queryByText(/Make flashcards/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Larger text'));
    expect(settings.setNoteFocusSize).toHaveBeenCalledWith(expect.anything(), 'xl');
    expect(screen.getByLabelText('Larger text')).toBeDisabled();

    await fireEvent.press(screen.getByLabelText('Exit focus mode'));
    expect(await screen.findByText('Exam 1')).toBeOnTheScreen();
  });

  it('covers Cornell notes in focus mode until each one is tapped', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(
      note({ style: 'cornell', rows: [{ cue: 'What is speed?', notes: 'Distance over time' }] }),
    );

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByText('Focus'));
    await fireEvent.press(await screen.findByLabelText('Cover notes to test yourself'));

    expect(screen.getByText('What is speed?')).toBeOnTheScreen();
    expect(screen.queryByText('Distance over time')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Show notes for What is speed?'));
    expect(screen.getByText('Distance over time')).toBeOnTheScreen();
  });

  it('turns off focus mode for an empty note', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({}));

    await render(<NoteScreen />);

    expect(await screen.findByText('This note is empty. Tap to start writing.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Focus'));
    expect(screen.queryByLabelText('Exit focus mode')).toBeNull();
  });

  it('steps to the previous and next note in the same folder', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-2' });
    const inFolder = [
      note({ id: 'n-1', folderId: 'f-1', title: 'Speed' }),
      note({ id: 'n-2', folderId: 'f-1', title: 'Velocity', body: 'Speed with a direction' }),
      note({ id: 'n-3', folderId: 'f-1', title: 'Acceleration' }),
    ];
    jest.mocked(notes.getNote).mockResolvedValue(inFolder[1]);
    jest.mocked(notes.listNotes).mockResolvedValue(inFolder);

    await render(<NoteScreen />);

    expect(await screen.findByText('2 / 3')).toBeOnTheScreen();
    expect(notes.listNotes).toHaveBeenCalledWith(expect.anything(), 'f-1');
    await fireEvent.press(screen.getByLabelText('Next note: Acceleration'));
    expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-3' } });
    await fireEvent.press(screen.getByLabelText('Previous note: Speed'));
    expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-1' } });
  });

  it('steps through the folder in focus mode, staying in focus mode', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    const inFolder = [
      note({ id: 'n-1', folderId: 'f-1', title: 'Speed', body: 'Distance ÷ time' }),
      note({ id: 'n-2', folderId: 'f-1', title: 'Velocity' }),
    ];
    jest.mocked(notes.getNote).mockResolvedValue(inFolder[0]);
    jest.mocked(notes.listNotes).mockResolvedValue(inFolder);

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByText('Focus'));

    expect(await screen.findByLabelText('Exit focus mode')).toBeOnTheScreen();
    expect(screen.getByText('1 / 2')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Next note: Velocity'));
    expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-2', focus: '1' } });
  });

  it('opens straight into focus mode when asked to', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-2', focus: '1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ id: 'n-2', title: 'Velocity', body: 'Speed with a direction' }));

    await render(<NoteScreen />);

    expect(await screen.findByLabelText('Exit focus mode')).toBeOnTheScreen();
  });

  it('hides previous and next for a note on its own', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Speed: distance ÷ time' }));

    await render(<NoteScreen />);

    expect(await screen.findByText('Speed: distance ÷ time')).toBeOnTheScreen();
    expect(screen.queryByText('Previous')).toBeNull();
    expect(notes.listNotes).toHaveBeenCalledWith(expect.anything(), null); // top level
  });
});

describe('Make flashcards', () => {
  it('suggests cards from the note and adds the ticked ones to a new deck', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ noteId: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(
      note({
        title: 'Motion',
        style: 'cornell',
        rows: [
          { cue: 'Speed?', notes: 'distance ÷ time' },
          { cue: 'Velocity?', notes: 'speed with direction' },
        ],
      }),
    );
    jest.mocked(decks.createDeck).mockResolvedValue('d-new');

    await render(<NoteCardsScreen />);

    expect(await screen.findByDisplayValue('Speed?')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Include card 2'));
    expect(screen.getByDisplayValue('Motion')).toBeOnTheScreen(); // new deck named after the note
    await fireEvent.press(screen.getByText('Add 1 card'));

    await waitFor(() => expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/deck/[id]', params: { id: 'd-new' } }));
    expect(decks.createDeck).toHaveBeenCalledWith(expect.anything(), { name: 'Motion' });
    expect(cards.createCard).toHaveBeenCalledTimes(1);
    expect(cards.createCard).toHaveBeenCalledWith(expect.anything(), 'd-new', { front: 'Speed?', back: 'distance ÷ time' });
  });
});

describe('Note header: read aloud and the ⋮ menu', () => {
  // The speaker and menu sit in the header, which the test router doesn't normally draw.
  const plainScreen = mockRouter.Stack.Screen;
  beforeEach(() => {
    mockRouter.Stack.Screen = (({ options }: { options?: { headerRight?: () => React.ReactNode } }) =>
      options?.headerRight?.() ?? null) as typeof plainScreen;
  });
  afterEach(() => {
    mockRouter.Stack.Screen = plainScreen;
  });

  it('reads the note out and stops when tapped again', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: '**Speed**: distance ÷ time' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Read note aloud'));

    expect(Speech.speak).toHaveBeenCalledWith('Speed\nSpeed: distance ÷ time', expect.anything());
    await fireEvent.press(screen.getByLabelText('Stop reading'));
    expect(Speech.stop).toHaveBeenCalled();
    expect(screen.getByLabelText('Read note aloud')).toBeOnTheScreen();
  });

  it('goes back to the speaker once the voice finishes', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Distance ÷ time' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Read note aloud'));
    const options = jest.mocked(Speech.speak).mock.calls[0][1];
    await act(() => options?.onDone?.());

    expect(screen.getByLabelText('Read note aloud')).toBeOnTheScreen();
  });

  it('reads aloud from focus mode too', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1', focus: '1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Distance ÷ time' }));

    await render(<NoteScreen />);
    expect(await screen.findByLabelText('Exit focus mode')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Read note aloud'));

    expect(Speech.speak).toHaveBeenCalledWith('Speed\nDistance ÷ time', expect.anything());
    expect(screen.getByLabelText('Stop reading')).toBeOnTheScreen();
  });

  it('puts make flashcards, favourite, edit and delete in the ⋮ menu', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Speed: distance ÷ time' }));

    await render(<NoteScreen />);
    expect(screen.queryByText(/Make flashcards/)).toBeNull();

    await fireEvent.press(await screen.findByLabelText('More options'));
    expect(screen.getByText('Add to favourites')).toBeOnTheScreen();
    expect(screen.getByText('Edit note')).toBeOnTheScreen();
    expect(screen.getByText('Delete note')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(/Make flashcards/));
    expect(mockRouter.router.push).toHaveBeenCalledWith({ pathname: '/note-cards', params: { noteId: 'n-1' } });
  });

  it('has no speaker on an empty note', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({}));

    await render(<NoteScreen />);

    expect(await screen.findByText('This note is empty. Tap to start writing.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Read note aloud')).toBeNull();
  });
});
