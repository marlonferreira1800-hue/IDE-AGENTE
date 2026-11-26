import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '../api';
import { useSwarm } from '../store';

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = [];
  for (const p of paths) {
    const parts = p.split('/');
    let level = root;
    let acc = '';
    for (let i = 0; i < parts.length; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      let node = level.find((n) => n.name === parts[i]);
      if (!node) {
        node = { name: parts[i], path: acc, children: [] };
        level.push(node);
      }
      if (i === parts.length - 1) node.path = p;
      level = node.children;
    }
  }
  return root;
}

const FALLBACK_FILES = [
  'client/src/App.tsx',
  'client/src/components/SwarmPanel/SwarmPanel.tsx',
  'server/src/engine/SwarmEngine.ts',
  'server/src/index.ts',
  'shared/types.ts',
];

export default function FileTree() {
  const [files, setFiles] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['src', 'client', 'server', 'shared']));
  const openFile = useSwarm((s) => s.openFile);
  const setOpenFile = useSwarm((s) => s.setOpenFile);

  useEffect(() => {
    fetch(`${API_BASE}/api/files`)
      .then((r) => r.json())
      .then((data: { files?: string[] }) => setFiles(data.files ?? FALLBACK_FILES))
      .catch(() => setFiles(FALLBACK_FILES));
  }, []);

  const tree = useMemo(() => buildTree(files), [files]);

  const open = async (path: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/file?path=${encodeURIComponent(path)}`);
      const data = await r.json();
      setOpenFile({ path, content: data.content ?? `// (demo) ${path}\n` });
    } catch {
      setOpenFile({ path, content: `// modo demo — conteúdo indisponível\n// ${path}\n` });
    }
  };

  const toggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const render = (nodes: TreeNode[], depth: number): JSX.Element[] =>
    nodes.flatMap((node) => {
      const isDir = node.children.length > 0;
      const isOpen = expanded.has(node.path);
      return [
        <div key={node.path}>
          <button
            onClick={() => (isDir ? toggle(node.path) : open(node.path))}
            className={`flex w-full items-center gap-1.5 truncate px-2 py-1 text-left text-[13px] hover:bg-neutral-800 ${
              openFile?.path === node.path ? 'bg-neutral-800 text-green-400' : 'text-neutral-300'
            }`}
            style={{ paddingLeft: depth * 12 + 8 }}
            title={node.path}
          >
            <span className="w-3 shrink-0 text-neutral-500">{isDir ? (isOpen ? '▾' : '▸') : '·'}</span>
            {node.name}
          </button>
          {isDir && isOpen ? render(node.children, depth + 1) : null}
        </div>,
      ];
    });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-neutral-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        Explorador
      </div>
      <div className="swarm-scroll min-h-0 flex-1 overflow-auto py-1">
        {render(tree, 0)}
      </div>
    </div>
  );
}
