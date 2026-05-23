import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MutableRefObject
} from 'react'

import type { AgentConfigMap, AgentPrompt, PtyBackend } from '../core/index.js'
import {
  createAgentTerminalSession,
  type AgentRuntimeMessage,
  type CreateAgentTerminalSessionOptions,
  type TerminalDropEvent,
  type WebTuiSession
} from '../browser/index.js'

export type WebTuiTerminalHandle = {
  session: WebTuiSession | null
  focus(): void
  write(data: string): void
  sendAgentMessage(message: AgentRuntimeMessage): boolean
  setFontSize(size: number): number | null
  zoomFontIn(): number | null
  zoomFontOut(): number | null
  resetFontZoom(): number | null
  copySelection(): Promise<string>
}

export type WebTuiTerminalProps = {
  backend: PtyBackend
  cwd?: string
  env?: Record<string, string>
  command?: string
  agent?: string
  prompt?: AgentPrompt | null
  customAgents?: AgentConfigMap
  commandOverrides?: Record<string, string>
  agentReadiness?: CreateAgentTerminalSessionOptions['agentReadiness']
  terminalOptions?: CreateAgentTerminalSessionOptions['terminalOptions']
  terminalLinks?: CreateAgentTerminalSessionOptions['terminalLinks']
  terminalGpuAcceleration?: CreateAgentTerminalSessionOptions['terminalGpuAcceleration']
  fontZoom?: CreateAgentTerminalSessionOptions['fontZoom']
  className?: string
  onReady?: (session: WebTuiSession) => void
  onExit?: CreateAgentTerminalSessionOptions['onExit']
  onTitle?: CreateAgentTerminalSessionOptions['onTitle']
  onAgentStatus?: CreateAgentTerminalSessionOptions['onAgentStatus']
  onTitleStatus?: CreateAgentTerminalSessionOptions['onTitleStatus']
  onDrop?: (event: TerminalDropEvent) => void
}

export const WebTuiTerminal = forwardRef<WebTuiTerminalHandle, WebTuiTerminalProps>(
  function WebTuiTerminal(props, ref) {
    const {
      backend,
      cwd,
      env,
      command,
      agent,
      prompt,
      customAgents,
      commandOverrides,
      agentReadiness,
      terminalOptions,
      terminalLinks,
      terminalGpuAcceleration,
      fontZoom,
      className,
      onReady,
      onExit,
      onTitle,
      onAgentStatus,
      onTitleStatus,
      onDrop
    } = props
    const containerRef = useRef<HTMLDivElement | null>(null)
    const sessionRef = useRef<WebTuiSession | null>(null)
    const [error, setError] = useState<string | null>(null)
    const onReadyRef = useLatestRef(onReady)
    const onExitRef = useLatestRef(onExit)
    const onTitleRef = useLatestRef(onTitle)
    const onAgentStatusRef = useLatestRef(onAgentStatus)
    const onTitleStatusRef = useLatestRef(onTitleStatus)
    const onDropRef = useLatestRef(onDrop)
    const terminalOptionsRef = useLatestRef(terminalOptions)
    const terminalLinksRef = useLatestRef(terminalLinks)
    const agentReadinessRef = useLatestRef(agentReadiness)
    const promptText = prompt?.text
    const hasExplicitNullPrompt = prompt === null

    useImperativeHandle(
      ref,
      () => ({
        get session() {
          return sessionRef.current
        },
        focus(): void {
          sessionRef.current?.terminal.focus()
        },
        write(data: string): void {
          sessionRef.current?.write(data)
        },
        sendAgentMessage(message: AgentRuntimeMessage): boolean {
          return sessionRef.current?.sendAgentMessage(message) ?? false
        },
        setFontSize(size: number): number | null {
          return sessionRef.current?.setFontSize(size) ?? null
        },
        zoomFontIn(): number | null {
          return sessionRef.current?.zoomFontIn() ?? null
        },
        zoomFontOut(): number | null {
          return sessionRef.current?.zoomFontOut() ?? null
        },
        resetFontZoom(): number | null {
          return sessionRef.current?.resetFontZoom() ?? null
        },
        copySelection(): Promise<string> {
          return sessionRef.current?.copySelection() ?? Promise.resolve('')
        }
      }),
      []
    )

    useEffect(() => {
      const container = containerRef.current
      if (!container) {
        return
      }

      let disposed = false
      setError(null)
      const sessionOptions: CreateAgentTerminalSessionOptions = {
        container,
        backend
      }
      if (cwd !== undefined) {
        sessionOptions.cwd = cwd
      }
      if (env !== undefined) {
        sessionOptions.env = env
      }
      if (command !== undefined) {
        sessionOptions.command = command
      }
      if (agent !== undefined) {
        sessionOptions.agent = agent
      }
      if (promptText !== undefined) {
        sessionOptions.prompt = { text: promptText }
      } else if (hasExplicitNullPrompt) {
        sessionOptions.prompt = null
      }
      if (customAgents !== undefined) {
        sessionOptions.customAgents = customAgents
      }
      if (commandOverrides !== undefined) {
        sessionOptions.commandOverrides = commandOverrides
      }
      if (agentReadinessRef.current !== undefined) {
        sessionOptions.agentReadiness = agentReadinessRef.current
      }
      if (terminalOptionsRef.current !== undefined) {
        sessionOptions.terminalOptions = terminalOptionsRef.current
      }
      if (terminalLinksRef.current !== undefined) {
        sessionOptions.terminalLinks = terminalLinksRef.current
      }
      if (terminalGpuAcceleration !== undefined) {
        sessionOptions.terminalGpuAcceleration = terminalGpuAcceleration
      }
      if (fontZoom !== undefined) {
        sessionOptions.fontZoom = fontZoom
      }
      // Event handlers are intentionally read from refs so parent UI updates do
      // not tear down and respawn the PTY session.
      sessionOptions.onExit = (event) => onExitRef.current?.(event)
      sessionOptions.onTitle = (title) => onTitleRef.current?.(title)
      sessionOptions.onAgentStatus = (status) => onAgentStatusRef.current?.(status)
      sessionOptions.onTitleStatus = (status, title) => onTitleStatusRef.current?.(status, title)
      sessionOptions.onDrop = (event) => onDropRef.current?.(event)

      void createAgentTerminalSession(sessionOptions)
        .then((session) => {
          if (disposed) {
            session.dispose()
            return
          }
          sessionRef.current = session
          onReadyRef.current?.(session)
        })
        .catch((err: unknown) => {
          if (!disposed) {
            setError(err instanceof Error ? err.message : String(err))
          }
        })

      return () => {
        disposed = true
        sessionRef.current?.dispose()
        sessionRef.current = null
      }
    }, [
      backend,
      cwd,
      env,
      command,
      agent,
      promptText,
      hasExplicitNullPrompt,
      customAgents,
      commandOverrides,
      agentReadinessRef,
      terminalGpuAcceleration,
      fontZoom,
      terminalOptionsRef,
      terminalLinksRef,
      onReadyRef,
      onExitRef,
      onTitleRef,
      onAgentStatusRef,
      onTitleStatusRef,
      onDropRef
    ])

    return (
      <div className={['webtui-shell', className].filter(Boolean).join(' ')}>
        <div ref={containerRef} className="webtui-terminal" />
        {error ? <div className="webtui-error">{error}</div> : null}
      </div>
    )
  }
)

function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  ref.current = value
  return ref
}
