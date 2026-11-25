import { act, renderHook } from '@testing-library/react-native';

import { formatDuration, formatStudyTotal, useStudyTimer } from '@/hooks/use-study-timer';

describe('formatDuration', () => {
  it('shows minutes and seconds, and hours once past an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3729)).toBe('1:02:09');
  });
});

describe('useStudyTimer', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('counts while running, pauses when stopped, and resets', async () => {
    const { result, rerender } = await renderHook(({ running }: { running: boolean }) => useStudyTimer(running), {
      initialProps: { running: true },
    });

    await act(() => jest.advanceTimersByTime(3000));
    expect(result.current.seconds).toBe(3);

    await rerender({ running: false });
    await act(() => jest.advanceTimersByTime(5000));
    expect(result.current.seconds).toBe(3);

    await rerender({ running: true });
    await act(() => jest.advanceTimersByTime(2000));
    expect(result.current.seconds).toBe(5);

    await act(() => result.current.reset());
    expect(result.current.seconds).toBe(0);
    await act(() => jest.advanceTimersByTime(1000));
    expect(result.current.seconds).toBe(1);
  });
});

describe('formatStudyTotal', () => {
  it('shows seconds, minutes, or hours and minutes', () => {
    expect(formatStudyTotal(45)).toBe('45 sec');
    expect(formatStudyTotal(12 * 60 + 30)).toBe('12 min');
    expect(formatStudyTotal(65 * 60)).toBe('1 h 05 min');
  });
});
