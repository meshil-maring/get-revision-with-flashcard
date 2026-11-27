import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  findNoteImage,
  NoteImages,
  NoteImagesProvider,
  placedImageIds,
  type ImageSyncState,
} from '@/components/notes/note-images';
import { RichText } from '@/components/ui/rich-text';
import type { Note, NoteAttachment } from '@/data/types';

/** The images at the end of a note, as the note screen shows them. */
function Shown({ images, sync }: { images: NoteAttachment[]; sync: ImageSyncState }) {
  return (
    <NoteImagesProvider images={images} sync={sync}>
      <NoteImages images={images} />
    </NoteImagesProvider>
  );
}

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function image(over: Partial<NoteAttachment> = {}): NoteAttachment {
  return {
    id: 'img-1',
    noteId: 'note-1',
    kind: 'image',
    uri: 'file:///crossroads.png',
    name: 'crossroads.png',
    mimeType: 'image/png',
    createdAt: '2026-11-27T10:00:00.000Z',
    caption: null,
    altText: null,
    position: 0,
    remoteKey: 'u/user-1/img-1',
    ...over,
  };
}

const idle: ImageSyncState = { signedIn: true, syncing: false, error: null };

describe('NoteImages', () => {
  it('shows nothing for a note without images', async () => {
    await render(<Shown images={[]} sync={idle} />);
    expect(screen.queryByTestId('note-image')).toBeNull();
  });

  it('shows each image with its caption, described by its alt text, in order', async () => {
    await render(
      <Shown
        images={[
          image({ id: 'a', caption: 'Figure 1: A crossroads', altText: 'Two roads crossing at right angles' }),
          image({ id: 'b', name: 'roundabout.png', caption: 'Figure 2: A roundabout' }),
        ]}
        sync={idle}
      />,
    );
    expect(screen.getAllByTestId('note-image')).toHaveLength(2);
    expect(screen.getByText('Figure 1: A crossroads')).toBeOnTheScreen();
    expect(screen.getByText('Figure 2: A roundabout')).toBeOnTheScreen();
    expect(screen.getByLabelText('Two roads crossing at right angles. Open full screen')).toBeOnTheScreen();
    // Without alt text, the caption describes it.
    expect(screen.getByLabelText('Figure 2: A roundabout. Open full screen')).toBeOnTheScreen();
  });

  it('opens an image full screen, with its caption and zoom controls', async () => {
    await render(<Shown images={[image({ caption: 'Figure 1' }), image({ id: 'b', name: 'b.png' })]} sync={idle} />);
    await fireEvent.press(screen.getByLabelText('Figure 1. Open full screen'));
    expect(screen.getByLabelText('Close image')).toBeOnTheScreen();
    expect(screen.getByLabelText('Zoom in')).toBeOnTheScreen();
    expect(screen.getByText(/1 of 2/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Next image'));
    expect(screen.getByText(/2 of 2/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByLabelText('Close image'));
    expect(screen.queryByLabelText('Close image')).toBeNull();
  });

  it('shows an image that is still downloading, with a way to sync now', async () => {
    const onSyncNow = jest.fn();
    await render(<Shown images={[image({ uri: '', caption: 'Figure 1' })]} sync={{ ...idle, onSyncNow }} />);
    expect(screen.getByText('This image appears after the next sync.')).toBeOnTheScreen();
    expect(screen.getByText('Figure 1')).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Sync now'));
    expect(onSyncNow).toHaveBeenCalled();
  });

  it('says when downloading, and when the download failed', async () => {
    const { rerender } = await render(<Shown images={[image({ uri: '' })]} sync={{ ...idle, syncing: true }} />);
    expect(screen.getByText('Downloading image…')).toBeOnTheScreen();
    await rerender(<Shown images={[image({ uri: '' })]} sync={{ ...idle, error: 'Network error', onSyncNow: jest.fn() }} />);
    expect(screen.getByText('Could not download this image yet.')).toBeOnTheScreen();
    expect(screen.getByText('Try again')).toBeOnTheScreen();
  });

  it('marks an image that is only on this device, and a failed upload', async () => {
    const { rerender } = await render(<Shown images={[image({ remoteKey: null })]} sync={idle} />);
    expect(screen.getByText('Only on this device: uploads with the next sync.')).toBeOnTheScreen();
    await rerender(<Shown images={[image({ remoteKey: null })]} sync={{ ...idle, error: 'Your storage is full.' }} />);
    expect(screen.getByText('Not uploaded yet: Your storage is full.')).toBeOnTheScreen();
    // A guest has no account to upload to, so nothing is said.
    await rerender(<Shown images={[image({ remoteKey: null })]} sync={{ ...idle, signedIn: false }} />);
    expect(screen.queryByText(/uploads with the next sync/)).toBeNull();
  });

  it('says when an image cannot be shown', async () => {
    await render(<Shown images={[image()]} sync={idle} />);
    // expo-image is a plain View in tests; fire its error callback.
    const picture = screen.getAllByLabelText('crossroads.png').find((n) => n.props.onError);
    await fireEvent(picture!, 'error');
    expect(screen.getByText('Could not show this image (crossroads.png).')).toBeOnTheScreen();
  });
});

describe('images placed in the text', () => {
  const crossroads = image({ id: 'row-id', remoteKey: 'u/user-1/upload-1', caption: 'Figure 1: A crossroads' });

  it('finds an image by its own id or by the id the AI app was given', () => {
    expect(findNoteImage([crossroads], 'row-id')).toBe(crossroads);
    expect(findNoteImage([crossroads], 'upload-1')).toBe(crossroads);
    expect(findNoteImage([crossroads], 'other')).toBeUndefined();
  });

  it('shows the image where its line is, e.g. inside a Cornell row', async () => {
    await render(
      <NoteImagesProvider images={[crossroads]} sync={idle}>
        <RichText text={'- Four arms meet\n:::image upload-1\n- Many conflict points'} />
      </NoteImagesProvider>,
    );
    expect(screen.getByText('Four arms meet')).toBeOnTheScreen();
    expect(screen.getByText('Figure 1: A crossroads')).toBeOnTheScreen();
    expect(screen.getByText('Many conflict points')).toBeOnTheScreen();
    expect(screen.queryByText(/:::image/)).toBeNull();

    await fireEvent.press(screen.getByLabelText('Figure 1: A crossroads. Open full screen'));
    expect(screen.getByLabelText('Close image')).toBeOnTheScreen();
  });

  it('shows nothing for an image line the note has no image for, or outside a note', async () => {
    await render(
      <NoteImagesProvider images={[crossroads]} sync={idle}>
        <RichText text={'Text\n:::image missing'} />
      </NoteImagesProvider>,
    );
    expect(screen.queryByTestId('note-image')).toBeNull();
    await render(<RichText text={'Text\n:::image upload-1'} />);
    expect(screen.queryByTestId('note-image')).toBeNull();
    expect(screen.queryByText(/:::image/)).toBeNull();
  });

  it('knows which images a note places itself, so they are not shown twice', () => {
    const other = image({ id: 'b', remoteKey: 'u/user-1/b' });
    const note = {
      style: 'cornell',
      body: '',
      rows: [{ cue: 'Layout?', notes: 'Roads\n:::image upload-1' }],
      summary: '',
    } as unknown as Note;
    expect([...placedImageIds(note, [crossroads, other])]).toEqual(['row-id']);
  });
});
