import { useEffect, useState } from 'react';

/**
 * Hook to check if the File System Access API is unsupported in the current browser
 */
export default function useFSAUnsupported() {
  const [isSupported, setIsSupported] = useState<boolean|null>(null);

  useEffect(() => {
    // List of required File System Access API functions
    const requiredFunctions = [
      'showOpenFilePicker',
      'showSaveFilePicker',
      'showDirectoryPicker'
    ];

    // Check if all required functions are available on the window object
    const supported = requiredFunctions.every(
      funcName => typeof (window as object as {
        [funcName: string]: unknown | undefined
      })[funcName] === 'function'
    );

    setIsSupported(supported);
  }, []);
const loaded = isSupported !== null;
  return loaded && !isSupported
}