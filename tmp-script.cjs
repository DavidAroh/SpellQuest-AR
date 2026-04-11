const fs = require('fs');
const file = './components/MultiplayerAdventure.tsx';
let src = fs.readFileSync(file, 'utf8');

// Rename component
src = src.replace('const SpellingAdventure: React.FC = () => {', 'export const MultiplayerAdventure: React.FC = () => {');
src = src.replace('export default SpellingAdventure;', '');

// Add P2 states
src = src.replace(
  'const [trayWord, setTrayWord] = useState("");\n  const [isCorrect, setIsCorrect] = useState(false);\n  const [score, setScore] = useState(0);',
  `const [trayWord, setTrayWord] = useState("");
  const [trayWord2, setTrayWord2] = useState("");
  const [isCorrect, setIsCorrect] = useState(false);
  const [isCorrect2, setIsCorrect2] = useState(false);
  const [score, setScore] = useState(0);
  const [score2, setScore2] = useState(0);`
);

// High score persistence is not needed for multi
src = src.replace(/\/\/ Load High Score[\s\S]*?\/\/ Sound Generation/, '// Sound Generation');

// Hand state references for 2 players
src = src.replace(
  'const activeTileId = useRef<string | null>(null);\n  // Gesture smoothing & confirmation\n  const smoothHandPos = useRef<Point>({ x: 0, y: 0 });\n  const pinchFrames = useRef<number>(0); // consecutive frames where pinch is detected\n  const pinchConfirmed = useRef<boolean>(false);',
  `const activeTileId = useRef<Record<number, string | null>>({0: null, 1: null});
  // Gesture smoothing & confirmation
  const smoothHandPos = useRef<Record<number, Point>>({0: { x: 0, y: 0 }, 1: { x: 0, y: 0 }});
  const pinchFrames = useRef<Record<number, number>>({0: 0, 1: 0});
  const pinchConfirmed = useRef<Record<number, boolean>>({0: false, 1: false});`
);

// Double word logic, inside initPool
src = src.replace(
  'const baseCount = 1; // A-Z has exactly one of each letter\n        const extras = count - baseCount;',
  `const baseCount = 1; // A-Z has exactly one of each letter
        const extras = count * 2 - baseCount; // 2 players`
);

// Update max hands check
src = src.replace(
  'maxNumHands: 1,',
  'maxNumHands: 2,'
);

// P1 vs P2 in onResults logic
// The previous logic has: 
// if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
//   const landmarks = results.multiHandLandmarks[0]; ...
// We need to rewrite onResults from "let handPos..." to "ctx.restore();"

const regexOnResults = /let handPos: Point \| null = null;[\s\S]*?\/\/ --- Render tiles ---/;
const newHandLogic = `
      let handPosMap: Record<number, Point> = {};
      let isPinchingMap: Record<number, boolean> = {};

      const activeHands = new Set<number>();
      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const rawHands = results.multiHandLandmarks;
        const handsWithCenters = rawHands.map((landmarks: any) => {
           const idxTipX = 1 - landmarks[8].x;
           const thumbTipX = 1 - landmarks[4].x;
           const rawX = (idxTipX * canvas.width + thumbTipX * canvas.width) / 2;
           return { landmarks, rawX, idxTipX, thumbTipX, idxTipY: landmarks[8].y, thumbTipY: landmarks[4].y };
        });
        
        handsWithCenters.sort((a: any, b: any) => a.rawX - b.rawX); // Left hand (P1) is 0, Right hand (P2) is 1.

        handsWithCenters.forEach((h: any) => {
          let p = h.rawX > canvas.width / 2 ? 1 : 0;
          activeHands.add(p);
          
          const rawY = (h.idxTipY * canvas.height + h.thumbTipY * canvas.height) / 2;

          smoothHandPos.current[p].x += (h.rawX - smoothHandPos.current[p].x) * HAND_SMOOTH;
          smoothHandPos.current[p].y += (rawY - smoothHandPos.current[p].y) * HAND_SMOOTH;
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
          isPinchingMap[p] = rawPinching && (pinchConfirmed.current[p] || !!activeTileId.current[p]);
        });
      }

      [0, 1].forEach((p) => {
        if (!activeHands.has(p)) {
          pinchFrames.current[p] = 0;
          if (!activeTileId.current[p]) pinchConfirmed.current[p] = false;
        }

        const handPos = handPosMap[p];
        const isPinching = isPinchingMap[p];
        const trayCenter = p === 0 ? canvas.width * 0.25 : canvas.width * 0.75;
        const trayIsCorrect = p === 0 ? isCorrect : isCorrect2;

        if (handPos && isPinching && !trayIsCorrect) {
          if (!activeTileId.current[p]) {
            // make sure no other player is grabbing this
            const clicked = tiles.current.find(t => 
              Math.abs(t.x - handPos.x) < TILE_SIZE / 2 && 
              Math.abs(t.y - handPos.y) < TILE_SIZE / 2 &&
              !Object.values(activeTileId.current).includes(t.id)
            );
            if (clicked) {
              activeTileId.current[p] = clicked.id;
              clicked.isDragging = true;
              playSound("click");
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
              if (tile.trayOwner !== p) playSound("click");
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
          updateTray(p);
        }
      });
      
      [0, 1].forEach((p) => {
         const trayCenter = p === 0 ? canvas.width * 0.25 : canvas.width * 0.75;
         const trayIsCorrect = p === 0 ? isCorrect : isCorrect2;
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

      // --- Render tiles ---`;

