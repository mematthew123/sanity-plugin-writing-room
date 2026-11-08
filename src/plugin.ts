import {ComposeIcon} from '@sanity/icons/Compose'
import {definePlugin} from 'sanity'
import {route} from 'sanity/router'
import {withPostDetailsOnPublish} from './actions/publish-post'
import {resolveConfig, type WritingRoomOptions} from './config'
import {TOOL_NAME, WRITE_INTENT} from './room/constants'
import {OpenInWritingRoomAction} from './room/OpenInWritingRoomAction'
import {RoomAwareNavbar} from './room/RoomAwareNavbar'
import {WritingRoomTool} from './room/WritingRoomTool'

/**
 * The Writing Room: a calm, full-screen space for writing a single Post. It's a Studio Tool
 * rather than a custom input because only a Tool can take the whole screen; Details stay in
 * the standard document form.
 *
 * The plugin adds the Tool, an "Open in Writing Room" action on Posts, and wraps the built-in
 * Publish so a Post published from the form gets the same slug and date as one published from
 * the room. It doesn't register schema types: add `writingRoomSchemaTypes` (or your own `post`
 * and `body` with the same shape) to your Studio's schema.
 */
export const writingRoom = definePlugin<WritingRoomOptions | void>((options) => {
  const config = resolveConfig(options ?? undefined)
  return {
    name: 'sanity-plugin-writing-room',
    tools: [
      {
        name: TOOL_NAME,
        title: 'Writing Room',
        icon: ComposeIcon,
        component: WritingRoomTool,
        options: config,
        router: route.create('/', [route.create('/:postId')]),
        canHandleIntent: (intent, params) => intent === WRITE_INTENT && params.type === 'post',
        getIntentState: (_intent, params) => ({postId: params.id}),
      },
    ],
    studio: {
      components: {
        navbar: RoomAwareNavbar,
      },
    },
    document: {
      actions: (prev, context) =>
        context.schemaType === 'post'
          ? [
              ...prev.map((action) =>
                action.action === 'publish' ? withPostDetailsOnPublish(action, context) : action,
              ),
              OpenInWritingRoomAction,
            ]
          : prev,
    },
  }
})
