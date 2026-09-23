export interface DocumentAsset {
  path: string
  type: string
  blob: Blob
}

export interface StoredDocument {
  id: string
  name: string
  sourceType: "docx" | "text" | "markdown" | "mineru"
  sourceFile: Blob
  html?: string
  markdown?: string
  assets: DocumentAsset[]
  createdAt: number
  updatedAt: number
  byteSize: number
}

export type StoredDocumentSummary = Pick<
  StoredDocument,
  "id" | "name" | "sourceType" | "createdAt" | "updatedAt" | "byteSize"
>

const DB_NAME = "tts-word-reader-documents"
const DB_VERSION = 1
const STORE_NAME = "documents"

function openDocumentDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("updatedAt", "updatedAt")
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runRequest<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDocumentDb().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode)
    const request = action(transaction.objectStore(STORE_NAME))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => db.close()
    transaction.onerror = () => reject(transaction.error)
  }))
}

export function saveDocument(document: StoredDocument) {
  return runRequest("readwrite", (store) => store.put(document))
}

export function getDocument(id: string) {
  return runRequest<StoredDocument | undefined>("readonly", (store) => store.get(id))
}

export async function listDocuments(): Promise<StoredDocumentSummary[]> {
  const documents = await runRequest<StoredDocument[]>("readonly", (store) => store.getAll())
  return documents
    .map(({ id, name, sourceType, createdAt, updatedAt, byteSize }) => ({
      id,
      name,
      sourceType,
      createdAt,
      updatedAt,
      byteSize,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function deleteDocuments(ids: string[]) {
  if (ids.length === 0) return
  const db = await openDocumentDb()
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    ids.forEach((id) => store.delete(id))
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
  db.close()
}