src = src.replace(regexOnResults, newHandLogic);

// Replace `updateTrayWord()` with a parameterized `updateTray(playerIndex)`
const regexUpdateTray = /const updateTrayWord = \(\) => \{[\s\S]*? \/\/ startTimer/;
const newUpdateTray = `const updateTray = (p: number) => {
    const inTray = tiles.current
      .filter((t) => t.trayOwner === p)
      .sort((a, b) => (a.trayIndex || 0) - (b.trayIndex || 0));
    const word = inTray.map((t) => t.char).join("");
    if (p===0) setTrayWord(word); else setTrayWord2(word);

    if (word === currentWord && word.length > 0) {
      playSound("success");
      if (p===0) setIsCorrect(true); else setIsCorrect2(true);
      const diffConfig = DIFFICULTY_SETTINGS[difficulty];
      const timeBonus = Math.floor(timeLeft * diffConfig.multiplier);
      const points = Math.floor(word.length * 10 * diffConfig.multiplier) + timeBonus;
      if (p===0) setScore(v=>v+points); else setScore2(v=>v+points);

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      tiles.current.forEach((t) => {
        if (t.trayOwner === p) createSparkles(t.x, t.y, COLOR_MAP[t.color]);
      });
    } else {
      if (p===0) setIsCorrect(false); else setIsCorrect2(false);
    }
  };
  
  const startTimer`;
src = src.replace(regexUpdateTray, newUpdateTray);

// We need to fix UI: render Both Trays
// Original code for trays:
const uiCurrentTray = /\{\/\* User's Spelled Word \*\/\}[\s\S]*?\{\/\* Success Message & Next Button \*\/\}/;
// Note: we'll render both traywords.

const newUiTray = `
        {/* User 1 Spelled Word */}
        {trayWord && (
          <div className="absolute top-28 left-1/4 -translate-x-1/2 z-40">
            <div className={\`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 \${isCorrect ? "bg-green-50 border-green-300 scale-105" : "bg-white border-blue-200"}\`}>
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">{trayWord}</span>
              {isCorrect && <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />}
            </div>
          </div>
        )}
        {/* User 2 Spelled Word */}
        {trayWord2 && (
          <div className="absolute top-28" style={{ left: '75%', transform: 'translateX(-50%)', zIndex: 40}}>
            <div className={\`px-10 py-4 rounded-[30px] shadow-2xl flex items-center gap-4 border-2 transition-all duration-500 \${isCorrect2 ? "bg-green-50 border-green-300 scale-105" : "bg-white border-red-200"}\`}>
              <span className="text-4xl font-black tracking-[0.2em] text-gray-900 uppercase">{trayWord2}</span>
              {isCorrect2 && <CheckCircle2 className="w-7 h-7 text-green-500 animate-bounce" />}
            </div>
          </div>
        )}

        {/* Success Message & Next Button */}
`;
src = src.replace(uiCurrentTray, newUiTray);

// Also we need to fix the UI for Score cards (add P2) and Success buttons:
// Success message: shows if *either* is correct.
src = src.replace(
  '{isCorrect && (', 
  '{(isCorrect || isCorrect2) && ('
);
// "Perfect!" + pts
src = src.replace(
  'Perfect! +',
  '{isCorrect ? "Blue Wins! P1: " : "Red Wins! P2: "} +'
);

fs.writeFileSync(file, src);
