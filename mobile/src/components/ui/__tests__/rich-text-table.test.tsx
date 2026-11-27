import { fireEvent, render, screen } from '@testing-library/react-native';

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

  it('scrolls sideways when the columns do not fit, like in a Cornell notes column', async () => {
    const text = '| Feature | Traditional rotary | Modern roundabout |\n|---|---|---|\n| Deflection | Less pronounced | Strong |';
    await render(<RichText text={text} />);
    const table = screen.getByLabelText('Table with 3 columns');

    await fireEvent(table, 'layout', { nativeEvent: { layout: { width: 600 } } });
    expect(screen.queryByTestId('table-scroll')).toBeNull(); // room enough: columns share the width

    await fireEvent(table, 'layout', { nativeEvent: { layout: { width: 200 } } });
    expect(screen.getByTestId('table-scroll')).toBeOnTheScreen();
  });

  it('fills short rows so every row has the same columns', async () => {
    await render(<RichText text={'| a | b | c | d |\n| e |'} tone="onDark" />);

    expect(screen.getByLabelText('Table with 4 columns')).toBeOnTheScreen();
    expect(screen.getByText('e')).toBeOnTheScreen();
  });
});
