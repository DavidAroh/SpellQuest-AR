const fs = require('fs');
const path = './components/NetworkMultiplayer.tsx';
let src = fs.readFileSync(path, 'utf8');

// Imports
src = src.replace("import React, { useEffect, useRef, useState, useCallback } from \"react\";", 
`import React, { useEffect, useRef, useState, useCallback } from "react";
import Peer, { DataConnection } from "peerjs";`);

// Rename Component
src = src.replace("const SpellingAdventure: React.FC = () => {", "export const NetworkMultiplayer: React.FC = () => {");
src = src.replace("export default SpellingAdventure;", "");

// Add Networking state and Lobby UI
const stateInjection = `const [peer, setPeer] = useState<Peer | null>(null);
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const [peerId, setPeerId] = useState("");
  const [joinId, setJoinId] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [gamePhase, setGamePhase] = useState<"LOBBY" | "PLAYING">("LOBBY");
  const [oppScore, setOppScore] = useState(0);
  const [oppTrayWord, setOppTrayWord] = useState("");
  const connRef = useRef<DataConnection | null>(null);

  useEffect(() => {
    connRef.current = connection;
  }, [connection]);

  // Peer initialization 
  const initPeer = () => {
    const newPeer = new Peer();
    newPeer.on('open', (id) => {
      setPeerId(id);
      setIsHost(true);
    });
    newPeer.on('connection', (conn) => {
      conn.on('open', () => {
        setConnection(conn);
        connRef.current = conn;
        setGamePhase("PLAYING");
        // Host triggers start
        setTimeout(() => hostNextWord(conn), 1000);
      });
      setupConnListeners(conn);
    });
    setPeer(newPeer);
  };

  const joinGame = () => {
    if (!joinId) return;
    const newPeer = new Peer();
    newPeer.on('open', () => {
      const conn = newPeer.connect(joinId);
      conn.on('open', () => {
        setConnection(conn);
        connRef.current = conn;
        setGamePhase("PLAYING");
      });
      setupConnListeners(conn);
    });
    setPeer(newPeer);
    setIsHost(false);
  };

  const setupConnListeners = (conn: DataConnection) => {
    conn.on('data', (data: any) => {
      if (data.type === 'START_WORD') {
        setCurrentWord(data.word);
        setTrayWord("");
        setIsCorrect(false);
        setWordsCompleted(prev => prev + 1);
        if (containerRef.current) {
          initPool(containerRef.current.clientWidth, containerRef.current.clientHeight, data.word);
        }
        startTimer(data.difficulty);
      } else if (data.type === 'UPDATE_TRAY') {
        setOppTrayWord(data.word);
      } else if (data.type === 'OPPONENT_SCORE') {
        setOppScore(data.score);
      }
    });
  };

  const hostNextWord = (activeConn?: DataConnection) => {
    const c = activeConn || connRef.current;
    if (!c) return;
    const wordList = WORD_CATEGORIES[category][difficulty];
    const nextWordText = wordList[Math.floor(Math.random() * wordList.length)];
    
    // Broadcast word
    c.send({ type: 'START_WORD', word: nextWordText, difficulty: difficulty });
    
    setCurrentWord(nextWordText);
    setTrayWord("");
    setIsCorrect(false);
    setWordsCompleted(prev => prev + 1);
    if (containerRef.current) {
      initPool(containerRef.current.clientWidth, containerRef.current.clientHeight, nextWordText);
    }
    startTimer(difficulty);
  };
`;

src = src.replace('const [loading, setLoading] = useState(true);', 'const [loading, setLoading] = useState(false);\n  ' + stateInjection);

// Replace existing nextWord to block if playing network multi (host controls it)
src = src.replace(
`  const nextWord = useCallback(() => {
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
  }, [category, difficulty, initPool, startTimer]);`,
`  const nextWord = useCallback(() => {
    // Only host triggers next word in network mode
    if (isHost && connRef.current) {
      hostNextWord();
    }
  }, [category, difficulty, initPool, isHost]);`
);


// Rewrite the tray word logic to sync it over Network
src = src.replace(
`    const word = inTray.map((t) => t.char).join("");
    setTrayWord(word);`,
`    const word = inTray.map((t) => t.char).join("");
    setTrayWord(word);
    if (connRef.current) connRef.current.send({ type: "UPDATE_TRAY", word });`);

