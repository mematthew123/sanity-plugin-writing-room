import {type DocumentActionComponent, type DocumentActionsContext, useDocumentOperation} from 'sanity'
import {API_VERSION} from '../lib/api-version'
import {withoutReadOnly} from '../lib/lock'
import {detailsForPublish} from '../lib/publish-details'
import {slugTakenByAnother} from '../lib/slug-availability'
import {detailsPatch, readPublishable, type WritingFields} from '../room/fields'

const roomPublishActions = new WeakSet<DocumentActionComponent>()

/**
 * Whether an action is Publish as this plugin wrapped it. If a Studio has put something else in
 * its place, the room offers that instead of its own Publish.
 */
export const isRoomPublishAction = (action: DocumentActionComponent): boolean => roomPublishActions.has(action)

/** Fills in the same slug and published date as publishing from the room. */
export function withPostDetailsOnPublish(
  original: DocumentActionComponent,
  context: DocumentActionsContext,
  fields: WritingFields,
): DocumentActionComponent {
  const client = context.getClient({apiVersion: API_VERSION})

  const PublishPostAction: DocumentActionComponent = (props) => {
    const result = original(props)
    const {patch} = useDocumentOperation(props.id, props.type)
    if (!result) return result

    return {
      ...result,
      onHandle: async () => {
        const document = (props.draft ?? props.published ?? {}) as Record<string, unknown>
        const details = await detailsForPublish({
          post: readPublishable(document, fields),
          isFirstPublish: !props.published,
          isTaken: slugTakenByAnother(client, props.type, fields.slug, props.id),
        })
        // A slug or a date the schema makes read-only isn't written, here or in the room.
        const set = withoutReadOnly(
          detailsPatch(details, fields),
          context.schema.get(props.type),
          document,
          context.currentUser,
        )
        if (Object.keys(set).length > 0) patch.execute([{set}])
        result.onHandle?.()
      },
    }
  }
  PublishPostAction.action = original.action
  PublishPostAction.displayName = 'PublishPostAction'
  roomPublishActions.add(PublishPostAction)
  return PublishPostAction
}
