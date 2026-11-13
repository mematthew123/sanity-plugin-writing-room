import {type DocumentHandle} from '@sanity/sdk-react'
import {useEffect, useMemo, useRef, useState} from 'react'
import {
  ALL_FIELDS_GROUP,
  ChangeIndicatorsTracker,
  createPatchChannel,
  FormBuilder,
  type ObjectMember,
  stringToPath,
  useDocumentForm,
} from 'sanity'
import styled from 'styled-components'
import {type WritingFields} from '../fields'
import {onDetailsFocusAsked, onFirstDetailAsked} from '../navigation'
import {Placeholder} from '../primitives'
import {DetailsDocument, InRoomDetails} from './room-form'

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
  /** A publish problem or a nudge can send the Writer to one field, named by its path. */
  focusField?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  const [patchChannel] = useState(() => createPatchChannel())
  const form = useDocumentForm({documentId: handle.documentId, documentType: handle.documentType})
  const {formState, onSetActiveFieldGroup, onProgrammaticFocus, ready} = form

  useEffect(() => {
    onSetActiveFieldGroup([], ALL_FIELDS_GROUP.name)
  }, [onSetActiveFieldGroup])

  const hasForm = !!formState && ready
  // Read through a ref, so a new function from the form never moves focus on its own.
  const focusPath = useRef(onProgrammaticFocus)
  useEffect(() => {
    focusPath.current = onProgrammaticFocus
  })
  useEffect(() => {
    if (!hasForm) return undefined
    if (!focusField) {
      // Nowhere in particular to go: focus arrives at the top of Details, one Tab from its first field.
      root.current?.focus({preventScroll: true})
      return undefined
    }
    const focus = () => focusPath.current(stringToPath(focusField))
    focus()
    return onDetailsFocusAsked(focus)
  }, [hasForm, focusField])

  const members = useMemo(
    () => withoutFields(formState?.members ?? [], [fields.title, fields.body]),
    [formState?.members, fields.title, fields.body],
  )

  // Sanity moves focus by path: it opens a collapsed fieldset on the way, which a DOM focus wouldn't.
  const firstField = members.flatMap((member) =>
    member.kind === 'field' ? [member] : member.kind === 'fieldSet' ? member.fieldSet.members : [],
  ).find((member) => member.kind === 'field')?.name
  useEffect(() => {
    if (!firstField) return undefined
    return onFirstDetailAsked(() => focusPath.current([firstField]))
  }, [firstField])

  if (!formState || !ready) return <Placeholder $height="12rem" />

  return (
    <InRoomDetails.Provider value>
      <DetailsDocument.Provider value={handle.documentId}>
        <Root ref={root} tabIndex={-1} data-calm-details="">
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
              readOnly={formState.readOnly}
              schemaType={formState.schemaType}
              validation={formState.validation}
              value={form.value}
              hasUpstreamVersion={false}
              hasBaseVariant={false}
            />
          </ChangeIndicatorsTracker>
        </Root>
      </DetailsDocument.Provider>
    </InRoomDetails.Provider>
  )
}

/** The title and the body are the room's own, wherever the schema keeps them: a fieldset included. */
function withoutFields(members: ObjectMember[], names: string[]): ObjectMember[] {
  return members.flatMap((member): ObjectMember[] => {
    if (member.kind === 'field') return names.includes(member.name) ? [] : [member]
    if (member.kind !== 'fieldSet') return [member]
    const inside = member.fieldSet.members.filter((own) => !(own.kind === 'field' && names.includes(own.name)))
    if (inside.length === member.fieldSet.members.length) return [member]
    return inside.length > 0 ? [{...member, fieldSet: {...member.fieldSet, members: inside}}] : []
  })
}

const Root = styled.div`
  margin-top: var(--calm-space-xl);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
  line-height: 1.4;

  &:focus {
    outline: none;
  }
`
