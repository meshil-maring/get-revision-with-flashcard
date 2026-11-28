import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as Speech from 'expo-speech';
import { Alert } from 'react-native';

import NoteScreen from '@/app/note/[id]';
import NotesScreen from '@/app/(tabs)/notes';
import NoteCardsScreen from '@/app/note-cards';
import NoteEditorScreen from '@/app/note-editor';
import NotePageScreen from '@/app/note-page';
import * as notePages from '@/data/note-pages';
import * as cards from '@/data/cards';
import * as decks from '@/data/decks';
import * as folders from '@/data/folders';
import * as notes from '@/data/notes';
import * as settings from '@/data/settings';
import * as tags from '@/data/tags';
import type { FolderWithCounts, Note, Tag } from '@/data/types';
import { mockRouter } from '@/test-utils/mock-router';

// The header's right-hand buttons are drawn, so the note screen's Textbook switch can be pressed.
jest.mock('expo-router', () => {
  const { mockRouter } = jest.requireActual('@/test-utils/mock-router');
  return {
    ...mockRouter,
    Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null },
  };
});
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
  moveFolders: jest.fn(),
  listAllFolders: jest.fn(),
}));
jest.mock('@/data/notes', () => ({
  ...jest.requireActual('@/data/notes'),
  listNotes: jest.fn(),
  markNoteRead: jest.fn(),
  getNote: jest.fn(),
  createNote: jest.fn(),
  listNoteAttachments: jest.fn(),
  searchNotes: jest.fn(),
  listFavorites: jest.fn(),
  setNoteFavorite: jest.fn(),
  moveNotes: jest.fn(),
  deleteNote: jest.fn(),
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
  getNoteHandwriting: jest.fn(() => Promise.resolve(true)),
  setNoteHandwriting: jest.fn(() => Promise.resolve()),
  getNoteView: jest.fn(() => Promise.resolve(null)),
  getNoteViewDefault: jest.fn(() => Promise.resolve('auto')),
  setNoteView: jest.fn(() => Promise.resolve()),
  getTextbookPrefs: jest.fn(() => Promise.resolve(null)),
  setTextbookPrefs: jest.fn(() => Promise.resolve()),
  getNoteBookmarks: jest.fn(() => Promise.resolve([])),
  setNoteBookmarks: jest.fn(() => Promise.resolve()),
}));
// The textbook reader runs in a web view on phones; here it is a stand-in that shows what it was given.
jest.mock('@/components/textbook/textbook-reader', () => {
  const { Pressable, Text, View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: {
      chapter: { title: string; body: string };
      next: { title: string } | null;
      onUseStandard: () => void;
      onNavigate: (to: 'previous' | 'next') => void;
      focus: boolean;
      onFocusChange: (on: boolean) => void;
    }) => (
      <View testID="textbook-reader">
        <Pressable onPress={() => props.onFocusChange(!props.focus)} accessibilityRole="button">
          <Text>{props.focus ? 'Exit focus' : 'Focus'}</Text>
        </Pressable>
        <Text>Textbook: {props.chapter.title}</Text>
        <Text testID="textbook-body">{props.chapter.body}</Text>
        <Pressable onPress={props.onUseStandard} accessibilityRole="button">
          <Text>Standard view</Text>
        </Pressable>
        {props.next ? (
          <Pressable onPress={() => props.onNavigate('next')} accessibilityRole="button">
            <Text>Next chapter</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(() => Promise.resolve()),
  maxSpeechInputLength: 4000,
}));
jest.mock('@/lib/confirm', () => ({ confirm: jest.fn(() => Promise.resolve(true)) }));
// The recorder needs the microphone; it isn't opened in these tests.
jest.mock('@/components/cards/audio-recorder', () => ({ AudioRecorderModal: () => null }));
// Study sounds have their own tests (components/study/__tests__/focus-sound.test.tsx).
jest.mock('@/components/study/focus-sound', () => ({ FocusSoundButton: () => null }));

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

  describe('select mode', () => {
    beforeEach(() => {
      jest.mocked(folders.listFolders).mockResolvedValue([folder({}), folder({ id: 'f-2', name: 'Class 9' })]);
      jest.mocked(notes.listNotes).mockResolvedValue([note({ id: 'n-1' }), note({ id: 'n-2', title: 'Velocity' })]);
    });

    it('ticks folders and notes and deletes them together', async () => {
      jest.mocked(folders.countFolderContents).mockResolvedValue({ folders: 0, notes: 3 });
      const { confirm } = jest.requireMock('@/lib/confirm');

      await render(<NotesScreen />);
      await fireEvent.press(await screen.findByLabelText('Select'));
      expect(screen.getByText('Tap to select')).toBeOnTheScreen();
      expect(screen.queryByText('New note')).toBeNull();

      await fireEvent.press(screen.getByLabelText('Class 10, Empty'));
      await fireEvent.press(screen.getByText('Velocity'));
      expect(screen.getByText('2 selected')).toBeOnTheScreen();
      expect(mockRouter.router.push).not.toHaveBeenCalled(); // tapping ticks, it doesn't open

      await fireEvent.press(screen.getByText('Delete'));
      await waitFor(() => expect(notes.deleteNote).toHaveBeenCalledWith(expect.anything(), 'n-2'));
      expect(confirm).toHaveBeenCalledWith(
        'Delete selected?',
        '1 folder and 1 note will be deleted, with everything inside (3 notes).',
      );
      expect(folders.deleteFolder).toHaveBeenCalledWith(expect.anything(), 'f-1');
      expect(folders.deleteFolder).toHaveBeenCalledTimes(1);
      expect(await screen.findByText('New note')).toBeOnTheScreen(); // back out of select mode
    });

    it('starts with a long press, selects all, and stars everything', async () => {
      await render(<NotesScreen />);
      await fireEvent(await screen.findByText('Speed'), 'longPress');
      expect(screen.getByText('1 selected')).toBeOnTheScreen();

      await fireEvent.press(screen.getByText('Select all'));
      expect(screen.getByText('4 selected')).toBeOnTheScreen();

      await fireEvent.press(screen.getByText('Favourite'));
      await waitFor(() => expect(notes.setNoteFavorite).toHaveBeenCalledTimes(2));
      expect(folders.setFolderFavorite).toHaveBeenCalledWith(expect.anything(), 'f-2', true);
      expect(notes.setNoteFavorite).toHaveBeenCalledWith(expect.anything(), 'n-1', true);
    });

    it('moves the ticked items into a folder, leaving out the ones being moved', async () => {
      jest.mocked(folders.listAllFolders).mockResolvedValue([
        folder({}),
        folder({ id: 'f-2', name: 'Class 9' }),
        folder({ id: 'f-3', name: 'Physics', parentId: 'f-1' }),
      ]);

      await render(<NotesScreen />);
      await fireEvent.press(await screen.findByLabelText('Select'));
      await fireEvent.press(screen.getByLabelText('Class 9, Empty'));
      await fireEvent.press(screen.getByText('Speed'));
      await fireEvent.press(screen.getByText('Move'));

      expect(await screen.findByText('Move 1 folder and 1 note to')).toBeOnTheScreen();
      expect(screen.getByLabelText('Move to Class 10 › Physics')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Move to Class 9')).toBeNull();
      await fireEvent.press(screen.getByLabelText('Move to Class 10'));

      await waitFor(() => expect(notes.moveNotes).toHaveBeenCalledWith(expect.anything(), ['n-1'], 'f-1'));
      expect(folders.moveFolders).toHaveBeenCalledWith(expect.anything(), ['f-2'], 'f-1');
    });

    it('groups the ticked items together in a new folder', async () => {
      jest.mocked(folders.createFolder).mockResolvedValue('f-new');

      await render(<NotesScreen />);
      await fireEvent.press(await screen.findByLabelText('Select'));
      await fireEvent.press(screen.getByLabelText('Class 10, Empty'));
      await fireEvent.press(screen.getByText('Speed'));
      await fireEvent.press(screen.getByLabelText('Put selected items in a new folder'));

      expect(screen.getByText('New folder for 1 folder and 1 note')).toBeOnTheScreen();
      await fireEvent.changeText(screen.getByPlaceholderText(/e\.g\. Class 10/), 'Term 1');
      await fireEvent.press(screen.getByText('Save'));

      await waitFor(() => expect(notes.moveNotes).toHaveBeenCalledWith(expect.anything(), ['n-1'], 'f-new'));
      expect(folders.createFolder).toHaveBeenCalledWith(expect.anything(), { parentId: null, name: 'Term 1' });
      expect(folders.moveFolders).toHaveBeenCalledWith(expect.anything(), ['f-1'], 'f-new');
      expect(screen.queryByText('2 selected')).toBeNull(); // select mode is over
    });

    it('says why a move failed and keeps the selection', async () => {
      const { FolderNameTakenError } = jest.requireActual('@/data/folders');
      jest.mocked(folders.listAllFolders).mockResolvedValue([folder({}), folder({ id: 'f-2', name: 'Class 9' })]);
      jest.mocked(folders.moveFolders).mockRejectedValue(new FolderNameTakenError('Class 9'));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

      await render(<NotesScreen />);
      await fireEvent.press(await screen.findByLabelText('Select'));
      await fireEvent.press(screen.getByLabelText('Class 9, Empty'));
      await fireEvent.press(screen.getByText('Move'));
      await fireEvent.press(await screen.findByLabelText('Move to Class 10'));

      await waitFor(() =>
        expect(alert).toHaveBeenCalledWith(
          'Name already used',
          'There is already a folder called "Class 9" here. Rename one of them first.',
        ),
      );
      expect(notes.moveNotes).not.toHaveBeenCalled();
      expect(screen.getByText('1 selected')).toBeOnTheScreen();
    });
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
  it('shows images an AI app attached, with captions, apart from other files', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Where roads meet.' }));
    const attachment = {
      noteId: 'n-1',
      mimeType: null,
      createdAt: '2026-11-27T10:00:00.000Z',
      caption: null,
      altText: null,
      remoteKey: 'u/user-1/x',
    };
    jest.mocked(notes.listNoteAttachments).mockResolvedValue([
      { ...attachment, id: 'a', kind: 'image', uri: 'file:///a.png', name: 'a.png', position: 0, caption: 'Figure 1: A crossroads' },
      { ...attachment, id: 'b', kind: 'image', uri: '', name: 'b.png', position: 1 },
      { ...attachment, id: 'c', kind: 'pdf', uri: 'file:///c.pdf', name: 'Signal timing.pdf', position: 2 },
    ]);

    await render(<NoteScreen />);

    expect(await screen.findByText('Images')).toBeOnTheScreen();
    expect(screen.getByText('Figure 1: A crossroads')).toBeOnTheScreen();
    expect(screen.getByText('This image appears after the next sync.')).toBeOnTheScreen();
    expect(screen.getByText('Attachments')).toBeOnTheScreen();
    expect(screen.getByText('Signal timing.pdf')).toBeOnTheScreen();
  });

  it('shows a plain note like an article: reading time, and contents for a longer note', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(
      note({ body: '# What is a wave\nEnergy moves.\n## Types\n- Transverse\n## Speed of sound\n340 m/s in air' }),
    );

    await render(<NoteScreen />);

    expect(await screen.findByText('1 min read · 3 sections')).toBeOnTheScreen();
    expect(screen.getByText('Contents')).toBeOnTheScreen();
    expect(screen.getByLabelText('Go to Speed of sound')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Go to Types'));
    // The sections themselves are all there, headings included.
    expect(screen.getByText('340 m/s in air')).toBeOnTheScreen();
    expect(screen.getAllByText('Types').length).toBeGreaterThanOrEqual(2);
  });

  it('leaves out the contents for a short plain note', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Speed: distance ÷ time' }));

    await render(<NoteScreen />);

    expect(await screen.findByText('1 min read')).toBeOnTheScreen();
    expect(screen.queryByText('Contents')).toBeNull();
  });

  it('shows an image inside its Cornell row, and every image in focus mode', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(
      note({
        style: 'cornell',
        rows: [
          { cue: 'Layout?', notes: '- Four arms\n:::image upload-1' },
          { cue: 'Control?', notes: '- Signals' },
        ],
        summary: 'Where roads meet.',
      }),
    );
    const attachment = { noteId: 'n-1', kind: 'image' as const, mimeType: 'image/png', createdAt: '2026-11-27T10:00:00.000Z', altText: null };
    jest.mocked(notes.listNoteAttachments).mockResolvedValue([
      { ...attachment, id: 'row-1', uri: 'file:///a.png', name: 'a.png', position: 0, caption: 'Figure 1: Layout', remoteKey: 'u/user-1/upload-1' },
      { ...attachment, id: 'row-2', uri: 'file:///b.png', name: 'b.png', position: 1, caption: 'Figure 2: Extra', remoteKey: 'u/user-1/b' },
    ]);

    await render(<NoteScreen />);

    // In the row, and not again at the end; the other image is at the end.
    expect(await screen.findByText('Figure 1: Layout')).toBeOnTheScreen();
    expect(screen.getAllByText('Figure 1: Layout')).toHaveLength(1);
    expect(screen.getByText('Image')).toBeOnTheScreen();
    expect(screen.getByText('Figure 2: Extra')).toBeOnTheScreen();
    expect(screen.queryByText(/:::image/)).toBeNull();

    await fireEvent.press(screen.getByText('Focus'));
    expect(await screen.findByLabelText('Exit focus mode')).toBeOnTheScreen();
    expect(screen.getByText('Figure 1: Layout')).toBeOnTheScreen();
    expect(screen.getByText('Figure 2: Extra')).toBeOnTheScreen();
  });

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

  it('shows a Cornell note with its diagram and boxes', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(
      note({
        style: 'cornell',
        title: 'Rotary',
        rows: [
          {
            cue: 'What does it look like?',
            notes: ':::diagram Rotary layout\n<svg viewBox="0 0 400 300"><circle r="50"/></svg>\n:::',
          },
          { cue: 'Pros and cons?', notes: ':::good Advantages\n- Smooth flow\n:::\n:::bad Limitations\n- Needs land\n:::' },
        ],
        summary: 'A large circular intersection.',
      }),
    );

    await render(<NoteScreen />);

    // A classic Cornell sheet: cue and notes columns, the summary along the bottom.
    expect(await screen.findByText('Cues')).toBeOnTheScreen();
    expect(screen.getByText('Summary')).toBeOnTheScreen();
    expect(screen.getByText('A large circular intersection.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Diagram: Rotary layout. Tap to enlarge.')).toBeOnTheScreen();
    expect(screen.getByText('Smooth flow')).toBeOnTheScreen();
    expect(screen.getByText('Needs land')).toBeOnTheScreen();
    expect(screen.queryByText(/<svg|:::/)).toBeNull();
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

  /** What the voice was asked to say, in order. */
  const said = () => jest.mocked(Speech.speak).mock.calls.map((call) => call[0]);
  /** Finishes the sentence the voice is on. */
  const finishSentence = () => act(() => jest.mocked(Speech.speak).mock.calls.at(-1)?.[1]?.onDone?.());

  it('reads the note out sentence by sentence and stops when tapped again', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: '**Speed**: distance ÷ time' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Read note aloud'));

    expect(said()).toEqual(['Speed']);
    expect(screen.getByLabelText('Reading: Speed')).toBeOnTheScreen();
    await finishSentence();
    expect(said()).toEqual(['Speed', 'Speed: distance ÷ time']);
    expect(screen.getByLabelText('Reading: Speed: distance ÷ time')).toBeOnTheScreen(); // the player follows the voice
    expect(screen.getByText('2 / 2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Stop reading'));
    expect(Speech.stop).toHaveBeenCalled();
    expect(screen.getByLabelText('Read note aloud')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Pause reading')).toBeNull();
  });

  it('pauses and plays on from the same sentence', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'One. Two. Three.' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Read note aloud'));
    await finishSentence(); // now on "One."
    await fireEvent.press(screen.getByLabelText('Pause reading'));

    expect(Speech.stop).toHaveBeenCalled();
    await finishSentence(); // a late callback from the stopped voice changes nothing
    expect(said()).toEqual(['Speed', 'One.']);

    await fireEvent.press(screen.getByLabelText('Play reading'));
    expect(said().at(-1)).toBe('One.');
  });

  it('skips sentences and changes the speed', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'One. Two. Three.' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Read note aloud'));
    await fireEvent.press(screen.getByLabelText('Next sentence'));
    await fireEvent.press(screen.getByLabelText('Next sentence'));
    expect(said().at(-1)).toBe('Two.');
    expect(screen.getByText('3 / 4')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Previous sentence'));
    expect(said().at(-1)).toBe('One.');

    await fireEvent.press(screen.getByLabelText('Reading speed 1×'));
    expect(screen.getByLabelText('Reading speed 1.25×')).toBeOnTheScreen();
    // The sentence starts again at the new speed.
    expect(jest.mocked(Speech.speak).mock.calls.at(-1)).toEqual(['One.', expect.objectContaining({ rate: 1.25 })]);
    await fireEvent.press(screen.getByLabelText('Reading speed 1.25×'));
    await fireEvent.press(screen.getByLabelText('Reading speed 1.5×'));
    await fireEvent.press(screen.getByLabelText('Reading speed 0.75×')); // back to 1×
  });

  it('jumps when the bar is tapped, on phones (locationX) and on the web (offsetX)', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'One. Two. Three.' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Read note aloud'));
    const bar = screen.getByLabelText('Reading position');
    await fireEvent(bar, 'layout', { nativeEvent: { layout: { width: 200, height: 24, x: 0, y: 0 } } });

    await fireEvent.press(bar, { nativeEvent: { locationX: 190 } });
    expect(said().at(-1)).toBe('Three.');
    await fireEvent.press(bar, { nativeEvent: { locationX: undefined, offsetX: 60 } });
    expect(said().at(-1)).toBe('One.');

    // A press with no position at all does nothing, rather than asking the voice to read nothing.
    const before = said().length;
    await fireEvent.press(bar, { nativeEvent: { locationX: undefined } });
    expect(said()).toHaveLength(before);
    expect(said()).not.toContain(undefined);
  });

  it('stays open at the end so it can be played again from the top', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Distance ÷ time' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Read note aloud'));
    await finishSentence();
    await finishSentence();

    expect(screen.getByLabelText('Play reading')).toBeOnTheScreen();
    expect(said()).toEqual(['Speed', 'Distance ÷ time']);
    await fireEvent.press(screen.getByLabelText('Play reading'));
    expect(said().at(-1)).toBe('Speed');

    await fireEvent.press(screen.getByLabelText('Close player'));
    expect(screen.getByLabelText('Read note aloud')).toBeOnTheScreen();
  });

  it('reads aloud from focus mode too, with the player', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1', focus: '1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Distance ÷ time' }));

    await render(<NoteScreen />);
    expect(await screen.findByLabelText('Exit focus mode')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Read note aloud'));

    expect(said()).toEqual(['Speed']);
    expect(screen.getByLabelText('Stop reading')).toBeOnTheScreen();
    expect(screen.getByLabelText('Pause reading')).toBeOnTheScreen();
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
    // Only Cornell notes have the handwritten font, so a plain note doesn't offer the switch.
    expect(screen.queryByText('Use normal font')).toBeNull();
  });

  it('switches the handwritten font of Cornell notes off from the ⋮ menu', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ style: 'cornell', rows: [{ cue: 'Speed?', notes: 'Fast' }] }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('More options'));
    await fireEvent.press(screen.getByText('Use normal font'));

    expect(settings.setNoteHandwriting).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('has no speaker on an empty note', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({}));

    await render(<NoteScreen />);

    expect(await screen.findByText('This note is empty. Tap to start writing.')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Read note aloud')).toBeNull();
  });
});

