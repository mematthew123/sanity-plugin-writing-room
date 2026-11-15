import {ComposeIcon} from '@sanity/icons/Compose'
import {definePlugin} from 'sanity'
import {route} from 'sanity/router'
import {withPostDetailsOnPublish} from './actions/publish-post'
import {resolveConfig, type WritingRoomOptions} from './config'
import {roomBlockTypes} from './schema/room-blocks'
import {TOOL_NAME, WRITE_INTENT} from './room/constants'
import {RoomField, RoomInput} from './room/details/room-form'
import {OpenInWritingRoomAction} from './room/OpenInWritingRoomAction'
import {RoomAwareNavbar} from './room/RoomAwareNavbar'
import {resolveKinds} from './room/kinds'
import {ROOM_ROUTES, roomState} from './room/room-route'
import {WritingRoomTool} from './room/WritingRoomTool'

/**
 * A full-screen Studio Tool for writing documents. Doesn't register document types: add
 * `writingRoomSchemaTypes`, or your own types with the same shape, to your schema.
 */
export const writingRoom = definePlugin<WritingRoomOptions | void>((options) => {
  const config = resolveConfig(options ?? undefined)
  const types = config.types.map((option) => option.type)
  const isWritingType = (type: unknown): type is string =>
    typeof type === 'string' && types.includes(type)

  return {
    name: 'sanity-plugin-writing-room',
    // Prefixed names only, so nothing clashes with the Studio's own types.
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
    form: {components: {field: RoomField, input: RoomInput}},
    document: {
      actions: (prev, context) => {
        if (!isWritingType(context.schemaType)) return prev
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
