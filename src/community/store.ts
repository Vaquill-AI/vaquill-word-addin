/**
 * Local persistence for the community edition, replacing the Supabase-backed CRUD
 * endpoints. Single-user, on-device, IndexedDB. No auth or org scoping needed.
 *
 * Hand-rolled (no dependency) thin wrapper: one database, one object store per
 * entity keyed by `id`.
 */
const DB_NAME = "vaquill_community";
const DB_VERSION = 2;
export const STORES = ["prompts", "clauses", "playbooks"] as const;
export type StoreName = (typeof STORES)[number];

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function run<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

export function getAll<T>(store: StoreName): Promise<T[]> {
  return run<T[]>(store, "readonly", (s) => s.getAll());
}

export function get<T>(store: StoreName, id: string): Promise<T | undefined> {
  return run<T | undefined>(store, "readonly", (s) => s.get(id));
}

export function put<T extends { id: string }>(store: StoreName, value: T): Promise<void> {
  return run<IDBValidKey>(store, "readwrite", (s) => s.put(value)).then(() => undefined);
}

export function del(store: StoreName, id: string): Promise<void> {
  return run<undefined>(store, "readwrite", (s) => s.delete(id)).then(() => undefined);
}
