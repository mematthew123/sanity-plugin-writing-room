import {type DocumentActionComponent, type DocumentActionsContext, useDocumentOperation} from 'sanity'
import {API_VERSION} from '../lib/api-version'
import {detailsForPublish} from '../lib/publish-details'
import {slugTakenByAnother} from '../lib/slug-availability'
import {detailsPatch, readPublishable, type WritingFields} from '../room/fields'

/**
 * Extends the built-in Publish so a document published from the form gets the same Details the
 * Writing Room fills in: a settled slug, unique within its type, and a published date.
 */
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
        const set = detailsPatch(details, fields)
        if (Object.keys(set).length > 0) patch.execute([{set}])
        result.onHandle?.()
      },
    }
  }
  PublishPostAction.action = original.action
  PublishPostAction.displayName = 'PublishPostAction'
  return PublishPostAction
}
