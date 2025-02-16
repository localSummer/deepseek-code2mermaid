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
  let generateFromFileOrFolder = vscode.commands.registerCommand('deepseek.generateMermaidDiagram', async (uri: vscode.Uri) => {
    if (uri && uri.fsPath) {
      // 根据uri.fsPath获取工作目录的绝对路径
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath!;
      // 基于 workspacePath获取 url.fsPath 绝对路径
      const absolutePath = path.resolve(workspacePath, uri.fsPath)
      const repomixCommand = `npx repomix --include "${absolutePath}" --output ${repomixFileName} --style markdown`

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
    } else {
      vscode.window.showInformationMessage('No file selected.');
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
        temperature: 0.3,
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
