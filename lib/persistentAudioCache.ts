interface PersistentAudioRecord {
  key: string;
  blob: Blob;
  byteSize: number;
  createdAt: number;
  lastUsed: number;
  apiEndpoint: string;
  voice: string;
  style: string;
  text: string;
}

interface PersistentAudioWriteInput {
  key: string;
  blob: Blob;
  apiEndpoint: string;
  voice: string;
  style: string;
  text: string;
}

const PERSISTENT_AUDIO_DB_NAME = "tts-word-reader-audio-cache";
const PERSISTENT_AUDIO_DB_VERSION = 1;
const PERSISTENT_AUDIO_STORE_NAME = "audio";
const PERSISTENT_AUDIO_CACHE_MAX_ITEMS = 500;
const PERSISTENT_AUDIO_CACHE_MAX_BYTES = 300 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase | null> | null = null;

export function openPersistentAudioDb() {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = window.indexedDB.open(PERSISTENT_AUDIO_DB_NAME, PERSISTENT_AUDIO_DB_VERSION);
    } catch (error) {
      console.error("打开 IndexedDB 音频缓存失败:", error);
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(PERSISTENT_AUDIO_STORE_NAME)
        ? request.transaction?.objectStore(PERSISTENT_AUDIO_STORE_NAME)
        : db.createObjectStore(PERSISTENT_AUDIO_STORE_NAME, { keyPath: "key" });

      if (store && !store.indexNames.contains("lastUsed")) {
        store.createIndex("lastUsed", "lastUsed", { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      console.error("打开 IndexedDB 音频缓存失败:", request.error);
      resolve(null);
    };

    request.onblocked = () => {
      console.warn("IndexedDB 音频缓存升级被其他页面阻塞");
    };
  });

  return dbPromise;
}

export async function closePersistentAudioDb() {
  const db = await dbPromise;
  db?.close();
  dbPromise = null;
}

export async function readPersistentAudioBlob(key: string) {
  const db = await openPersistentAudioDb();
  if (!db) return null;

  return new Promise<Blob | null>((resolve) => {
    let settled = false;
    const settle = (value: Blob | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const record = request.result as PersistentAudioRecord | undefined;
      if (!record?.blob) {
        settle(null);
        return;
      }

      record.lastUsed = Date.now();
      store.put(record);
      settle(record.blob);
    };

    request.onerror = () => {
      console.error("读取 IndexedDB 音频缓存失败:", request.error);
      settle(null);
    };

    transaction.onerror = () => {
      console.error("IndexedDB 音频缓存读取事务失败:", transaction.error);
      settle(null);
    };
  });
}

export async function writePersistentAudioBlob(input: PersistentAudioWriteInput) {
  const db = await openPersistentAudioDb();
  if (!db) return;

  const now = Date.now();
  const record: PersistentAudioRecord = {
    key: input.key,
    blob: input.blob,
    byteSize: input.blob.size,
    createdAt: now,
    lastUsed: now,
    apiEndpoint: input.apiEndpoint,
    voice: input.voice,
    style: input.style,
    text: input.text,
  };

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);

    store.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error("写入 IndexedDB 音频缓存失败:", transaction.error);
      resolve();
    };
  });

  prunePersistentAudioCache().catch((error) => {
    console.error("清理 IndexedDB 音频缓存失败:", error);
  });
}

export async function prunePersistentAudioCache() {
  const db = await openPersistentAudioDb();
  if (!db) return;

  const scanResult = await new Promise<{
    totalItems: number;
    totalBytes: number;
    evictableRecords: Array<{ key: string; byteSize: number }>;
  }>((resolve) => {
    const evictableRecords: Array<{ key: string; byteSize: number }> = [];
    let totalItems = 0;
    let totalBytes = 0;

    const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readonly");
    const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);
    const index = store.index("lastUsed");
    const request = index.openCursor();

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve({ totalItems, totalBytes, evictableRecords });
        return;
      }

      const record = cursor.value as PersistentAudioRecord;
      const byteSize = record.byteSize || record.blob?.size || 0;
      totalItems += 1;
      totalBytes += byteSize;
      evictableRecords.push({ key: record.key, byteSize });
      cursor.continue();
    };

    request.onerror = () => {
      console.error("读取 IndexedDB 音频缓存列表失败:", request.error);
      resolve({ totalItems: 0, totalBytes: 0, evictableRecords: [] });
    };
  });

  let { totalItems, totalBytes } = scanResult;
  if (totalItems <= PERSISTENT_AUDIO_CACHE_MAX_ITEMS && totalBytes <= PERSISTENT_AUDIO_CACHE_MAX_BYTES) {
    return;
  }

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);

    for (const record of scanResult.evictableRecords) {
      if (totalItems <= PERSISTENT_AUDIO_CACHE_MAX_ITEMS && totalBytes <= PERSISTENT_AUDIO_CACHE_MAX_BYTES) {
        break;
      }

      store.delete(record.key);
      totalItems -= 1;
      totalBytes -= record.byteSize;
    }

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error("清理 IndexedDB 音频缓存失败:", transaction.error);
      resolve();
    };
  });
}

export async function clearPersistentAudioCache() {
  const db = await openPersistentAudioDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const transaction = db.transaction(PERSISTENT_AUDIO_STORE_NAME, "readwrite");
    const store = transaction.objectStore(PERSISTENT_AUDIO_STORE_NAME);

    store.clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => {
      console.error("清空 IndexedDB 音频缓存失败:", transaction.error);
      resolve();
    };
  });
}
