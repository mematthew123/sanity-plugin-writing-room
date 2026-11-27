import {type DocumentHandle} from '@sanity/sdk-react'
import {
  type ComponentProps,
  type HTMLAttributes,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ALL_FIELDS_GROUP,
  ChangeIndicatorsTracker,
  CopyPasteProvider,
  createPatchChannel,
  FormBuilder,
  type ObjectMember,
  ReferenceInputOptionsProvider,
  stringToPath,
  useDocumentForm,
  VirtualizerScrollInstanceProvider,
} from 'sanity'
import {type WritingFields} from '../fields'
import {onDetailsFocusAsked, onFirstDetailAsked} from '../navigation'
import {Placeholder} from '../primitives'
import {DetailsDocument, InRoomDetails} from './room-form'
import styles from './DetailsView.module.css'

type ReferenceLink = NonNullable<
  ComponentProps<typeof ReferenceInputOptionsProvider>['EditReferenceLinkComponent']
>

/**
 * Sanity draws a reference's preview inside the link its host gives it, and nothing at all when
 * there is none. In the room it isn't a link: the other document can't be opened without leaving.
 */
const ReferenceFrame: ReferenceLink = ({
  documentId: _documentId,
  documentType: _documentType,
  parentRefPath: _parentRefPath,
  template: _template,
  ...rest
}) => <div {...(rest as HTMLAttributes<HTMLDivElement>)} />

/**
 * Every field but the title and the body, rendered by the Studio's own form,
 * on one page in schema order.
 */
export function DetailsView({
  handle,
  fields,
  scrollContent,
  focusField,
  lockedRelease,
}: {
  handle: DocumentHandle
  fields: WritingFields
  scrollContent: RefObject<HTMLDivElement | null>
  lockedRelease?: string
  /** A publish problem or a nudge can send the Writer to one field, named by its path. */
  focusField?: string
}) {
  const root = useRef<HTMLDivElement>(null)
  // Sanity's array input virtualizes long lists and needs to know what it scrolls in.
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const attach = useCallback((node: HTMLDivElement | null) => {
    root.current = node
    setScroller(node?.closest<HTMLElement>('[data-calm-surface]') ?? null)
  }, [])
  const [patchChannel] = useState(() => createPatchChannel())
  const form = useDocumentForm({
    documentId: handle.documentId,
    documentType: handle.documentType,
    ...(lockedRelease && {
      releaseId: lockedRelease,
      selectedPerspectiveName: lockedRelease,
      readOnly: true,
    }),
  })
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
  const firstField = members
    .flatMap((member) =>
      member.kind === 'field'
        ? [member]
        : member.kind === 'fieldSet'
          ? member.fieldSet.members
          : [],
    )
    .find((member) => member.kind === 'field')?.name
  useEffect(() => {
    if (!firstField) return undefined
    return onFirstDetailAsked(() => focusPath.current([firstField]))
  }, [firstField])

  if (!formState || !ready) return <Placeholder className={styles.placeholder} />

  return (
    <InRoomDetails.Provider value>
      <DetailsDocument.Provider value={handle.documentId}>
        <div className={styles.root} ref={attach} tabIndex={-1} data-calm-details="">
          {/* Sanity measures list offsets from the top of the room's scrolling content. */}
          <VirtualizerScrollInstanceProvider scrollElement={scroller} containerElement={scrollContent}>
            <ChangeIndicatorsTracker>
              {/* The items of a list of objects read this; without it they throw. */}
              <CopyPasteProvider>
                <ReferenceInputOptionsProvider EditReferenceLinkComponent={ReferenceFrame}>
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
                </ReferenceInputOptionsProvider>
              </CopyPasteProvider>
            </ChangeIndicatorsTracker>
          </VirtualizerScrollInstanceProvider>
        </div>
      </DetailsDocument.Provider>
    </InRoomDetails.Provider>
  )
}

/** The title and the body are the room's own, wherever the schema keeps them: a fieldset included. */
function withoutFields(members: ObjectMember[], names: string[]): ObjectMember[] {
  return members.flatMap((member): ObjectMember[] => {
    if (member.kind === 'field') return names.includes(member.name) ? [] : [member]
    if (member.kind !== 'fieldSet') return [member]
    const inside = member.fieldSet.members.filter(
      (own) => !(own.kind === 'field' && names.includes(own.name)),
    )
    if (inside.length === member.fieldSet.members.length) return [member]
    return inside.length > 0 ? [{...member, fieldSet: {...member.fieldSet, members: inside}}] : []
  })
}
