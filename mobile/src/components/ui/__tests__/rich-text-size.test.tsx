import { render, screen } from '@testing-library/react-native';

import { ReadingSizeContext, RichText, scaledText, stepSize } from '@/components/ui/rich-text';

// The words are in an inner span; the size classes are on the line's Text around it.
const classes = (text: string) => String(screen.getByText(text).parent?.props.className);

describe('RichText text size', () => {
  it('uses Medium when no size is set', async () => {
    await render(<RichText text={'# Cells\nThe basic unit of life.'} />);
    expect(classes('Cells')).toContain('text-3xl');
    expect(classes('The basic unit of life.')).toContain('text-base');
  });

  it('follows the text size from Settings, headings included', async () => {
    await render(
      <ReadingSizeContext.Provider value="sm">
        <RichText text={'# Cells\nThe basic unit of life.'} />
      </ReadingSizeContext.Provider>,
    );
    expect(classes('Cells')).toContain('text-2xl');
    expect(classes('The basic unit of life.')).toContain('text-sm');
  });

  it('keeps a size given by the screen (focus mode)', async () => {
    await render(
      <ReadingSizeContext.Provider value="sm">
        <RichText text="Mitochondria" size="xl" />
      </ReadingSizeContext.Provider>,
    );
    expect(classes('Mitochondria')).toContain('text-2xl');
  });
});

describe('size steps', () => {
  it('scales a text class up and down, within the largest and smallest', () => {
    expect(scaledText('text-xl', 'sm')).toBe('text-lg');
    expect(scaledText('text-xl', 'base')).toBe('text-xl');
    expect(scaledText('text-xl', 'xl')).toBe('text-3xl');
    expect(scaledText('text-3xl', 'xl')).toBe('text-4xl'); // largest there is
  });

  it('steps between sizes, stopping at Extra large', () => {
    expect(stepSize('base', 1)).toBe('lg');
    expect(stepSize('xl', 1)).toBe('xl');
    expect(stepSize('sm', -1)).toBe('sm');
  });
});
