import React, { useEffect, useRef, useState, useCallback } from "react";
import { Point, LetterTile, Particle, TileColor } from "../types";
import {
  Loader2,
  Sparkles,
  MousePointer2,
  RefreshCcw,
  CheckCircle2,
  Trophy,
  ArrowRight,
  Clock,
  Settings,
  Volume2,
  VolumeX,
  Star,
  Crown,
} from "lucide-react";
import { WORD_CATEGORIES } from "./wordLists";

const PINCH_GRAB_THRESHOLD = 0.09;
const PINCH_RELEASE_THRESHOLD = 0.13;
const TRAY_Y = 220;
const HAND_SMOOTH = 0.4;
const GRAB_CONFIRM_FRAMES = 3;
const HAND_SETTLE_FRAMES = 3;
const TILE_SIZE = 60;
const POOL_SPACING = 1.3;

const TILE_COLORS: TileColor[] = [
  "red",
  "blue",
  "green",
  "yellow",
  "purple",
  "orange",
  "cyan",
  "pink",
];
const COLOR_MAP: Record<TileColor, string> = {
  red: "#ff8a80",
  blue: "#82b1ff",
  green: "#b9f6ca",
  yellow: "#ffff8d",
  purple: "#ea80fc",
  orange: "#ffd180",
  cyan: "#84ffff",
  pink: "#ff80ab",
};

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type Category = keyof typeof WORD_CATEGORIES;

const DIFFICULTY_SETTINGS = {
  EASY: { time: 45, multiplier: 1, label: "Easy" },
  MEDIUM: { time: 30, multiplier: 1.5, label: "Medium" },
  HARD: { time: 20, multiplier: 2, label: "Hard" },
};

