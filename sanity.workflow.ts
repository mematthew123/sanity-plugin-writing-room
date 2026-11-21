import type {WorkflowDeploymentInput} from '@sanity/workflows'
import {defineWorkflowConfig} from '@sanity/workflows/define'
import {postReview} from './e2e/workflows/post-review'

// Dev Studio only, like sanity.config.ts: a workflow with a hold to try the room against.
// `pnpm workflows:deploy` writes its definition to the project in .env.local.
if (!process.env.SANITY_STUDIO_PROJECT_ID) process.loadEnvFile('.env.local')
const projectId = process.env.SANITY_STUDIO_PROJECT_ID
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'
if (!projectId) throw new Error('Missing SANITY_STUDIO_PROJECT_ID. Copy .env.example to .env.local and fill it in.')

export const dev = {
  name: 'dev',
  // sanity.config.ts names the same partition.
  partition: 'writing-room-dev',
  expectedMinReaderModel: 10,
  workflowResource: {type: 'dataset', id: `${projectId}.${dataset}`},
  definitions: [postReview],
} satisfies WorkflowDeploymentInput

export default defineWorkflowConfig({deployments: [dev]})
