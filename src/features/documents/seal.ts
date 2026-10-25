export type DocStatus = 'issued' | 'void' | 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'invoiced'

/**
 * The stamp and signature belong on an issued invoice only — never on a
 * quotation, a draft, or a voided invoice. Both the document and the code
 * that loads the images ask this one function.
 */
export function sealAllowed(doc: { kind: 'invoice' | 'quote'; status: DocStatus }): boolean {
  return doc.kind === 'invoice' && doc.status === 'issued'
}
