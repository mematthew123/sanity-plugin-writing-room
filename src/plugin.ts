import {ComposeIcon} from '@sanity/icons/Compose'
import {definePlugin} from 'sanity'
import {route} from 'sanity/router'
import {withPostDetailsOnPublish} from './actions/publish-post'
import {resolveConfig, type WritingRoomOptions} from './config'
import {roomBlockTypes} from './schema/room-blocks'
import {TOOL_NAME, WRITE_INTENT} from './room/constants'
import {OpenInWritingRoomAction} from './room/OpenInWritingRoomAction'
import {RoomAwareNavbar} from './room/RoomAwareNavbar'
import {resolveKinds} from './room/kinds'
import {ROOM_ROUTES, roomState} from './room/room-route'
import {WritingRoomTool} from './room/WritingRoomTool'

/**
 * The Writing Room: a calm, full-screen space for writing a single document (a Post, by default;
 * see the `types` option). It's a Studio Tool rather than a custom input because only a Tool can
 * take the whole screen; Details stay in the standard document form.
 *
 * The plugin adds the Tool, an "Open in Writing Room" action on the room's types, and wraps the
 * built-in Publish on them so a document published from the form gets the same slug and date as
 * one published from the room. It doesn't register schema types: add `writingRoomSchemaTypes`
 * (or your own types with the same shape) to your Studio's schema.
 */
export const writingRoom = definePlugin<WritingRoomOptions | void>((options) => {
  const config = resolveConfig(options ?? undefined)
  const types = config.types.map((option) => option.type)
  const isWritingType = (type: unknown): type is string =>
    typeof type === 'string' && types.includes(type)

  return {
    name: 'sanity-plugin-writing-room',
    // Only the room's own prefixed blocks; it never registers a Studio's names (post, body).
    schema: {types: roomBlockTypes},
    tools: [
      {
        name: TOOL_NAME,
        title: 'Writing Room',
        icon: ComposeIcon,
        component: WritingRoomTool,
        options: config,
        router: route.create(
          '/',
          ROOM_ROUTES.map((path) => route.create(path)),
        ),
        canHandleIntent: (intent, params) => intent === WRITE_INTENT && isWritingType(params.type),
        getIntentState: (_intent, params) =>
          isWritingType(params.type) ? roomState(params.id, params.type, types) : {},
      },
    ],
    studio: {
      components: {
        navbar: RoomAwareNavbar,
      },
    },
    document: {
      actions: (prev, context) => {
        if (!isWritingType(context.schemaType)) return prev
        // Only types the room can write (a title and a body it can find) get the room's actions.
        const [kind] = resolveKinds(
          config.types.filter((option) => option.type === context.schemaType),
          (name) => context.schema.get(name),
        )
        if (!kind) return prev
        return [
          ...prev.map((action) =>
            action.action === 'publish' ? withPostDetailsOnPublish(action, context, kind.fields) : action,
          ),
          OpenInWritingRoomAction,
        ]
      },
    },
  }
})
