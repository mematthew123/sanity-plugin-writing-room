import {ComposeIcon} from '@sanity/icons/Compose'
import {type DocumentActionComponent} from 'sanity'
import {useRouter} from 'sanity/router'
import {cameFromForm} from './came-from'
import {WRITE_INTENT} from './constants'

export const OpenInWritingRoomAction: DocumentActionComponent = (props) => {
  const {navigateIntent} = useRouter()
  return {
    label: 'Open in Writing Room',
    icon: ComposeIcon,
    onHandle: () => {
      cameFromForm(props.id)
      navigateIntent(WRITE_INTENT, {id: props.id, type: props.type})
      props.onComplete()
    },
  }
}
OpenInWritingRoomAction.displayName = 'OpenInWritingRoomAction'