describe('Note screen: standard and textbook views', () => {
  beforeEach(() => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(settings.getNoteView).mockResolvedValue(null);
    jest.mocked(settings.getNoteViewDefault).mockResolvedValue('auto');
  });

  it('has a Textbook switch at the top that turns the view on and off, and remembers it', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Plain words.' }));

    await render(<NoteScreen />);
    const toggle = await screen.findByRole('switch', { name: 'Textbook view' });
    expect(toggle).not.toBeChecked();

    await fireEvent.press(toggle);
    expect(await screen.findByTestId('textbook-reader')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Textbook view' })).toBeChecked();
    expect(settings.setNoteView).toHaveBeenLastCalledWith(expect.anything(), 'n-1', 'textbook');

    await fireEvent.press(screen.getByRole('switch', { name: 'Textbook view' }));
    expect(await screen.findByText('Plain words.')).toBeOnTheScreen();
    expect(screen.queryByTestId('textbook-reader')).toBeNull();
    expect(settings.setNoteView).toHaveBeenLastCalledWith(expect.anything(), 'n-1', 'standard');
  });

  it('has a focus mode: the app header goes, and the next chapter opens in focus mode too', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(note({ id: 'n-1', body: '$x$' }));
    jest.mocked(notes.listNotes).mockResolvedValue([note({ id: 'n-1' }), note({ id: 'n-2', title: 'Chapter 2' })]);

    await render(<NoteScreen />);
    expect(await screen.findByRole('switch', { name: 'Textbook view' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Focus'));

    expect(await screen.findByText('Exit focus')).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: 'Textbook view' })).toBeNull();
    expect(screen.getByTestId('textbook-reader')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Next chapter'));
    expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-2', focus: '1' } });

    await fireEvent.press(screen.getByText('Exit focus'));
    expect(await screen.findByRole('switch', { name: 'Textbook view' })).toBeOnTheScreen();
  });

  it('opens a textbook note in focus mode when Previous / Next came from focus mode', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1', focus: '1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: '$x$' }));

    await render(<NoteScreen />);

    expect(await screen.findByText('Exit focus')).toBeOnTheScreen();
  });

  it('has no Textbook switch on an empty note', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: '' }));

    await render(<NoteScreen />);

    expect(await screen.findByText('This note is empty. Tap to start writing.')).toBeOnTheScreen();
    expect(screen.queryByRole('switch', { name: 'Textbook view' })).toBeNull();
  });

  it('opens notes the way Settings says, unless a note was switched itself', async () => {
    jest.mocked(settings.getNoteViewDefault).mockResolvedValue('textbook');
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Plain words.' }));
    const first = await render(<NoteScreen />);
    expect(await screen.findByTestId('textbook-reader')).toBeOnTheScreen();
    await first.unmount();

    jest.mocked(settings.getNoteViewDefault).mockResolvedValue('standard');
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: '$$E=mc^2$$' }));
    const second = await render(<NoteScreen />);
    expect(await screen.findByTestId('math-fallback')).toBeOnTheScreen();
    await second.unmount();

    jest.mocked(settings.getNoteView).mockResolvedValue('textbook');
    await render(<NoteScreen />);
    expect(await screen.findByTestId('textbook-reader')).toBeOnTheScreen();
  });

  it('opens a note with maths in the textbook reader, without a heading that repeats the title', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(
      note({ title: 'Quadratics', body: '# Quadratics\n## Formula\n$$x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$$' }),
    );

    await render(<NoteScreen />);

    expect(await screen.findByText('Textbook: Quadratics')).toBeOnTheScreen();
    expect(screen.getByTestId('textbook-body')).toHaveTextContent('## Formula $$x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}$$');
  });

  it('opens a note with textbook blocks (a definition) in the textbook reader', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: ':::definition Derivative\nThe rate of change.\n:::' }));

    await render(<NoteScreen />);

    expect(await screen.findByTestId('textbook-reader')).toBeOnTheScreen();
  });

  it('keeps an ordinary note in the standard view (existing notes look as before)', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: '# Waves\nEnergy moves. It costs $5 and $10.' }));

    await render(<NoteScreen />);

    expect(await screen.findByText('Energy moves. It costs $5 and $10.')).toBeOnTheScreen();
    expect(screen.queryByTestId('textbook-reader')).toBeNull();
  });

  it('switches to the standard view from the reader, remembers it, and shows maths as readable text', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Pythagoras: $a^2+b^2=c^2$\n\n$$E=mc^2$$' }));

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByText('Standard view'));

    expect(settings.setNoteView).toHaveBeenCalledWith(expect.anything(), 'n-1', 'standard');
    expect(await screen.findByText('E=mc²')).toBeOnTheScreen();
    expect(screen.getByText('a²+b²=c²')).toBeOnTheScreen();
    expect(screen.queryByTestId('textbook-reader')).toBeNull();
  });

  it('respects a note set to the standard view, even with maths', async () => {
    jest.mocked(settings.getNoteView).mockResolvedValue('standard');
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: '$$\int_0^1 x\,dx$$' }));

    await render(<NoteScreen />);

    expect(await screen.findByTestId('math-fallback')).toBeOnTheScreen();
    expect(screen.queryByTestId('textbook-reader')).toBeNull();
  });

  it('opens a note set to the textbook view, even without maths', async () => {
    jest.mocked(settings.getNoteView).mockResolvedValue('textbook');
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Just words.' }));

    await render(<NoteScreen />);

    expect(await screen.findByTestId('textbook-reader')).toBeOnTheScreen();
  });

  it('goes to the next note in the folder from the end of a chapter', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(note({ id: 'n-1', body: '$x$' }));
    jest.mocked(notes.listNotes).mockResolvedValue([note({ id: 'n-1' }), note({ id: 'n-2', title: 'Chapter 2' })]);

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByText('Next chapter'));

    expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-2' } });
  });

  it('reads a Cornell note with maths as a chapter: cues become sections, the summary a summary block', async () => {
    jest.mocked(notes.getNote).mockResolvedValue(
      note({ style: 'cornell', body: '', rows: [{ cue: 'Area', notes: '$A=\pi r^2$' }], summary: 'Circles.' }),
    );

    await render(<NoteScreen />);

    expect(await screen.findByTestId('textbook-body')).toHaveTextContent('## Area $A=\pi r^2$ :::summary Circles. :::');
  });
});