export const MultiplayerAdventure: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const tiles = useRef<LetterTile[]>([]);
  const particles = useRef<Particle[]>([]);
  const activeTileId = useRef<Record<number, string | null>>({0: null, 1: null});
  // Gesture smoothing & confirmation — off-screen initial pos prevents false grabs
  const smoothHandPos = useRef<Record<number, Point>>({0: { x: -9999, y: -9999 }, 1: { x: -9999, y: -9999 }});
  const pinchFrames = useRef<Record<number, number>>({0: 0, 1: 0});
  const pinchConfirmed = useRef<Record<number, boolean>>({0: false, 1: false});
  const handSettleFrames = useRef<Record<number, number>>({0: 0, 1: 0});
  const handWasPresent = useRef<Record<number, boolean>>({0: false, 1: false});

  // Ref to track correct state inside timer (avoid stale closure)
  const isCorrectRef = useRef(false);
  const isCorrect2Ref = useRef(false);
  // Refs for all values used inside the once-mounted camera loop
  const currentWordRef = useRef("");
  const difficultyRef = useRef<"EASY" | "MEDIUM" | "HARD">("MEDIUM");
  const timeLeftRef = useRef(30);
  const soundEnabledRef = useRef(true);
  const playSoundRef = useRef<(type: "success" | "failure" | "tick" | "click") => void>(() => {});
  const updateTrayRef = useRef<(p: number) => void>(() => {});

  // Game State
  const [loading, setLoading] = useState(true);
  const [currentWord, setCurrentWord] = useState("");
  const [trayWord, setTrayWord] = useState("");
  const [trayWord2, setTrayWord2] = useState("");
  const [isCorrect, setIsCorrect] = useState(false);
  const [isCorrect2, setIsCorrect2] = useState(false);
  const [score, setScore] = useState(0);
  const [score2, setScore2] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [category, setCategory] = useState<Category>("ANIMALS");
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Audio Context
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Sound Generation — uses soundEnabledRef to avoid stale closure
  const playSound = useCallback(
    (type: "success" | "failure" | "tick" | "click") => {
      if (!soundEnabledRef.current) return;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.exponentialRampToValueAtTime(1000, now + 0.1);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);

        // Secondary harmony
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(750, now + 0.1);
        osc2.frequency.exponentialRampToValueAtTime(1500, now + 0.2);
        gain2.gain.setValueAtTime(0.2, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc2.start(now + 0.1);
        osc2.stop(now + 0.6);
      } else if (type === "failure") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === "tick") {
        osc.type = "square";
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === "click") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc.start(now);
        osc.stop(now + 0.03);
      }
    },
    [soundEnabled],
  );

  // Keep refs in sync with state every render
  useEffect(() => {
    playSoundRef.current = playSound;
    soundEnabledRef.current = soundEnabled;
    difficultyRef.current = difficulty;
  });
  useEffect(() => { updateTrayRef.current = updateTray; });

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const initPool = useCallback(
    (width: number, height: number, word: string = "") => {
      // Start with the full A-Z alphabet
      const baseLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

      // Count how many times each letter appears in the target word
      const wordLetterCounts: Record<string, number> = {};
      for (const ch of word.toUpperCase()) {
        wordLetterCounts[ch] = (wordLetterCounts[ch] || 0) + 1;
      }

      // For any letter that appears more than once in the word, add the extra copies
      // E.g., "CHEETAH" needs 2 E's, but A-Z only has 1 E → inject 1 extra E
      const extraLetters: string[] = [];
      for (const [ch, count] of Object.entries(wordLetterCounts)) {
        const baseCount = 1; // A-Z has exactly one of each letter
        const extras = count * 2 - baseCount; // 2 players
        for (let i = 0; i < extras; i++) {
          extraLetters.push(ch);
        }
      }

      const allLetters = shuffleArray([...baseLetters, ...extraLetters]);
      const newTiles: LetterTile[] = [];

      // Arrange letters in rows of 9, adapting for any extra letters
      const totalLetters = allLetters.length;
      const perRow = 7;
      const rows: number[] = [];
      let remaining = totalLetters;
      while (remaining > 0) {
        rows.push(Math.min(perRow, remaining));
        remaining -= perRow;
      }
      const poolHeight = rows.length * TILE_SIZE * POOL_SPACING;
      // Vertically center letters between the tray and the floor
      const trayBottom = TRAY_Y + 50;
      const availableSpace = height - trayBottom;
      const poolStartY = trayBottom + Math.max(TILE_SIZE * 0.85, (availableSpace - poolHeight) / 2);

      let charIdx = 0;
      rows.forEach((colsInRow, rowIndex) => {
        const rowWidth = (colsInRow - 1) * TILE_SIZE * POOL_SPACING;
        const rowStartX = (width - rowWidth) / 2;

        for (let col = 0; col < colsInRow; col++) {
          if (charIdx >= allLetters.length) break;

          const char = allLetters[charIdx];
          const x = rowStartX + col * TILE_SIZE * POOL_SPACING;
          const y = poolStartY + rowIndex * TILE_SIZE * POOL_SPACING;

          newTiles.push({
            id: `tile-${char}-${charIdx}-${Math.random().toString(36).substr(2, 9)}`,
            char,
            x,
            y,
            targetX: x,
            targetY: y,
            color: TILE_COLORS[charIdx % TILE_COLORS.length],
            isDragging: false,
            inTray: false,
          });
          charIdx++;
        }
      });

      tiles.current = newTiles;
    },
    [],
  );

  const createSparkles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      particles.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 12,
        life: 1.0,
        color,
      });
    }
  };

  const updateTray = (p: number) => {
    const inTray = tiles.current
      .filter((t) => t.trayOwner === p && t.inTray)
      .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
    const word = inTray.map((t) => t.char).join("");
    
    if (p === 0) setTrayWord(word); 
    else setTrayWord2(word);

    // Check if word is correct — use refs to avoid stale closures
    const alreadyCorrect = p === 0 ? isCorrectRef.current : isCorrect2Ref.current;
    if (word === currentWordRef.current && word.length > 0 && !alreadyCorrect) {
      playSoundRef.current("success");
      if (p === 0) { setIsCorrect(true); isCorrectRef.current = true; }
      else { setIsCorrect2(true); isCorrect2Ref.current = true; }

      const diffConfig = DIFFICULTY_SETTINGS[difficultyRef.current];
      const timeBonus = Math.floor(timeLeftRef.current * diffConfig.multiplier);
      const points = Math.floor(word.length * 10 * diffConfig.multiplier) + timeBonus;

      if (p === 0) setScore((prev) => prev + points);
      else setScore2((prev) => prev + points);

      // Stop timer on first correct answer
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      tiles.current.forEach((t) => {
        if (t.trayOwner === p) createSparkles(t.x, t.y, COLOR_MAP[t.color]);
      });
    } else if (word !== currentWordRef.current) {
      if (p === 0) { setIsCorrect(false); isCorrectRef.current = false; }
      else { setIsCorrect2(false); isCorrect2Ref.current = false; }
    }
  };

  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    const limit = DIFFICULTY_SETTINGS[difficultyRef.current].time;
    setTimeLeft(limit);
    timeLeftRef.current = limit;
    isCorrectRef.current = false;
    isCorrect2Ref.current = false;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;
        timeLeftRef.current = next;
        if (next <= 5 && next > 0) {
          playSoundRef.current("tick");
        }
        if (next <= 0) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          playSoundRef.current("failure");
          setTimeout(() => {
            if (!isCorrectRef.current && !isCorrect2Ref.current) nextWord();
          }, 500);
          return 0;
        }
        return next;
      });
    }, 1000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // uses refs — stable forever

  const nextWord = useCallback(() => {
    const wordList = WORD_CATEGORIES[category][difficultyRef.current];
    const nextWordText = wordList[Math.floor(Math.random() * wordList.length)];

    setCurrentWord(nextWordText);
    currentWordRef.current = nextWordText;
    setTrayWord("");
    setTrayWord2("");
    setIsCorrect(false);
    setIsCorrect2(false);
    isCorrectRef.current = false;
    isCorrect2Ref.current = false;
    setWordsCompleted((prev) => prev + 1);

    const cw =
      (canvasRef.current && canvasRef.current.width > 0 ? canvasRef.current.width : null) ??
      containerRef.current?.clientWidth ??
      window.innerWidth;
    const ch =
      (canvasRef.current && canvasRef.current.height > 0 ? canvasRef.current.height : null) ??
      containerRef.current?.clientHeight ??
      window.innerHeight;
    initPool(cw, ch, nextWordText);

    startTimer();
  }, [category, initPool, startTimer]);


  const resetGame = () => {
    setScore(0);
    setWordsCompleted(0);
    nextWord();
  };

  // Initialize first word or reset when settings change
  useEffect(() => {
    // Only reset if we are just starting or settings changed mid-game
    // Ideally we might want a "New Game" button inside settings, but auto-restart is fine
    nextWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, difficulty]); // Restart when these change

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!videoRef.current || !canvasRef.current || !containerRef.current)
      return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) {
        canvas.width = w;
        canvas.height = h;
      }
      if (currentWordRef.current && canvas.width > 0) {
        initPool(canvas.width, canvas.height, currentWordRef.current);
      }
    };

    window.addEventListener("resize", resize);
    resize();

    let camera: any = null;
    let hands: any = null;

    const onResults = (results: any) => {
      setLoading(false);

      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = container.clientWidth || window.innerWidth;
        canvas.height = container.clientHeight || window.innerHeight;
      }
      if (tiles.current.length === 0 && currentWordRef.current) {
        initPool(canvas.width, canvas.height, currentWordRef.current);
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Mirror the video feed
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      
      let handPosMap: Record<number, Point> = {};
      let isPinchingMap: Record<number, boolean> = {};

      const activeHands = new Set<number>();
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const rawHands = results.multiHandLandmarks;
        const handsWithCenters = rawHands.map((landmarks: any) => {
           // Cursor = index tip only; sort position uses index tip for consistency
           const idxTipX = 1 - landmarks[8].x;   // mirror
           const thumbTipX = 1 - landmarks[4].x;
           const rawX = idxTipX * canvas.width;   // cursor is at index tip, not midpoint
           return { landmarks, rawX, idxTipX, thumbTipX, idxTipY: landmarks[8].y, thumbTipY: landmarks[4].y };
        });
        
        handsWithCenters.sort((a: any, b: any) => a.rawX - b.rawX); // Left hand (P1) is 0, Right hand (P2) is 1.

        handsWithCenters.forEach((h: any) => {
          let p = h.rawX > canvas.width / 2 ? 1 : 0;
          activeHands.add(p);
          
          // Cursor follows index tip; assign player by which half of screen index is in
          const rawY = h.idxTipY * canvas.height;

          // Snap on first appearance per player
          if (!handWasPresent.current[p]) {
            smoothHandPos.current[p].x = h.rawX;
            smoothHandPos.current[p].y = rawY;
            handWasPresent.current[p] = true;
            handSettleFrames.current[p] = 0;
            pinchFrames.current[p] = 0;
            pinchConfirmed.current[p] = false;
          } else {
            smoothHandPos.current[p].x += (h.rawX - smoothHandPos.current[p].x) * HAND_SMOOTH;
            smoothHandPos.current[p].y += (rawY - smoothHandPos.current[p].y) * HAND_SMOOTH;
          }
          handSettleFrames.current[p] = Math.min(handSettleFrames.current[p] + 1, HAND_SETTLE_FRAMES + 1);
          handPosMap[p] = { x: smoothHandPos.current[p].x, y: smoothHandPos.current[p].y };

          const dx = h.idxTipX - h.thumbTipX;
          const dy = h.idxTipY - h.thumbTipY;
          let pinchDistance = Math.sqrt(dx * dx + dy * dy);

          const threshold = activeTileId.current[p] ? PINCH_RELEASE_THRESHOLD : PINCH_GRAB_THRESHOLD;
          let rawPinching = pinchDistance < threshold;

          if (rawPinching) {
            pinchFrames.current[p] = Math.min(pinchFrames.current[p] + 1, GRAB_CONFIRM_FRAMES + 1);
            if (pinchFrames.current[p] >= GRAB_CONFIRM_FRAMES) pinchConfirmed.current[p] = true;
          } else {
            pinchFrames.current[p] = 0;
            if (!activeTileId.current[p]) pinchConfirmed.current[p] = false;
          }
          const handSettled = handSettleFrames.current[p] >= HAND_SETTLE_FRAMES;
          isPinchingMap[p] = rawPinching && (pinchConfirmed.current[p] || !!activeTileId.current[p]) && handSettled;
        });
      }

      [0, 1].forEach((p) => {
        if (!activeHands.has(p)) {
          // Hand lost for this player: reset gesture state
          handWasPresent.current[p] = false;
          handSettleFrames.current[p] = 0;
          pinchFrames.current[p] = 0;
          if (!activeTileId.current[p]) pinchConfirmed.current[p] = false;
        }

        const handPos = handPosMap[p];
        const isPinching = isPinchingMap[p];
        const trayCenter = p === 0 ? canvas.width * 0.25 : canvas.width * 0.75;
        const trayIsCorrect = p === 0 ? isCorrect : isCorrect2;

        if (handPos && isPinching && !(p === 0 ? isCorrectRef.current : isCorrect2Ref.current)) {
          if (!activeTileId.current[p]) {
            const clicked = tiles.current.find(t => 
              Math.abs(t.x - handPos.x) < TILE_SIZE * 0.75 && 
              Math.abs(t.y - handPos.y) < TILE_SIZE * 0.75 &&
              !Object.values(activeTileId.current).includes(t.id)
            );
            if (clicked) {
              activeTileId.current[p] = clicked.id;
              clicked.isDragging = true;
              playSoundRef.current("click");
            }
          } else {
            const tile = tiles.current.find(t => t.id === activeTileId.current[p]);
            if (tile) {
              tile.x = handPos.x;
              tile.y = handPos.y;
            }
          }
        } else if (activeTileId.current[p]) {
          const tile = tiles.current.find(t => t.id === activeTileId.current[p]);
          if (tile) {
            tile.isDragging = false;
            // Dropped near player's tray
            if (Math.abs(tile.y - TRAY_Y) < 100 && Math.abs(tile.x - trayCenter) < (canvas.width * 0.45) / 2) {
              if (tile.trayOwner !== p) playSoundRef.current("click");
              tile.inTray = true;
              tile.trayOwner = p;
              
              const trayTiles = tiles.current.filter(t => t.trayOwner === p && t.id !== tile.id)
                .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
              tile.trayIndex = trayTiles.length;
              tile.targetY = TRAY_Y;
              const totalWidth = (trayTiles.length + 1) * TILE_SIZE * 1.1;
              const startX = trayCenter - totalWidth / 2 + (TILE_SIZE * 1.1) / 2;
              trayTiles.concat(tile).forEach((t, i) => {
                t.trayIndex = i;
                t.targetX = startX + i * TILE_SIZE * 1.1 - (TILE_SIZE * 1.1) / 2;
                t.targetY = TRAY_Y;
              });
            } else {
              tile.inTray = false;
              tile.trayOwner = undefined;
              tile.trayIndex = undefined;
            }
          }
          activeTileId.current[p] = null;
          updateTrayRef.current(p);
        }
      });
      
      [0, 1].forEach((p) => {
         const trayCenter = p === 0 ? canvas.width * 0.25 : canvas.width * 0.75;
         // Use refs to avoid stale closure for tray colour
         const trayIsCorrect = p === 0 ? isCorrectRef.current : isCorrect2Ref.current;
         const trayW = canvas.width * 0.45;
         ctx.fillStyle = trayIsCorrect ? "#c8e6c9" : "#ffffff";
         ctx.strokeStyle = trayIsCorrect ? "#66bb6a" : "#e0e0e0";
         ctx.lineWidth = 3;
         ctx.beginPath();
         ctx.roundRect(trayCenter - trayW/2, TRAY_Y - 50, trayW, 100, 24);
         ctx.fill();
         ctx.stroke();

         ctx.font = "bold 14px sans-serif";
         ctx.fillStyle = trayIsCorrect ? "#388e3c" : "#ccc";
         ctx.textAlign = "center";
         ctx.fillText(p === 0 ? "PLAYER 1" : "PLAYER 2", trayCenter, TRAY_Y - 20);
      });

      // --- Render tiles ---
      // Pre-compute which tile (if any) is being hovered for glow effect
      const hoveredTileIds = [0, 1].map(p => 
        handPosMap[p] && !activeTileId.current[p]
          ? (tiles.current.find(
              (t) =>
                !t.inTray &&
                Math.hypot(t.x - handPosMap[p]!.x, t.y - handPosMap[p]!.y) <
                  TILE_SIZE * 0.85,
            )?.id ?? null)
          : null
      );

      tiles.current.forEach((t) => {
        if (!t.isDragging) {
          t.x += (t.targetX - t.x) * 0.15;
          t.y += (t.targetY - t.y) * 0.15;
        }

        const isHovered = hoveredTileIds.includes(t.id);
        const isDragging = t.isDragging;

        ctx.save();
        ctx.translate(t.x, t.y);

        if (isDragging) {
          ctx.scale(1.28, 1.28);
          ctx.shadowBlur = 28;
          ctx.shadowColor = "rgba(66,133,244,0.35)";
        } else if (isHovered) {
          ctx.scale(1.08, 1.08);
          ctx.shadowBlur = 22;
          ctx.shadowColor = "rgba(66,133,244,0.45)";
        } else {
          ctx.shadowBlur = 8;
          ctx.shadowColor = "rgba(0,0,0,0.08)";
        }

        // Hover / drag ring
        if (isHovered || isDragging) {
          ctx.beginPath();
          ctx.roundRect(
            -TILE_SIZE / 2 - 4,
            -TILE_SIZE / 2 - 4,
            TILE_SIZE + 8,
            TILE_SIZE + 8,
            18,
          );
          ctx.strokeStyle = isDragging
            ? "rgba(255,64,129,0.7)"
            : "rgba(66,133,244,0.6)";
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        ctx.fillStyle = COLOR_MAP[t.color];
        ctx.beginPath();
        ctx.roundRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 14);
        ctx.fill();

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.beginPath();
        ctx.roundRect(
          -TILE_SIZE / 2 + 4,
          -TILE_SIZE / 2 + 4,
          TILE_SIZE - 8,
          TILE_SIZE / 2 - 4,
          10,
        );
        ctx.fill();

        ctx.fillStyle = "#333";
        ctx.font = `bold ${TILE_SIZE * 0.55}px 'Roboto'`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(t.char, 0, 2);
        ctx.restore();
      });

      // --- Hand cursor ---
      [0, 1].forEach(p => {
        const hp = handPosMap[p];
        if (hp) {
          // Basic pinch visualization without exact distance
          const isPinching = isPinchingMap[p];
          const pinchStrength = isPinching ? 1 : 0.2;
          
          // Outer ring — shrinks as you pinch closer
          const outerR = 30 - pinchStrength * 12;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, outerR, 0, Math.PI * 2);
          ctx.strokeStyle = isPinching
            ? (p===0 ? "#4285f4" : "#ff4081")
            : (p===0 ? `rgba(66,133,244,${0.4 + pinchStrength * 0.5})` : `rgba(255,64,129,${0.4 + pinchStrength * 0.5})`);
          ctx.lineWidth = isPinching ? 4 : 2.5;
          ctx.stroke();

          // Inner filled dot — grows as you pinch
          const innerR = 4 + pinchStrength * 8;
          ctx.beginPath();
          ctx.arc(hp.x, hp.y, innerR, 0, Math.PI * 2);
          ctx.fillStyle = isPinching
            ? (p===0 ? "rgba(66,133,244,0.55)" : "rgba(255,64,129,0.55)")
            : (p===0 ? `rgba(66,133,244,${0.2 + pinchStrength * 0.4})` : `rgba(255,64,129,${0.2 + pinchStrength * 0.4})`);
          ctx.fill();

          // Label
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = isPinching ? (p===0 ? "#4285f4" : "#ff4081") : (p===0 ? "#82b1ff" : "#ff80ab");
          ctx.fillText(
            isPinching ? "✦ GRAB" : "PINCH",
            hp.x,
            hp.y + outerR + 16,
          );
        }
      });

      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.025;
        if (p.life <= 0) particles.current.splice(i, 1);
        else {
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const tryInit = () => {
      if (window.Hands && window.Camera) {
        if (window.__mpHandsWarm) {
          hands = window.__mpHandsWarm;
          window.__mpHandsWarm = null;
        } else {
          hands = new window.Hands({
            locateFile: (f: any) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
          });
        }
        hands.setOptions({
          maxNumHands: 2,
          modelComplexity: 0,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        hands.onResults(onResults);
        const camW = container.clientWidth || 1280;
        const camH = container.clientHeight || 720;
        camera = new window.Camera(video, {
          onFrame: async () => {
            if (hands && video.readyState >= 2) await hands.send({ image: video });
          },
          width: camW,
          height: camH,
        });
        camera.start();
      } else {
        setTimeout(tryInit, 100);
      }
    };
    tryInit();
    return () => {
      camera?.stop();
      hands?.close();
      window.removeEventListener("resize", resize);
    };
  }, []); // camera mounts ONCE — all game state accessed via refs

  // Calculate timer color based on time left
  const getTimerColor = () => {
    if (timeLeft > 20) return "text-green-600 border-green-300";
    if (timeLeft > 10) return "text-yellow-600 border-yellow-300";
    return "text-red-600 border-red-300 animate-pulse";
  };

  return (
    <div className="flex w-full h-screen bg-gradient-to-br from-blue-50 to-purple-50 overflow-hidden font-roboto relative">
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200">
          <div className="bg-white p-8 rounded-[38px] shadow-2xl max-w-sm w-full mx-6 transition-all scale-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-500" /> Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition"
              >
                <CheckCircle2 className="w-6 h-6 text-gray-600" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Difficulty */}
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">
                  Difficulty
                </p>
                <div className="flex gap-2">
                  {(["EASY", "MEDIUM", "HARD"] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d ? "bg-blue-600 text-white shadow-lg scale-105" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {DIFFICULTY_SETTINGS[d].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">
                  Word Category
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(WORD_CATEGORIES) as Category[]).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCategory(c)}
                      className={`py-2 rounded-xl text-[11px] font-black transition-all uppercase tracking-wide ${category === c ? "bg-purple-600 text-white shadow-lg" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sound */}
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">
                  Sound
                </p>
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${soundEnabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
                >
                  {soundEnabled ? (
                    <Volume2 className="w-5 h-5" />
                  ) : (
                    <VolumeX className="w-5 h-5" />
                  )}
                  {soundEnabled ? "Sound On" : "Sound Off"}
                </button>
              </div>
            </div>

            <div className="mt-8 text-center text-xs text-gray-400 font-medium">
              Adjusting difficulty will restart the current word.
            </div>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 relative h-full overflow-hidden"
      >
        <video ref={videoRef} className="absolute hidden" playsInline />
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Header */}
        <div className="absolute top-6 left-6 z-40 flex items-center gap-4">
          <div className="bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border border-blue-100 flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-2xl shadow-md">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-800 tracking-tight">
                Spelling Adventure
              </h1>
              <p className="text-[11px] text-blue-600 font-bold flex items-center gap-1 uppercase tracking-wider">
                <MousePointer2 className="w-3 h-3" /> Pinch to spell!
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-white/95 p-3 rounded-full shadow-lg hover:shadow-xl transition-all group border border-gray-100 active:scale-95"
          >
            <Settings
              className={`w-6 h-6 text-gray-600 transition-transform duration-700 ${showSettings ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {/* Score & Timer & High Score */}
        <div className="absolute top-6 right-6 z-40 flex flex-col items-end gap-3">
          <div className="flex gap-3">
            <div className="bg-yellow-100/90 backdrop-blur-md px-4 py-2 rounded-[20px] shadow-lg border border-yellow-200 flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-600" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-yellow-600 leading-none">
                  Best
                </span>
                <span className="text-sm font-black text-yellow-700 leading-none">
                  {highScore}
                </span>
              </div>
            </div>

            <div className="bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border border-purple-100 flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-500" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
                  Score
                </p>
                <p className="text-2xl font-black text-gray-800">{score}</p>
              </div>
            </div>
          </div>

          {!isCorrect && (
            <div
              className={`bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border-2 flex items-center gap-3 transition-colors duration-500 ${getTimerColor()}`}
            >
              <Clock className="w-6 h-6" />
              <div>
                <p className="text-xs uppercase tracking-wider font-medium opacity-80">
                  Time
                </p>
                <p className="text-2xl font-black font-mono">{timeLeft}s</p>
              </div>
            </div>
          )}
        </div>

        {/* Target Word Display */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-12 py-6 rounded-[32px] shadow-2xl border-4 border-white relative overflow-hidden group">
            {/* Category Badge */}
            <div className="absolute top-0 right-0 bg-white/20 px-3 py-1 rounded-bl-xl text-[10px] font-black text-white/90 uppercase tracking-widest backdrop-blur-sm">
              {category} • {DIFFICULTY_SETTINGS[difficulty].label}
            </div>

            <p className="text-xs text-white/80 uppercase tracking-widest font-bold mb-2 text-center mt-2 group-hover:scale-105 transition-transform">
              Spell this word:
            </p>
            <p className="text-5xl font-black tracking-[0.3em] text-white uppercase text-center drop-shadow-lg scale-100 transition-all">
              {currentWord}
            </p>
          </div>
        </div>

        
        {/* User 1 Spelled Word */}
        {trayWord && (
          <div className="absolute top-28 left-1/4 -translate-x-1/2 z-40">
            <div className={`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 ${isCorrect ? "bg-green-50 border-green-300 scale-105" : "bg-white border-blue-200"}`}>
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">{trayWord}</span>
              {isCorrect && <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />}
            </div>
          </div>
        )}
        {/* User 2 Spelled Word */}
        {trayWord2 && (
          <div className="absolute top-28" style={{ left: '75%', transform: 'translateX(-50%)', zIndex: 40}}>
            <div className={`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 ${isCorrect2 ? "bg-green-50 border-green-300 scale-105" : "bg-white border-red-200"}`}>
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">{trayWord2}</span>
              {isCorrect2 && <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />}
            </div>
          </div>
        )}

        {/* Success Message & Next Button */}

        {(isCorrect || isCorrect2) && (
          <div className="absolute top-44 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-green-500 text-white px-8 py-4 rounded-full shadow-xl flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-full">
                <Star className="w-5 h-5 text-yellow-300 fill-current animate-spin-slow" />
              </div>
              <span className="text-xl font-black">
                {isCorrect ? "Blue Wins! P1: " : "Red Wins! P2: "} +
                {Math.floor(
                  currentWord.length *
                    10 *
                    DIFFICULTY_SETTINGS[difficulty].multiplier,
                ) +
                  Math.floor(
                    timeLeft * DIFFICULTY_SETTINGS[difficulty].multiplier,
                  )}{" "}
                pts
              </span>
            </div>
            <button
              onClick={nextWord}
              className="bg-white hover:bg-gray-50 text-gray-800 font-bold px-8 py-4 rounded-full shadow-xl flex items-center gap-3 transition-all hover:scale-105 active:scale-95 border-2 border-gray-200"
            >
              <span className="text-lg">Next Word</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 z-50">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin" />
                <Sparkles className="absolute -top-2 -right-2 text-purple-500 animate-pulse" />
              </div>
              <p className="mt-8 text-xl font-bold text-gray-600 tracking-tight">
                Starting Adventure...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


