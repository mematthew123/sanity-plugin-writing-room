import {type BlockObjectRenderProps, useEditor} from '@portabletext/editor'
import {useState} from 'react'
import styled from 'styled-components'
import {EMBED_PROVIDER_NAMES, embedPlayerUrl, parseEmbedUrl} from '@calm/content'
import {useBlockField} from '../use-block-field'
import {BlockFrame, Caution, Controls, FieldInput} from './frame'

export function EmbedBlock({attributes, children, node, selected, focused}: BlockObjectRenderProps) {
  const url = typeof node.url === 'string' ? node.url : ''
  return (
    <BlockFrame {...attributes} data-calm-block={node._key} $selected={selected}>
      {children}
      {url ? (
        <EmbedCard blockKey={node._key} url={url} caption={node.caption} />
      ) : (
        <EmbedLinkPrompt blockKey={node._key} autoFocus={focused} />
      )}
    </BlockFrame>
  )
}

function EmbedLinkPrompt({blockKey, autoFocus}: {blockKey: string; autoFocus: boolean}) {
  const editor = useEditor()
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  function submit() {
    const link = draft.trim()
    if (!link) return
    if (!parseEmbedUrl(link)) {
      setProblem('This link isn’t from YouTube, Vimeo or Spotify.')
      return
    }
    editor.send({type: 'block.set', at: [{_key: blockKey}], props: {url: link}})
  }

  return (
    <Card>
      <Controls>
        <FieldInput
           
          autoFocus={autoFocus}
          aria-label="Embed link"
          data-calm-field={`${blockKey}.url`}
          placeholder="Paste a YouTube, Vimeo or Spotify link"
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            setProblem(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submit()
            }
          }}
          onBlur={submit}
        />
        {problem && <Caution role="alert">{problem}</Caution>}
      </Controls>
    </Card>
  )
}

function EmbedCard({blockKey, url, caption}: {blockKey: string; url: string; caption: unknown}) {
  const [previewing, setPreviewing] = useState(false)
  const captionField = useBlockField(blockKey, 'caption', caption)
  const embed = parseEmbedUrl(url)

  return (
    <Card>
      <Controls>
        <Header>
          <Provider>{embed ? EMBED_PROVIDER_NAMES[embed.provider] : 'Embed'}</Provider>
          {embed && (
            <PreviewToggle type="button" onClick={() => setPreviewing((on) => !on)}>
              {previewing ? 'Hide preview' : 'Preview'}
            </PreviewToggle>
          )}
        </Header>
        <Link title={url}>{url}</Link>
        {previewing && embed && (
          <Player
            $audio={embed.provider === 'spotify'}
            src={embedPlayerUrl(embed)}
            title={`${EMBED_PROVIDER_NAMES[embed.provider]} preview`}
            allow="encrypted-media; picture-in-picture; fullscreen"
            loading="lazy"
          />
        )}
        {!embed && <Caution>This link isn’t from YouTube, Vimeo or Spotify.</Caution>}
        <FieldInput
          aria-label="Caption"
          placeholder="Add a caption (optional)"
          value={captionField.value}
          onChange={(event) => captionField.onChange(event.currentTarget.value)}
          onBlur={captionField.onBlur}
        />
      </Controls>
    </Card>
  )
}

const Card = styled.div`
  padding: var(--calm-space-md);
  border-radius: var(--calm-radius-large);
  background: var(--calm-color-surface);
  font-family: var(--calm-font-ui);
  font-size: var(--calm-type-ui-size);
`

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--calm-space-md);
`

const Provider = styled.span`
  color: var(--calm-color-ink);
  font-weight: var(--calm-weight-ui-strong);
`

const PreviewToggle = styled.button`
  padding: var(--calm-space-xs) var(--calm-space-sm);
  border: 0;
  border-radius: var(--calm-radius-pill);
  background: transparent;
  color: var(--calm-color-ink-muted);
  font: inherit;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: var(--calm-color-paper);
    color: var(--calm-color-ink);
  }
`

const Link = styled.div`
  overflow: hidden;
  margin-top: var(--calm-space-xs);
  color: var(--calm-color-ink-muted);
  font-size: var(--calm-type-ui-size-small);
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Player = styled.iframe<{$audio: boolean}>`
  display: block;
  width: 100%;
  height: ${({$audio}) => ($audio ? '152px' : 'auto')};
  aspect-ratio: ${({$audio}) => ($audio ? 'auto' : '16 / 9')};
  margin-top: var(--calm-space-sm);
  border: 0;
  border-radius: var(--calm-radius);
`