describe('Handwritten notes', () => {
  it('writes on the page with a finger or pen, undoes, and saves the drawing', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ folderId: 'f-2' });
    jest.mocked(notes.createNote).mockResolvedValue('n-hand');
    jest.mocked(tags.listTags).mockResolvedValue([]);

    await render(<NoteEditorScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Leaf sketch');
    await fireEvent.press(screen.getByLabelText('Handwritten notes: Write with your finger or a pen'));
    expect(screen.getByLabelText('Pen')).toBeSelected();

    const paper = screen.getByLabelText(/^Handwriting page/);
    await fireEvent(paper, 'layout', { nativeEvent: { layout: { width: 500, height: 707 } } });
    // Page units are twice screen units on a 500-wide page.
    const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, touches: [{}] } });
    const line = async (points: [number, number][]) => {
      await fireEvent(paper, 'responderGrant', touch(...points[0]));
      for (const p of points.slice(1)) await fireEvent(paper, 'responderMove', touch(...p));
      await fireEvent(paper, 'responderRelease', touch(...points[points.length - 1]));
    };
    await line([[10, 10], [20, 15], [30, 30]]);
    await fireEvent.press(screen.getByLabelText('Red'));
    await line([[100, 100], [120, 100]]);
    expect(screen.getByLabelText('Handwriting page. 2 lines written.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Undo'));
    expect(screen.getByLabelText('Handwriting page. 1 lines written.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Squared paper'));
    await fireEvent.press(screen.getByLabelText('Save'));

    await waitFor(() => expect(notes.createNote).toHaveBeenCalled());
    const [, folderId, input] = jest.mocked(notes.createNote).mock.calls[0];
    expect(folderId).toBe('f-2');
    expect(input.style).toBe('handwritten');
    expect(JSON.parse(input.body!)).toEqual({
      v: 1,
      paper: 'grid',
      height: 1414,
      strokes: [{ c: '#1f2933', w: 5, p: [20, 20, 40, 30, 60, 60] }],
    });
  });

  it('selects writing with a loop or a tap, then moves, recolours, copies and deletes it', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ folderId: 'f-2' });
    jest.mocked(notes.createNote).mockResolvedValue('n-hand');
    jest.mocked(tags.listTags).mockResolvedValue([]);

    await render(<NoteEditorScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Selecting');
    await fireEvent.press(screen.getByLabelText('Handwritten notes: Write with your finger or a pen'));
    const paper = screen.getByLabelText(/^Handwriting page/);
    await fireEvent(paper, 'layout', { nativeEvent: { layout: { width: 500, height: 707 } } });
    const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, touches: [{}] } });
    const line = async (points: [number, number][]) => {
      await fireEvent(paper, 'responderGrant', touch(...points[0]));
      for (const p of points.slice(1)) await fireEvent(paper, 'responderMove', touch(...p));
      await fireEvent(paper, 'responderRelease', touch(...points[points.length - 1]));
    };
    await line([[10, 10], [30, 30]]); // page [20, 20, 60, 60]
    await line([[200, 200], [220, 200]]); // page [400, 400, 440, 400]

    await fireEvent.press(screen.getByLabelText('Select'));
    expect(screen.getByText(/Draw a loop round your writing/)).toBeOnTheScreen();
    // A loop round the first line.
    await line([[0, 0], [50, 0], [50, 50], [0, 50], [0, 1]]);
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    // Drag it 100 page units right.
    await line([[20, 20], [70, 20]]);
    await fireEvent.press(screen.getByLabelText('Red'));
    await fireEvent.press(screen.getByLabelText('Duplicate the selection'));
    // Tap the second line, then delete it.
    await line([[210, 200]]);
    expect(screen.getByText('1 selected')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Delete the selection'));
    expect(screen.getByLabelText('Handwriting page. 2 lines written.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(notes.createNote).toHaveBeenCalled());
    const [, , input] = jest.mocked(notes.createNote).mock.calls[0];
    expect(JSON.parse(input.body!).strokes).toEqual([
      { c: '#d64545', w: 5, p: [120, 20, 160, 60] },
      { c: '#d64545', w: 5, p: [170, 70, 210, 110] },
    ]);
  });

  it('shows the handwritten page, without text-only tools', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    const drawing = JSON.stringify({ v: 1, paper: 'lined', height: 1414, strokes: [{ c: '#1f2933', w: 5, p: [1, 2, 3, 4] }] });
    jest.mocked(notes.getNote).mockResolvedValue(note({ title: 'Leaf sketch', style: 'handwritten', body: drawing }));
    jest.mocked(notes.listNoteAttachments).mockResolvedValue([]);

    await render(<NoteScreen />);

    expect(await screen.findByLabelText('Handwritten page: Leaf sketch. Tap to zoom.')).toBeOnTheScreen();
    expect(screen.getByText('Handwritten')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Textbook view')).toBeNull();
    expect(screen.queryByText(/\{"v":1/)).toBeNull();
  });
});