src = src.replace(
`      setScore(
        (prev) =>
          prev +
          Math.floor(word.length * 10 * diffConfig.multiplier) +
          timeBonus,
      );`,
`      setScore((prev) => {
        const newScore = prev + Math.floor(word.length * 10 * diffConfig.multiplier) + timeBonus;
        if (connRef.current) connRef.current.send({ type: "OPPONENT_SCORE", score: newScore });
        return newScore;
      });`
);

// startTimer rewrite to accept difficulty explicitly from host if guest
src = src.replace(
`  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    const limit = DIFFICULTY_SETTINGS[difficulty].time;`,
`  const startTimer = useCallback((forceDifficulty?: string) => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    const d = (forceDifficulty as Difficulty) || difficulty;
    const limit = DIFFICULTY_SETTINGS[d].time;`
);

// We should skip \`nextWord\` on initial mount for guests
src = src.replace(
`  useEffect(() => {
    // Only reset if we are just starting or settings changed mid-game
    // Ideally we might want a "New Game" button inside settings, but auto-restart is fine
    nextWord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, difficulty]);`,
`  useEffect(() => {
    if (gamePhase === "PLAYING" && isHost) nextWord();
  }, [category, difficulty]);`
);

// Lobby screen wrapper wrapping the main game content
const lobbyUI = `
  if (gamePhase === "LOBBY") {
    return (
      <div className="flex flex-col items-center justify-center w-full min-h-screen bg-gray-900 text-white font-sans p-8">
        <h1 className="text-4xl font-black mb-8 text-blue-400">Network Multiplayer</h1>
        
        <div className="grid grid-cols-2 gap-12 w-full max-w-4xl">
          <div className="bg-gray-800 p-8 rounded-2xl flex flex-col items-center">
            <h2 className="text-2xl font-bold mb-4">Host Game</h2>
            <button onClick={initPeer} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-xl font-bold w-full mb-4 transition">
              Create Room
            </button>
            {peerId && (
              <div className="text-center">
                <p className="text-gray-400 mb-2">Your Room Code:</p>
                <div className="bg-black py-4 px-6 rounded-lg text-green-400 font-mono text-2xl tracking-widest selection:bg-gray-600 mb-2">
                  {peerId}
                </div>
                <p className="text-xs text-yellow-500 animate-pulse">Waiting for opponent to join...</p>
              </div>
            )}
          </div>
          
          <div className="bg-gray-800 p-8 rounded-2xl flex flex-col items-center">
            <h2 className="text-2xl font-bold mb-4">Join Game</h2>
            <input 
              value={joinId} 
              onChange={e => setJoinId(e.target.value)} 
              placeholder="Enter Room Code" 
              className="bg-gray-900 border border-gray-700 text-white w-full px-4 py-3 rounded-xl mb-4 text-center tracking-widest font-mono"
            />
            <button onClick={joinGame} className="bg-purple-600 hover:bg-purple-500 px-6 py-3 rounded-xl font-bold w-full transition">
              Join Room
            </button>
          </div>
        </div>
      </div>
    );
  }
`;

src = src.replace('return (\n    <div className="flex w-full h-screen', lobbyUI + '\n  return (\n    <div className="flex w-full h-screen');

// Add "Opponent" score and progress UI to top right of gameplay
const oppUI = `
        {/* Opponent UI Overlay */}
        <div className="absolute bottom-6 right-6 z-40 bg-gray-900/80 backdrop-blur-md p-4 rounded-3xl border border-gray-700 shadow-2xl flex flex-col items-end">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Opponent Score</p>
          <p className="text-2xl font-black text-white mb-4">{oppScore}</p>
          <div className="bg-gray-800 px-6 py-3 rounded-2xl border border-gray-600 relative">
             <p className="text-[10px] text-gray-500 absolute -top-4 right-2 font-bold uppercase">Spelling</p>
             <p className="text-xl font-black tracking-widest text-white uppercase">{oppTrayWord || "..."}</p>
          </div>
        </div>
`;
src = src.replace('        {/* Score & Timer & High Score */}', oppUI + '\n        {/* Score & Timer & High Score */}');

fs.writeFileSync(path, src);
