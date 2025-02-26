import * as vscode from 'vscode';
import { OpenAI } from 'openai';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';
import { defaultMermaidPrompt } from './prompts';
import { repomixFileName, downloadSVGFilename } from './constants';

const execAsync = promisify(exec);

/**
 * 激活 VS Code 扩展。
 * 注册两个命令：从选中的文本生成 Mermaid 图表和从文件或文件夹生成 Mermaid 图表。
 * @param context VS Code 扩展上下文对象。
 */
export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'deepseek.generateMermaidDiagramFromSelection',
      () => generateFromSelection(context)
    ),
    vscode.commands.registerCommand(
      'deepseek.generateMermaidDiagram',
      (uri: vscode.Uri, selectedUris: vscode.Uri[] = []) =>
        generateFromFileOrFolder(uri, selectedUris, context)
    )
  );
}

/**
 * 处理从选中文本生成 Mermaid 图表的命令。
 * @param context VS Code 扩展上下文对象。
 */
async function generateFromSelection(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('No active text editor.');
    return;
  }

  const selection = editor.selection;
  const text = editor.document.getText(selection);
  if (!text) {
    vscode.window.showInformationMessage('No text selected.');
    return;
  }

  await generateMermaidDiagram(text, context);
}

/**
 * 处理从文件或文件夹生成 Mermaid 图表的命令。
 * @param uri 触发命令的 URI。
 * @param selectedUris 用户选择的 URI 数组。
 * @param context VS Code 扩展上下文对象。
 */
async function generateFromFileOrFolder(
  uri: vscode.Uri,
  selectedUris: vscode.Uri[],
  context: vscode.ExtensionContext
) {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace found for the selected file or folder.');
    throw new Error('No workspace found for the selected file or folder.');
  }

  const selectedItems = selectedUris?.length > 0 ? selectedUris : [uri];
  if (selectedItems.length === 0) {
    vscode.window.showErrorMessage('No files or folders selected.');
    return;
  }

  const selectedFileOrFolders = selectedItems.map((item) => item.fsPath);
  const workspacePath = workspaceFolder.uri.fsPath;
  const absoluteFileOrFolders = selectedFileOrFolders.map((fileOrFolder) =>
    path.isAbsolute(fileOrFolder)
      ? fileOrFolder
      : path.join(workspacePath, fileOrFolder)
  );

  try {
    const promptData = await generatePromptData(absoluteFileOrFolders, workspacePath);
    await generateMermaidDiagram(promptData, context);
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error generating diagram: ${error.message}`);
  }
}

/**
 * 生成提示数据。
 * @param absoluteFileOrFolders 绝对文件或文件夹路径数组。
 * @param workspacePath 工作区路径。
 * @returns 生成的提示数据。
 */
async function generatePromptData(
  absoluteFileOrFolders: string[],
  workspacePath: string
): Promise<string> {
  const filesOrFoldersString = absoluteFileOrFolders.join(',');
  const repomixCommand = `npx repomix --include "${filesOrFoldersString}" --output ${repomixFileName} --style markdown`;

  try {
    const { stderr } = await execAsync(repomixCommand, {
      cwd: workspacePath,
    });

    if (stderr) {
      vscode.window.showWarningMessage(`Command repomixCommand stderr: ${stderr}`);
    }

    const repomixFilePath = path.join(workspacePath, repomixFileName);
    const promptData = await vscode.workspace.fs.readFile(
      vscode.Uri.file(repomixFilePath)
    );

    await vscode.workspace.fs.delete(vscode.Uri.file(repomixFilePath));

    return promptData.toString();
  } catch (error: any) {
    throw new Error(`Error generating prompt data: ${error.message}`);
  }
}

/**
 * 生成 Mermaid 图表。
 * 调用 DeepSeek API 生成 Mermaid 代码，并显示预览。
 * @param inputText 输入的文本内容。
 * @param context VS Code 扩展上下文对象。
 */
async function generateMermaidDiagram(
  inputText: string,
  context: vscode.ExtensionContext
) {
  const config = vscode.workspace.getConfiguration('mermaidDeepseek');
  const openaiBaseUrl = config.get<string>('openaiBaseUrl');
  const openaiKey = config.get<string>('openaiKey');
  const openaiModel = config.get<string>('openaiModel');
  const deepseekPrompt =
    config.get<string>('deepseekPrompt') || `${defaultMermaidPrompt}\n`;
  const temperature = config.get<number>('temperature');

  if (!openaiKey) {
    vscode.window.showErrorMessage(
      'DeepSeek API Key is not configured. Please set it in settings.'
    );
    return;
  }

  const openai = new OpenAI({
    apiKey: openaiKey,
    baseURL: openaiBaseUrl,
  });

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Generating Mermaid Diagram...',
      cancellable: false,
    },
    async (progress) => {
      try {
        progress.report({ increment: 0, message: 'Calling DeepSeek API...' });
        const completion = await openai.chat.completions.create({
          model: openaiModel || 'deepseek-chat',
          temperature,
          messages: [{ role: 'user', content: deepseekPrompt + inputText }],
        });

        const mermaidCode = extractMermaidCode(
          completion.choices[0]?.message?.content
        );

        if (!mermaidCode) {
          vscode.window.showWarningMessage(
            'DeepSeek API did not return Mermaid code.'
          );
          return;
        }

        progress.report({
          increment: 100,
          message: 'Rendering Mermaid Diagram...',
        });
        showMermaidPreview(mermaidCode, context);
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error generating Mermaid diagram: ${error.message}`
        );
      } finally {
        progress.report({ increment: 100, message: 'Finished.' });
      }
    }
  );
}

