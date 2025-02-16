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
- Only files matching these patterns are included: /cloudide/workspace/deepseek-code2mermaid/src/extension.ts, /cloudide/workspace/deepseek-code2mermaid/src/prompts.ts, /cloudide/workspace/deepseek-code2mermaid/src/webview-content.html, /cloudide/workspace/deepseek-code2mermaid/src/constants.ts
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
          constants.ts
          extension.ts
          prompts.ts
          webview-content.html
```

# Files

## File: /cloudide/workspace/deepseek-code2mermaid/src/constants.ts
````typescript
/** Aide copy as ai prompt filename */
export const repomixFileName = 'aide-mermaid-prompt.md'

/** 保存到本地的流程图文件名称 */
export const downloadSVGFilename = 'aide-mermaid-diagram.svg';
````

## File: /cloudide/workspace/deepseek-code2mermaid/src/extension.ts
````typescript
import * as vscode from 'vscode';
import { OpenAI } from 'openai';
import { exec } from 'child_process'
import path from 'path'
import { promisify } from 'util'
import fs from 'fs';
import { defaultMermaidPrompt } from './prompts';
import { repomixFileName, downloadSVGFilename } from './constants';

const execAsync = promisify(exec)

export function activate(context: vscode.ExtensionContext) {
  // Command to generate diagram from selection
  let generateFromSelection = vscode.commands.registerCommand('deepseek.generateMermaidDiagramFromSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const selection = editor.selection;
      const text = editor.document.getText(selection);
      if (text) {
        await generateMermaidDiagram(text, context);
      } else {
        vscode.window.showInformationMessage('No text selected.');
      }
    } else {
      vscode.window.showInformationMessage('No active text editor.');
    }
  });

  // Command to generate diagram from file
  let generateFromFileOrFolder = vscode.commands.registerCommand('deepseek.generateMermaidDiagram', async (uri: vscode.Uri, selectedUris: vscode.Uri[] = []) => {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) throw new Error('error.noWorkspace');
    const selectedItems = selectedUris?.length > 0 ? selectedUris : [uri];
    if (selectedItems.length === 0) throw new Error('error.noSelection');

    const selectedFileOrFolders = selectedItems.map(item => item.fsPath);
    const workspacePath = workspaceFolder.uri.fsPath;

    const absoluteFileOrFolders = selectedFileOrFolders.map(fileOrFolder => {
      const absolutePath = path.isAbsolute(fileOrFolder)
        ? fileOrFolder
        : path.join(workspacePath, fileOrFolder);
      return absolutePath;
    })

    // Convert fileOrFolders array to string format for the repomix command
    const filesOrFoldersString = absoluteFileOrFolders.join(',');
    const repomixCommand = `npx repomix --include "${filesOrFoldersString}" --output ${repomixFileName} --style markdown`

    try {
      const { stderr } = await execAsync(repomixCommand, {
        cwd: workspacePath // 在工作区根目录执行
      });
      // 显示执行结果
      if (stderr) {
        vscode.window.showWarningMessage(
          `Command repomixCommand stderr: ${stderr}`
        )
      }

      // Read the prompt data from the repomix file
      const repomixFilePath = path.join(workspacePath, repomixFileName)
      // 读取文件内容
      const promptData = await vscode.workspace.fs.readFile(
        vscode.Uri.file(repomixFilePath)
      )

      // Parse the prompt data and update the result object
      const promptDataString = promptData.toString()
      await generateMermaidDiagram(promptDataString, context);
    } catch (error) {
      vscode.window.showErrorMessage(`Error reading file: ${error}`);
    }
  });

  context.subscriptions.push(generateFromSelection, generateFromFileOrFolder);
}

async function generateMermaidDiagram(inputText: string, context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('mermaidDeepseek');
  const openaiBaseUrl = config.get<string>('openaiBaseUrl');
  const openaiKey = config.get<string>('openaiKey');
  const openaiModel = config.get<string>('openaiModel');
  const deepseekPrompt = config.get<string>('deepseekPrompt') || `${defaultMermaidPrompt}\n`;
  const temperature = config.get<number>('temperature');

  if (!openaiKey) {
    vscode.window.showErrorMessage('DeepSeek API Key is not configured. Please set it in settings.');
    return;
  }

  const openai = new OpenAI({
    apiKey: openaiKey,
    baseURL: openaiBaseUrl
  });

  vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Generating Mermaid Diagram...",
    cancellable: false
  }, async (progress) => {
    try {
      progress.report({ increment: 0, message: 'Calling DeepSeek API...' });
      const completion = await openai.chat.completions.create({
        model: openaiModel || "deepseek-chat",
        temperature,
        messages: [{ role: "user", content: deepseekPrompt + inputText }],
      });

      let mermaidCode = completion.choices[0]?.message?.content;

      if (mermaidCode) {
        const regex = /```mermaid\s+(.*?)\s+```/s;
        const match = mermaidCode.match(regex);
        if (match) {
          const extractedText = match[1]!.trim();
          mermaidCode = extractedText;
        }
      }

      if (mermaidCode) {
        progress.report({ increment: 100, message: 'Rendering Mermaid Diagram...' });
        showMermaidPreview(mermaidCode, context);
      } else {
        vscode.window.showWarningMessage('DeepSeek API did not return Mermaid code.');
      }

    } catch (error: any) {
      vscode.window.showErrorMessage(`Error generating Mermaid diagram: ${error.message}`);
    } finally {
      progress.report({ increment: 100, message: 'Finished.' });
    }
  });
}

function showMermaidPreview(mermaidCode: string, context: vscode.ExtensionContext) {
  const panel = vscode.window.createWebviewPanel(
    'mermaidPreview',
    'Mermaid Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  panel.webview.html = getWebviewContent(mermaidCode);
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === 'downloadSVG') {
      const uri = await vscode.window.showSaveDialog({
        filters: {
          'SVG Files': ['svg']
        },
        defaultUri: vscode.Uri.file(downloadSVGFilename)
      });

      if (uri) {
        // 将SVG内容写入文件
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(message.data)
        );
        vscode.window.showInformationMessage('SVG文件已保存！');
      }
    }
  }, undefined, context.subscriptions);
}

function getWebviewContent(mermaidCode: string) {
  const htmlPath = path.join(__dirname, 'webview-content.html');
  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  return htmlContent.replace('${mermaidCode}', mermaidCode);
}

export function deactivate() { }
````

## File: /cloudide/workspace/deepseek-code2mermaid/src/prompts.ts
````typescript
export const defaultMermaidPrompt = `
- Role: 软件架构分析师和代码流程可视化专家
- Background: 用户需要对代码文件目录、代码文件或代码片段进行深入分析，以直观地理解代码的执行流程。这可能是为了代码审查、优化、重构或学习目的，用户希望通过可视化的方式快速把握代码的关键逻辑和结构。
- Profile: 你是一位资深的软件架构分析师，对各种编程语言的代码结构和执行流程有着深刻的理解。同时，你也是代码流程可视化的专家，擅长使用Mermaid语法将复杂的代码逻辑转化为清晰易懂的流程图。
- Skills: 你具备深入分析代码结构、识别关键逻辑节点的能力，能够准确地提取程序入口点、函数调用关系、条件判断、循环结构、变量变化、异常处理以及外部依赖等信息，并将其以Mermaid流程图的形式呈现出来。
- Goals: 生成一个详细的Mermaid流程图，清晰地展示代码的执行流程，包括程序入口点、函数调用关系、条件判断分支、循环迭代过程、关键变量变化、异常处理流程以及外部依赖调用等关键节点。
- Constrains: 流程图应使用Mermaid语法，确保节点功能描述清晰，箭头明确表示执行顺序。对于包含多个文件或模块的代码，需体现它们之间的调用关系及数据传递路径。
- OutputFormat: 仅回复Mermaid流程图代码，请不要回复任何代码之外的文本，并且不要使用Markdown语法。
- Workflow:
  1. 解析用户提供的代码文件目录、代码文件或代码片段，提取程序入口点。
  2. 分析代码中的函数调用关系及执行顺序，识别条件判断、循环结构、关键变量变化、异常处理以及外部依赖调用等关键节点。
  3. 使用Mermaid语法构建流程图，清晰标注每个节点的功能描述，并用箭头表示执行顺序，体现多个文件或模块之间的调用关系及数据传递路径。
