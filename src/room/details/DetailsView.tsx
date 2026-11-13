import {type DocumentHandle} from '@sanity/sdk-react'
import {useEffect, useMemo, useState} from 'react'
import {
  ALL_FIELDS_GROUP,
  ChangeIndicatorsTracker,
  createPatchChannel,
  FormBuilder,
  useDocumentForm,
} from 'sanity'
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
  focusField,
}: {
  handle: DocumentHandle
  fields: WritingFields
  /** A publish problem or a nudge can send the Writer to one field. */
  focusField?: string
}) {
  const [patchChannel] = useState(() => createPatchChannel())
  const form = useDocumentForm({documentId: handle.documentId, documentType: handle.documentType})
  const {formState, onSetActiveFieldGroup, onProgrammaticFocus, ready} = form

  useEffect(() => {
    onSetActiveFieldGroup([], ALL_FIELDS_GROUP.name)
  }, [onSetActiveFieldGroup])

  const hasForm = !!formState && ready
  useEffect(() => {
    if (hasForm && focusField) onProgrammaticFocus([focusField])
  }, [hasForm, focusField, onProgrammaticFocus])

  const members = useMemo(
    () =>
      (formState?.members ?? []).filter(
        (member) => !(member.kind === 'field' && (member.name === fields.title || member.name === fields.body)),
      ),
    [formState?.members, fields.title, fields.body],
  )

  if (!formState || !ready) return <Placeholder $height="12rem" />

  return (
    <InRoomDetails.Provider value>
      <Root data-calm-details="">
        <ChangeIndicatorsTracker>
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
        </ChangeIndicatorsTracker>
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