jest.mock('@/data/note-pages', () => ({
  getNotePage: jest.fn(() => Promise.resolve(null)),
  listWrittenPages: jest.fn(() => Promise.resolve([])),
  saveNotePage: jest.fn(() => Promise.resolve()),
}));

describe('Handwriting pages for headings and questions', () => {
  it('writes on a heading’s own page, saves it, and steps to the next heading', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ noteId: 'n-1', page: 'h:learning-objectives', title: '1 Learning objectives' });
    jest.mocked(notes.getNote).mockResolvedValue(
      note({ title: 'Quadratic equations', body: '## Learning objectives\nRecognise one.\n## Introduction\nQ1. Solve x² = 4.' }),
    );

    await render(<NotePageScreen />);
    expect(await screen.findByText('Quadratic equations')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Learning objectives' })).toBeOnTheScreen();

    const paper = screen.getByLabelText(/^Handwriting page/);
    await fireEvent(paper, 'layout', { nativeEvent: { layout: { width: 500, height: 707 } } });
    const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y, touches: [{}] } });
    await fireEvent(paper, 'responderGrant', touch(10, 10));
    await fireEvent(paper, 'responderMove', touch(40, 40));
    await fireEvent(paper, 'responderRelease', touch(40, 40));

    await waitFor(() =>
      expect(notePages.saveNotePage).toHaveBeenCalledWith(
        expect.anything(),
        'n-1',
        'h:learning-objectives',
        'Learning objectives',
        [expect.objectContaining({ strokes: [{ c: '#1f2933', w: 5, p: [20, 20, 80, 80] }] })],
      ),
    );
    expect(await screen.findByText('Saved')).toBeOnTheScreen();

    // Another page for the same heading.
    expect(screen.getByText('Page 1 of 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Add page'));
    expect(screen.getByText('Page 2 of 2')).toBeOnTheScreen();
    const second = screen.getByLabelText(/^Handwriting page/);
    expect(second).toHaveProp('accessibilityLabel', 'Handwriting page. Nothing written yet.');
    await fireEvent(second, 'layout', { nativeEvent: { layout: { width: 500, height: 707 } } });
    await fireEvent(second, 'responderGrant', touch(100, 100));
    await fireEvent(second, 'responderRelease', touch(100, 100));
    await waitFor(() =>
      expect(notePages.saveNotePage).toHaveBeenLastCalledWith(expect.anything(), 'n-1', 'h:learning-objectives', 'Learning objectives', [
        expect.objectContaining({ strokes: [{ c: '#1f2933', w: 5, p: [20, 20, 80, 80] }] }),
        expect.objectContaining({ strokes: [{ c: '#1f2933', w: 5, p: [200, 200] }] }),
      ]),
    );
    await fireEvent.press(screen.getByLabelText('Previous page'));
    expect(screen.getByText('Page 1 of 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Handwriting page. 1 lines written.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Next: Introduction'));
    expect(mockRouter.router.replace).toHaveBeenCalledWith({
      pathname: '/note-page',
      params: { noteId: 'n-1', page: 'h:introduction', title: 'Introduction' },
    });
    expect(screen.getByLabelText('No previous heading')).toBeDisabled();
  });

  it('opens a heading’s page from the note', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ id: 'n-1' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ body: 'Intro text\n## Speed of sound\n340 m/s' }));
    jest.mocked(notes.listNoteAttachments).mockResolvedValue([]);
    jest.mocked(notePages.listWrittenPages).mockResolvedValue(['h:speed-of-sound']);

    await render(<NoteScreen />);
    await fireEvent.press(await screen.findByLabelText('Open your handwritten notes for Speed of sound'));
    expect(mockRouter.router.push).toHaveBeenCalledWith({
      pathname: '/note-page',
      params: { noteId: 'n-1', page: 'h:speed-of-sound', title: 'Speed of sound' },
    });
  });
});

