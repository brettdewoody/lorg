declare module '@mapbox/polyline' {
  export function decode(input: string, precision?: number): [number, number][]
  export function encode(coordinates: [number, number][], precision?: number): string
  const polyline: {
    decode: typeof decode
    encode: typeof encode
  }
  export default polyline
}

declare module 'pg' {
  import type { EventEmitter } from 'node:events'

  export interface PoolConfig {
    connectionString?: string
    max?: number
    maxUses?: number
    idleTimeoutMillis?: number
    connectionTimeoutMillis?: number
    keepAlive?: boolean
    ssl?: boolean | { rejectUnauthorized?: boolean }
  }

  export interface QueryResult<T = unknown> {
    rows: T[]
    rowCount: number
  }

  export interface PoolClient {
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>
    release(): void
  }

  export class Pool extends EventEmitter {
    constructor(config?: PoolConfig)
    connect(): Promise<PoolClient>
    end(): Promise<void>
    query<T = unknown>(text: string, params?: unknown[]): Promise<QueryResult<T>>
    on(event: 'error', listener: (error: unknown) => void): this
  }
}
