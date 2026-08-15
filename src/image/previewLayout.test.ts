import { describe, expect, it } from 'vitest';
import { previewLayout } from './previewLayout';

describe('previewLayout', () => {
  it('fits a rotated landscape image inside the 4:3 viewport', () => {
    expect(previewLayout(1200, 900, 90)).toEqual({
      width: '75%',
      height: '75%',
      transform: 'rotate(90deg)',
    });
  });

  it('uses the full 4:3 viewport when a portrait image is rotated to landscape', () => {
    expect(previewLayout(900, 1200, 90)).toEqual({
      width: '75%',
      height: '133.333333%',
      transform: 'rotate(90deg)',
    });
  });

  it('fits an unrotated wide image without changing its aspect ratio', () => {
    expect(previewLayout(1600, 900, 0)).toEqual({
      width: '100%',
      height: '75%',
      transform: 'rotate(0deg)',
    });
  });
});