describe('Full screen writing', () => {
  it('hides the titles and Previous / Next, and brings them back', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({ noteId: 'n-1', page: 'h:introduction', title: 'Introduction' });
    jest.mocked(notes.getNote).mockResolvedValue(note({ title: 'Quadratic equations', body: '## Objectives\n## Introduction\n## Summary' }));

    await render(<NotePageScreen />);
    expect(await screen.findByText('Quadratic equations')).toBeOnTheScreen();
    expect(screen.getByLabelText('Next: Summary')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Full screen'));
    expect(screen.queryByText('Quadratic equations')).toBeNull();
    expect(screen.queryByLabelText('Next: Summary')).toBeNull();
    // The tools and the page stay.
    expect(screen.getByLabelText('Pen')).toBeOnTheScreen();
    expect(screen.getByLabelText('Add page')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Handwriting page/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Exit full screen'));
    expect(screen.getByText('Quadratic equations')).toBeOnTheScreen();
    expect(screen.getByLabelText('Next: Summary')).toBeOnTheScreen();
  });

  it('writes a handwritten note full screen', async () => {
    mockRouter.useLocalSearchParams.mockReturnValue({});
    jest.mocked(tags.listTags).mockResolvedValue([]);
    await render(<NoteEditorScreen />);
    await fireEvent.press(await screen.findByLabelText('Handwritten notes: Write with your finger or a pen'));
    await fireEvent.press(screen.getByLabelText('Full screen'));
    expect(screen.queryByLabelText('Title')).toBeNull();
    expect(screen.queryByLabelText('Save')).toBeNull();
    expect(screen.getByLabelText(/^Handwriting page/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Exit full screen'));
    expect(screen.getByLabelText('Title')).toBeOnTheScreen();
  });
});
