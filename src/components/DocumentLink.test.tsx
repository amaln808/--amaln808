import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DocIcon, OpenDocumentButton } from './DocumentLink'

const LINK = 'https://drive.google.com/file/d/1AbC/view'

describe('document link buttons', () => {
  it('«فتح المستند» opens the link in a new tab', () => {
    const html = renderToStaticMarkup(<OpenDocumentButton url={LINK} />)
    expect(html).toContain(`href="${LINK}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('noopener')
    expect(html).toContain('فتح المستند')
  })

  it('shows nothing without a link, or with a link that is not https', () => {
    for (const url of [null, '', '  ', 'javascript:alert(1)', 'http://x.com/a'])
      expect(renderToStaticMarkup(<OpenDocumentButton url={url} />)).toBe('')
  })

  it('📎 only for records that have a link', () => {
    expect(renderToStaticMarkup(<DocIcon url={LINK} />)).toContain('📎')
    expect(renderToStaticMarkup(<DocIcon url={null} />)).toBe('')
  })
})
