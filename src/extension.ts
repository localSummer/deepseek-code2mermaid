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
 * @param context - VS Code 扩展上下文对象。
 */
export function activate(context: vscode.ExtensionContext) {
  /** 注册命令：从选中的文本生成 Mermaid 图表 */
  let generateFromSelection = vscode.commands.registerCommand(
    'deepseek.generateMermaidDiagramFromSelection',
    async () => {
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
    }
  );

  /** 注册命令：从文件或文件夹生成 Mermaid 图表 */
  let generateFromFileOrFolder = vscode.commands.registerCommand(
    'deepseek.generateMermaidDiagram',
    async (uri: vscode.Uri, selectedUris: vscode.Uri[] = []) => {
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      if (!workspaceFolder) throw new Error('error.noWorkspace');
      const selectedItems = selectedUris?.length > 0 ? selectedUris : [uri];
      if (selectedItems.length === 0) throw new Error('error.noSelection');

      const selectedFileOrFolders = selectedItems.map((item) => item.fsPath);
      const workspacePath = workspaceFolder.uri.fsPath;

      const absoluteFileOrFolders = selectedFileOrFolders.map(
        (fileOrFolder) => {
          const absolutePath = path.isAbsolute(fileOrFolder)
            ? fileOrFolder
            : path.join(workspacePath, fileOrFolder);
          return absolutePath;
        }
      );

      // 将文件或文件夹路径数组转换为字符串格式，用于 repomix 命令
      const filesOrFoldersString = absoluteFileOrFolders.join(',');
      const repomixCommand = `npx repomix --include "${filesOrFoldersString}" --output ${repomixFileName} --style markdown`;

      try {
        const { stderr } = await execAsync(repomixCommand, {
          cwd: workspacePath, // 在工作区根目录执行
        });
        // 显示执行结果
        if (stderr) {
          vscode.window.showWarningMessage(
            `Command repomixCommand stderr: ${stderr}`
          );
        }

        // 从 repomix 文件中读取提示数据
        const repomixFilePath = path.join(workspacePath, repomixFileName);
        // 读取文件内容
        const promptData = await vscode.workspace.fs.readFile(
          vscode.Uri.file(repomixFilePath)
        );

        // 读取内容后删除临时 repomixFilePath 文件
        await vscode.workspace.fs.delete(vscode.Uri.file(repomixFilePath));

        // 解析提示数据并更新结果对象
        const promptDataString = promptData.toString();
        await generateMermaidDiagram(promptDataString, context);
      } catch (error) {
        vscode.window.showErrorMessage(`Error reading file: ${error}`);
      }
    }
  );

  context.subscriptions.push(generateFromSelection, generateFromFileOrFolder);
}

/**
 * 生成 Mermaid 图表。
 * 调用 DeepSeek API 生成 Mermaid 代码，并显示预览。
 * @param inputText - 输入的文本内容。
 * @param context - VS Code 扩展上下文对象。
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

  vscode.window.withProgress(
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
          progress.report({
            increment: 100,
            message: 'Rendering Mermaid Diagram...',
          });
          showMermaidPreview(mermaidCode, context);
        } else {
          vscode.window.showWarningMessage(
            'DeepSeek API did not return Mermaid code.'
          );
        }
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
 * 显示 Mermaid 图表的预览。
 * 创建一个 Webview 面板来显示生成的 Mermaid 图表。
 * @param mermaidCode - 生成的 Mermaid 代码。
 * @param context - VS Code 扩展上下文对象。
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
      if (message.command === 'downloadSVG') {
        const uri = await vscode.window.showSaveDialog({
          filters: {
            'SVG Files': ['svg'],
          },
          defaultUri: vscode.Uri.file(downloadSVGFilename),
        });

        if (uri) {
          // 将SVG内容写入文件
          await vscode.workspace.fs.writeFile(uri, Buffer.from(message.data));
          vscode.window.showInformationMessage('SVG文件已保存！');
        }
      } else if (message.command === 'copyMermaidCode') {
        vscode.env.clipboard.writeText(mermaidCode).then(
          () => {
            vscode.window.showInformationMessage(
              '已复制 Mermaid 代码到剪贴板！'
            );
          },
          () => {
            vscode.window.showErrorMessage('复制失败');
          }
        );
      }
    },
    undefined,
    context.subscriptions
  );
}

/**
 * 获取 Webview 的 HTML 内容。
 * 读取并替换 HTML 模板中的 Mermaid 代码。
 * @param mermaidCode - 生成的 Mermaid 代码。
 * @returns 替换后的 HTML 内容。
 */
function getWebviewContent(mermaidCode: string) {
  const htmlPath = path.join(__dirname, 'webview-content.html');
  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  return htmlContent.replace('${mermaidCode}', mermaidCode);
}

/** 停用 VS Code 扩展。 */
export function deactivate() { }