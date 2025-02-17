import { useMonaco } from "@monaco-editor/react";

export function useRegisterOpenSCADLanguage() {
  const monaco = useMonaco();

  if (!monaco) return;

  // Register the OpenSCAD language
  monaco.languages.register({ id: "openscad" });

  monaco.editor.defineTheme("openscad-theme", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "C586C0" },
      { token: "identifier", foreground: "9CDCFE" },
      { token: "number", foreground: "B5CEA8" },
      { token: "operator", foreground: "D4D4D4" },
      { token: "string", foreground: "CE9178" },
      { token: "comment", foreground: "6A9955", fontStyle: "italic" },
    ],
    colors: {},
  });

  // Define the Monarch tokens provider for OpenSCAD
  monaco.languages.setMonarchTokensProvider("openscad", {
    // Default token and file extension
    defaultToken: "",
    tokenPostfix: ".scad",

    // OpenSCAD keywords – add more as needed
    keywords: [
      "module",
      "function",
      "if",
      "else",
      "for",
      "let",
      "intersection_for",
      "union",
      "difference",
      "intersection",
      "translate",
      "rotate",
      "scale",
      "mirror",
      "hull",
      "minkowski",
      "import",
      "include",
      "render",
      "echo",
    ],

    // Operators
    operators: [
      "=",
      "==",
      "!=",
      "<",
      ">",
      "<=",
      ">=",
      "+",
      "-",
      "*",
      "/",
      "%",
      "^",
      "&&",
      "||",
      "!",
    ],

    // Symbols used for operators
    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    // String escape sequences
    escapes: /\\(?:[nrt\\"'])/,

    // The main tokenizer for our language
    tokenizer: {
      root: [
        // Whitespace and comments
        { include: "@whitespace" },

        // Identifiers and keywords
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@default": "identifier",
            },
          },
        ],

        // Numbers: float and integer
        [/\d*\.\d+([eE][-+]?\d+)?/, "number.float"],
        [/\d+/, "number"],

        // Delimiters and operators
        [/[{}()\[\]]/, "@brackets"],
        [/[;,]/, "delimiter"],
        [
          /@symbols/,
          {
            cases: {
              "@operators": "operator",
              "@default": "",
            },
          },
        ],

        // Strings
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
      ],

      // Whitespace and comments
      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
      ],

      // Multi-line comment
      comment: [
        [/[^/*]+/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/\*\//, "comment", "@pop"],
        [/[\/*]/, "comment"],
      ],

      // String state
      string: [
        [/[^\\"]+/, "string"],
        [/@escapes/, "string.escape"],
        [/\\./, "string.escape.invalid"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }],
      ],
    },
  });
}
