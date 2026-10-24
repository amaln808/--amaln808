/** Postgres uses snake_case columns, the app camelCase fields; these convert one record (shallow). */

type CamelCase<S extends string> = S extends `${infer H}_${infer T}` ? `${H}${Capitalize<CamelCase<T>>}` : S
export type Camel<T> = { [K in keyof T as K extends string ? CamelCase<K> : K]: T[K] }

const camelKey = (k: string) => k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const snakeKey = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

export function toCamel<T extends object>(row: T): Camel<T> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [camelKey(k), v])) as Camel<T>
}

/** Drops undefined fields so a partial update only touches what was given. */
export function toSnake(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [snakeKey(k), v]),
  )
}
