import { render, screen } from '@testing-library/react-native';

import { GuideBody } from '@/components/help/guide-body';

const TEXT = `Intro with **flashcards** here.

## Your first five minutes
1. Open the **Flashcards** tab.
2. Rate it **Hard** or **Easy**.

## Finding your way
- **Home**: continue your last deck
- A plain bullet

==Tip:== short cards work best.`;

describe('GuideBody', () => {
  it('turns headings, steps, labelled bullets and tips into a laid-out page', async () => {
    await render(<GuideBody text={TEXT} />);

    expect(screen.getByRole('header', { name: 'Your first five minutes' })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Finding your way' })).toBeOnTheScreen();
    // Step numbers are drawn as badges, not "1." text.
    expect(screen.getByText('1')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    // "- **Home**: continue…" becomes a label and a capitalised meaning.
    expect(screen.getByText('Home')).toBeOnTheScreen();
    expect(screen.getByText('Continue your last deck')).toBeOnTheScreen();
    expect(screen.getByText('A plain bullet')).toBeOnTheScreen();
    // The tip keeps its label and capitalises the rest.
    expect(screen.getByText('Tip: ')).toBeOnTheScreen();
    expect(screen.getByText('Short cards work best.')).toBeOnTheScreen();
  });
});
