import Editor, { OnMount } from "@monaco-editor/react";
import { useRef, useState } from "react";
import { Button, Div } from "style-props-html";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

import "./App.css";
import exampleCode from "./assets/example.scad?raw";
import { useRegisterOpenSCADLanguage } from "./openscad";


const MAX_MESSAGES = 200;
const LOCAL_STORAGE_KEY = "openscad-code";

function App() {
  useRegisterOpenSCADLanguage();
  const consoleDivRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);


  const handleEditorDidMount: OnMount = (editor) => {
    // Load code from localStorage when editor mounts
    const savedCode = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedCode) {
      editor.setValue(savedCode);
    }else{
      editor.setValue(exampleCode);
    }
    // Set the cursor position to the end of the content
    const model = editor.getModel();
    if (model) {
      const lastLineNumber = model.getLineCount();
      const lastLineLength = model.getLineLength(lastLineNumber);
      editor.setPosition({
        lineNumber: lastLineNumber,
        column: lastLineLength + 1,
      });
      editor.focus();
    }
  };

  const log = (message: string) => {
    setMessages((prevMessages) => {
      const newMessages = [...prevMessages, message];
      if (newMessages.length > MAX_MESSAGES) {
        newMessages.shift();
      }
      return newMessages;
    });
    consoleDivRef.current?.scrollTo({
      top: consoleDivRef.current?.scrollHeight,
      behavior: "smooth",
    });
  };

  const previewModel = async () => {
    log("Previewing...");

    log("Preview completed.");
  };

  const renderModel = async () => {
    log("Rendering...");

    log("Rendering completed.");
  };

  return (
    <Div
      display="flex"
      flexDirection="row"
      alignItems="flex-start"
      justifyContent="flex-start"
      height="100%"
    >
      <Div height="100%" flex={1.5}>
        <Editor
          options={{
            fontSize: 22,
            fontFamily: "'Fira Code', monospace",
            fontLigatures: true,
            fontWeight: "400",
            renderWhitespace: "all",
            minimap: { enabled: false },
          }}
          defaultLanguage="openscad"
          defaultValue={"// Loading..."}
          theme="openscad-theme"
          onMount={handleEditorDidMount}
          onChange={(value) => {
            if (typeof value === "string") {
              if (value === "") {
                localStorage.removeItem(LOCAL_STORAGE_KEY);
              } else {
                localStorage.setItem(LOCAL_STORAGE_KEY, value);
              }
            } else {
              localStorage.removeItem(LOCAL_STORAGE_KEY);
            }
          }}
        />
      </Div>
      <Div
        height="100%"
        flex={1}
        display="grid"
        gridTemplateRows="auto 1fr 1fr"
        gridTemplateColumns="1fr"
      >
        {/* Preview and Render Controls */}
        <Div display="flex" flexDirection="row">
          <Button flex={1} fontSize="200%" onClick={previewModel}>
            Preview
          </Button>
          <Button flex={1} fontSize="200%" onClick={renderModel}>
            Render
          </Button>
        </Div>
        {/* ThreeJS Model Viewer Div */}
        <Div background="skyblue"></Div>
        {/* Console Div */}
        <Div
          ref={consoleDivRef}
          overflow="auto"
          whiteSpace="pre-wrap"
          background="darkgreen"
          color="white"
          fontFamily="'Fira Code', monospace"
        >
          {messages.join("\n") + "\n"}
        </Div>
      </Div>
    </Div>
  );
}

export default App;
