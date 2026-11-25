import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import NotesScreen from '@/app/(tabs)/notes';
import NoteCardsScreen from '@/app/note-cards';
import NoteEditorScreen from '@/app/note-editor';
import * as cards from '@/data/cards';
import * as decks from '@/data/decks';
import * as folders from '@/data/folders';
import * as notes from '@/data/notes';
import * as settings from '@/data/settings';
import type { FolderWithCounts, Note } from '@/data/types';
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
}));
jest.mock('@/data/notes', () => ({
  ...jest.requireActual('@/data/notes'),
  listNotes: jest.fn(),
  getNote: jest.fn(),
  createNote: jest.fn(),
  listNoteAttachments: jest.fn(),
  searchNotes: jest.fn(),
}));
jest.mock('@/data/decks');
jest.mock('@/data/cards');
jest.mock('@/data/settings', () => ({ ...jest.requireActual('@/data/settings'), isTipDismissed: jest.fn() }));
jest.mock('@/lib/confirm', () => ({ confirm: jest.fn(() => Promise.resolve(true)) }));
// The recorder needs the microphone; it isn't opened in these tests.
jest.mock('@/components/audio-recorder', () => ({ AudioRecorderModal: () => null }));

const NOW = '2026-01-01T00:00:00.000Z';

function folder(overrides: Partial<FolderWithCounts>): FolderWithCounts {
  return {
    id: 'f-1',
    parentId: null,
    name: 'Class 10',
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    folderCount: 0,
    noteCount: 0,
    ...overrides,
  };
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
  jest.mocked(folders.listFolders).mockResolvedValue([]);
  jest.mocked(folders.getFolderPath).mockResolvedValue([]);
  jest.mocked(notes.listNotes).mockResolvedValue([]);
  jest.mocked(notes.listNoteAttachments).mockResolvedValue([]);
  jest.mocked(notes.searchNotes).mockResolvedValue({ folders: [], notes: [] });
  jest.mocked(decks.listDecks).mockResolvedValue([]);
});

describe('Notes tab', () => {
  it('explains how to start when there is nothing yet', async () => {
    await render(<NotesScreen />);
    expect(await screen.findByText('Nothing here yet')).toBeOnTheScreen();
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

    await render(<NoteEditorScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Title'), 'Forces');
    await fireEvent.press(screen.getByLabelText('Cornell notes: Cues, notes and a summary'));
    await fireEvent.changeText(screen.getByLabelText('Cue 1'), 'What is inertia?');
    await fireEvent.changeText(screen.getByLabelText('Notes 1'), 'Objects keep moving');
    await fireEvent.press(screen.getByText('Add row'));
    await fireEvent.changeText(screen.getByLabelText('Cue 2'), 'F = ?');
    await fireEvent.changeText(screen.getByLabelText('Summary'), 'Newton');
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
    expect(mockRouter.router.replace).toHaveBeenCalledWith({ pathname: '/note/[id]', params: { id: 'n-new' } });
  });

  it('needs a title to save', async () => {
    await render(<NoteEditorScreen />);
    expect(await screen.findByText('Add a title to save this note')).toBeOnTheScreen();
    expect(screen.getByLabelText('Save')).toBeDisabled();
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
