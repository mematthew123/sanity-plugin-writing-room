import {type BlockObjectRenderProps, useEditor} from '@portabletext/editor'
import {useState} from 'react'
import {EMBED_PROVIDER_NAMES, embedPlayerUrl, parseEmbedUrl} from '../../../embed'
import {useBlockField} from '../use-block-field'
import {BlockFrame, Caution, Controls, FieldInput} from './frame'
import styles from './EmbedBlock.module.css'

export function EmbedBlock({attributes, children, node, selected, focused}: BlockObjectRenderProps) {
  const url = typeof node.url === 'string' ? node.url : ''
  return (
    <BlockFrame {...attributes} data-calm-block={node._key} selected={selected}>
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
    <div className={styles.card}>
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
    </div>
  )
}

function EmbedCard({blockKey, url, caption}: {blockKey: string; url: string; caption: unknown}) {
  const [previewing, setPreviewing] = useState(false)
  const captionField = useBlockField(blockKey, 'caption', caption)
  const embed = parseEmbedUrl(url)

  return (
    <div className={styles.card}>
      <Controls>
        <div className={styles.header}>
          <span className={styles.provider}>{embed ? EMBED_PROVIDER_NAMES[embed.provider] : 'Embed'}</span>
          {embed && (
            <button className={styles.previewToggle} type="button" onClick={() => setPreviewing((on) => !on)}>
              {previewing ? 'Hide preview' : 'Preview'}
            </button>
          )}
        </div>
        <div className={styles.link} title={url}>{url}</div>
        {previewing && embed && (
          <iframe
            className={styles.player}
            data-audio={embed.provider === 'spotify' || undefined}
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
    </div>
  )
}
