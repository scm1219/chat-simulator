# 配置说明

## 支持的 LLM 供应商

| 供应商 | 标识符 | 推荐模型 | 说明 |
|--------|--------|----------|------|
| **OpenAI** | `openai` | gpt-5.4, gpt-5.4-mini, o3, o4-mini | GPT 系列大模型 |
| **DeepSeek** | `deepseek` | deepseek-chat, deepseek-reasoner | 国产高性能 LLM，支持推理模式 |
| **通义千问** | `qwen` | qwen3, qwen3.5, qwen-max | 阿里云大模型 |
| **Moonshot** | `moonshot` | moonshot-v1-8k, moonshot-v1-32k | Kimi 提供的 LLM |
| **智谱 AI** | `zhipu` | glm-5, glm-5.1, glm-4-flash | 智谱 AI GLM 系列大模型 |
| **智谱 AI Coding** | `zhipu-coding` | glm-5.1 | 智谱 AI Coding 专用端点 |
| **MiniMax** | `minimax` | M2.7-Pro, M2.7-Ultra | MiniMax 大模型 |
| **ModelScope** | `modelscope` | 自定义 | 魔搭社区模型服务 |
| **Ollama** | `ollama` | llama3, qwen2, mistral | 本地部署，支持原生 API 和 OpenAI 兼容模式 |
| **自定义** | `custom` | 自定义 | 支持任何 OpenAI 兼容的 API |

## 回复模式

- **顺序模式**：一个角色回复完成后，才调用下一个角色
  - 适合：剧情演绎、连续对话场景
- **并行模式**：同时调用所有启用角色的 LLM
  - 适合：自由讨论、头脑风暴场景

## 角色排序与随机发言

- 支持拖拽排序 AI 角色的发言顺序
- 开启"随机发言"后，每轮对话随机决定角色发言顺序
- 用户角色不参与排序和 LLM 对话生成

## API Key 配置

- **全局 API Key**：在设置中配置，所有新群默认使用
- **群组独立 API Key**：在群设置中配置，优先级高于全局配置

## LLM 配置管理

应用支持保存多个 LLM 配置（Profile），每个配置包含：
- **配置名称**：便于识别和切换
- **供应商**：OpenAI、DeepSeek、通义千问、Moonshot 等
- **API Key**：供应商提供的访问密钥
- **模型名称**：要使用的模型
- **自定义 API 地址**：可选，用于自建服务或第三方中转
- **代理配置**：可选，按 Profile 独立配置代理

## 代理配置

支持以下代理类型：HTTP、HTTPS、SOCKS5、系统代理、不代理。

## 思考模式

- 在群设置或角色级别开启
- 模型会在回复前展示推理过程（reasoning_content）
- 适用于支持推理的模型（如 DeepSeek Reasoner、OpenAI o1 系列）

## 群背景设定

在群设置中配置背景场景，帮助 AI 更好地理解对话场景和角色关系。

**示例**：
```
这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话。
场景：赤壁之战前夕，刘备军营中，诸葛亮、刘备、关羽等人正在商议对策。
```
