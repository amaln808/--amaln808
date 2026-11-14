/**
 * Bundled logo as an absolute URL. The build uses a relative base ('./'), and a
 * relative url() inside a CSS variable resolves against the stylesheet folder
 * (assets/), so the logo mask came out empty. Resolving against the page fixes it
 * on any host or sub-path.
 */
const relative = `${import.meta.env.BASE_URL}logo.png`
export const LOGO_URL = typeof document === 'undefined' ? relative : new URL(relative, document.baseURI).href
