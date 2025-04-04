// fileSystemUtils.ts
// This module contains helper functions for interacting with the FileSystemAccessAPI,
// including persisting a directory handle for future use.

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
            console.log("File handle stored successfully");
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

export async function getStoredFileHandle(): Promise<FileSystemFileHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction("handles", "readonly");
    const store = tx.objectStore("handles");
    const request = store.get("lastFile");
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log("File handle retrieved successfully", request.result);
        db.close();
        resolve(request.result || null);
      };
      request.onerror = () => {
        console.error("Failed to retrieve file handle", request.error);
        db.close();
        reject(request.error);
      };
    });
  } catch (error) {
    console.error("Error retrieving stored file handle:", error);
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
          console.log("File handle deleted successfully");
          db.close();
          resolve();
        };
      };
      request.onerror = () => {
        console.error("Failed to delete file handle", request.error);
        db.close();
        reject(request.error);
      };
      tx.onerror = () => {
        db.close();
        reject(new Error("Transaction failed"));
      };
    });
  } catch (error) {
    console.error("Error deleting stored file handle:", error);
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
      console.error("Error reopening last file:", error);
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
      const newPermissionState = await (
        handle as object as {
          requestPermission: (options: {
            mode: "readwrite" | "read";
          }) => Promise<"granted" | "denied" | "prompt">;
        }
      ).requestPermission({ mode: "readwrite" });
      if (newPermissionState !== "granted") {
        console.log("Read/write permission was not granted for the file.");
        // You might want to handle this case, perhaps by only allowing read operations
        // or by informing the user that they won't be able to save changes to this file.
      }
    }
    const file = await handle.getFile();
    const content = await file.text();
    return { fileHandle: handle, content };
  } catch (error) {
    console.error("Error opening file:", error);
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
    console.error("Error saving file:", error);
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
    console.error("Error creating new file:", error);
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
    console.error("Error retrieving stored directory handle:", error);
    return null;
  }
}
