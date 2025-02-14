import * as vscode from 'vscode';
import { OpenAI } from 'openai';

export function activate(context: vscode.ExtensionContext) {
	// Command to generate diagram from selection
	let generateFromSelection = vscode.commands.registerCommand('extension.generateMermaidDiagramFromSelection', async () => {
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
	let generateFromFile = vscode.commands.registerCommand('extension.generateMermaidDiagramFromFile', async (uri: vscode.Uri) => {
		if (uri && uri.fsPath) {
			try {
				const document = await vscode.workspace.openTextDocument(uri);
				const text = document.getText();
				await generateMermaidDiagram(text, context);
			} catch (error) {
				vscode.window.showErrorMessage(`Error reading file: ${error}`);
			}
		} else {
			vscode.window.showInformationMessage('No file selected.');
		}
	});

	// Command to generate diagram from folder (for simplicity, reads all files in folder and concatenates)
	let generateFromFolder = vscode.commands.registerCommand('extension.generateMermaidDiagramFromFolder', async (uri: vscode.Uri) => {
		if (uri && uri.fsPath) {
			try {
				const files = await vscode.workspace.findFiles(new vscode.RelativePattern(uri.fsPath, '**/*'));
				let allText = '';
				for (const fileUri of files) {
					const document = await vscode.workspace.openTextDocument(fileUri);
					allText += document.getText() + '\n\n----------Split File Line----------';
				}
				if (allText) {
					await generateMermaidDiagram(allText, context);
				} else {
					vscode.window.showInformationMessage('No text content found in folder.');
				}
			} catch (error) {
				vscode.window.showErrorMessage(`Error reading folder: ${error}`);
			}
		} else {
			vscode.window.showInformationMessage('No folder selected.');
		}
	});

	context.subscriptions.push(generateFromSelection, generateFromFile, generateFromFolder);
}

async function generateMermaidDiagram(inputText: string, context: vscode.ExtensionContext) {
	const config = vscode.workspace.getConfiguration('mermaidDeepseek');
	const openaiBaseUrl = config.get<string>('openaiBaseUrl');
	const openaiKey = config.get<string>('openaiKey');
	const openaiModel = config.get<string>('openaiModel');
	const deepseekPrompt = config.get<string>('deepseekPrompt') || "请根据以下代码，生成 mermaid 流程图代码，只输出 mermaid 代码，不要包含其他任何文字和markdown格式：\n"; // Default prompt

	if (!openaiKey) {
		vscode.window.showErrorMessage('DeepSeek API Key is not configured. Please set it in settings.');
		return;
	}

	const openai = new OpenAI({
		apiKey: openaiKey,
		baseURL: openaiBaseUrl,
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
				messages: [{ role: "user", content: deepseekPrompt + inputText }],
			});

			const mermaidCode = completion.choices[0]?.message?.content;

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
}

function getWebviewContent(mermaidCode: string) {
	return `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mermaid Preview</title>
    </head>
    <body>
        <div id="mermaid" class="mermaid"></div>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
        <script>
            mermaid.initialize({ startOnLoad: true });
			document.addEventListener('DOMContentLoaded', function() {
				const mermaidDiv = document.getElementById('mermaid');
				mermaidDiv.textContent = \`${mermaidCode}\`;
				mermaid.init(undefined, mermaidDiv);
			});
        </script>
    </body>
    </html>`;
}

export function deactivate() { }
