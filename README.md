# DeepSeek Code2Mermaid

将代码的执行流程转为可在线预览的Mermaid流程图，提升代码的可读性。

#### 插件核心逻辑预览效果图
[](https://i-blog.csdnimg.cn/direct/d7beec6e29a94b32ac9de75516563fe1.png)

## 功能特点

- 支持选中代码片段生成流程图
- 支持选中文件或文件夹生成流程图
- 支持流程图缩放预览
- 支持导出SVG格式的流程图
- 基于DeepSeek AI模型，可切换其他兼容OpenAI API的AI模型，智能分析代码结构和执行流程

## 安装方法

1. 下载 `.vsix` 安装包
2. 在VS Code中，选择 "扩展" 视图
3. 点击视图右上角的 "..." 菜单
4. 选择 "从VSIX安装..."
5. 选择下载的 `.vsix` 文件进行安装

## 配置说明

在VS Code设置中配置以下参数：

- `mermaidDeepseek.openaiBaseUrl`: DeepSeek API的基础URL
  - 默认值: `https://api.deepseek.com/v1`
- `mermaidDeepseek.openaiKey`: DeepSeek API密钥
  - 必须配置项
- `mermaidDeepseek.openaiModel`: 使用的DeepSeek模型
  - 默认值: `deepseek-chat`
- `mermaidDeepseek.temperature`: AI生成的温度参数
  - 默认值: `0.1`
- `mermaidDeepseek.deepseekPrompt`: 自定义的提示词
  - 可选配置

## 使用方法

### 从代码片段生成流程图

1. 在编辑器中选中要分析的代码片段
2. 右键选择 "Generate Mermaid Diagram (Selection)"
3. 等待流程图生成

### 从文件或文件夹生成流程图

1. 在资源管理器中右键选择文件或文件夹
2. 点击 "Generate Mermaid Diagram"
3. 等待流程图生成

### 流程图操作

- 使用右上角的放大/缩小按钮调整流程图大小
- 点击下载按钮将流程图保存为SVG格式

## 注意事项

- 使用前请确保已正确配置DeepSeek API密钥
- 生成大型项目的流程图可能需要较长时间
- 建议从较小的代码片段开始使用，以熟悉工具的功能

## 许可证

MIT

## 问题反馈

如有问题或建议，请在GitHub仓库提交Issue：[deepseek-code2mermaid](https://github.com/localSummer/deepseek-code2mermaid)