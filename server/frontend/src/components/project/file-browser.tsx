// GSD Cloud - File Browser Component
// Adapted from VCCA — uses REST API for remote node filesystem (no Tauri)

import 'highlight.js/styles/github-dark.css';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useCopyToClipboard } from '@/hooks';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import java from 'highlight.js/lib/languages/java';
import kotlin from 'highlight.js/lib/languages/kotlin';
import swift from 'highlight.js/lib/languages/swift';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import php from 'highlight.js/lib/languages/php';
import lua from 'highlight.js/lib/languages/lua';
import perl from 'highlight.js/lib/languages/perl';
import r from 'highlight.js/lib/languages/r';
import scala from 'highlight.js/lib/languages/scala';
import dart from 'highlight.js/lib/languages/dart';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import scss from 'highlight.js/lib/languages/scss';
import less from 'highlight.js/lib/languages/less';
import json from 'highlight.js/lib/languages/json';
import yaml from 'highlight.js/lib/languages/yaml';
import ini from 'highlight.js/lib/languages/ini';
import markdown from 'highlight.js/lib/languages/markdown';
import sql from 'highlight.js/lib/languages/sql';
import bash from 'highlight.js/lib/languages/bash';
import powershell from 'highlight.js/lib/languages/powershell';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import makefile from 'highlight.js/lib/languages/makefile';
import gradle from 'highlight.js/lib/languages/gradle';
import objectivec from 'highlight.js/lib/languages/objectivec';
import elixir from 'highlight.js/lib/languages/elixir';
import erlang from 'highlight.js/lib/languages/erlang';
import haskell from 'highlight.js/lib/languages/haskell';
import ocaml from 'highlight.js/lib/languages/ocaml';
import vim from 'highlight.js/lib/languages/vim';
import graphql from 'highlight.js/lib/languages/graphql';
import plaintext from 'highlight.js/lib/languages/plaintext';
import {
  Folder,
  FolderOpen,
  FileText,
  Search,
  ChevronRight,
  File,
  Loader2,
  Copy,
  Check,
  WifiOff,
  AlertCircle,
} from 'lucide-react';
import { browseNodeFs, readNodeFile, type FsEntry } from '@/lib/api/nodes';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('ruby', ruby);
hljs.registerLanguage('go', go);
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('java', java);
hljs.registerLanguage('kotlin', kotlin);
hljs.registerLanguage('swift', swift);
hljs.registerLanguage('c', c);
hljs.registerLanguage('cpp', cpp);
hljs.registerLanguage('csharp', csharp);
hljs.registerLanguage('php', php);
hljs.registerLanguage('lua', lua);
hljs.registerLanguage('perl', perl);
hljs.registerLanguage('r', r);
hljs.registerLanguage('scala', scala);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('css', css);
hljs.registerLanguage('scss', scss);
hljs.registerLanguage('less', less);
hljs.registerLanguage('json', json);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('ini', ini);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('makefile', makefile);
hljs.registerLanguage('gradle', gradle);
hljs.registerLanguage('objectivec', objectivec);
hljs.registerLanguage('elixir', elixir);
hljs.registerLanguage('erlang', erlang);
hljs.registerLanguage('haskell', haskell);
hljs.registerLanguage('ocaml', ocaml);
hljs.registerLanguage('vim', vim);
hljs.registerLanguage('graphql', graphql);
hljs.registerLanguage('plaintext', plaintext);

interface FileBrowserProps {
  nodeId?: string;
  initialPath?: string;
  // Legacy local-mode props (kept for backward compat — not functional in cloud mode)
  projectId?: string;
  projectPath?: string;
}

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  lua: 'lua',
  pl: 'perl',
  r: 'r',
  scala: 'scala',
  dart: 'dart',
  vue: 'xml',
  svelte: 'xml',
  html: 'xml',
  xml: 'xml',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  shell: 'bash',
  ps1: 'powershell',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  gradle: 'gradle',
  m: 'objectivec',
  mm: 'objectivec',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  ml: 'ocaml',
  vim: 'vim',
  graphql: 'graphql',
  gql: 'graphql',
  tf: 'ini',
};

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  return EXTENSION_TO_LANGUAGE[ext] || 'plaintext';
}

function highlightCode(code: string, language: string): string {
  try {
    if (language && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language }).value;
    }
    return code;
  } catch {
    return code;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Response || (error && typeof error === 'object' && 'status' in error)) {
    const status = (error as { status: number }).status;
    if (status === 503) return 'Node is offline';
    if (status === 504) return 'Node did not respond — try again';
  }
  if (error instanceof Error) return error.message;
  return 'Failed to load';
}

