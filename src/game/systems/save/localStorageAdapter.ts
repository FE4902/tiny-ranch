import {
  decodeSaveState,
  type SaveStateDecodeErrorCode,
  type SaveStateV1,
} from './schema'

const DEFAULT_STORAGE_KEY = 'tiny-ranch:save-state'

export type SaveStorageErrorCode = SaveStateDecodeErrorCode | 'invalid_json' | 'storage_unavailable'

export class SaveStorageError extends Error {
  readonly code: SaveStorageErrorCode

  constructor(code: SaveStorageErrorCode, message: string) {
    super(message)
    this.name = 'SaveStorageError'
    this.code = code
  }
}

export type SaveStorageReadResult =
  | {
      state: SaveStateV1 | null
      error: null
    }
  | {
      state: null
      error: SaveStorageError
    }

export interface SaveStorageAdapter {
  read(): SaveStorageReadResult
  write(state: SaveStateV1): void
  reset(): void
}

export interface LocalStorageSaveAdapterOptions {
  storageKey?: string
  storage?: Storage
}

function resolveStorage(explicitStorage?: Storage): Storage {
  if (explicitStorage) {
    return explicitStorage
  }

  if (typeof window === 'undefined' || !window.localStorage) {
    throw new SaveStorageError('storage_unavailable', 'localStorage is not available in this environment.')
  }

  return window.localStorage
}

export function createLocalStorageSaveAdapter(
  options: LocalStorageSaveAdapterOptions = {},
): SaveStorageAdapter {
  const storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY

  const getStorage = (): Storage => {
    return resolveStorage(options.storage)
  }

  const read = (): SaveStorageReadResult => {
    let rawValue: string | null

    try {
      rawValue = getStorage().getItem(storageKey)
    } catch {
      return {
        state: null,
        error: new SaveStorageError(
          'storage_unavailable',
          'Unable to read save data from localStorage.',
        ),
      }
    }

    if (rawValue === null) {
      return {
        state: null,
        error: null,
      }
    }

    let parsedValue: unknown
    try {
      parsedValue = JSON.parse(rawValue)
    } catch {
      return {
        state: null,
        error: new SaveStorageError('invalid_json', 'Save payload is not valid JSON.'),
      }
    }

    const decoded = decodeSaveState(parsedValue)
    if (!decoded.ok) {
      return {
        state: null,
        error: new SaveStorageError(decoded.error.code, decoded.error.message),
      }
    }

    return {
      state: decoded.value,
      error: null,
    }
  }

  const write = (state: SaveStateV1): void => {
    getStorage().setItem(storageKey, JSON.stringify(state))
  }

  const reset = (): void => {
    getStorage().removeItem(storageKey)
  }

  return {
    read,
    write,
    reset,
  }
}
