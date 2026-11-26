import { render, screen } from '@testing-library/react-native';

import { RichText } from '@/components/ui/rich-text';

describe('RichText tables', () => {
  it('shows each cell of the table', async () => {
    await render(<RichText text={'| Capacity | LOS |\n|---|---|\n| Vehicles per hour | Grades A to F |'} />);

    expect(screen.getByLabelText('Table with 2 columns')).toBeOnTheScreen();
    for (const cell of ['Capacity', 'LOS', 'Vehicles per hour', 'Grades A to F']) {
      expect(screen.getByText(cell)).toBeOnTheScreen();
    }
    expect(screen.queryByText(/\|/)).toBeNull();
  });

  it('fills short rows so every row has the same columns', async () => {
    await render(<RichText text={'| a | b | c | d |\n| e |'} tone="onDark" />);

    expect(screen.getByLabelText('Table with 4 columns')).toBeOnTheScreen();
    expect(screen.getByText('e')).toBeOnTheScreen();
  });
});
