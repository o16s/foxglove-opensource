# Agent Tool Architecture (MCP)

The AI Agent in octaview Studio uses a tool-calling pattern inspired by MCP (Model Context Protocol), but implemented as **in-process function calls** rather than the MCP wire protocol. The tools run entirely in the browser — no server-side execution.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser                                                         │
│                                                                  │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐           │
│  │ Chat UI  │───▶│  Agent Loop  │───▶│ OpenAI API    │           │
│  │ index.tsx │   │ agentLoop.ts │   │ (user config) │           │
│  └──────────┘    └──────┬───────┘    └───────────────┘           │
│                         │                                        │
│                         │ tool_calls                             │
│                         ▼                                        │
│                  ┌──────────────┐                                │
│                  │Tool Executor │                                │
│                  │toolExecutor  │                                │
│                  └──────┬───────┘                                │
│                         │                                        │
│     ┌──────────┬────────┼────────┬──────────┐                    │
│     ▼          ▼        ▼        ▼          ▼                    │
│ ┌────────┐ ┌────────┐ ┌──────┐ ┌────────┐ ┌──────────────┐      │
│ │Topics &│ │Layout  │ │Schema│ │Block   │ │Playback &    │      │
│ │Pipeline│ │Actions │ │Intro.│ │Messages│ │Data Sources  │      │
│ └────────┘ └────────┘ └──────┘ └────┬───┘ └──────┬───────┘      │
│ MessagePipeline CurrentLayout Datatypes  │        │              │
│                                  messageCache  seekPlayback      │
│                                  .blocks    selectSource         │
│                                          ┌────────┘              │
│                                          ▼                       │
│                                   ┌─────────────┐               │
│                                   │ Go Server   │               │
│                                   │ /api/mcap/* │               │
│                                   └─────────────┘               │
└──────────────────────────────────────────────────────────────────┘
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

Maps tool names to handler functions. Created via `createToolExecutor(ctx, fetchFn?)` where `ctx` is a `StudioContext` containing React hook values (topics, datatypes, layout actions).

```typescript
type StudioContext = {
  topics: TopicInfo[];                    // from MessagePipeline
  datatypes: Immutable<RosDatatypes>;     // from MessagePipeline
  panelTypes: string[];                   // from PanelCatalog
  currentLayout: { layout, configById };  // from CurrentLayoutContext
  addPanel: (payload) => void;            // from CurrentLayoutActions
  changePanelLayout: (payload) => void;   // from CurrentLayoutActions
  savePanelConfigs: (payload) => void;     // from CurrentLayoutActions
  seekPlayback: ((time: Time) => void) | undefined;  // from MessagePipeline
  selectSource: (sourceId, args?) => void;            // from PlayerSelectionContext
  getBlockMessages: (topic: string) => MessageEvent[];  // reads block loader cache
  incidents: Incident[];                  // from URL ?incidents= parameter
  startTime: Time | undefined;            // recording start time, from playerState
};
```

The executor is recreated on each send (via `useMemo`) so it always has fresh context values.

### 5. System Prompt (`systemPrompt.ts`)

Builds the system message that instructs the LLM about:
- What octaview Studio is
- Available panel types and their config formats
- MessagePath syntax rules (topic name conventions, no spurious slash prepending)
- Layout mosaic tree structure
- Time convention (all times are elapsed seconds from recording start)
- Visualization workflow (list topics → choose panels → create layout)
- Incident-aware workflow (check incidents → correlate with data)
- Data analysis workflow (read values → statistics → peaks → seek → annotate)
- Recording search workflow (search → load → explore topics)

### 6. Markdown Parser (`parseMarkdown.ts`)

Converts assistant response markdown to HTML for rendering. Handles bold, italic, inline code, code blocks, tables, unordered lists, and newlines. HTML-escapes input first to prevent XSS. Tables render as styled `<table>` elements with borders; lists render as `<ul>/<li>`.

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

### Incident Context

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `get_incidents` | none | `Incident[]` | Get incidents passed via `?incidents=` URL parameter. Each has `time` (ISO 8601), `summary`, `severity`, `source`, `dedup_key` |

### Data Analysis

All times are **elapsed seconds** from the recording start — matching the Plot X-axis and progress bar.

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `read_field_values` | `{ topic, field, limit? }` | `[{time, value}]` | Read numeric values from loaded MCAP data (block loader cache). Times are elapsed seconds. Downsampled to limit (default 5000) |
| `get_statistics` | `{ topic, field }` | `{min, max, mean, stddev, count, startTime, endTime}` | Compute summary statistics for a numeric field. Times are elapsed seconds |
| `find_peaks` | `{ topic, field, threshold?, stddev? }` | `[{time, value}]` | Find local maxima above threshold or mean + N*stddev. Max 50 results, sorted by value descending |
| `seek_to_time` | `{ time }` | Status | Jump playback to a specific elapsed time (seconds from recording start) |
| `annotate_plot` | `{ panelId, annotations }` | Status | Add shaded time-range annotation regions to a Plot panel. Annotations render as colored boxes via chartjs-plugin-annotation |

### Recording Browser (MCAP server only)

| Tool | Args | Returns | Description |
|------|------|---------|-------------|
| `search_recordings` | `{ from?, to?, pattern? }` | `McapFileEntry[]` | Query `/api/mcap/index` for matching MCAP files by time range overlap and filename pattern |
| `load_recordings` | `{ files }` | Status | Download MCAP files from server and open them in the player via `storeDownloadedFiles` + `selectSource` |

### How Tools Access Studio State

Tools don't call React hooks directly. Instead, the `AgentChat` component:
1. Uses hooks to read current state (`useMessagePipeline`, `useCurrentLayoutActions`, `usePanelCatalog`, `usePlayerSelection`)
2. Packages the values into a `StudioContext` object
3. Passes it to `createToolExecutor(ctx, fetchFn?)` which closes over the values
4. The returned executor function is passed to `runAgentLoop()`

This keeps the tool logic pure and testable — tests create a mock `StudioContext` with `jest.fn()` callbacks.

## Time Convention

All data analysis tools use **elapsed seconds from the recording start**, not raw unix timestamps. This matches what the user sees on the Plot X-axis and the progress bar.

- `startTime` is read from `playerState.activeData?.startTime` and stored in `StudioContext`
- `extractFieldValues()` subtracts `startTime` from each message's `receiveTime` to produce elapsed seconds
- `seek_to_time` adds `startTime` back when calling `seekPlayback()`
- `annotate_plot` annotations use elapsed seconds for `startTime`/`endTime`, matching the Plot X-axis

The system prompt instructs the LLM to present times as "at 12.5s" or "between 100s and 200s", never raw unix timestamps.

## Topic Name Convention

**Critical rule for all tools that reference topics:**

Topic names come from the data source as-is. The agent must use them exactly.
- ROS topics: `/camera/image` (have leading slash)
- MCAP/Foxglove WebSocket: `sick1/image` (often no leading slash)

The `@foxglove/message-path` parser handles both. The agent must NOT prepend a slash.

For Plot paths: `<exact_topic_name>.<field>.<subfield>`
- Topic `sensors/imu` → path `sensors/imu.linear_acceleration.x`
- Topic `/odom` → path `/odom.pose.position.x`

## Implementation Notes

### Data Analysis Tools

Data analysis tools (`read_field_values`, `get_statistics`, `find_peaks`) read from the player's `BlockLoader` cache (`playerState.progress.messageCache.blocks`). For MCAP files, all message data is pre-loaded into blocks. These tools do NOT work with live WebSocket streams (no historical data available).

The `getBlockMessages(topic)` helper iterates all blocks and collects `messagesByTopic[topic]` into a flat `MessageEvent[]` array. Field values are extracted using dot-path traversal (e.g. `"linear_acceleration.x"`).

### Recording Browser Tools

Recording tools (`search_recordings`, `load_recordings`) require the Go server with `--mcap-path` enabled. They call the same HTTP API (`/api/mcap/index`, `/api/mcap/files/`) that the Browse Recordings UI uses. Not available in the desktop app with local files.

`load_recordings` downloads files, stores them via `storeDownloadedFiles()`, then opens them via `selectSource("mcap-server", { type: "connection", params: { downloadId } })`.

### Plot Annotations

The `annotate_plot` tool adds annotation regions to a Plot panel's config. Each annotation has `startTime`, `endTime`, `label`, optional `color`, and optional `enabled` flag.

**Rendering**: Annotations are piped through `PlotCoordinator.handleConfig()` → `ChartRenderer.update()` as `boxAnnotations`, rendered via `chartjs-plugin-annotation` as semi-transparent colored boxes with labels.

**Settings UI**: The Plot panel settings sidebar has an "Annotations" section (under Series) where users can:
- Add new annotations
- Delete existing annotations
- Toggle annotation visibility (eye icon)
- Edit label, start/end time (elapsed seconds), and color

**Type**: `PlotAnnotation` is defined in `packages/studio-base/src/panels/Plot/config.ts`:
```typescript
type PlotAnnotation = {
  startTime: number;   // elapsed seconds from recording start
  endTime: number;
  label: string;
  color?: string;      // hex color, defaults to #FF9800 (orange)
  enabled?: boolean;   // defaults to true
};
```

### Incident Context

Incidents are parsed from the `?incidents=` URL parameter (base64 or plain JSON) in `AgentChat/index.tsx`. The `get_incidents` tool exposes them to the agent so it can correlate alerts with recording data.

### Chat Markdown Rendering

The `parseMarkdown` function supports:
- **Bold** (`**text**`), **italic** (`*text*`), **inline code** (`` `code` ``), **code blocks** (` ``` `)
- **Tables** — pipe-delimited markdown tables → `<table>` with styled borders
- **Unordered lists** — `- item` or `* item` → `<ul>/<li>`
- **Newlines** → `<br>` (except inside `<pre>` blocks)

All input is HTML-escaped first to prevent XSS.

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
├── toolDefinitions.ts    # JSON schemas for 16 tools sent to LLM
├── toolDefinitions.test.ts
├── toolExecutor.ts       # Tool name → handler mapping + StudioContext
├── toolExecutor.test.ts  # 31 tests (all tools + error/edge cases)
├── systemPrompt.ts       # System message builder
├── systemPrompt.test.ts
├── parseMarkdown.ts      # MD → HTML (tables, lists, bold, italic, code; XSS-safe)
├── parseMarkdown.test.ts # 10 tests
├── index.tsx             # React UI (chat bubbles, input, settings check)
└── agent-avatar.svg      # Avatar icon
```
