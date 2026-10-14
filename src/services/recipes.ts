import type { FactoryDB } from '../db/db'
import { newRecord } from '../db/records'
import { SETTINGS_ID } from '../db/seed'
import type { ID, Recipe, RecipeComponent } from '../db/types'
import { UserError } from './errors'

export interface RecipeInput {
  finishedItemId: ID
  name?: string
  components: RecipeComponent[]
}

/** One recipe per finished product. Saving clears the "estimated" flag. */
export async function saveRecipe(db: FactoryDB, input: RecipeInput): Promise<ID> {
  const components = input.components.filter((c) => c.itemId)
  if (!components.length) throw new UserError('أضف مكوّناً واحداً على الأقل')
  if (components.some((c) => !(c.qtyPerUnit > 0))) throw new UserError('كمية كل مكوّن يجب أن تكون أكبر من صفر')
  if (new Set(components.map((c) => c.itemId)).size !== components.length) throw new UserError('يوجد مكوّن مكرر')

  return db.transaction('rw', db.recipes, db.items, async () => {
    const product = await db.items.get(input.finishedItemId)
    if (!product || product.type !== 'finished') throw new UserError('اختر منتجاً نهائياً')
    for (const c of components) {
      const item = await db.items.get(c.itemId)
      if (!item) throw new UserError('أحد المكونات غير موجود')
      if (item.type === 'finished') throw new UserError(`«${item.name}» منتج نهائي ولا يكون مكوّناً`)
    }
    const name = input.name?.trim() || product.name
    const existing = await db.recipes.where('finishedItemId').equals(input.finishedItemId).first()
    if (existing) {
      await db.recipes.put({ ...existing, name, components, isEstimate: false, updatedAt: new Date().toISOString() })
      return existing.id
    }
    const recipe: Recipe = newRecord({ finishedItemId: input.finishedItemId, name, components, active: true })
    await db.recipes.add(recipe)
    return recipe.id
  })
}

export async function deleteRecipe(db: FactoryDB, id: ID): Promise<void> {
  await db.recipes.delete(id)
}

/** Starter quantities per jar: ~70% dates, ~30% peanut, plus jar, lid and label. */
const ESTIMATES: Record<number, Array<[string, number]>> = {
  250: [
    ['معجون تمر', 0.175],
    ['فول سوداني', 0.075],
    ['علبة 250 جم', 1],
    ['غطاء علبة', 1],
    ['ملصق', 1],
  ],
  500: [
    ['معجون تمر', 0.35],
    ['فول سوداني', 0.15],
    ['علبة 500 جم', 1],
    ['غطاء علبة', 1],
    ['ملصق', 1],
  ],
}

/**
 * Creates estimated recipes for the starter products, once per database.
 * Components are matched by the starter item names; missing ones are skipped.
 */
export async function seedEstimatedRecipes(db: FactoryDB): Promise<void> {
  await db.transaction('rw', db.settings, db.items, db.recipes, async () => {
    const settings = await db.settings.get(SETTINGS_ID)
    if (!settings || settings.recipesSeeded) return
    const items = await db.items.toArray()
    const byName = new Map(items.map((i) => [i.name, i]))
    for (const product of items.filter((i) => i.type === 'finished' && i.packageSizeG)) {
      const spec = ESTIMATES[product.packageSizeG!]
      if (!spec || (await db.recipes.where('finishedItemId').equals(product.id).count())) continue
      const components = spec
        .map(([name, qtyPerUnit]) => ({ itemId: byName.get(name)?.id ?? '', qtyPerUnit }))
        .filter((c) => c.itemId)
      if (!components.length) continue
      await db.recipes.add(
        newRecord({ finishedItemId: product.id, name: product.name, components, active: true, isEstimate: true }),
      )
    }
    await db.settings.put({ ...settings, recipesSeeded: true, updatedAt: new Date().toISOString() })
  })
}