/**
 * 提取 Mermaid 代码。
 * @param content API 响应内容。
 * @returns 提取的 Mermaid 代码，如果未找到则返回 undefined。
 */
function extractMermaidCode(content: string | undefined | null): string | undefined {
  if (!content) {
    return undefined;
  }

  const regex = /```mermaid\s+(.*?)\s+```/s;
  const match = content.match(regex);
  return match?.[1]?.trim();
}

/**
 * 显示 Mermaid 图表的预览。
 * @param mermaidCode Mermaid 代码。
 * @param context VS Code 扩展上下文对象。
 */
function showMermaidPreview(
  mermaidCode: string,
  context: vscode.ExtensionContext
) {
  const panel = vscode.window.createWebviewPanel(
    'mermaidPreview',
    'Mermaid Preview',
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = getWebviewContent(mermaidCode);
  panel.webview.onDidReceiveMessage(
    async (message) => {
      switch (message.command) {
        case 'downloadSVG':
          await handleDownloadSVG(message.data);
          break;
        case 'copyMermaidCode':
          await handleCopyMermaidCode(mermaidCode);
          break;
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * 处理下载 SVG 的消息。
 * @param svgData SVG 数据。
 */
async function handleDownloadSVG(svgData: string) {
  const uri = await vscode.window.showSaveDialog({
    filters: {
      'SVG Files': ['svg'],
    },
    defaultUri: vscode.Uri.file(downloadSVGFilename),
  });

  if (!uri) {
    vscode.window.showInformationMessage('Save operation cancelled.');
    return;
  }

  try {
    await vscode.workspace.fs.writeFile(uri, Buffer.from(svgData));
    vscode.window.showInformationMessage('SVG file saved successfully!');
  } catch (error: any) {
    vscode.window.showErrorMessage(`Error saving SVG file: ${error.message}`);
  }
}

/**
 * 处理复制 Mermaid 代码的消息。
 * @param mermaidCode Mermaid 代码。
 */
async function handleCopyMermaidCode(mermaidCode: string) {
  try {
    await vscode.env.clipboard.writeText(mermaidCode);
    vscode.window.showInformationMessage('Mermaid code copied to clipboard!');
  } catch (error: any) {
    vscode.window.showErrorMessage(`Copy failed: ${error.message}`);
  }
}

/**
 * 获取 Webview 的 HTML 内容。
 * @param mermaidCode 生成的 Mermaid 代码。
 * @returns 替换后的 HTML 内容。
 */
function getWebviewContent(mermaidCode: string): string {
  const htmlPath = path.join(__dirname, 'webview-content.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  return htmlContent.replace('${mermaidCode}', mermaidCode);
}

/**
 * 停用 VS Code 扩展。
 */
export function deactivate() { }