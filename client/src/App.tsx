import { useEffect, useRef } from 'react';
import { useSwarm } from './store';
import { connectSwarmSocket } from './ws';
import { startDemoSimulator, type DemoHandle } from './demoSimulator';
import FileTree from './components/FileTree';
import CodeEditor from './components/CodeEditor';
import StatusBar from './components/StatusBar';
import SwarmPanel from './components/SwarmPanel/SwarmPanel';
import LiveSwarmScreen from './components/LiveSwarmScreen';

export default function App() {
  const applyServerEvent = useSwarm((s) => s.applyServerEvent);
  const setConnected = useSwarm((s) => s.setConnected);
  const registerSender = useSwarm((s) => s.registerSender);
  const viewMode = useSwarm((s) => s.viewMode);
  const setViewMode = useSwarm((s) => s.setViewMode);
  const demoRef = useRef<DemoHandle | null>(null);

  useEffect(() => {
    const socket = connectSwarmSocket(applyServerEvent, (connected) => {
      setConnected(connected);
      if (connected) {
        if (demoRef.current) {
          demoRef.current.stop();
          demoRef.current = null;
        }
        registerSender(socket.send);
      }
    });
    registerSender(socket.send);

    // Se o server não responder em 2.5s, liga o simulador local (demo standalone).
    const fallback = setTimeout(() => {
      if (!useSwarm.getState().connected && !demoRef.current) {
        const demo = startDemoSimulator();
        demoRef.current = demo;
        registerSender(demo.send);
      }
    }, 2500);

    return () => {
      clearTimeout(fallback);
      socket.close();
      demoRef.current?.stop();
      demoRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full w-full flex-col bg-neutral-950 text-neutral-200">
      <header className="flex h-10 shrink-0 items-center gap-3 border-b border-neutral-800 px-4">
        <span className="text-sm font-semibold tracking-wide text-neutral-100">
          Swarm IDE <span className="text-neutral-500">// MVP</span>
        </span>
        <ConnectionDot />

        <div className="ml-auto flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900 p-0.5 text-xs">
          <button
            onClick={() => setViewMode('live')}
            className={`rounded px-2.5 py-1 font-medium transition-colors ${
              viewMode === 'live'
                ? 'bg-green-600/20 text-green-400 ring-1 ring-green-500/40'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Tela Única
          </button>
          <button
            onClick={() => setViewMode('ide')}
            className={`rounded px-2.5 py-1 font-medium transition-colors ${
              viewMode === 'ide'
                ? 'bg-neutral-800 text-neutral-100 ring-1 ring-neutral-700'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            IDE + Enxame
          </button>
        </div>
      </header>

      {viewMode === 'live' ? (
        <LiveSwarmScreen />
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-60 shrink-0 border-r border-neutral-800 bg-neutral-925">
            <FileTree />
          </aside>
          <main className="min-w-0 flex-1">
            <CodeEditor />
          </main>
          <aside className="w-[430px] shrink-0 border-l border-neutral-800">
            <SwarmPanel />
          </aside>
        </div>
      )}

      <StatusBar />
    </div>
  );
}

function ConnectionDot() {
  const connected = useSwarm((s) => s.connected);
  return (
    <span className="flex items-center gap-1.5 text-xs text-neutral-400">
      <span
        className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-amber-500 animate-pulse'}`}
      />
      {connected ? 'orquestrador online' : 'modo demo (offline)'}
    </span>
  );
}