export function FileBrowser({ nodeId, initialPath = '/' }: FileBrowserProps) {
  // Guard: FileBrowser requires a remote nodeId in cloud mode.
  // Legacy local-mode callers (project.tsx, gsd2-files-tab.tsx) pass projectId/projectPath
  // which are not used here — show a placeholder until those views are updated.
  if (!nodeId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
        <File className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">
          File browsing requires a connected node. Select a node from the Nodes page.
        </p>
      </div>
    );
  }
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const { copyToClipboard, copiedItems } = useCopyToClipboard();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Directory listing via REST — browseNodeFs
  const {
    data: dirData,
    isLoading: isLoadingDir,
    error: dirError,
  } = useQuery({
    queryKey: ['node-fs', nodeId, currentPath],
    queryFn: () => browseNodeFs(nodeId, currentPath),
    enabled: !!nodeId,
  });

  // File content via REST — readNodeFile
  const {
    data: fileData,
    isLoading: isLoadingContent,
    error: fileError,
  } = useQuery({
    queryKey: ['node-file', nodeId, selectedFile],
    queryFn: () => readNodeFile(nodeId, selectedFile!),
    enabled: !!selectedFile && !!nodeId,
  });

  const entries: FsEntry[] = dirData?.entries ?? [];

  const filteredEntries = useMemo(() => {
    if (!debouncedSearch.trim()) return entries;
    const q = debouncedSearch.toLowerCase();
    return entries.filter((e) => e.name.toLowerCase().includes(q));
  }, [entries, debouncedSearch]);

  const dirs = filteredEntries.filter((e) => e.isDirectory);
  const files = filteredEntries.filter((e) => !e.isDirectory);

  const language = selectedFile ? detectLanguage(selectedFile.split('/').pop() || '') : 'plaintext';

  const fileContent = fileData?.content ?? '';
  const highlightedContent = useMemo(() => {
    return fileContent ? highlightCode(fileContent, language) : '';
  }, [fileContent, language]);

  const editorHighlight = useCallback(
    (code: string) => highlightCode(code, language),
    [language],
  );
  void editorHighlight; // kept for future edit mode — suppress unused warning

  const handleDirClick = (entry: FsEntry) => {
    setCurrentPath(entry.path);
    setSelectedFile(null);
    setSearch('');
  };

  const handleFileClick = (entry: FsEntry) => {
    setSelectedFile(entry.path);
  };

  // Breadcrumb: split currentPath into segments
  const breadcrumbs = useMemo(() => {
    const parts = currentPath.replace(/\/$/, '').split('/').filter(Boolean);
    return [
      { label: '/', path: '/' },
      ...parts.map((part, i) => ({
        label: part,
        path: '/' + parts.slice(0, i + 1).join('/'),
      })),
    ];
  }, [currentPath]);

  return (
    <div className="h-full flex flex-col gap-3 sm:flex-row sm:gap-4">
      {/* File Tree Panel */}
      <div className="w-full sm:w-64 flex flex-col gap-3 flex-shrink-0">
        {/* Breadcrumb nav */}
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground min-w-0">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 flex-shrink-0" />}
              <button
                onClick={() => { setCurrentPath(crumb.path); setSelectedFile(null); }}
                className="hover:text-foreground transition-colors truncate max-w-[80px]"
                title={crumb.path}
              >
                {crumb.label}
              </button>
            </span>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Directory listing */}
        <ScrollArea className="flex-1 border rounded-lg min-h-[200px] sm:min-h-0">
          {isLoadingDir ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dirError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4 gap-2">
              <WifiOff className="h-8 w-8 text-destructive/50" />
              <p className="text-sm text-destructive">{getErrorMessage(dirError)}</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <Folder className="h-8 w-8 text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">
                {debouncedSearch.trim() ? 'No files match your search.' : 'Empty directory.'}
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-0.5">
              {/* Directories first */}
              {dirs.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => handleDirClick(entry)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors text-left"
                >
                  <FolderOpen className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm flex-1 truncate">{entry.name}</span>
                  <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
              {/* Files */}
              {files.map((entry) => {
                const isSelected = selectedFile === entry.path;
                const isCopied = copiedItems.has(entry.path);
                return (
                  <div key={entry.path} className="group relative">
                    <button
                      onClick={() => handleFileClick(entry)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left',
                        isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-accent',
                      )}
                    >
                      <FileText className="h-4 w-4 flex-shrink-0" />
                      <span className="text-sm flex-1 truncate">{entry.name}</span>
                      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0">
                        {formatFileSize(entry.size)}
                      </span>
                    </button>
                    {/* Copy path button */}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(entry.path, `Copied: ${entry.path}`);
                            }}
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="text-xs">
                          Copy file path
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Entry count */}
        {!isLoadingDir && !dirError && entries.length > 0 && (
          <div className="text-xs text-muted-foreground text-center">
            {debouncedSearch.trim()
              ? `${filteredEntries.length} of ${entries.length} entries`
              : `${entries.length} entries`}
          </div>
        )}
      </div>

      {/* File Preview Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedFile ? (
          <div className="flex-1 flex items-center justify-center border rounded-lg bg-muted/30 min-h-[200px]">
            <div className="text-center">
              <File className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Select a file to view its contents</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
            {/* File Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium truncate">
                  {selectedFile.split('/').pop()}
                </span>
                <Badge variant="secondary" className="text-xs flex-shrink-0">
                  {language}
                </Badge>
                {fileData?.truncated && (
                  <Badge variant="outline" className="text-xs flex-shrink-0 text-yellow-600 border-yellow-600">
                    truncated
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => copyToClipboard(selectedFile, `Copied: ${selectedFile}`)}
                      >
                        {copiedItems.has(selectedFile) ? (
                          <Check className="h-3 w-3 text-green-600" />
                        ) : (
                          <Copy className="h-3 w-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Copy file path
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedFile(null)}
                  className="flex-shrink-0 text-xs"
                >
                  Close
                </Button>
              </div>
            </div>

            {/* File Content */}
            <ScrollArea className="flex-1">
              {isLoadingContent ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : fileError ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-center px-4">
                  <AlertCircle className="h-8 w-8 text-destructive/50" />
                  <p className="text-sm text-destructive">{getErrorMessage(fileError)}</p>
                </div>
              ) : (
                <div className="p-4">
                  {/* T-04-17: rendered as text content, not innerHTML for user-controlled data */}
                  <pre className="text-xs font-mono leading-relaxed">
                    <code
                      className={`language-${language}`}
                      dangerouslySetInnerHTML={{ __html: highlightedContent }}
                    />
                  </pre>
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
