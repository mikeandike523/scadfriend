import { css } from "@emotion/react";
import { Editor } from "@monaco-editor/react";
import { forwardRef, RefObject, useEffect, useState } from "react";
import { Button, Div, DivProps, H1, P, Span } from "style-props-html";
import { TabManager } from "../hooks/useEditorTabAgent";
import { useRegisterOpenSCADLanguage } from "../openscad-lang";
import { FaSave, FaTimes } from "react-icons/fa";

import "@fontsource/fira-code/300.css";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/500.css";
import "@fontsource/fira-code/600.css";
import "@fontsource/fira-code/700.css";
import "@fontsource/fira-code/index.css";

export interface EditorTabProps extends DivProps {
  agent: TabManager;
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
  }, [currentContainerWidth]);

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
      {/* Tab bar */}
      <Div
        display="flex"
        flexDirection="column"
        gap="0"
      >
        {/* Tabs row */}
        <Div
          display="flex"
          flexDirection="row"
          alignItems="stretch"
          overflowX="auto"
          background="#e8e8e8"
          borderBottom="1px solid #ccc"
          minHeight="32px"
          css={css`
            scrollbar-width: thin;
            &::-webkit-scrollbar {
              height: 4px;
            }
          `}
        >
          {agent.tabs.map((tab, i) => {
            const isActive = i === agent.activeTabIndex;
            return (
              <Div
                key={tab.filePath}
                display="flex"
                alignItems="center"
                gap="4px"
                padding="4px 8px"
                cursor="pointer"
                background={isActive ? "#ffffff" : "#e8e8e8"}
                borderRight="1px solid #ccc"
                borderBottom={isActive ? "2px solid #1e88e5" : "2px solid transparent"}
                userSelect="none"
                flexShrink={0}
                onClick={() => agent.switchTab(i)}
                css={css`
                  &:hover {
                    background: ${isActive ? "#ffffff" : "#f0f0f0"};
                  }
                `}
              >
                <Span
                  fontSize="13px"
                  fontStyle={tab.isPreview ? "italic" : "normal"}
                  color={isActive ? "#1e88e5" : "#555"}
                  fontWeight={isActive ? "600" : "normal"}
                  whiteSpace="nowrap"
                >
                  {tab.filename}
                </Span>
                {tab.dirty && (
                  <Span
                    fontSize="10px"
                    color="#999"
                    lineHeight="1"
                  >
                    *
                  </Span>
                )}
                <Button
                  background="none"
                  border="none"
                  padding="0"
                  margin="0"
                  cursor="pointer"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  width="16px"
                  height="16px"
                  color="#999"
                  borderRadius="3px"
                  onClick={(e) => {
                    e.stopPropagation();
                    agent.closeTab(i);
                  }}
                  css={css`
                    &:hover {
                      background: #ddd;
                      color: #333;
                    }
                  `}
                >
                  <FaTimes style={{ fontSize: "10px" }} />
                </Button>
              </Div>
            );
          })}
        </Div>

        {/* Active tab toolbar (save button) */}
        {agent.fileIsLoaded && (
          <Div
            display="flex"
            flexDirection="row"
            alignItems="center"
            justifyContent="flex-end"
            padding="2px 8px"
            background="#fff"
            borderBottom="1px solid #eee"
            minHeight="28px"
          >
            {agent.dirty && (
              <Button
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
