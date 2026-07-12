# Agent Tool Architecture (MCP)

The AI Agent in Octaview Studio uses a tool-calling pattern inspired by MCP (Model Context Protocol), but implemented as **in-process function calls** rather than the MCP wire protocol. The tools run entirely in the browser — no server-side execution.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ Chat UI  │───▶│  Agent Loop  │───▶│ OpenAI API    │  │
│  │ index.tsx │   │ agentLoop.ts │   │ (user config) │  │
│  └──────────┘    └──────┬───────┘    └───────────────┘  │
│                         │                               │
│                         │ tool_calls                    │
│                         ▼                               │
│                  ┌──────────────┐                       │
│                  │Tool Executor │                       │
│                  │toolExecutor  │                       │
│                  └──────┬───────┘                       │
│                         │                               │
│           ┌─────────────┼─────────────┐                 │
│           ▼             ▼             ▼                 │
│    ┌────────────┐ ┌──────────┐ ┌───────────┐           │
│    │ Topics &   │ │ Layout   │ │ Schema    │           │
│    │ Pipeline   │ │ Actions  │ │ Introspect│           │
│    └────────────┘ └──────────┘ └───────────┘           │
│    MessagePipeline CurrentLayout  RosDatatypes          │
│    (React context) (React context) (React context)      │
└─────────────────────────────────────────────────────────┘
```

## Components

### 1. Types (`types.ts`)

Shared type definitions matching the OpenAI chat completions API format:

```typescript
type ChatMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | undefined;
  tool_calls?: ToolCall[];     // assistant → tool invocations
  tool_call_id?: string;       // tool → response to a specific call
};

type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;  // JSON Schema
  };
};
```

### 2. Agent Loop (`agentLoop.ts`)

The core orchestration loop. Pure async function with dependency injection — no React dependencies, fully testable.

```
Input: messages[], tools[], fetchFn, executeTool, config
                    │
                    ▼
            ┌───────────────┐
            │ Call LLM API  │◀────────────────┐
            └───────┬───────┘                 │
                    │                         │
              ┌─────▼─────┐                   │
              │ tool_calls │──yes──▶ Execute   │
              │ in resp?   │       each tool   │
              └─────┬──────┘       Append      │
                    │ no           results ─────┘
                    ▼
              Return conversation
