// fileSystemUtils.ts
// This module contains helper functions for interacting with the FileSystemAccessAPI,
// including persisting a directory handle for future use.
import { emitUiLog } from "./uiLogger";

export type OpenFilePickerOptions = {
  multiple?: boolean;
  types?: { description: string; accept: { [type: string]: string[] } }[];
  startIn?: FileSystemDirectoryHandle;
};

export type SaveFilePickerOptions = {
  suggestedName?: string;
  types?: { description: string; accept: { [type: string]: string[] } }[];
  startIn?: FileSystemDirectoryHandle;
};

export async function storeFileHandle(
  handle: FileSystemFileHandle
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    openDB()
      .then((db) => {
        const tx = db.transaction("handles", "readwrite");
        const store = tx.objectStore("handles");
        const request = store.put(handle, "lastFile");

        request.onsuccess = () => {
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };

        request.onerror = () => {
          db.close();
          reject(new Error("Failed to store file handle"));
        };

        tx.onerror = () => {
          db.close();
          reject(new Error("Transaction failed"));
        };
      })
      .catch((error) => {
        reject(new Error(`Failed to open database: ${error.message}`));
      });
  });
}

/**
 * No-op for project config directories.
 * Editor state is persisted in localStorage.
 */
export async function ensureProjectConfigDirs(
  _handle: FileSystemDirectoryHandle
): Promise<void> {
  // no-op
}

export async function getStoredFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction("handles", "readonly");
    const store = tx.objectStore("handles");
    const request = store.get("lastFile");
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    emitUiLog(
      "error",
      `Error retrieving stored file handle: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

export async function deleteStoredFileHandle(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction("handles", "readwrite");
    const store = tx.objectStore("handles");
    const request = store.delete("lastFile");
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
      request.onerror = () => {
        emitUiLog(
          "error",
          `Failed to delete file handle: ${request.error?.message ?? "unknown error"}`
        );
        db.close();
        reject(request.error);
      };
      tx.onerror = () => {
        db.close();
        reject(new Error("Transaction failed"));
      };
    });
  } catch (error) {
    emitUiLog(
      "error",
      `Error deleting stored file handle: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function reopenLastFile(): Promise<{
  fileHandle: FileSystemFileHandle;
  content: string;
} | null> {
  const fileHandle = await getStoredFileHandle();
  if (fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const content = await file.text();
      return { fileHandle, content };
    } catch (error) {
      emitUiLog(
        "error",
        `Error reopening last file: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
  return null;
}

export async function openExistingFile(
  lastDirectoryHandle?: FileSystemDirectoryHandle
): Promise<{ fileHandle: FileSystemFileHandle; content: string } | null> {
  const options: OpenFilePickerOptions = {
    multiple: false,
    types: [
      {
        description: "OpenSCAD Files",
        accept: { "application/scad": [".scad"] },
      },
    ],
  };
  // If a previous directory is known, hint to the picker
  if (lastDirectoryHandle) {
    options.startIn = lastDirectoryHandle;
  }
  try {
    const [handle] = await (
      window as object as {
        showOpenFilePicker: (
          options: OpenFilePickerOptions
        ) => Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker(options);

    // Request read/write permission immediately
    const permissionState = await (
      handle as object as {
        queryPermission: (options: {
          mode: "readwrite" | "read";
        }) => Promise<"granted" | "denied" | "prompt">;
      }
    ).queryPermission({ mode: "readwrite" });
    if (permissionState !== "granted") {
       await (
        handle as object as {
          requestPermission: (options: {
            mode: "readwrite" | "read";
          }) => Promise<"granted" | "denied" | "prompt">;
        }
      ).requestPermission({ mode: "readwrite" });
    }
    const file = await handle.getFile();
    const content = await file.text();
    return { fileHandle: handle, content };
  } catch (error) {
    emitUiLog(
      "error",
      `Error opening file: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

export async function saveFile(
  fileHandle: FileSystemFileHandle,
  content: string
): Promise<boolean> {
  try {
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (error) {
    emitUiLog(
      "error",
      `Error saving file: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

export async function createNewFile(
  initialContent: string,
  lastDirectoryHandle?: FileSystemDirectoryHandle
): Promise<{ fileHandle: FileSystemFileHandle; content: string } | null> {
  const options: SaveFilePickerOptions = {
    suggestedName: "Untitled.scad",
    types: [
      {
        description: "OpenSCAD Files",
        accept: { "application/scad": [".scad"] },
      },
    ],
  };
  if (lastDirectoryHandle) {
    options.startIn = lastDirectoryHandle;
  }
  try {
    const handle = await (
      window as object as {
        showSaveFilePicker: (
          options: SaveFilePickerOptions
        ) => Promise<FileSystemFileHandle>;
      }
    ).showSaveFilePicker(options);
    await saveFile(handle, initialContent);
    return { fileHandle: handle, content: initialContent };
  } catch (error) {
    emitUiLog(
      "error",
      `Error creating new file: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

// -- Persistence with IndexedDB --

// Use IndexedDB to save and retrieve the last directory handle.
// Note: file handle objects are not serializable in plain JSON,
// but modern browsers support storing them in IndexedDB via structured cloning.

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open("FileHandleDB", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function storeDirectoryHandle(
  handle: FileSystemDirectoryHandle
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    openDB()
      .then((db) => {
        const tx = db.transaction("handles", "readwrite");
        const store = tx.objectStore("handles");
        const request = store.put(handle, "lastDirectory");

        request.onsuccess = () => {
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };

        request.onerror = () => {
          db.close();
          reject(new Error("Failed to store directory handle"));
        };

        tx.onerror = () => {
          db.close();
          reject(new Error("Transaction failed"));
        };
      })
      .catch((error) => {
        reject(new Error(`Failed to open database: ${error.message}`));
      });
  });
}

export async function getStoredDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction("handles", "readonly");
    const store = tx.objectStore("handles");
    const request = store.get("lastDirectory");
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    emitUiLog(
      "error",
      `Error retrieving stored directory handle: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Load the file-explorer state from localStorage.
 */
export async function loadFileExplorerState(
  root: FileSystemDirectoryHandle
): Promise<{ expanded: string[] }> {
  try {
    const key = `fileExplorerState_${root.name}`;
    const text = localStorage.getItem(key);
    if (text) {
      const data = JSON.parse(text);
      if (Array.isArray(data.expanded)) {
        return { expanded: data.expanded };
      }
    }
    return { expanded: [] };
  } catch (error) {
    emitUiLog(
      "error",
      `Error loading file-explorer state from localStorage: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { expanded: [] };
  }
}

/**
 * Save the file-explorer state to localStorage.
 */
export async function saveFileExplorerState(
  root: FileSystemDirectoryHandle,
  expanded: string[]
): Promise<void> {
  try {
    const key = `fileExplorerState_${root.name}`;
    localStorage.setItem(key, JSON.stringify({ expanded }));
  } catch (error) {
    emitUiLog(
      "error",
      `Error saving file-explorer state to localStorage: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Clear the stored directory handle so it won't auto-open on next load.
 */
export async function clearStoredDirectoryHandle(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase("FileHandleDB");
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      emitUiLog("warn", "clearStoredDirectoryHandle: deleteDatabase blocked");
  });
}
