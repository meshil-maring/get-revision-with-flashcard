import { render, screen } from '@testing-library/react-native';

import { RichText } from '@/components/ui/rich-text';

describe('RichText boxes and diagrams', () => {
  it('shows the title and points of each box, without the ::: marks', async () => {
    await render(<RichText text={':::good Advantages\n- Smooth flow\n:::\n\n:::bad Limitations\n- Needs land\n:::'} />);

    for (const text of ['Advantages', 'Smooth flow', 'Limitations', 'Needs land']) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
    expect(screen.queryByText(/:::/)).toBeNull();
  });

  it('shows a diagram as a picture with its caption, not as SVG code', async () => {
    await render(<RichText text={':::diagram Rotary layout\n<svg viewBox="0 0 400 300"><circle r="5"/></svg>\n:::'} />);

    expect(screen.getByLabelText('Diagram: Rotary layout. Tap to enlarge.')).toBeOnTheScreen();
    expect(screen.getByText('Rotary layout')).toBeOnTheScreen();
    expect(screen.queryByText(/<svg/)).toBeNull();
  });

  it('says when a diagram has no SVG to show', async () => {
    await render(<RichText text={':::diagram Broken\n:::'} />);

    expect(screen.getByText("This diagram can't be shown.")).toBeOnTheScreen();
  });
});
