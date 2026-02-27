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

const PINCH_GRAB_THRESHOLD = 0.065; // wider → easier to start a grab
const PINCH_RELEASE_THRESHOLD = 0.1; // wider → won't accidentally drop mid-drag
const TRAY_Y = 220;
const HAND_SMOOTH = 0.45; // 0 = frozen, 1 = raw (no smoothing)
const GRAB_CONFIRM_FRAMES = 2; // consecutive pinch frames before pickup
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

const SpellingAdventure: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const tiles = useRef<LetterTile[]>([]);
  const particles = useRef<Particle[]>([]);
  const activeTileId = useRef<string | null>(null);
  // Gesture smoothing & confirmation
  const smoothHandPos = useRef<Point>({ x: 0, y: 0 });
  const pinchFrames = useRef<number>(0); // consecutive frames where pinch is detected
  const pinchConfirmed = useRef<boolean>(false);

  // Game State
  const [loading, setLoading] = useState(true);
  const [currentWord, setCurrentWord] = useState("");
  const [trayWord, setTrayWord] = useState("");
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
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

  // Load High Score
  useEffect(() => {
    const saved = localStorage.getItem("spellingHighScore");
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  // Save High Score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem("spellingHighScore", score.toString());
    }
  }, [score, highScore]);

  // Sound Generation
  const playSound = useCallback(
    (type: "success" | "failure" | "tick" | "click") => {
      if (!soundEnabled) return;

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
        const extras = count - baseCount;
        for (let i = 0; i < extras; i++) {
          extraLetters.push(ch);
        }
      }

      const allLetters = shuffleArray([...baseLetters, ...extraLetters]);
      const newTiles: LetterTile[] = [];

      // Arrange letters in rows of 9, adapting for any extra letters
      const totalLetters = allLetters.length;
      const perRow = 9;
      const rows: number[] = [];
      let remaining = totalLetters;
      while (remaining > 0) {
        rows.push(Math.min(perRow, remaining));
        remaining -= perRow;
      }
      const poolHeight = rows.length * TILE_SIZE * POOL_SPACING;
      const poolStartY = height - poolHeight - 40;

      let charIdx = 0;
      rows.forEach((colsInRow, rowIndex) => {
        const rowWidth = colsInRow * TILE_SIZE * POOL_SPACING;
        const rowStartX =
          (width - rowWidth) / 2 + (TILE_SIZE * POOL_SPACING) / 2;

        for (let col = 0; col < colsInRow; col++) {
          if (charIdx >= allLetters.length) break;

          const char = allLetters[charIdx];
          const x =
            rowStartX +
            col * TILE_SIZE * POOL_SPACING -
            (TILE_SIZE * POOL_SPACING) / 2;
          const y = poolStartY + rowIndex * TILE_SIZE * POOL_SPACING;

          newTiles.push({
            id: `tile-${char}-${charIdx}`,
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

  const updateTrayWord = () => {
    const inTray = tiles.current
      .filter((t) => t.inTray)
      .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
    const word = inTray.map((t) => t.char).join("");
    setTrayWord(word);

    // Check if word is correct
    if (word === currentWord && word.length > 0) {
      playSound("success");
      setIsCorrect(true);
      const diffConfig = DIFFICULTY_SETTINGS[difficulty];
      const timeBonus = Math.floor(timeLeft * diffConfig.multiplier);
      setScore(
        (prev) =>
          prev +
          Math.floor(word.length * 10 * diffConfig.multiplier) +
          timeBonus,
      );

      // Stop timers
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      // Create sparkles for all tiles
      tiles.current.forEach((t) => {
        if (t.inTray) createSparkles(t.x, t.y, COLOR_MAP[t.color]);
      });
    } else {
      setIsCorrect(false);
    }
  };

  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    const limit = DIFFICULTY_SETTINGS[difficulty].time;
    setTimeLeft(limit);

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 5 && prev > 0) {
          playSound("tick");
        }
        if (prev <= 1) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
          }
          playSound("failure");
          setTimeout(() => {
            if (!isCorrect) nextWord();
          }, 500);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [difficulty, isCorrect, playSound]);

  const nextWord = useCallback(() => {
    const wordList = WORD_CATEGORIES[category][difficulty];
    // Pick random word ensuring no repeats if possible (simple random for now)
    const nextWordText = wordList[Math.floor(Math.random() * wordList.length)];

    setCurrentWord(nextWordText);
    setTrayWord("");
    setIsCorrect(false);
    setWordsCompleted((prev) => prev + 1);
    if (containerRef.current) {
      initPool(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight,
        nextWordText,
      );
    }
    startTimer();
  }, [category, difficulty, initPool, startTimer]);

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
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (tiles.current.length === 0) {
        initPool(canvas.width, canvas.height, currentWord);
      }
    };

    window.addEventListener("resize", resize);
    resize();

    let camera: any = null;
    let hands: any = null;

    const onResults = (results: any) => {
      setLoading(false);

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

      let handPos: Point | null = null;
      let rawPinching = false;
      let pinchDistance = 1;

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        const idxTip = landmarks[8];
        const thumbTip = landmarks[4];

        // Flip x coordinates for mirror effect
        const idxTipX = 1 - idxTip.x;
        const thumbTipX = 1 - thumbTip.x;

        const rawX = (idxTipX * canvas.width + thumbTipX * canvas.width) / 2;
        const rawY =
          (idxTip.y * canvas.height + thumbTip.y * canvas.height) / 2;

        // Exponential moving average smoothing to reduce jitter
        smoothHandPos.current.x +=
          (rawX - smoothHandPos.current.x) * HAND_SMOOTH;
        smoothHandPos.current.y +=
          (rawY - smoothHandPos.current.y) * HAND_SMOOTH;
        handPos = { x: smoothHandPos.current.x, y: smoothHandPos.current.y };

        const dx = idxTipX - thumbTipX;
        const dy = idxTip.y - thumbTip.y;
        pinchDistance = Math.sqrt(dx * dx + dy * dy);

        // Hysteresis: wider threshold while already dragging
        const threshold = activeTileId.current
          ? PINCH_RELEASE_THRESHOLD
          : PINCH_GRAB_THRESHOLD;
        rawPinching = pinchDistance < threshold;

        if (window.drawConnectors && window.drawLandmarks) {
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, {
            color: "rgba(130,177,255,0.6)",
            lineWidth: 2,
          });
          window.drawLandmarks(ctx, landmarks, { color: "#448aff", radius: 3 });
          ctx.restore();
        }
      } else {
        // Hand lost — reset smoothing so it snaps when hand reappears
        pinchFrames.current = 0;
        pinchConfirmed.current = false;
      }

      // --- Grab confirmation: require N consecutive pinch frames before pickup ---
      if (rawPinching) {
        pinchFrames.current = Math.min(
          pinchFrames.current + 1,
          GRAB_CONFIRM_FRAMES + 1,
        );
        if (pinchFrames.current >= GRAB_CONFIRM_FRAMES)
          pinchConfirmed.current = true;
      } else {
        pinchFrames.current = 0;
        if (!activeTileId.current) pinchConfirmed.current = false; // only clear if not mid-drag
      }
      const isPinching =
        rawPinching && (pinchConfirmed.current || !!activeTileId.current);

      if (handPos && isPinching && !isCorrect) {
        if (!activeTileId.current) {
          const clicked = tiles.current.find(
            (t) =>
              Math.abs(t.x - (handPos?.x || 0)) < TILE_SIZE / 2 &&
              Math.abs(t.y - (handPos?.y || 0)) < TILE_SIZE / 2,
          );
          if (clicked) {
            activeTileId.current = clicked.id;
            clicked.isDragging = true;
            playSound("click");
          }
        } else {
          const tile = tiles.current.find((t) => t.id === activeTileId.current);
          if (tile) {
            tile.x = handPos.x;
            tile.y = handPos.y;
          }
        }
      } else if (activeTileId.current) {
        const tile = tiles.current.find((t) => t.id === activeTileId.current);
        if (tile) {
          tile.isDragging = false;
          if (Math.abs(tile.y - TRAY_Y) < 100) {
            if (!tile.inTray) playSound("click");
            tile.inTray = true;
            const trayTiles = tiles.current
              .filter((t) => t.inTray && t.id !== tile.id)
              .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
            tile.trayIndex = trayTiles.length;
            tile.targetY = TRAY_Y;
            const totalWidth = (trayTiles.length + 1) * TILE_SIZE * 1.1;
            const startX =
              (canvas.width - totalWidth) / 2 + (TILE_SIZE * 1.1) / 2;
            trayTiles.concat(tile).forEach((t, i) => {
              t.trayIndex = i;
              t.targetX = startX + i * TILE_SIZE * 1.1 - (TILE_SIZE * 1.1) / 2;
              t.targetY = TRAY_Y;
            });
          } else {
            tile.inTray = false;
            tile.trayIndex = undefined;
          }
        }
        activeTileId.current = null;
        updateTrayWord();
      }

      // Word Tray Background
      ctx.fillStyle = isCorrect ? "#c8e6c9" : "#ffffff";
      ctx.strokeStyle = isCorrect ? "#66bb6a" : "#e0e0e0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(60, TRAY_Y - 50, canvas.width - 120, 100, 24);
      ctx.fill();
      ctx.stroke();

      // --- Render tiles ---
      // Pre-compute which tile (if any) is being hovered for glow effect
      const hoveredTileId =
        handPos && !activeTileId.current
          ? (tiles.current.find(
              (t) =>
                !t.inTray &&
                Math.hypot(t.x - handPos!.x, t.y - handPos!.y) <
                  TILE_SIZE * 0.85,
            )?.id ?? null)
          : null;

      tiles.current.forEach((t) => {
        if (!t.isDragging) {
          t.x += (t.targetX - t.x) * 0.15;
          t.y += (t.targetY - t.y) * 0.15;
        }

        const isHovered = t.id === hoveredTileId;
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
      if (handPos) {
        // Pinch strength: 0 = fingers wide open, 1 = fully pinched
        const pinchStrength = Math.max(
          0,
          Math.min(1, 1 - (pinchDistance - 0) / (PINCH_GRAB_THRESHOLD * 2)),
        );

        // Outer ring — shrinks as you pinch closer
        const outerR = 30 - pinchStrength * 12;
        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, outerR, 0, Math.PI * 2);
        ctx.strokeStyle = isPinching
          ? "#ff4081"
          : `rgba(66,133,244,${0.4 + pinchStrength * 0.5})`;
        ctx.lineWidth = isPinching ? 4 : 2.5;
        ctx.stroke();

        // Inner filled dot — grows as you pinch
        const innerR = 4 + pinchStrength * 8;
        ctx.beginPath();
        ctx.arc(handPos.x, handPos.y, innerR, 0, Math.PI * 2);
        ctx.fillStyle = isPinching
          ? "rgba(255,64,129,0.55)"
          : `rgba(66,133,244,${0.2 + pinchStrength * 0.4})`;
        ctx.fill();

        // Label
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillStyle = isPinching ? "#ff4081" : "#4285f4";
        ctx.fillText(
          isPinching ? "✦ GRAB" : "PINCH",
          handPos.x,
          handPos.y + outerR + 16,
        );
      }

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

    if (window.Hands) {
      hands = new window.Hands({
        locateFile: (f: any) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      hands.onResults(onResults);
      if (window.Camera) {
        camera = new window.Camera(video, {
          onFrame: async () => {
            if (hands) await hands.send({ image: video });
          },
          width: 1280,
          height: 720,
        });
        camera.start();
      }
    }
    return () => {
      camera?.stop();
      hands?.close();
      window.removeEventListener("resize", resize);
    };
  }, [initPool, currentWord, isCorrect, playSound]);

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

        {/* User's Spelled Word */}
        {trayWord && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40">
            <div
              className={`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 ${isCorrect ? "bg-green-50 border-green-300 scale-105" : "bg-white border-blue-200"}`}
            >
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">
                {trayWord}
              </span>
              {isCorrect && (
                <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />
              )}
            </div>
          </div>
        )}

        {/* Success Message & Next Button */}
        {isCorrect && (
          <div className="absolute top-44 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="bg-green-500 text-white px-8 py-4 rounded-full shadow-xl flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-full">
                <Star className="w-5 h-5 text-yellow-300 fill-current animate-spin-slow" />
              </div>
              <span className="text-xl font-black">
                Perfect! +
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

export default SpellingAdventure;