```

**Key behaviors:**
- Max 10 iterations (prevents infinite tool-call loops)
- Supports parallel tool calls (multiple `tool_calls` in one response)
- Error in tool execution is caught and returned as error text to the LLM
- Dependency-injected `fetchFn` and `executeTool` for testability

### 3. Tool Definitions (`toolDefinitions.ts`)

JSON Schema definitions sent in the `tools` array of the API request. These tell the LLM what tools are available and how to call them. Each definition has:
- `name` — identifier matching a handler in the executor
- `description` — natural language description the LLM reads
- `parameters` — JSON Schema for the arguments

### 4. Tool Executor (`toolExecutor.ts`)

Maps tool names to handler functions. Created via `createToolExecutor(ctx)` where `ctx` is a `StudioContext` containing React hook values (topics, datatypes, layout actions).

```typescript
type StudioContext = {
  topics: TopicInfo[];                    // from MessagePipeline
  datatypes: Immutable<RosDatatypes>;     // from MessagePipeline
  panelTypes: string[];                   // from PanelCatalog
  currentLayout: { layout, configById };  // from CurrentLayoutContext
  addPanel: (payload) => void;            // from CurrentLayoutActions
  changePanelLayout: (payload) => void;   // from CurrentLayoutActions
  savePanelConfigs: (payload) => void;     // from CurrentLayoutActions
};
```

The executor is recreated on each send (via `useMemo`) so it always has fresh context values.

### 5. System Prompt (`systemPrompt.ts`)

Builds the system message that instructs the LLM about:
- What Octaview Studio is
- Available panel types and their config formats
- MessagePath syntax rules (topic name conventions, no spurious slash prepending)
- Layout mosaic tree structure
- Recommended workflow (list topics → choose panels → create layout)

### 6. Markdown Parser (`parseMarkdown.ts`)

Converts assistant response markdown to HTML for rendering. Handles bold, italic, inline code, code blocks, and newlines. HTML-escapes input first to prevent XSS.

## Current Tools

### Topic Discovery

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `list_topics` | none | `TopicInfo[]` | All topics with schema names |
| `search_topics` | `{ query }` | `TopicInfo[]` | Filter topics by name/schema substring |
| `get_topic_fields` | `{ topic }` | `string[]` | Recursive field paths for a topic (e.g. `["linear_acceleration.x", ...]`) |
| `search_topic_fields` | `{ query }` | `[{topic, path}]` | Search all topics for fields matching a query |

### Layout Manipulation

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `get_panel_types` | none | `string[]` | Available panel types |
| `get_current_layout` | none | `{layout, configById}` | Current mosaic tree + configs |
| `add_panel` | `{ type, config? }` | panel ID | Add a panel to the layout |
| `set_layout` | `{ layout, configs }` | `"Layout updated"` | Replace entire layout |

### How Tools Access Studio State

Tools don't call React hooks directly. Instead, the `AgentChat` component:
1. Uses hooks to read current state (`useMessagePipeline`, `useCurrentLayoutActions`, `usePanelCatalog`)
2. Packages the values into a `StudioContext` object
3. Passes it to `createToolExecutor()` which closes over the values
4. The returned executor function is passed to `runAgentLoop()`

This keeps the tool logic pure and testable — tests create a mock `StudioContext` with `jest.fn()` callbacks.

## Topic Name Convention

**Critical rule for all tools that reference topics:**

Topic names come from the data source as-is. The agent must use them exactly.
- ROS topics: `/camera/image` (have leading slash)
- MCAP/Foxglove WebSocket: `sick1/image` (often no leading slash)

The `@foxglove/message-path` parser handles both. The agent must NOT prepend a slash.

For Plot paths: `<exact_topic_name>.<field>.<subfield>`
- Topic `sensors/imu` → path `sensors/imu.linear_acceleration.x`
- Topic `/odom` → path `/odom.pose.position.x`

## Planned Tools

### Recording Browser (MCAP server only)

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `search_recordings` | `{ from?, to?, pattern? }` | File list with time ranges | Query `/api/mcap/index` for matching MCAP files |
| `load_recordings` | `{ files }` | Status | Download and open MCAP files in the player |

These tools require the Go server with `--mcap-path` enabled. They call the same HTTP API that the Browse Recordings UI uses. Not available in the desktop app with local files.

### Data Analysis (MCAP files only)

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `read_field_values` | `{ topic, field, from?, to?, limit? }` | `[{time, value}]` | Read values from loaded MCAP data (via block loader). Capped/downsampled to ~5k points |
| `get_statistics` | `{ topic, field, from?, to? }` | `{min, max, mean, stddev, count}` | Compute summary statistics for a field |
| `find_peaks` | `{ topic, field, threshold?, stddev? }` | `[{time, value}]` | Find peaks above threshold or N standard deviations from mean |
| `seek_to_time` | `{ time }` | Status | Jump playback to a specific timestamp |
| `annotate_plot` | `{ panelId, annotations }` | Status | Add shaded time-range regions with labels to a Plot panel |

Data is read from the player's `BlockLoader` cache — no extra downloads. For MCAP files, all message data is pre-loaded. These tools do NOT work with live WebSocket streams (no historical data available).

## Adding a New Tool

1. **Define the schema** in `toolDefinitions.ts` — add a `ToolDefinition` entry
2. **Add the handler** in `toolExecutor.ts` — add an entry to the `handlers` record
3. **Write tests** in `toolExecutor.test.ts` — mock the `StudioContext` and verify behavior
4. **Update system prompt** if the tool changes how the agent should interact (new workflow, new config format)
5. **Update `toolDefinitions.test.ts`** — add the tool name to the expected list

The tool definition `description` field is critical — it's what the LLM reads to decide when and how to use the tool. Be precise and include examples.

## File Map

```
packages/studio-base/src/components/AgentChat/
├── types.ts              # ChatMessage, ToolCall, ToolDefinition types
├── agentLoop.ts          # Core loop: API → tool calls → repeat
├── agentLoop.test.ts     # 4 tests (text response, tool loop, error, max iterations)
├── toolDefinitions.ts    # JSON schemas sent to LLM
├── toolDefinitions.test.ts
├── toolExecutor.ts       # Tool name → handler mapping + StudioContext
├── toolExecutor.test.ts  # 9 tests (all tools + error case)
├── systemPrompt.ts       # System message builder
├── systemPrompt.test.ts
├── parseMarkdown.ts      # MD → HTML (XSS-safe)
├── parseMarkdown.test.ts # 7 tests
├── index.tsx             # React UI (chat bubbles, input, settings check)
└── agent-avatar.svg      # Avatar icon
```
