import { activityLevel } from '@/components/activity-heatmap';

describe('activityLevel', () => {
  it('maps cards studied to a shade from 0 to 4', () => {
    expect([0, 1, 4, 5, 9, 10, 19, 20, 100].map(activityLevel)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});
