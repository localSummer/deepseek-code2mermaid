This file is a merged representation of a subset of the codebase, containing specifically included files, combined into a single document by Repomix.

# File Summary

## Purpose
This file contains a packed representation of the entire repository's contents.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Only files matching these patterns are included: /cloudide/workspace/deepseek-code2mermaid/src/webview
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded

## Additional Info

# Directory Structure
```
/
  cloudide/
    workspace/
      deepseek-code2mermaid/
        src/
          webview/
            helpers/
              vscode.ts
            types/
              vite-env.d.ts
            App.css
            App.tsx
            main.tsx
```

# Files

## File: /cloudide/workspace/deepseek-code2mermaid/src/webview/helpers/vscode.ts
```typescript
import type { WebviewApi } from 'vscode-webview'

/**
 * A utility wrapper around the acquireVsCodeApi() function, which enables
 * message passing and state management between the webview and extension
 * contexts.
 *
 * This utility also enables webview code to be run in a web browser-based
 * dev server by using native web browser features that mock the functionality
 * enabled by acquireVsCodeApi.
 */
class VSCodeAPIWrapper {
  private readonly vsCodeApi: WebviewApi<unknown> | undefined

  constructor() {
    // Check if the acquireVsCodeApi function exists in the current development
    // context (i.e. VS Code development window or web browser)
    if (typeof acquireVsCodeApi === 'function') {
      this.vsCodeApi = acquireVsCodeApi()
    }
  }

  /**
   * Post a message (i.e. send arbitrary data) to the owner of the webview.
   *
   * @remarks When running webview code inside a web browser, postMessage will instead
   * log the given message to the console.
   *
   * @param message Abitrary data (must be JSON serializable) to send to the extension context.
   */
  public postMessage(message: unknown) {
    if (this.vsCodeApi) {
      this.vsCodeApi.postMessage(message)
    } else {
      window.parent.postMessage({ type: 'page:message', data: message }, '*')
      console.log(message)
    }
  }

  /**
   * Get the persistent state stored for this webview.
   *
   * @remarks When running webview source code inside a web browser, getState will retrieve state
   * from local storage (https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
   *
   * @return The current state or `undefined` if no state has been set.
   */
  public async getState(): Promise<unknown> {
    if (this.vsCodeApi) {
      return await this.vsCodeApi.getState()
    }
    const state = localStorage.getItem('vscodeState')
    return state ? JSON.parse(state) : undefined
  }

  /**
   * Set the persistent state stored for this webview.
   *
   * @remarks When running webview source code inside a web browser, setState will set the given
   * state using local storage (https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage).
   *
   * @param newState New persisted state. This must be a JSON serializable object. Can be retrieved
   * using {@link getState}.
   *
   * @return The new state.
   */
  public async setState<T extends unknown | undefined>(
    newState: T
  ): Promise<T> {
    if (this.vsCodeApi) {
      return await this.vsCodeApi.setState(newState)
    }
    localStorage.setItem('vscodeState', JSON.stringify(newState))
    return newState
  }
}

// Exports class singleton to prevent multiple invocations of acquireVsCodeApi.
export const vscode = new VSCodeAPIWrapper()
```

## File: /cloudide/workspace/deepseek-code2mermaid/src/webview/types/vite-env.d.ts
```typescript
/// <reference types="vite/client" />
```

## File: /cloudide/workspace/deepseek-code2mermaid/src/webview/App.css
```css
main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
}
```

## File: /cloudide/workspace/deepseek-code2mermaid/src/webview/App.tsx
```typescript
import { useState } from 'react'
import { VSCodeButton, VSCodeTextField } from '@vscode/webview-ui-toolkit/react'

import { vscode } from './helpers/vscode'

import './App.css'

function App() {
  function onPostMessage() {
    vscode.postMessage({
      command: 'hello',
      text: 'Hey there partner! 🤠'
    })
  }

  const [message, setMessage] = useState('')
  const [state, setState] = useState('')

  const onSetState = () => {
    vscode.setState(state)
  }
  const onGetState = async () => {
    console.log('state', await vscode.getState())
    setState((await vscode.getState()) as string)
  }

  return (
    <main>
      <h1>Hello React!</h1>
      <VSCodeButton onClick={onPostMessage}>Test VSCode Message</VSCodeButton>
      <div>
        <VSCodeTextField
          value={message}
          onInput={(e: any) => setMessage(e?.target?.value)}
        >
          Please enter a message
        </VSCodeTextField>
        <div>Message is: {message}</div>
      </div>
      <div>
        <VSCodeTextField
          value={state}
          onInput={(e: any) => setState(e?.target?.value)}
        >
          Please enter a state
        </VSCodeTextField>
        <div>State is: {state}</div>
        <div>
          <VSCodeButton onClick={onSetState}>setState</VSCodeButton>
          <VSCodeButton style={{ marginLeft: '8px' }} onClick={onGetState}>
            getState
          </VSCodeButton>
        </div>
      </div>
    </main>
  )
}

export default App
```

## File: /cloudide/workspace/deepseek-code2mermaid/src/webview/main.tsx
```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```
