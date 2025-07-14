import { css } from "@emotion/react";
import { Editor } from "@monaco-editor/react";
import { forwardRef } from "react";
import { Aside, Br, Button, Div, DivProps, H1, Span } from "style-props-html";
import { EditorTabAgent } from "../hooks/useEditorTabAgent";
import { useRegisterOpenSCADLanguage } from "../openscad-lang";
import { FaSave } from "react-icons/fa";
import exampleSCAD from "../assets/example.scad?raw";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

export interface EditorTabProps extends DivProps {
  agent: EditorTabAgent;
}
export default forwardRef<HTMLDivElement, EditorTabProps>(function EditorTab(
  { agent, ...rest },
  ref
) {
  const showNoneSelectedDialog = !agent.fileIsLoaded && !agent.isNewFile;
  useRegisterOpenSCADLanguage();

  return (
    <Div
      ref={ref}
      width={"100%"}
      display="grid"
      gridTemplateRows="auto 1fr"
      gridTemplateColumns="1fr"
      height="100%"
      rowGap="0"
      columnGap="0"
      {...rest}
    >
      <Div
        display="flex"
        flexDirection="row"
        alignItems="center"
        justifyContent="flex-start"
        padding="4px"
        gap="4px"
      >
        <H1
          display={!agent.fileIsLoaded && !agent.isNewFile ? "none" : "block"}
          onClick={agent.closeFile}
          color="red"
          fontSize="16px"
          fontWeight="normal"
          userSelect="none"
          cursor="pointer"
        >
          &times;
        </H1>
        <H1 width="auto" fontSize="16px" color="black" fontWeight="normal">
          {agent.fileIsLoaded || agent.isNewFile
            ? agent.filename ?? "Untitled.scad"
            : "No File Selected"}
        </H1>
        <Span
          transformOrigin="center"
          transform="scale(1.5)"
          display={agent.dirty ? "block" : "none"}
          color="grey"
        >
          *
        </Span>
        {agent.dirty && (
          <Button
            marginLeft="auto"
            borderRadius="50%"
            border="2px solid blue"
            width="auto"
            height="auto"
            display="flex"
            aspectRatio={1.0}
            padding="4px"
            color="blue"
            background="none"
            alignItems="center"
            justifyContent="center"
            onClick={agent.saveCurrentFile}
          >
            <FaSave />
          </Button>
        )}
      </Div>

      <Div width="100%" height="100%" position="relative">
        <Editor
          onMount={(editor) => {
            agent.storeEditor(editor);
          }}
          onChange={(newValue) => {
            agent.setCode(newValue ?? "");
            agent.computeDirty(newValue ?? "");
          }}
          css={css`
            width: 100%;
            height: 100%;
            border: none;
          `}
          options={{
            wordWrap: "on",
            fontSize: 18,
            fontFamily: "'Fira Code', monospace",
            fontLigatures: true,
            fontWeight: "400",
            renderWhitespace: "all",
            minimap: { enabled: false },
          }}
          defaultLanguage="openscad"
          defaultValue={""}
          theme="openscad-theme"
        />
        <Div
          position="absolute"
          top="0"
          left="0"
          bottom="0"
          right="0"
          pointerEvents={showNoneSelectedDialog ? "auto" : "none"}
          opacity={showNoneSelectedDialog ? 1 : 0}
          transition="opacity 0.2s ease-in-out"
          display="flex"
          alignItems="center"
          justifyContent="center"
          background="rgba(255,255,255,0.5)"
        >
          <Div
            display="flex"
            flexDirection="column"
            alignItems="stretch"
            padding="8px"
            gap="8px"
            background="white"
          >
            <H1 textAlign="center">No File Selected</H1>
            <Button onClick={agent.openExistingFile}>Open Existing File</Button>
            <Button onClick={() => agent.createNewFile()}>
              Create New File
            </Button>
            <Button
              onClick={() => {
                agent.createNewFile("Example.scad", exampleSCAD);
              }}
            >
              Open Example Code
            </Button>

            <Aside fontSize="12px" textAlign="center" fontStyle="italic">
              Please respond "yes" to any dialogs that ask for permission after
              opening or before saving files.
              <Br />
              If you do not respond "yes", you will need to try opening or
              saving the file again.
            </Aside>
          </Div>
        </Div>
      </Div>
    </Div>
  );
});
