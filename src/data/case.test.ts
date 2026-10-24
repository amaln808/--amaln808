import { describe, expect, it } from 'vitest'
import { toCamel, toSnake } from './case'

describe('case conversion', () => {
  it('converts database rows to app records and back', () => {
    const row = { company_name: 'زوردة', default_vat_rate: '0.00', max_aflatoxin_ppb: null, id: 1 }
    const rec = toCamel(row)
    expect(rec).toEqual({ companyName: 'زوردة', defaultVatRate: '0.00', maxAflatoxinPpb: null, id: 1 })
    expect(toSnake(rec)).toEqual(row)
  })

  it('leaves out undefined fields', () => {
    expect(toSnake({ phone: undefined, email: '' })).toEqual({ email: '' })
  })
})