- Examples:
  - 例子1：单文件代码流程图
    <mermaid>
			graph TD
				A[程序入口点 main] --> B[函数调用 func1]
				B --> C[条件判断 if/else]
				C -->|条件为真| D[执行分支1]
				C -->|条件为假| E[执行分支2]
				D --> F[循环结构 for]
				F -->|迭代完成| G[函数返回]
				E --> H[异常处理 try/catch]
				H --> I[外部依赖调用 API]
				I --> J[状态更新]
				J --> K[程序结束]
		</mermaid>
  - 例子2：多文件模块代码流程图
    <mermaid>
			graph TD
				A[模块1入口点 main] --> B[调用模块2函数 func2]
				B --> C[模块2函数 func2]
				C --> D[条件判断 switch]
				D -->|case1| E[调用模块3函数 func3]
				D -->|case2| F[执行本地逻辑]
				E --> G[模块3函数 func3]
				G --> H[循环结构 while]
				H -->|迭代完成| I[返回模块2]
				F --> J[异常处理 try/catch]
				J --> K[外部依赖调用 API]
				K --> L[状态更新]
				L --> M[返回模块1]
				M --> N[程序结束]
		</mermaid>
`;
````

## File: /cloudide/workspace/deepseek-code2mermaid/src/webview-content.html
````html
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mermaid Preview</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({ startOnLoad: true });
  </script>
  <style>
    .controls {
      position: fixed;
      top: 10px;
      right: 10px;
      background: var(--vscode-editor-background);
      padding: 5px;
      border-radius: 4px;
      display: flex;
      gap: 5px;
      z-index: 100;
    }

    .control-btn {
      cursor: pointer;
      padding: 5px;
      background: var(--vscode-button-background);
      border: none;
      color: var(--vscode-button-foreground);
      border-radius: 3px;
    }

    .control-btn:hover {
      background: var(--vscode-button-hoverBackground);
    }

    #diagram-container {
      transform-origin: top left;
    }
  </style>
</head>

<body>
  <div class="controls">
    <button class="control-btn" onclick="zoomIn()">
      <span class="codicon codicon-zoom-in"></span>
    </button>
    <button class="control-btn" onclick="zoomOut()">
      <span class="codicon codicon-zoom-out"></span>
    </button>
    <button class="control-btn" onclick="downloadSVG()">
      <span class="codicon codicon-cloud-download"></span>
    </button>
  </div>
  <div id="diagram-container">
    <div class="mermaid">${mermaidCode}</div>
  </div>
  <script>
    let scale = 1;
    const container = document.getElementById('diagram-container');

    function zoomIn() {
      scale *= 1.2;
      updateZoom();
    }

    function zoomOut() {
      scale *= 0.8;
      updateZoom();
    }

    function updateZoom() {
      container.style.transform = `scale(${scale})`;
    }

    function downloadSVG() {
      const svgElement = document.querySelector('.mermaid svg');
      if (!svgElement) {
        console.error('没有找到SVG元素');
        return;
      }

      // 获取SVG内容
      const svgData = new XMLSerializer().serializeToString(svgElement);

      // 通过 vscode webview API 发送消息到插件
      vscode.postMessage({
        command: 'downloadSVG',
        data: svgData
      });
    }
  </script>
  <script>
    const vscode = acquireVsCodeApi();
  </script>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vscode-codicons/dist/codicon.css" />
</body>

</html>
````
