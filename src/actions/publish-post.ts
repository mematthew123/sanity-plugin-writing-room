import {type DocumentActionComponent, type DocumentActionsContext, useDocumentOperation} from 'sanity'
import {API_VERSION} from '../lib/api-version'
import {detailsForPublish, type PublishablePost} from '../lib/publish-details'
import {slugTakenByAnother} from '../lib/slug-availability'

/**
 * Extends the built-in Publish so a document published from the form gets the same Details the
 * Writing Room fills in: a settled slug, unique within its type, and a published date.
 */
export function withPostDetailsOnPublish(
  original: DocumentActionComponent,
  context: DocumentActionsContext,
): DocumentActionComponent {
  const client = context.getClient({apiVersion: API_VERSION})

  const PublishPostAction: DocumentActionComponent = (props) => {
    const result = original(props)
    const {patch} = useDocumentOperation(props.id, props.type)
    if (!result) return result

    return {
      ...result,
      onHandle: async () => {
        const post = (props.draft ?? props.published ?? {}) as PublishablePost
        const details = await detailsForPublish({
          post,
          isFirstPublish: !props.published,
          isTaken: slugTakenByAnother(client, props.type, props.id),
        })
        if (Object.keys(details).length > 0) patch.execute([{set: details}])
        result.onHandle?.()
      },
    }
  }
  PublishPostAction.action = original.action
  PublishPostAction.displayName = 'PublishPostAction'
  return PublishPostAction
}
