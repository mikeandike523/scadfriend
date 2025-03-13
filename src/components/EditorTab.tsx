import { forwardRef } from "react";
import { Button, Div, DivProps, H1 } from "style-props-html";
import { EditorTabAgent } from "../hooks/useEditorTabAgent";
import { Editor } from "@monaco-editor/react";
import { css } from "@emotion/react";
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
      {...rest}
    >
      <H1 width="100%" textAlign="center">
        {agent.filename ?? "New File"}
      </H1>
      <Div width="100%" height="100%" position="relative">
        <Editor
          onChange={(newValue) => agent.setCode(newValue ?? "")}
          css={css`
            width: 100%;
            height: 100%;
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
          defaultValue={"// Loading..."}
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
          flexDirection="column"
          background="white"
          padding="8px"
        >
            <H1>No File Selected</H1>
            <Button>Open Existing File</Button>
            <Button>Create New File</Button>
        </Div>
      </Div>
    </Div>
  );
});
