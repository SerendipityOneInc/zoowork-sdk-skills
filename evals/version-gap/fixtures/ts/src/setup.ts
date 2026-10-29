// One-time setup: creates the ZooWork Agent this app uses and prints its ID.
// Save the printed ID as ZOOWORK_AGENT_ID.
import { createZooworkClient } from '@zoowork-ai/sdk'

const client = createZooworkClient()

const models = await client.listModels()
const primary = models.find(
  (model) => model.selectable !== false && model.default_for?.includes('model'),
)?.model
if (!primary) throw new Error('No default model in the catalog')

const agent = await client.createAgent(
  {
    resource: {
      name: 'sales-insights',
      model: { primary },
      labels: { app: 'sales-insights' },
    },
  },
  'sales-insights-setup-v1',
)

console.log(agent.agent_id)
