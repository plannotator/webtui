import { buildAgentLaunchPlan } from '../dist/core/index.js'
import { NodePtyBackend } from '../dist/server/index.js'

const plan = buildAgentLaunchPlan({
  agent: 'codex',
  prompt: { text: 'smoke test' },
  platform: process.platform
})

if (!plan.command.includes('codex')) {
  throw new Error('Launch plan did not include codex command')
}

const backend = new NodePtyBackend()
const session = await backend.spawn({
  command: `${JSON.stringify(process.execPath)} -e "console.log('webtui-smoke')"`,
  cols: 80,
  rows: 24
})

const output = await new Promise((resolve, reject) => {
  let buffer = ''
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for smoke output')), 8000)
  session.onData((data) => {
    buffer += data
    if (buffer.includes('webtui-smoke')) {
      clearTimeout(timeout)
      resolve(buffer)
    }
  })
})

session.kill()
console.log(output.includes('webtui-smoke') ? 'webtui smoke ok' : output)
