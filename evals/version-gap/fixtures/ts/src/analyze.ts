// Asks the Agent for a short analysis of this quarter's sales.
import { assistantText, createZooworkClient, isRunFinished } from '@zoowork-ai/sdk'

const agentId = process.env.ZOOWORK_AGENT_ID
if (!agentId) throw new Error('Set ZOOWORK_AGENT_ID (run npm run setup first)')

const client = createZooworkClient()

const session = await client.createSession(agentId, {
  initial_events: [
    {
      type: 'user.message',
      content: 'Read /workspace/sales.csv and summarize revenue by region in three bullet points.',
    },
  ],
})

for await (const event of client.streamEvents(agentId, session.session_id)) {
  const text = assistantText(event)
  if (text) console.log(text)
  if (isRunFinished(event)) break
}
