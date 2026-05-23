<div align="center">

<img src="assets/webtui.webp" alt="webtui" width="160" />



**TUI in a GUI**

https://github.com/user-attachments/assets/704e68e3-c7dd-4b0d-a289-61ccbee42d05


</div>

## What It Is WebTUI

- TypeScript library for running local coding agents inside Xterm.
- Browser UI talks to a PTY backend.
- Included backend uses `node-pty`.
- Included React component mounts the terminal.
- Included example app launches agents, accepts prompts, and supports file drag/drop into the terminal.

## Run The Example

```bash
cd ~/oss/webtui
pnpm run build
pnpm run example:build
pnpm run example:start
```

Open:

```text
http://localhost:8730
```

Ports:

- App: `8730`
- PTY websocket: `8731`

## Example App

- Select an agent.
- Optional working directory.
- Enter a prompt.
- Click `Launch`.
- Use the left file tree after the session starts.
- Drag files from the tree into the terminal.
- Use `Inject` to send another message to the running agent.
- Use `Cmd/Ctrl +`, `Cmd/Ctrl -`, and `Cmd/Ctrl 0` for terminal font zoom.

## Imports

```ts
import { buildAgentLaunchPlan, listBuiltInAgents } from 'webtui'
import { WebSocketPtyBackend } from 'webtui/browser'
import { WebTuiTerminal } from 'webtui/react'
import { NodePtyBackend, createNodePtyWebSocketServer } from 'webtui/server'
import 'webtui/styles.css'
```

## React Usage

```tsx
import { WebSocketPtyBackend } from 'webtui/browser'
import { WebTuiTerminal } from 'webtui/react'
import 'webtui/styles.css'

const backend = new WebSocketPtyBackend('ws://localhost:8731/pty')

export function AgentPane() {
  return (
    <WebTuiTerminal
      backend={backend}
      agent="codex"
      cwd="/path/to/project"
      prompt={{ text: 'Fix the failing tests' }}
      fontZoom
    />
  )
}
```

## Browser Controller

```ts
import { createAgentTerminalSession, WebSocketPtyBackend } from 'webtui/browser'

const session = await createAgentTerminalSession({
  container,
  backend: new WebSocketPtyBackend('ws://localhost:8731/pty'),
  agent: 'claude',
  cwd: '/path/to/project',
  prompt: { text: 'Summarize this repo' }
})

session.sendAgentMessage({ text: 'Now inspect the tests' })
```

## Backend

```ts
import { createNodePtyWebSocketServer, NodePtyBackend } from 'webtui/server'

createNodePtyWebSocketServer({
  port: 8731,
  backend: new NodePtyBackend({ agentTrustPreflight: true })
})
```

## Useful Scripts

```bash
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run smoke
pnpm run example:build
pnpm run example:start
```
