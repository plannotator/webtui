import { CornerDownLeft, MessageSquarePlus, Play } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { listBuiltInAgents } from '@plannotator/webtui'
import { WebSocketPtyBackend, WEBTUI_THEMES } from '@plannotator/webtui/browser'
import { WebTuiTerminal, type WebTuiTerminalHandle } from '@plannotator/webtui/react'
import '@plannotator/webtui/styles.css'

import { Button } from './components/ui/button.js'
import { Input } from './components/ui/input.js'
import { Label } from './components/ui/label.js'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.js'
import { Textarea } from './components/ui/textarea.js'
import { FileTreeSidebar } from './FileTreeSidebar.js'
import {
  appendPromptPayload,
  createPathPayload,
  createTerminalDropPayload,
  fetchFileTree,
  togglePath,
  type FileTreeNode
} from './file-tree-data.js'

const logoUrl = new URL('../../../assets/webtui.webp', import.meta.url).href
const catppuccinTerminalOptions = { theme: WEBTUI_THEMES.catppuccinMocha }
const terminalFontZoom = true

type ActiveAgentSession = {
  key: number
  cwd?: string
  agent: string
  prompt: { text: string } | null
}

const agents = listBuiltInAgents()

export default function App() {
  const [agent, setAgent] = useState('claude')
  const [prompt, setPrompt] = useState('wassup my dawg')
  const [cwd, setCwd] = useState('')
  const [activeSession, setActiveSession] = useState<ActiveAgentSession | null>(null)
  const [isTerminalReady, setIsTerminalReady] = useState(false)
  const [isInjectorOpen, setIsInjectorOpen] = useState(false)
  const [injectionText, setInjectionText] = useState('')
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null)
  const [fileTreeError, setFileTreeError] = useState<string | null>(null)
  const [isFileTreeLoading, setIsFileTreeLoading] = useState(true)
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([])
  const [openFolderPaths, setOpenFolderPaths] = useState<string[]>([])
  const terminalRef = useRef<WebTuiTerminalHandle | null>(null)
  const backend = useMemo(() => new WebSocketPtyBackend(resolveWebSocketUrl()), [])
  const activeCwdProps = activeSession?.cwd ? { cwd: activeSession.cwd } : {}
  const selectedFilePathSet = useMemo(() => new Set(selectedFilePaths), [selectedFilePaths])
  const openFolderPathSet = useMemo(() => new Set(openFolderPaths), [openFolderPaths])
  const selectedFilePayload = useMemo(() => createPathPayload(selectedFilePaths), [selectedFilePaths])
  const canInjectMessage = isTerminalReady && activeSession !== null
  const hasInjectionText = injectionText.trim().length > 0

  useEffect(() => {
    const controller = new AbortController()
    setIsFileTreeLoading(true)
    setFileTreeError(null)

    const timeout = window.setTimeout(() => {
      void fetchFileTree(cwd, controller.signal)
        .then((response) => {
          setFileTree(response.tree)
          setOpenFolderPaths([response.tree.path])
          setSelectedFilePaths([])
        })
        .catch((err: unknown) => {
          if (!controller.signal.aborted) {
            setFileTree(null)
            setFileTreeError(err instanceof Error ? err.message : String(err))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsFileTreeLoading(false)
          }
        })
    }, 180)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [cwd])

  useEffect(() => {
    if (!canInjectMessage) {
      setIsInjectorOpen(false)
    }
  }, [canInjectMessage])

  const applyTerminalPayload = (text: string): void => {
    const payload = text.trim()
    if (!payload) {
      return
    }
    if (terminalRef.current?.session) {
      terminalRef.current.write(payload)
      return
    }
    setPrompt((current) => appendPromptPayload(current, payload))
  }

  const injectAgentMessage = (): void => {
    if (!canInjectMessage) {
      return
    }
    const delivered =
      terminalRef.current?.sendAgentMessage({
        text: injectionText
      }) ?? false
    if (delivered) {
      setIsInjectorOpen(false)
      terminalRef.current?.focus()
    }
  }

  return (
    <main className="app-shell">
      <div className="workbench">
        <section className="launcher-panel" aria-label="Agent launch controls">
          <div className="brand-panel">
            <img src={logoUrl} alt="webtui" />
          </div>

          <div className="launcher-form">
            <div className="launcher-grid">
              <Field label="Agent">
                <Select value={agent} onValueChange={setAgent}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((entry) => (
                      <SelectItem key={entry} value={entry}>
                        {entry}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Working directory">
                <Input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="default" />
              </Field>
            </div>

            <Field label="Prompt" className="prompt-field">
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </Field>

            <div className="launch-row">
              <div className="injector-control">
                <Button
                  aria-expanded={isInjectorOpen}
                  aria-haspopup="dialog"
                  disabled={!canInjectMessage}
                  onClick={() => setIsInjectorOpen((open) => !open)}
                  variant="outline"
                >
                  <MessageSquarePlus />
                  Inject
                </Button>
                {isInjectorOpen ? (
                  <div
                    aria-label="Inject message into active agent"
                    className="injector-popover"
                    role="dialog"
                  >
                    <Field label="Message" className="injector-field">
                      <Textarea
                        autoFocus
                        value={injectionText}
                        onChange={(event) => setInjectionText(event.target.value)}
                        onKeyDown={(event) => {
                          if (isPrimaryEnterShortcut(event)) {
                            event.preventDefault()
                            injectAgentMessage()
                          }
                        }}
                        placeholder="Type a message for the running agent"
                      />
                    </Field>
                    <div className="injector-actions">
                      <Button
                        disabled={!hasInjectionText}
                        onClick={() => injectAgentMessage()}
                        size="sm"
                      >
                        <CornerDownLeft />
                        Send
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
              <Button
                onClick={() => {
                  setIsTerminalReady(false)
                  setIsInjectorOpen(false)
                  setActiveSession((current) =>
                    createActiveAgentSession({
                      key: (current?.key ?? 0) + 1,
                      agent,
                      prompt: appendPromptPayload(prompt, selectedFilePayload),
                      cwd
                    })
                  )
                }}
              >
                <Play />
                Launch
              </Button>
            </div>
          </div>
        </section>

        <div className="session-layout">
          <FileTreeSidebar
            error={fileTreeError}
            loading={isFileTreeLoading}
            openFolderPaths={openFolderPathSet}
            selectedFileCount={selectedFilePaths.length}
            selectedFilePaths={selectedFilePathSet}
            selectedFilePayload={selectedFilePayload}
            tree={fileTree}
            disabled={!isTerminalReady}
            onToggleFolder={(path) => setOpenFolderPaths((current) => togglePath(current, path))}
            onToggleFile={(path) => setSelectedFilePaths((current) => togglePath(current, path))}
          />

          <section className="terminal-band">
            {activeSession ? (
              <WebTuiTerminal
                key={activeSession.key}
                ref={terminalRef}
                backend={backend}
                agent={activeSession.agent}
                prompt={activeSession.prompt}
                terminalOptions={catppuccinTerminalOptions}
                fontZoom={terminalFontZoom}
                {...activeCwdProps}
                onReady={() => setIsTerminalReady(true)}
                onExit={() => setIsTerminalReady(false)}
                onDrop={(event) => {
                  const payload = createTerminalDropPayload(event.text, event.files)
                  if (payload) {
                    applyTerminalPayload(payload)
                  }
                }}
              />
            ) : (
              <div className="terminal-empty" aria-label="Terminal waiting for an agent session" />
            )}
          </section>
        </div>
      </div>
    </main>
  )
}

function Field({
  label,
  className,
  children
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function createActiveAgentSession(args: {
  key: number
  agent: string
  prompt: string
  cwd: string
}): ActiveAgentSession {
  const session: ActiveAgentSession = {
    key: args.key,
    agent: args.agent,
    prompt: args.prompt.trim() ? { text: args.prompt.trim() } : null
  }
  const cwd = args.cwd.trim()
  if (cwd) {
    session.cwd = cwd
  }
  return session
}

function resolveWebSocketUrl(): string {
  const url = new URL(window.location.href)
  const port = url.searchParams.get('ptyPort') ?? '8731'
  return `ws://${url.hostname || 'localhost'}:${port}/pty`
}

function isPrimaryEnterShortcut(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
}): boolean {
  const isMac = navigator.userAgent.includes('Mac')
  return event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey)
}
