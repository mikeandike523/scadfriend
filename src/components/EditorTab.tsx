import { css } from "@emotion/react";
import { Editor } from "@monaco-editor/react";
import { forwardRef, RefObject, useEffect, useState } from "react";
import { Button, Div, DivProps, H1, P, Span } from "style-props-html";
import { EditorTabAgent } from "../hooks/useEditorTabAgent";
import { useRegisterOpenSCADLanguage } from "../openscad-lang";
import { FaSave } from "react-icons/fa";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

export interface EditorTabProps extends DivProps {
  agent: EditorTabAgent;
  containerRef: RefObject<HTMLDivElement | null>;
}
export default forwardRef<HTMLDivElement, EditorTabProps>(function EditorTab(
  { agent, containerRef, ...rest },
  ref
) {
  const showNoneSelectedDialog = !agent.fileIsLoaded;
  useRegisterOpenSCADLanguage();
  const [currentContainerWidth, setCurrentContainerWidth] = useState<
    number | null
  >(null);
  useEffect(() => {
    const interval = setInterval(() => {
      if (containerRef.current) {
        const measuredWidth = containerRef.current.clientWidth;
        setCurrentContainerWidth(measuredWidth);
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    agent.layoutEditor();
  },[
    currentContainerWidth
  ])

  return (
    <Div
      ref={ref}
      width={currentContainerWidth ? `${currentContainerWidth}` : "100%"}
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
          display={agent.fileIsLoaded ? "block" : "none"}
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
          {agent.fileIsLoaded ? agent.filename ?? "Untitled.scad" : "No File Selected"}
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

      <Div width="100%" height="100%" position="relative" overflow="hidden">
        {currentContainerWidth && (
          <Editor
            onMount={(editor) => {
              agent.storeEditor(editor);
            }}
            onChange={(newValue) => {
              agent.handleEditorChange(newValue ?? "");
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
            value={agent.code}
            theme="openscad-theme"
          />
        )}
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
            alignItems="center"
            padding="8px"
            gap="8px"
            background="white"
          >
            <H1 textAlign="center">No File Selected</H1>
            <P textAlign="center">Choose a file from the browser.</P>
          </Div>
        </Div>
      </Div>
    </Div>
  );
});
