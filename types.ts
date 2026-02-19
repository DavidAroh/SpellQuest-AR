
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface Point {
  x: number;
  y: number;
}

export type TileColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'cyan' | 'pink';

// Added BubbleColor and Bubble for GeminiSlingshot game support
export type BubbleColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

export interface Bubble {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  color: BubbleColor;
  active: boolean;
}

export interface LetterTile {
  id: string;
  char: string;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  color: TileColor;
  isDragging: boolean;
  inTray: boolean;
  trayIndex?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface SpellingFeedback {
  word: string;
  isValid: boolean;
  definition?: string;
  sentence?: string;
  suggestion?: string;
  emoji?: string;
}

export interface DebugInfo {
  latency: number;
  screenshotBase64?: string;
  promptContext: string;
  rawResponse: string;
  parsedResponse?: any;
  error?: string;
  timestamp: string;
}

export interface AiResponse {
  feedback: SpellingFeedback;
  debug: DebugInfo;
}

declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}
