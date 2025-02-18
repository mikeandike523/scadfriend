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
import OpenSCAD from "./openscad";
import { useRegisterOpenSCADLanguage } from "./openscad-lang";
import { identifyParts, OpenSCADPart } from "./openscad-parsing";

const MAX_MESSAGES = 200;
const LOCAL_STORAGE_KEY = "openscad-code";

function App() {
  useRegisterOpenSCADLanguage();
  const consoleDivRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [editorValue, setEditorValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const handleEditorDidMount: OnMount = (editor) => {
    // Load code from localStorage when editor mounts
    const savedCode = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedCode) {
      editor.setValue(savedCode);
      setEditorValue(savedCode);
    } else {
      editor.setValue(exampleCode);
      setEditorValue(exampleCode);
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

  const clearLogs = () => {
    setMessages([]);
  };

  const renderModel = async (quality: "draft" | "full" = "draft") => {

    if(isProcessing) {
      log("Already processing, please wait...");
      return
    }

    setIsProcessing(true);

    clearLogs();
    
    const detectedParts = identifyParts(editorValue);

    log(`Found Parts: ${Object.keys(detectedParts).join(", ")}`);

    async function renderPart(partName: string,part:OpenSCADPart) {
      
      log(`Processing part ${partName}...`);
      
      log("Initializing OpenSCAD...");
  

      // It appears from prior testing that the WASM implementation
      // Does not support reuse
      // It will be too difficult to change this at this time
      // Maybe I should raise a github issue
      const instance = await OpenSCAD({
        noInitialRun: true,
      });
  
      log("Writing input file...");
  
      let filename;
  
      // Write a file to the filesystem
      instance.FS.writeFile("/input.scad", part.ownSourceCode); // OpenSCAD script to generate a 10mm cube
  
      log("Performing render...");
  
      const args = ["/input.scad", "--viewall", "--autocenter", "--render"];
  
      switch (quality) {
        case "draft":
          filename = "draft.stl";
          break;
        case "full":
          filename = "final.stl";
          args.push("--enable=manifold");
          break;
      }
  
      args.push("-o", filename);
  
      // Run like a command-line program with arguments
      instance.callMain(args);
  
      log("Reading output...");
  
      // Read the output 3D-model into a JS byte-array
      const output = instance.FS.readFile("/" + filename);
  
      log("Downloading files...");
  
      // Generate a link to output 3D-model and download the output STL file
      const link = document.createElement("a");
      link.href = URL.createObjectURL(
        new Blob([output], { type: "application/octet-stream" })
      );
      link.download = `${partName}-${filename}`;
      document.body.append(link);
      link.click();
      link.remove();
      log("Render completed.");
    }

    const entries = Object.entries(detectedParts);

    for(const [name, part] of entries) {
      await renderPart(name, part);
    }

    setIsProcessing(false);
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
            fontSize: 18,
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
            setEditorValue(value ?? "");
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
        {/* Render Controls */}
        <Div display="flex" flexDirection="row" gap="8px" padding="8px">
          <Div flex={0} fontSize="150%">
            Render:
          </Div>
          <Button
            disabled={isProcessing}
            flex={1}
            fontSize="150%"
            onClick={() => {
              renderModel("draft");
            }}
            cursor={isProcessing ? "progress" : "pointer"}
          >
            Draft Quality
          </Button>
          <Button
            disabled={isProcessing}
            flex={1}
            fontSize="150%"
            onClick={() => {
              renderModel("full");
            }}
            cursor={isProcessing ? "progress" : "pointer"}
          >
            Final Quality
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
