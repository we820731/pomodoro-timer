import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, Coffee, Brain, ChevronUp, ChevronDown, Volume2, VolumeX, CloudRain } from 'lucide-react';

function playAlarm() {
  const ctx = new AudioContext();
  const now = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.3, now + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.18);
    osc.stop(now + i * 0.18 + 0.35);
  });
}

type Mode = 'focus' | 'break' | 'longBreak';

interface SessionRecord {
  id: string;
  mode: Mode;
  duration: number;
  completedAt: string;
}

const MODES: Record<Mode, { label: string; minutes: number; color: string; bg: string; ring: string }> = {
  focus: { label: 'Focus', minutes: 25, color: 'text-rose-500', bg: 'bg-rose-500', ring: 'stroke-rose-500' },
  break: { label: 'Short Break', minutes: 5, color: 'text-emerald-500', bg: 'bg-emerald-500', ring: 'stroke-emerald-500' },
  longBreak: { label: 'Long Break', minutes: 15, color: 'text-sky-500', bg: 'bg-sky-500', ring: 'stroke-sky-500' },
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function loadSessions(): SessionRecord[] {
  try {
    const raw = localStorage.getItem('pomodoro-sessions');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions(records: SessionRecord[]) {
  localStorage.setItem('pomodoro-sessions', JSON.stringify(records));
}

function loadDurations(): Record<Mode, number> {
  try {
    const raw = localStorage.getItem('pomodoro-durations');
    return raw ? JSON.parse(raw) : { focus: 25, break: 5, longBreak: 15 };
  } catch {
    return { focus: 25, break: 5, longBreak: 15 };
  }
}

function saveDurations(d: Record<Mode, number>) {
  localStorage.setItem('pomodoro-durations', JSON.stringify(d));
}

function useWhiteNoise() {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const start = useCallback(() => {
    if (sourceRef.current) return;
    const ctx = new AudioContext();
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.value = 0.08;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start();

    ctxRef.current = ctx;
    sourceRef.current = source;
    gainRef.current = gain;
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    gainRef.current = null;
  }, []);

  const setVolume = useCallback((v: number) => {
    if (gainRef.current) gainRef.current.gain.value = v;
  }, []);

  return { start, stop, setVolume };
}

function App() {
  const [mode, setMode] = useState<Mode>('focus');
  const [durations, setDurations] = useState(loadDurations);
  const [timeLeft, setTimeLeft] = useState(durations.focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [sessions, setSessions] = useState(() => loadSessions().length);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [whiteNoise, setWhiteNoise] = useState(false);
  const [records, setRecords] = useState<SessionRecord[]>(loadSessions);
  const [showHistory, setShowHistory] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const noise = useWhiteNoise();

  const totalSeconds = durations[mode] * 60;
  const progress = (totalSeconds - timeLeft) / totalSeconds;
  const circumference = 2 * Math.PI * 120;
  const strokeDashoffset = circumference * (1 - progress);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const addRecord = useCallback((completedMode: Mode, duration: number) => {
    const record: SessionRecord = {
      id: crypto.randomUUID(),
      mode: completedMode,
      duration,
      completedAt: new Date().toISOString(),
    };
    setRecords(prev => {
      const next = [record, ...prev].slice(0, 100);
      saveSessions(next);
      return next;
    });
  }, []);

  const switchMode = useCallback((newMode: Mode) => {
    clearTimer();
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(durations[newMode] * 60);
  }, [clearTimer, durations]);

  const reset = useCallback(() => {
    clearTimer();
    setIsRunning(false);
    setTimeLeft(durations[mode] * 60);
  }, [clearTimer, durations, mode]);

  const adjustDuration = useCallback((target: Mode, delta: number) => {
    setDurations(prev => {
      const next = { ...prev, [target]: Math.max(1, Math.min(60, prev[target] + delta)) };
      saveDurations(next);
      if (target === mode) {
        setTimeLeft(next[target] * 60);
        setIsRunning(false);
        clearTimer();
      }
      return next;
    });
  }, [mode, clearTimer]);

  useEffect(() => {
    if (whiteNoise && mode === 'focus') {
      noise.start();
    } else {
      noise.stop();
    }
    return () => noise.stop();
  }, [whiteNoise, mode, noise]);

  useEffect(() => {
    if (!isRunning) {
      clearTimer();
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearTimer();
          setIsRunning(false);
          addRecord(mode, durations[mode]);
          setSessions(s => s + 1);
          if (soundEnabled) playAlarm();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return clearTimer;
  }, [isRunning, mode, durations, clearTimer, addRecord, soundEnabled]);

  useEffect(() => {
    if (timeLeft === 0 && !isRunning) {
      const nextMode: Mode = mode === 'focus'
        ? (sessions > 0 && sessions % 4 === 0 ? 'longBreak' : 'break')
        : 'focus';
      const timeout = setTimeout(() => switchMode(nextMode), 1500);
      return () => clearTimeout(timeout);
    }
  }, [timeLeft, isRunning, mode, sessions, switchMode]);

  const current = MODES[mode];

  const todayRecords = records.filter(r => {
    const d = new Date(r.completedAt);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
  });

  const todayFocusMinutes = todayRecords
    .filter(r => r.mode === 'focus')
    .reduce((sum, r) => sum + r.duration, 0);

  return (
    <div className={`min-h-screen transition-colors duration-700 flex flex-col items-center justify-center px-4 py-8 ${
      mode === 'focus' ? 'bg-rose-50' : mode === 'break' ? 'bg-emerald-50' : 'bg-sky-50'
    }`}>
      {/* Mode Tabs */}
      <div className="flex gap-2 mb-10">
        {(['focus', 'break', 'longBreak'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => switchMode(m)}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              mode === m
                ? `${MODES[m].bg} text-white shadow-lg scale-105`
                : 'bg-white/60 text-gray-600 hover:bg-white/80'
            }`}
          >
            {MODES[m].label}
          </button>
        ))}
      </div>

      {/* Timer Ring */}
      <div className="relative w-72 h-72 mb-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 256 256">
          <circle
            cx="128" cy="128" r="120"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            className="text-gray-200"
          />
          <circle
            cx="128" cy="128" r="120"
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            className={current.ring}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-6xl font-light tracking-wider tabular-nums ${current.color} transition-colors duration-700`}>
            {formatTime(timeLeft)}
          </span>
          <span className="text-sm text-gray-400 mt-2 font-medium uppercase tracking-widest">
            {current.label}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-6 mb-6">
        <button
          onClick={reset}
          className="w-12 h-12 rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
          aria-label="Reset"
        >
          <RotateCcw size={20} />
        </button>
        <button
          onClick={() => setIsRunning(!isRunning)}
          className={`w-20 h-20 rounded-full ${current.bg} hover:opacity-90 text-white flex items-center justify-center transition-all duration-200 shadow-lg hover:shadow-xl active:scale-95`}
          aria-label={isRunning ? 'Pause' : 'Start'}
        >
          {isRunning ? <Pause size={32} /> : <Play size={32} className="ml-1" />}
        </button>
        <button
          onClick={() => {
            const next: Mode = mode === 'focus' ? 'break' : 'focus';
            switchMode(next);
          }}
          className="w-12 h-12 rounded-full bg-white/70 hover:bg-white text-gray-500 hover:text-gray-700 flex items-center justify-center transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
          aria-label="Skip"
        >
          {mode === 'focus' ? <Coffee size={20} /> : <Brain size={20} />}
        </button>
      </div>

      {/* Sound & White Noise Toggles */}
      <div className="flex gap-3 mb-8">
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
            soundEnabled
              ? 'bg-white/70 text-gray-600 hover:bg-white'
              : 'bg-white/40 text-gray-400 hover:bg-white/60'
          }`}
          aria-label={soundEnabled ? 'Mute' : 'Unmute'}
        >
          {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          {soundEnabled ? 'Sound On' : 'Sound Off'}
        </button>
        {mode === 'focus' && (
          <button
            onClick={() => setWhiteNoise(!whiteNoise)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
              whiteNoise
                ? 'bg-rose-100 text-rose-600 hover:bg-rose-200'
                : 'bg-white/40 text-gray-400 hover:bg-white/60'
            }`}
            aria-label={whiteNoise ? 'Stop white noise' : 'Start white noise'}
          >
            <CloudRain size={16} />
            {whiteNoise ? 'Noise On' : 'Noise Off'}
          </button>
        )}
      </div>

      {/* Duration Adjusters */}
      <div className="flex gap-8 mb-8">
        {(['focus', 'break', 'longBreak'] as Mode[]).map(m => (
          <div key={m} className="flex flex-col items-center gap-1">
            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">{MODES[m].label}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => adjustDuration(m, -1)}
                className="w-7 h-7 rounded-full bg-white/70 hover:bg-white text-gray-500 flex items-center justify-center transition-all active:scale-90"
              >
                <ChevronDown size={14} />
              </button>
              <span className="w-8 text-center text-sm font-semibold text-gray-700 tabular-nums">{durations[m]}</span>
              <button
                onClick={() => adjustDuration(m, 1)}
                className="w-7 h-7 rounded-full bg-white/70 hover:bg-white text-gray-500 flex items-center justify-center transition-all active:scale-90"
              >
                <ChevronUp size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Session Counter */}
      <div className="flex items-center gap-2 text-gray-400 mb-4">
        <span className="text-sm">Sessions completed:</span>
        <div className="flex gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                i < (sessions % 4) ? `${current.bg} scale-110` : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <span className="text-sm font-semibold text-gray-600">{sessions}</span>
      </div>

      {/* Today's Stats */}
      <div className="text-sm text-gray-400 mb-4">
        Today: <span className="font-semibold text-gray-600">{todayRecords.length}</span> sessions,
        <span className="font-semibold text-gray-600"> {todayFocusMinutes}</span> min focused
      </div>

      {/* History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="text-sm text-gray-400 hover:text-gray-600 transition-colors underline underline-offset-2 mb-4"
      >
        {showHistory ? 'Hide History' : 'Show History'}
      </button>

      {/* History List */}
      {showHistory && (
        <div className="w-full max-w-md bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm p-4 max-h-60 overflow-y-auto">
          {records.length === 0 ? (
            <p className="text-center text-gray-400 text-sm">No sessions yet</p>
          ) : (
            <ul className="space-y-2">
              {records.map(r => (
                <li key={r.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${MODES[r.mode].bg}`} />
                    <span className="text-gray-600">{MODES[r.mode].label}</span>
                    <span className="text-gray-400">{r.duration} min</span>
                  </div>
                  <span className="text-gray-400">
                    {new Date(r.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
