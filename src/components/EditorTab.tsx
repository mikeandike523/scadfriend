import { css } from "@emotion/react";
import { Editor } from "@monaco-editor/react";
import { forwardRef } from "react";
import { Aside, Br, Button, Div, DivProps, H1, I } from "style-props-html";
import { EditorTabAgent } from "../hooks/useEditorTabAgent";
import { useRegisterOpenSCADLanguage } from "../openscad-lang";

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
      width="100%"
      display="grid"
      gridTemplateRows="auto 1fr"
      gridTemplateColumns="1fr"
      height="100%"
      rowGap="0"
      columnGap="0"
      {...rest}
    >
      <Div
        padding="0"
        display="flex"
        flexDirection="row"
        alignItems="center"
        justifyContent="flex-start"
      >
        <H1
          textAlign="left"
          fontSize="16px"
          background="#1E1E1E"
          color="white"
          padding="4px"
          fontWeight="normal"
        >
          {agent.fileIsLoaded
            ? agent.filename
            : agent.isNewFile
            ? "New File"
            : "No File Selected"}
        </H1>
      </Div>

      <Div width="100%" height="100%" position="relative">
        <Editor
          onMount={(editor) => {
            agent.storeEditor(editor);
          }}
          onChange={(newValue) => agent.setCode(newValue ?? "")}
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
          // background="rgba(255, 255, 255, 0.5)"
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
            <Button>Open Existing File</Button>
            <Button onClick={agent.createNewFile}>Create New File</Button>
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
