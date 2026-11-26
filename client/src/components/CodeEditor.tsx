import { useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useSwarm } from '../store';

function languageOf(path: string): string {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.html')) return 'html';
  return 'plaintext';
}

export default function CodeEditor() {
  const openFile = useSwarm((s) => s.openFile);
  const indicators = useSwarm((s) => s.indicators);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  // Badges/decorações em tempo real: quando um agente edita o arquivo aberto,
  // a linha 1 recebe glyph pulsante + destaque + hover com o nome do agente.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !openFile) return;

    const active = indicators.filter((i) => i.path === openFile.path);
    const decorations = active.map((ind) => ({
      range: new monaco.Range(1, 1, 1, 1),
      options: {
        isWholeLine: true,
        className: 'agent-editing-line',
        glyphMarginClassName: 'agent-editing-glyph',
        glyphMarginHoverMessage: { value: `✏️ editando agora: @${ind.agentId}` },
        overviewRuler: { color: '#22c55e', position: monaco.editor.OverviewRulerLane.Full },
      },
    }));
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
  }, [indicators, openFile]);

  const editingNow = openFile ? indicators.filter((i) => i.path === openFile.path) : [];

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-neutral-800 px-3 text-xs text-neutral-400">
        <span className="text-neutral-500">Editor</span>
        <span className="truncate text-neutral-300">{openFile?.path ?? 'nenhum arquivo aberto'}</span>
        <div className="ml-auto flex gap-1.5">
          {editingNow.map((ind) => (
            <span
              key={ind.agentId}
              className="animate-pulse rounded-full border border-green-500/50 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-400"
            >
              @{ind.agentId} editando...
            </span>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Editor
          path={openFile?.path ?? 'untitled'}
          language={languageOf(openFile?.path ?? '')}
          value={openFile?.content ?? '// abra um arquivo no explorador à esquerda\n// ou envie uma tarefa ao enxame →'}
          onMount={handleMount}
          theme="vs-dark"
          options={{
            fontSize: 13,
            minimap: { enabled: false },
            glyphMargin: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            padding: { top: 8 },
          }}
        />
      </div>
    </div>
  );
}
