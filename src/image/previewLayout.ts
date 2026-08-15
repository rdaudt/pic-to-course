import type { Rotation } from '../domain/models';

export interface PreviewLayout {
  width: string;
  height: string;
  transform: string;
}

const VIEWPORT_WIDTH = 4;
const VIEWPORT_HEIGHT = 3;

function percent(value: number): string {
  return `${Math.round(value * 1_000_000) / 1_000_000}%`;
}

export function previewLayout(width: number, height: number, rotation: Rotation): PreviewLayout {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : VIEWPORT_WIDTH;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : VIEWPORT_HEIGHT;
  const quarterTurn = rotation === 90 || rotation === 270;
  const visualWidth = quarterTurn ? safeHeight : safeWidth;
  const visualHeight = quarterTurn ? safeWidth : safeHeight;
  const scale = Math.min(VIEWPORT_WIDTH / visualWidth, VIEWPORT_HEIGHT / visualHeight);
  const layoutWidth = safeWidth * scale / VIEWPORT_WIDTH * 100;
  const layoutHeight = safeHeight * scale / VIEWPORT_HEIGHT * 100;

  return {
    width: percent(layoutWidth),
    height: percent(layoutHeight),
    transform: `rotate(${rotation}deg)`,
  };
}
