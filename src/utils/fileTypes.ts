/**
 * Extension-to-language mapping for Monaco editor and binary file detection.
 */

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  // OpenSCAD
  ".scad": "openscad",

  // Web
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".json": "json",
  ".xml": "xml",
  ".svg": "xml",

  // Scripting
  ".py": "python",
  ".rb": "ruby",
  ".lua": "lua",
  ".php": "php",
  ".pl": "perl",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".bat": "bat",
  ".cmd": "bat",
  ".ps1": "powershell",

  // Systems
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".java": "java",
  ".rs": "rust",
  ".go": "go",
  ".cs": "csharp",
  ".swift": "swift",
  ".kt": "kotlin",

  // Data / Config
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "ini",
  ".ini": "ini",
  ".cfg": "ini",
  ".sql": "sql",
  ".r": "r",
  ".R": "r",

  // Markup / Docs
  ".md": "markdown",
  ".markdown": "markdown",
  ".tex": "latex",
  ".rst": "restructuredtext",

  // Plain text
  ".txt": "plaintext",
  ".csv": "plaintext",
  ".tsv": "plaintext",
  ".log": "plaintext",
  ".env": "plaintext",
  ".gitignore": "plaintext",
  ".editorconfig": "plaintext",

  // Other
  ".dockerfile": "dockerfile",
  ".graphql": "graphql",
  ".gql": "graphql",
};

const BINARY_CATEGORIES: Record<string, string[]> = {
  Image: [
    ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".tiff",
    ".tif", ".psd", ".raw", ".heic", ".avif",
  ],
  Video: [
    ".mp4", ".avi", ".mov", ".mkv", ".wmv", ".flv", ".webm", ".m4v",
    ".mpeg", ".mpg",
  ],
  Audio: [
    ".mp3", ".wav", ".ogg", ".flac", ".aac", ".wma", ".m4a", ".opus",
  ],
  "3D Model": [
    ".stl", ".obj", ".fbx", ".gltf", ".glb", ".3ds", ".dae", ".ply",
    ".step", ".stp", ".iges", ".igs",
  ],
  Archive: [
    ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar", ".tgz",
  ],
  Document: [
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt",
  ],
  Executable: [
    ".exe", ".dll", ".so", ".dylib", ".bin", ".app", ".msi", ".deb",
    ".rpm",
  ],
  Font: [
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
  ],
};

// Build a reverse lookup: extension → category
const EXTENSION_TO_CATEGORY: Record<string, string> = {};
for (const [category, extensions] of Object.entries(BINARY_CATEGORIES)) {
  for (const ext of extensions) {
    EXTENSION_TO_CATEGORY[ext] = category;
  }
}

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot === -1) return "";
  return filename.slice(dot).toLowerCase();
}

export function getLanguageForFile(filename: string): string | null {
  const ext = getExtension(filename);
  return EXTENSION_TO_LANGUAGE[ext] ?? null;
}

export function isBinaryFile(filename: string): boolean {
  return getLanguageForFile(filename) === null;
}

export function getBinaryFileCategory(filename: string): string {
  const ext = getExtension(filename);
  return EXTENSION_TO_CATEGORY[ext] ?? "Binary file";
}

export function isScadFile(filename: string): boolean {
  return getExtension(filename) === ".scad";
}
