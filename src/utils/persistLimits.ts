/**
 * Size limit for persisting rendered model data to IndexedDB.
 * If total STL data exceeds this, no model/camera/render state is persisted.
 */
export const MAX_MODEL_PERSIST_BYTES = 100 * 1024 * 1024; // 100 MB
