import {type DocumentHandle} from '@sanity/sdk-react'
import {useEffect, useMemo, useState} from 'react'
import {ALL_FIELDS_GROUP, createPatchChannel, FormBuilder, useDocumentForm} from 'sanity'
import styled from 'styled-components'
import {type WritingFields} from '../fields'
import {Placeholder} from '../primitives'
import {InRoomDetails} from './room-form'

/**
 * Every field but the title and the body, rendered by the Studio's own form,
 * on one page in schema order.
 */
export function DetailsView({
  handle,
  fields,
  onSyncing,
}: {
  handle: DocumentHandle
  fields: WritingFields
  /** The form saves through the Studio's store, which the App SDK's sync status doesn't see. */
  onSyncing?: (syncing: boolean) => void
}) {
  const [patchChannel] = useState(() => createPatchChannel())
  const form = useDocumentForm({documentId: handle.documentId, documentType: handle.documentType})
  const {formState, onSetActiveFieldGroup, syncState} = form

  useEffect(() => {
    onSetActiveFieldGroup([], ALL_FIELDS_GROUP.name)
  }, [onSetActiveFieldGroup])

  const syncing = syncState !== 'synced'
  useEffect(() => {
    onSyncing?.(syncing)
    return () => onSyncing?.(false)
  }, [onSyncing, syncing])

  const members = useMemo(
    () =>
      (formState?.members ?? []).filter(
        (member) => !(member.kind === 'field' && (member.name === fields.title || member.name === fields.body)),
      ),
    [formState?.members, fields.title, fields.body],
  )

  if (!formState || !form.ready) return <Placeholder $height="12rem" />

  return (
    <InRoomDetails.Provider value>
      <Root data-calm-details="">
        <FormBuilder
          __internal_patchChannel={patchChannel}
          id="writing-room-details"
          changed={formState.changed}
          collapsedFieldSets={form.collapsedFieldSets}
          collapsedPaths={form.collapsedPaths}
          focused={formState.focused}
          focusPath={formState.focusPath}
          groups={[]}
          members={members}
          onChange={form.onChange}
          onFieldGroupSelect={onSetActiveFieldGroup}
          onPathBlur={form.onBlur}
          onPathFocus={form.onFocus}
          onPathOpen={form.onPathOpen}
          onSetFieldSetCollapsed={form.onSetCollapsedFieldSet}
          onSetPathCollapsed={form.onSetCollapsedPath}
          openPath={form.openPath}
          presence={formState.presence}
          schemaType={formState.schemaType}
          validation={formState.validation}
          value={form.value}
          hasUpstreamVersion={false}
          hasBaseVariant={false}
        />
      </Root>
    </InRoomDetails.Provider>
  )
}

const Root = styled.div`
  margin-top: var(--calm-space-xl);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
  line-height: 1.4;
`
