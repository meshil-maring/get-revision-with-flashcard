import { fireEvent, render, screen } from '@testing-library/react-native';

import { AutoNextPicker, autoNextShort, parseCustomTime } from '@/components/auto-next-picker';

describe('parseCustomTime', () => {
  it('turns minutes and seconds into seconds, within 5 sec and 30 min', () => {
    expect(parseCustomTime('1', '15')).toBe(75);
    expect(parseCustomTime('', '40')).toBe(40);
    expect(parseCustomTime('3', '')).toBe(180);
    expect(parseCustomTime('', '')).toBeNull();
    expect(parseCustomTime('0', '3')).toBeNull(); // too short
    expect(parseCustomTime('31', '0')).toBeNull(); // too long
  });
});

describe('autoNextShort', () => {
  it('fits on the small clock button', () => {
    expect(autoNextShort(0)).toBe('Off');
    expect(autoNextShort(20)).toBe('20s');
    expect(autoNextShort(120)).toBe('2m');
    expect(autoNextShort(75)).toBe('1m15');
  });
});

describe('AutoNextPicker', () => {
  it('sets a custom time', async () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    await render(<AutoNextPicker visible value={0} onChange={onChange} onClose={onClose} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.getByRole('button', { name: 'Set custom time' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Minutes'), '1');
    await fireEvent.changeText(screen.getByLabelText('Seconds'), '15');
    expect(screen.getByText('Each card: 1 min 15 sec')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Set custom time' }));
    expect(onChange).toHaveBeenCalledWith(75);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a saved custom time', async () => {
    await render(<AutoNextPicker visible value={75} onChange={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole('radio', { name: 'Custom · 1 min 15 sec' })).toBeChecked();
    expect(screen.getByLabelText('Minutes')).toHaveDisplayValue('1');
    expect(screen.getByLabelText('Seconds')).toHaveDisplayValue('15');
  });
});

describe('AutoNextPicker pause on answer', () => {
  it('turns Pause on answer on and off without closing', async () => {
    const onPause = jest.fn();
    const onClose = jest.fn();
    await render(
      <AutoNextPicker
        visible
        value={30}
        pauseOnAnswer={false}
        onPauseOnAnswerChange={onPause}
        onChange={jest.fn()}
        onClose={onClose}
      />,
    );

    await fireEvent(screen.getByLabelText('Pause on answer'), 'valueChange', true);
    expect(onPause).toHaveBeenCalledWith(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is locked while the timer is off', async () => {
    await render(
      <AutoNextPicker visible value={0} onPauseOnAnswerChange={jest.fn()} onChange={jest.fn()} onClose={jest.fn()} />,
    );
    expect(screen.getByLabelText('Pause on answer')).toBeDisabled();
    expect(screen.getByText('Choose a time above to use this.')).toBeOnTheScreen();
  });
});

describe('AutoNextPicker last custom time', () => {
  it('keeps Off first, then the last custom time', async () => {
    const onChange = jest.fn();
    await render(<AutoNextPicker visible value={0} recent={1523} onChange={onChange} onClose={jest.fn()} />);

    const radios = screen.getAllByRole('radio');
    expect(radios[0]).toHaveAccessibleName('Off');
    expect(radios[1]).toHaveAccessibleName('25 min 23 sec');
    expect(radios.filter((r) => r.props.accessibilityLabel === 'Off')).toHaveLength(1);
    await fireEvent.press(radios[1]);
    expect(onChange).toHaveBeenCalledWith(1523);
  });

  it('marks it chosen when it is the deck time, without opening Custom', async () => {
    await render(<AutoNextPicker visible value={1523} recent={1523} onChange={jest.fn()} onClose={jest.fn()} />);
    expect(screen.getByRole('radio', { name: '25 min 23 sec' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Custom' })).not.toBeChecked();
    expect(screen.queryByLabelText('Minutes')).toBeNull();
  });
});
