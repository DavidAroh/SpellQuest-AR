import React, { useEffect, useRef, useState, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";
import { Point, LetterTile, Particle, TileColor } from "../types";
import {
  Sparkles,
  MousePointer2,
  CheckCircle2,
  Trophy,
  ArrowRight,
  Clock,
  Settings,
  Volume2,
  VolumeX,
  Star,
  Crown,
  Copy,
  Wifi,
  WifiOff,
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
  "red", "blue", "green", "yellow", "purple", "orange", "cyan", "pink",
];
const COLOR_MAP: Record<TileColor, string> = {
  red: "#ff8a80", blue: "#82b1ff", green: "#b9f6ca", yellow: "#ffff8d",
  purple: "#ea80fc", orange: "#ffd180", cyan: "#84ffff", pink: "#ff80ab",
};

type Difficulty = "EASY" | "MEDIUM" | "HARD";
type Category = keyof typeof WORD_CATEGORIES;

const DIFFICULTY_SETTINGS = {
  EASY: { time: 45, multiplier: 1, label: "Easy" },
  MEDIUM: { time: 30, multiplier: 1.5, label: "Medium" },
  HARD: { time: 20, multiplier: 2, label: "Hard" },
};

/** Generate a short 6-character alphanumeric room code */
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const NetworkMultiplayer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraRef = useRef<any>(null);
  const handsRef = useRef<any>(null);

  const tiles = useRef<LetterTile[]>([]);
  const particles = useRef<Particle[]>([]);
  const activeTileId = useRef<string | null>(null);
  // Off-screen initial value prevents false grabs from coordinate (0,0)
  const smoothHandPos = useRef<Point>({ x: -9999, y: -9999 });
  const pinchFrames = useRef<number>(0);
  const pinchConfirmed = useRef<boolean>(false);
  const handSettleFrames = useRef<number>(0);
  const handWasPresent = useRef<boolean>(false);

  // Use refs for values accessed inside the canvas render loop to avoid stale closures
  const currentWordRef = useRef<string>("");
  const isCorrectRef = useRef<boolean>(false);
  const difficultyRef = useRef<Difficulty>("MEDIUM");
  const categoryRef = useRef<Category>("ANIMALS");
  const timeLeftRef = useRef<number>(30);
  const isHostRef = useRef<boolean>(false);

  // Game State (React state for UI)
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "creating" | "waiting" | "joining" | "connected" | "error">("idle");
  const [waitingForWord, setWaitingForWord] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [gamePhase, setGamePhase] = useState<"LOBBY" | "PLAYING">("LOBBY");
  const [oppScore, setOppScore] = useState(0);
  const [oppTrayWord, setOppTrayWord] = useState("");
  const [currentWord, setCurrentWord] = useState("");
  const [trayWord, setTrayWord] = useState("");
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [showSettings, setShowSettings] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [category, setCategory] = useState<Category>("ANIMALS");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [copied, setCopied] = useState(false);

  const connRef = useRef<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(true);
  const cameraInitializedRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { currentWordRef.current = currentWord; }, [currentWord]);
  useEffect(() => { isCorrectRef.current = isCorrect; }, [isCorrect]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);
  useEffect(() => { categoryRef.current = category; }, [category]);
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

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

  // Sound Generation — uses ref to avoid stale soundEnabled
  const playSound = useCallback(
    (type: "success" | "failure" | "tick" | "click") => {
      if (!soundEnabledRef.current) return;
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
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
        osc.start(now); osc.stop(now + 0.5);
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2); gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(750, now + 0.1);
        osc2.frequency.exponentialRampToValueAtTime(1500, now + 0.2);
        gain2.gain.setValueAtTime(0.2, now + 0.1);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
        osc2.start(now + 0.1); osc2.stop(now + 0.6);
      } else if (type === "failure") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.3);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
      } else if (type === "tick") {
        osc.type = "square";
        osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
      } else if (type === "click") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(600, now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
        osc.start(now); osc.stop(now + 0.03);
      }
    },
    [],
  );

  const shuffleArray = <T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  const initPool = useCallback((width: number, height: number, word: string = "") => {
    const baseLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const wordLetterCounts: Record<string, number> = {};
    for (const ch of word.toUpperCase()) {
      wordLetterCounts[ch] = (wordLetterCounts[ch] || 0) + 1;
    }
    const extraLetters: string[] = [];
    for (const [ch, count] of Object.entries(wordLetterCounts)) {
      for (let i = 0; i < count - 1; i++) extraLetters.push(ch);
    }
    const allLetters = shuffleArray([...baseLetters, ...extraLetters]);
    const newTiles: LetterTile[] = [];
    const perRow = 7;
    const rows: number[] = [];
    let remaining = allLetters.length;
    while (remaining > 0) { rows.push(Math.min(perRow, remaining)); remaining -= perRow; }
    const poolHeight = rows.length * TILE_SIZE * POOL_SPACING;
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
          char, x, y, targetX: x, targetY: y,
          color: TILE_COLORS[charIdx % TILE_COLORS.length],
          isDragging: false, inTray: false,
        });
        charIdx++;
      }
    });
    tiles.current = newTiles;
  }, []);

  const createSparkles = (x: number, y: number, color: string) => {
    for (let i = 0; i < 20; i++) {
      particles.current.push({ x, y, vx: (Math.random() - 0.5) * 12, vy: (Math.random() - 0.5) * 12, life: 1.0, color });
    }
  };

  // updateTrayWord reads from refs to avoid stale closures
  const updateTrayWord = useCallback(() => {
    const inTray = tiles.current.filter(t => t.inTray).sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
    const word = inTray.map(t => t.char).join("");
    setTrayWord(word);
    if (connRef.current) connRef.current.send({ type: "UPDATE_TRAY", word });

    if (word === currentWordRef.current && word.length > 0 && !isCorrectRef.current) {
      playSound("success");
      setIsCorrect(true);
      isCorrectRef.current = true;
      const diffConfig = DIFFICULTY_SETTINGS[difficultyRef.current];
      const timeBonus = Math.floor(timeLeftRef.current * diffConfig.multiplier);
      setScore(prev => {
        const newScore = prev + Math.floor(word.length * 10 * diffConfig.multiplier) + timeBonus;
        if (connRef.current) connRef.current.send({ type: "OPPONENT_SCORE", score: newScore });
        return newScore;
      });
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      tiles.current.forEach(t => { if (t.inTray) createSparkles(t.x, t.y, COLOR_MAP[t.color]); });
    } else if (word !== currentWordRef.current) {
      setIsCorrect(false);
      isCorrectRef.current = false;
    }
  }, [playSound]);

  const startTimer = useCallback((forceDifficulty?: string) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    const d = (forceDifficulty as Difficulty) || difficultyRef.current;
    const limit = DIFFICULTY_SETTINGS[d].time;
    setTimeLeft(limit);
    timeLeftRef.current = limit;
    isCorrectRef.current = false;

    timerIntervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        timeLeftRef.current = next;
        if (next <= 5 && next > 0) playSound("tick");
        if (next <= 0) {
          if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
          playSound("failure");
          // Only host advances when timer expires
          setTimeout(() => {
            if (!isCorrectRef.current && isHostRef.current && connRef.current) {
              hostNextWord();
            }
          }, 800);
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [playSound]);

  const hostNextWord = useCallback((activeConn?: DataConnection) => {
    const c = activeConn || connRef.current;
    if (!c) return;
    const wordList = WORD_CATEGORIES[categoryRef.current][difficultyRef.current];
    const nextWordText = wordList[Math.floor(Math.random() * wordList.length)];
    c.send({ type: "START_WORD", word: nextWordText, difficulty: difficultyRef.current });
    // Apply locally
    currentWordRef.current = nextWordText;
    setCurrentWord(nextWordText);
    setTrayWord("");
    setIsCorrect(false);
    isCorrectRef.current = false;
    setWordsCompleted(prev => prev + 1);
    tiles.current = [];
    // Sync canvas size before placing tiles
    if (canvasRef.current && containerRef.current) {
      canvasRef.current.width = containerRef.current.clientWidth;
      canvasRef.current.height = containerRef.current.clientHeight;
      initPool(canvasRef.current.width, canvasRef.current.height, nextWordText);
    } else if (containerRef.current) {
      initPool(containerRef.current.clientWidth, containerRef.current.clientHeight, nextWordText);
    }
    startTimer(difficultyRef.current);
  }, [initPool, startTimer]);

  const setupConnListeners = useCallback((conn: DataConnection) => {
    conn.on("data", (data: any) => {
      if (data.type === "START_WORD") {
        // Clear waiting overlay as soon as first word arrives
        setWaitingForWord(false);
        currentWordRef.current = data.word;
        setCurrentWord(data.word);
        setTrayWord("");
        setIsCorrect(false);
        isCorrectRef.current = false;
        setWordsCompleted(prev => prev + 1);
        tiles.current = [];
        const cw = (canvasRef.current?.width ?? 0) > 0 ? canvasRef.current!.width : (containerRef.current?.clientWidth || window.innerWidth);
        const ch = (canvasRef.current?.height ?? 0) > 0 ? canvasRef.current!.height : (containerRef.current?.clientHeight || window.innerHeight);
        initPool(cw, ch, data.word);
        startTimer(data.difficulty);
      } else if (data.type === "UPDATE_TRAY") {
        setOppTrayWord(data.word);
      } else if (data.type === "OPPONENT_SCORE") {
        setOppScore(data.score);
      }
    });
    conn.on("close", () => {
      setErrorMsg("Opponent disconnected.");
      setConnectionStatus("error");
    });
    conn.on("error", () => {
      setErrorMsg("Connection error occurred.");
      setConnectionStatus("error");
    });
  }, [initPool, startTimer]);

  const createRoom = useCallback(() => {
    setConnectionStatus("creating");
    setErrorMsg("");
    const code = generateRoomCode();

    // Destroy any existing peer
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }

    const newPeer = new Peer(code, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ]
      }
    });

    newPeer.on("open", (id) => {
      setRoomCode(id);
      setIsHost(true);
      isHostRef.current = true;
      setConnectionStatus("waiting");
    });

    newPeer.on("connection", (conn) => {
      connRef.current = conn;
      conn.on("open", () => {
        setConnectionStatus("connected");
        setGamePhase("PLAYING");
        setupConnListeners(conn);
        setTimeout(() => hostNextWord(conn), 1200);
      });
    });

    newPeer.on("error", (err: any) => {
      // If peer ID is taken, try a new code
      if (err.type === "unavailable-id") {
        newPeer.destroy();
        createRoom(); // retry with new code
      } else {
        setErrorMsg(`Error: ${err.message || err.type}`);
        setConnectionStatus("error");
      }
    });

    peerRef.current = newPeer;
  }, [setupConnListeners, hostNextWord]);

  const joinRoom = useCallback(() => {
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) { setErrorMsg("Please enter a valid room code."); return; }
    setConnectionStatus("joining");
    setErrorMsg("");
    setIsHost(false);
    isHostRef.current = false;

    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }

    const newPeer = new Peer(undefined as any, {
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ]
      }
    });

    newPeer.on("open", () => {
      const conn = newPeer.connect(code);
      connRef.current = conn;
      conn.on("open", () => {
        setConnectionStatus("connected");
        setGamePhase("PLAYING");
        // Show waiting overlay until host sends the first START_WORD
        setWaitingForWord(true);
        setupConnListeners(conn);
      });
      conn.on("error", () => {
        setErrorMsg("Could not connect. Check the room code.");
        setConnectionStatus("error");
      });
    });

    newPeer.on("error", (err: any) => {
      setErrorMsg(`Connection failed: ${err.message || err.type}`);
      setConnectionStatus("error");
    });

    peerRef.current = newPeer;
  }, [joinCode, setupConnListeners]);

  const copyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Cleanup on unmount (timer + peer only; camera effect handles its own cleanup)
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      peerRef.current?.destroy();
    };
  }, []);

  // Canvas resize — must depend on gamePhase so it runs AFTER the canvas is in the DOM
  useEffect(() => {
    if (gamePhase !== "PLAYING") return;
    if (!canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (currentWordRef.current) {
        initPool(canvas.width, canvas.height, currentWordRef.current);
      }
    };
    window.addEventListener("resize", resize);
    resize();
    return () => window.removeEventListener("resize", resize);
  }, [gamePhase, initPool]);

  // Initialize camera + hands once when the game PLAYING UI is rendered.
  // The <video> and <canvas> elements only appear in the DOM when gamePhase === "PLAYING",
  // so this effect MUST depend on gamePhase — the mount-time run always found null refs.
  useEffect(() => {
    if (gamePhase !== "PLAYING") return;
    if (cameraInitializedRef.current) return; // prevent double-init on re-renders
    if (!videoRef.current || !canvasRef.current || !containerRef.current) return;

    cameraInitializedRef.current = true;
    setLoading(true); // show "Starting Camera..." overlay until first frame arrives

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const onResults = (results: any) => {
      setLoading(false);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = containerRef.current?.clientWidth || window.innerWidth;
        canvas.height = containerRef.current?.clientHeight || window.innerHeight;
      }
      if (tiles.current.length === 0 && currentWordRef.current) {
        initPool(canvas.width, canvas.height, currentWordRef.current);
      }

      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw mirrored camera feed
      ctx.save();
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Semi-transparent overlay
      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Only run game logic if playing
      if (!isCorrectRef.current || tiles.current.some(t => t.inTray)) {
        // Hand tracking
        let handPos: Point | null = null;
        let rawPinching = false;
        let pinchDistance = 1;

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
          const landmarks = results.multiHandLandmarks[0];
          const idxTip = landmarks[8];
          const thumbTip = landmarks[4];
          const idxTipX = 1 - idxTip.x;
          const thumbTipX = 1 - thumbTip.x;
          // Cursor = index tip only (not midpoint); thumb position only used for pinch distance
          const rawX = idxTipX * canvas.width;
          const rawY = idxTip.y * canvas.height;

          // Snap on first appearance; smooth thereafter
          if (!handWasPresent.current) {
            smoothHandPos.current.x = rawX;
            smoothHandPos.current.y = rawY;
            handWasPresent.current = true;
            handSettleFrames.current = 0;
            pinchFrames.current = 0;
            pinchConfirmed.current = false;
          } else {
            smoothHandPos.current.x += (rawX - smoothHandPos.current.x) * HAND_SMOOTH;
            smoothHandPos.current.y += (rawY - smoothHandPos.current.y) * HAND_SMOOTH;
          }
          handSettleFrames.current = Math.min(handSettleFrames.current + 1, HAND_SETTLE_FRAMES + 1);
          handPos = { x: smoothHandPos.current.x, y: smoothHandPos.current.y };

          const dx = idxTipX - thumbTipX;
          const dy = idxTip.y - thumbTip.y;
          pinchDistance = Math.sqrt(dx * dx + dy * dy);
          const threshold = activeTileId.current ? PINCH_RELEASE_THRESHOLD : PINCH_GRAB_THRESHOLD;
          rawPinching = pinchDistance < threshold;

          if (window.drawConnectors && window.drawLandmarks) {
            ctx.save();
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            window.drawConnectors(ctx, landmarks, window.HAND_CONNECTIONS, { color: "rgba(130,177,255,0.6)", lineWidth: 2 });
            window.drawLandmarks(ctx, landmarks, { color: "#448aff", radius: 3 });
            ctx.restore();
          }
        } else {
          // Hand lost — reset all gesture state
          handWasPresent.current = false;
          handSettleFrames.current = 0;
          pinchFrames.current = 0;
          pinchConfirmed.current = false;
        }

        // Require N frames of pinch AND hand settled before grabbing
        const handSettled = handSettleFrames.current >= HAND_SETTLE_FRAMES;
        if (rawPinching) {
          pinchFrames.current = Math.min(pinchFrames.current + 1, GRAB_CONFIRM_FRAMES + 1);
          if (pinchFrames.current >= GRAB_CONFIRM_FRAMES) pinchConfirmed.current = true;
        } else {
          pinchFrames.current = 0;
          if (!activeTileId.current) pinchConfirmed.current = false;
        }
        const isPinching = rawPinching && (pinchConfirmed.current || !!activeTileId.current) && handSettled;

        if (handPos && isPinching && !isCorrectRef.current) {
          if (!activeTileId.current) {
            const clicked = tiles.current.find(
              t => Math.abs(t.x - handPos!.x) < TILE_SIZE * 0.75 && Math.abs(t.y - handPos!.y) < TILE_SIZE * 0.75
            );
            if (clicked) { activeTileId.current = clicked.id; clicked.isDragging = true; playSound("click"); }
          } else {
            const tile = tiles.current.find(t => t.id === activeTileId.current);
            if (tile) { tile.x = handPos.x; tile.y = handPos.y; }
          }
        } else if (activeTileId.current) {
          const tile = tiles.current.find(t => t.id === activeTileId.current);
          if (tile) {
            tile.isDragging = false;
            if (Math.abs(tile.y - TRAY_Y) < 100) {
              if (!tile.inTray) playSound("click");
              tile.inTray = true;
              const trayTiles = tiles.current.filter(t => t.inTray && t.id !== tile.id)
                .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
              tile.trayIndex = trayTiles.length;
              tile.targetY = TRAY_Y;
              const totalWidth = (trayTiles.length + 1) * TILE_SIZE * 1.1;
              const startX = (canvas.width - totalWidth) / 2 + (TILE_SIZE * 1.1) / 2;
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

        // Draw tray
        ctx.fillStyle = isCorrectRef.current ? "#c8e6c9" : "#ffffff";
        ctx.strokeStyle = isCorrectRef.current ? "#66bb6a" : "#e0e0e0";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(60, TRAY_Y - 50, canvas.width - 120, 100, 24);
        ctx.fill(); ctx.stroke();

        // Hover detection
        const hoveredTileId = handPos && !activeTileId.current
          ? (tiles.current.find(t => !t.inTray && Math.hypot(t.x - handPos!.x, t.y - handPos!.y) < TILE_SIZE * 0.85)?.id ?? null)
          : null;

        // Draw tiles
        tiles.current.forEach(t => {
          if (!t.isDragging) {
            t.x += (t.targetX - t.x) * 0.15;
            t.y += (t.targetY - t.y) * 0.15;
          }
          const isHovered = t.id === hoveredTileId;
          const isDragging = t.isDragging;
          ctx.save();
          ctx.translate(t.x, t.y);
          if (isDragging) { ctx.scale(1.28, 1.28); ctx.shadowBlur = 28; ctx.shadowColor = "rgba(66,133,244,0.35)"; }
          else if (isHovered) { ctx.scale(1.08, 1.08); ctx.shadowBlur = 22; ctx.shadowColor = "rgba(66,133,244,0.45)"; }
          else { ctx.shadowBlur = 8; ctx.shadowColor = "rgba(0,0,0,0.08)"; }
          if (isHovered || isDragging) {
            ctx.beginPath();
            ctx.roundRect(-TILE_SIZE / 2 - 4, -TILE_SIZE / 2 - 4, TILE_SIZE + 8, TILE_SIZE + 8, 18);
            ctx.strokeStyle = isDragging ? "rgba(255,64,129,0.7)" : "rgba(66,133,244,0.6)";
            ctx.lineWidth = 3; ctx.stroke();
          }
          ctx.fillStyle = COLOR_MAP[t.color];
          ctx.beginPath();
          ctx.roundRect(-TILE_SIZE / 2, -TILE_SIZE / 2, TILE_SIZE, TILE_SIZE, 14);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.4)";
          ctx.beginPath();
          ctx.roundRect(-TILE_SIZE / 2 + 4, -TILE_SIZE / 2 + 4, TILE_SIZE - 8, TILE_SIZE / 2 - 4, 10);
          ctx.fill();
          ctx.fillStyle = "#333";
          ctx.font = `bold ${TILE_SIZE * 0.55}px 'Roboto'`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(t.char, 0, 2);
          ctx.restore();
        });

        // Draw hand cursor
        if (handPos) {
          const pinchStrength = Math.max(0, Math.min(1, 1 - pinchDistance / (PINCH_GRAB_THRESHOLD * 2)));
          const isPinching = rawPinching && (pinchConfirmed.current || !!activeTileId.current);
          const outerR = 30 - pinchStrength * 12;
          ctx.beginPath();
          ctx.arc(handPos.x, handPos.y, outerR, 0, Math.PI * 2);
          ctx.strokeStyle = isPinching ? "#ff4081" : `rgba(66,133,244,${0.4 + pinchStrength * 0.5})`;
          ctx.lineWidth = isPinching ? 4 : 2.5;
          ctx.stroke();
          const innerR = 4 + pinchStrength * 8;
          ctx.beginPath();
          ctx.arc(handPos.x, handPos.y, innerR, 0, Math.PI * 2);
          ctx.fillStyle = isPinching ? "rgba(255,64,129,0.55)" : `rgba(66,133,244,${0.2 + pinchStrength * 0.4})`;
          ctx.fill();
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = isPinching ? "#ff4081" : "#4285f4";
          ctx.fillText(isPinching ? "✦ GRAB" : "PINCH", handPos.x, handPos.y + outerR + 16);
        }

        // Particles
        for (let i = particles.current.length - 1; i >= 0; i--) {
          const p = particles.current[i];
          p.x += p.vx; p.y += p.vy; p.life -= 0.025;
          if (p.life <= 0) particles.current.splice(i, 1);
          else { ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); }
        }
      }

      ctx.restore();
    };

    // Wait for MediaPipe to be ready
    const tryInit = () => {
      if (window.Hands && window.Camera) {
        let hands: any;
        if (window.__mpHandsWarm) {
          hands = window.__mpHandsWarm;
          window.__mpHandsWarm = null;
        } else {
          hands = new window.Hands({
            locateFile: (f: any) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`,
          });
        }
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        hands.onResults(onResults);
        handsRef.current = hands;

        const camW = containerRef.current?.clientWidth || 1280;
        const camH = containerRef.current?.clientHeight || 720;
        const camera = new window.Camera(video, {
          onFrame: async () => {
            if (handsRef.current && video.readyState >= 2) {
              await handsRef.current.send({ image: video });
            }
          },
          width: camW,
          height: camH,
        });
        camera.start();
        cameraRef.current = camera;
      } else {
        setTimeout(tryInit, 100);
      }
    };

    tryInit();

    return () => {
      cameraRef.current?.stop();
      handsRef.current?.close();
      cameraRef.current = null;
      handsRef.current = null;
      cameraInitializedRef.current = false;
    };
  }, [gamePhase]); // Re-run when gamePhase changes so PLAYING UI refs are populated

  const getTimerColor = () => {
    if (timeLeft > 20) return "text-green-600 border-green-300";
    if (timeLeft > 10) return "text-yellow-600 border-yellow-300";
    return "text-red-600 border-red-300 animate-pulse";
  };

  // --- LOBBY UI ---
  if (gamePhase === "LOBBY") {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-screen relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}>
        {/* Animated background orbs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-blue-600/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl" />
        </div>

        <div className="relative z-10 w-full max-w-4xl px-6">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-6 py-2 rounded-full border border-white/20 mb-6">
              <Wifi className="w-4 h-4 text-green-400" />
              <span className="text-white/80 text-sm font-bold tracking-widest uppercase">Online Battle</span>
            </div>
            <h1 className="text-6xl font-black text-white mb-3 tracking-tight">
              Network <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Multiplayer</span>
            </h1>
            <p className="text-white/50 text-lg">Challenge a friend on another device</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Host Panel */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 flex flex-col items-center gap-4">
              <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-4 rounded-2xl shadow-lg mb-2">
                <Crown className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-white">Host a Room</h2>
              <p className="text-white/50 text-sm text-center">Create a room and share the code with your friend</p>

              {connectionStatus === "idle" || connectionStatus === "error" ? (
                <button
                  onClick={createRoom}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-400 hover:to-blue-600 text-white font-black py-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-blue-500/30 text-lg"
                >
                  Create Room
                </button>
              ) : connectionStatus === "creating" ? (
                <div className="w-full py-4 flex items-center justify-center gap-3 bg-white/10 rounded-2xl text-white/60">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating code...
                </div>
              ) : (
                <>
                  <div className="w-full">
                    <p className="text-white/50 text-xs uppercase tracking-widest font-bold mb-2 text-center">Your Room Code</p>
                    <div className="bg-black/40 border border-white/20 py-5 px-6 rounded-2xl text-center relative">
                      <span className="text-4xl font-black tracking-[0.25em] text-green-400 font-mono">{roomCode}</span>
                    </div>
                    <button
                      onClick={copyCode}
                      className="w-full mt-2 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white py-2 rounded-xl transition-all text-sm font-bold"
                    >
                      <Copy className="w-4 h-4" />
                      {copied ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                  {connectionStatus === "waiting" && (
                    <div className="flex items-center gap-2 text-yellow-400 text-sm font-bold animate-pulse">
                      <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping" />
                      Waiting for opponent...
                    </div>
                  )}
                  {connectionStatus === "connected" && (
                    <div className="flex items-center gap-2 text-green-400 text-sm font-bold">
                      <Wifi className="w-4 h-4" />
                      Opponent connected! Starting...
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Join Panel */}
            <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 flex flex-col items-center gap-4">
              <div className="bg-gradient-to-br from-purple-500 to-purple-700 p-4 rounded-2xl shadow-lg mb-2">
                <ArrowRight className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-black text-white">Join a Room</h2>
              <p className="text-white/50 text-sm text-center">Enter your friend's room code to join their game</p>

              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && joinRoom()}
                placeholder="ENTER CODE"
                maxLength={8}
                className="w-full bg-black/40 border border-white/20 text-white placeholder-white/30 py-4 px-6 rounded-2xl text-center tracking-[0.25em] font-black font-mono text-2xl focus:outline-none focus:border-purple-400 transition-colors"
              />

              {connectionStatus === "joining" ? (
                <div className="w-full py-4 flex items-center justify-center gap-3 bg-white/10 rounded-2xl text-white/60">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </div>
              ) : (
                <button
                  onClick={joinRoom}
                  disabled={!joinCode.trim()}
                  className="w-full bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black py-4 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-lg shadow-purple-500/30 text-lg"
                >
                  Join Room
                </button>
              )}

              {connectionStatus === "connected" && !isHost && (
                <div className="flex items-center gap-2 text-green-400 text-sm font-bold">
                  <Wifi className="w-4 h-4" />
                  Connected! Waiting for host to start...
                </div>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="mt-6 flex items-center gap-3 bg-red-500/20 border border-red-500/40 text-red-300 px-6 py-4 rounded-2xl">
              <WifiOff className="w-5 h-5 flex-shrink-0" />
              <span className="font-bold">{errorMsg}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- GAME UI ---
  return (
    <div className="flex w-full h-screen bg-gradient-to-br from-blue-50 to-purple-50 overflow-hidden font-roboto relative">
      {/* Settings Modal */}
      {showSettings && (
        <div className="absolute inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white p-8 rounded-[38px] shadow-2xl max-w-sm w-full mx-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                <Settings className="w-6 h-6 text-blue-500" /> Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition">
                <CheckCircle2 className="w-6 h-6 text-gray-600" />
              </button>
            </div>
            <div className="space-y-6">
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Difficulty</p>
                <div className="flex gap-2">
                  {(["EASY", "MEDIUM", "HARD"] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setDifficulty(d)}
                      className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${difficulty === d ? "bg-blue-600 text-white shadow-lg scale-105" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                      {DIFFICULTY_SETTINGS[d].label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Word Category</p>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(WORD_CATEGORIES) as Category[]).map(c => (
                    <button key={c} onClick={() => setCategory(c)}
                      className={`py-2 rounded-xl text-[11px] font-black transition-all uppercase tracking-wide ${category === c ? "bg-purple-600 text-white shadow-lg" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Sound</p>
                <button onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`w-full py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition-all ${soundEnabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  {soundEnabled ? "Sound On" : "Sound Off"}
                </button>
              </div>
            </div>
            <div className="mt-8 text-center text-xs text-gray-400 font-medium">
              Settings changes apply to the next word.
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="flex-1 relative h-full overflow-hidden">
        <video ref={videoRef} className="absolute opacity-0 pointer-events-none" playsInline muted width="640" height="480" />
        <canvas ref={canvasRef} className="absolute inset-0 block w-full h-full" />

        {/* Header */}
        <div className="absolute top-6 left-6 z-40 flex items-center gap-4">
          <div className="bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border border-blue-100 flex items-center gap-4">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-3 rounded-2xl shadow-md">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black text-gray-800 tracking-tight">Network Battle</h1>
              <p className="text-[11px] text-blue-600 font-bold flex items-center gap-1 uppercase tracking-wider">
                <MousePointer2 className="w-3 h-3" /> Pinch to spell!
              </p>
            </div>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            className="bg-white/95 p-3 rounded-full shadow-lg hover:shadow-xl transition-all group border border-gray-100 active:scale-95">
            <Settings className={`w-6 h-6 text-gray-600 transition-transform duration-700 ${showSettings ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Opponent UI */}
        <div className="absolute bottom-6 right-6 z-40 bg-gray-900/80 backdrop-blur-md p-4 rounded-3xl border border-gray-700 shadow-2xl flex flex-col items-end">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Opponent Score</p>
          <p className="text-2xl font-black text-white mb-4">{oppScore}</p>
          <div className="bg-gray-800 px-6 py-3 rounded-2xl border border-gray-600 relative">
            <p className="text-[10px] text-gray-500 absolute -top-4 right-2 font-bold uppercase">Spelling</p>
            <p className="text-xl font-black tracking-widest text-white uppercase">{oppTrayWord || "..."}</p>
          </div>
        </div>

        {/* Score & Timer */}
        <div className="absolute top-6 right-6 z-40 flex flex-col items-end gap-3">
          <div className="flex gap-3">
            <div className="bg-yellow-100/90 backdrop-blur-md px-4 py-2 rounded-[20px] shadow-lg border border-yellow-200 flex items-center gap-2">
              <Crown className="w-4 h-4 text-yellow-600" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] uppercase font-bold text-yellow-600 leading-none">Best</span>
                <span className="text-sm font-black text-yellow-700 leading-none">{highScore}</span>
              </div>
            </div>
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border border-purple-100 flex items-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-500" />
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">Score</p>
                <p className="text-2xl font-black text-gray-800">{score}</p>
              </div>
            </div>
          </div>
          {!isCorrect && (
            <div className={`bg-white/95 backdrop-blur-md p-4 rounded-[28px] shadow-xl border-2 flex items-center gap-3 transition-colors duration-500 ${getTimerColor()}`}>
              <Clock className="w-6 h-6" />
              <div>
                <p className="text-xs uppercase tracking-wider font-medium opacity-80">Time</p>
                <p className="text-2xl font-black font-mono">{timeLeft}s</p>
              </div>
            </div>
          )}
        </div>

        {/* Target Word */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40">
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-12 py-6 rounded-[32px] shadow-2xl border-4 border-white relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-white/20 px-3 py-1 rounded-bl-xl text-[10px] font-black text-white/90 uppercase tracking-widest">
              {category} • {DIFFICULTY_SETTINGS[difficulty].label}
            </div>
            <p className="text-xs text-white/80 uppercase tracking-widest font-bold mb-2 text-center mt-2">Spell this word:</p>
            <p className="text-5xl font-black tracking-[0.3em] text-white uppercase text-center drop-shadow-lg">{currentWord}</p>
          </div>
        </div>

        {/* Tray Word */}
        {trayWord && (
          <div className="absolute top-28 left-1/2 -translate-x-1/2 z-40">
            <div className={`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 ${isCorrect ? "bg-green-50 border-green-300 scale-105" : "bg-white border-blue-200"}`}>
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">{trayWord}</span>
              {isCorrect && <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />}
            </div>
          </div>
        )}

        {/* Success */}
        {isCorrect && (
          <div className="absolute top-44 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-4">
            <div className="bg-green-500 text-white px-8 py-4 rounded-full shadow-xl flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-full">
                <Star className="w-5 h-5 text-yellow-300 fill-current" />
              </div>
              <span className="text-xl font-black">
                Perfect! +{Math.floor(currentWord.length * 10 * DIFFICULTY_SETTINGS[difficulty].multiplier) + Math.floor(timeLeft * DIFFICULTY_SETTINGS[difficulty].multiplier)} pts
              </span>
            </div>
            {isHost && (
              <button onClick={() => hostNextWord()}
                className="bg-white hover:bg-gray-50 text-gray-800 font-bold px-8 py-4 rounded-full shadow-xl flex items-center gap-3 transition-all hover:scale-105 active:scale-95 border-2 border-gray-200">
                <span className="text-lg">Next Word</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            )}
            {!isHost && (
              <div className="bg-white/80 text-gray-600 px-6 py-3 rounded-full text-sm font-bold border border-gray-200">
                Waiting for host to continue...
              </div>
            )}
          </div>
        )}

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 z-50">
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-gray-100 border-t-blue-600 rounded-full animate-spin" />
                <Sparkles className="absolute -top-2 -right-2 text-purple-500 animate-pulse" />
              </div>
              <p className="mt-8 text-xl font-bold text-gray-600 tracking-tight">Starting Camera...</p>
              <p className="mt-2 text-sm text-gray-400">Allow camera access when prompted</p>
            </div>
          </div>
        )}

        {/* Waiting-for-host overlay (joiner only) */}
        {waitingForWord && (
          <div className="absolute inset-0 flex items-center justify-center z-50"
            style={{ background: "linear-gradient(135deg, rgba(15,12,41,0.96), rgba(48,43,99,0.96), rgba(36,36,62,0.96))" }}>
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Wifi className="w-8 h-8 text-purple-400 animate-pulse" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-white mb-2">Connected!</p>
                <p className="text-white/60 font-semibold">Waiting for host to start the game...</p>
              </div>
              <div className="flex gap-2">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
