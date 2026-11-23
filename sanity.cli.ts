import {existsSync} from 'node:fs'
import {type IncomingMessage, type ServerResponse} from 'node:http'
import {defineCliConfig} from 'sanity/cli'
import {createSortingHandler} from './src/sorting'
import {LIMITS} from './src/sorting/contract'

// For AI_GATEWAY_API_KEY, which the CLI doesn't read from .env.local on its own.
if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const projectId = process.env.SANITY_STUDIO_PROJECT_ID

// Dev Studio only. Don't run `sanity build` here: it would overwrite the plugin's dist/.
export default defineCliConfig({
  api: {
    projectId,
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  // Required by the plugin (see the README's Install section).
  deployment: {autoUpdates: false},
  // The Sorting route, at /api/sort on the dev server, so Sorting can be tried without a site.
  vite: (config) => ({
    ...config,
    plugins: [
      ...(config.plugins ?? []),
      {
        name: 'writing-room-sorting-route',
        configureServer(server) {
          const sort = projectId ? createSortingHandler({projectId}) : null
          server.middlewares.use('/api/sort', async (incoming, outgoing) => {
            // Connect doesn't wait for this, so a rejection here would be unhandled and could stop the dev server.
            try {
              await answer(incoming, outgoing)
            } catch (error) {
              console.error('[writing-room] /api/sort', error)
              if (outgoing.headersSent) outgoing.destroy()
              else outgoing.writeHead(500).end()
            }
          })
          const answer = async (incoming: IncomingMessage, outgoing: ServerResponse) => {
            // The route reads no more than this, so nothing past it is kept. One byte over lets it say 413.
            const chunks: Buffer[] = []
            let held = 0
            for await (const chunk of incoming) {
              if (held > LIMITS.body) continue
              chunks.push(chunk as Buffer)
              held += (chunk as Buffer).length
            }
            const headers = new Headers()
            for (const [name, value] of Object.entries(incoming.headers)) {
              if (typeof value === 'string') headers.set(name, value)
            }
            const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD'
            const request = new Request('http://localhost/api/sort', {
              method: incoming.method,
              headers,
              body: hasBody ? Buffer.concat(chunks) : undefined,
            })
            const response =
              sort && process.env.AI_GATEWAY_API_KEY
                ? await sort(request)
                : Response.json({error: 'Set AI_GATEWAY_API_KEY in .env.local to try Sorting.'}, {status: 501})
            outgoing.statusCode = response.status
            response.headers.forEach((value, name) => outgoing.setHeader(name, value))
            outgoing.end(Buffer.from(await response.arrayBuffer()))
          }
        },
      },
    ],
  }),
})
