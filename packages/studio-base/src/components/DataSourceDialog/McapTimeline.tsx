// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import {
  Box,
  Button,
  CircularProgress,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeStyles } from "tss-react/mui";

import Stack from "@foxglove/studio-base/components/Stack";
import { usePlayerSelection } from "@foxglove/studio-base/context/PlayerSelectionContext";
import { useWorkspaceActions } from "@foxglove/studio-base/context/Workspace/useWorkspaceActions";

import View from "./View";

type McapFileIndex = {
  path: string;
  folder: string;
  filename: string;
  startTime: number; // unix seconds
  endTime: number; // unix seconds
  size: number;
};

type ViewMode = "day" | "week" | "month";

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 40;
const LABEL_WIDTH = 180;
const BAR_HEIGHT = 20;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const MIN_BAR_WIDTH = 4;

const VIEW_DURATIONS: Record<ViewMode, number> = {
  day: 24 * 3600,
  week: 7 * 24 * 3600,
  month: 30 * 24 * 3600,
};

function formatTickLabel(time: number, mode: ViewMode): string {
  const d = new Date(time * 1000);
  switch (mode) {
    case "day":
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "week":
      return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    case "month":
      return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

function getTickInterval(mode: ViewMode): number {
  switch (mode) {
    case "day":
      return 3600; // every hour
    case "week":
      return 24 * 3600; // every day
    case "month":
      return 3 * 24 * 3600; // every 3 days
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const useStyles = makeStyles()((theme) => ({
  container: {
    padding: theme.spacing(4),
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  toolbar: {
    marginBottom: theme.spacing(2),
  },
  timelineWrapper: {
    display: "flex",
    overflow: "hidden",
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    flex: 1,
    minHeight: 200,
  },
  labelColumn: {
    width: LABEL_WIDTH,
    minWidth: LABEL_WIDTH,
    flexShrink: 0,
    borderRight: `1px solid ${theme.palette.divider}`,
    overflow: "hidden",
  },
  labelHeader: {
    height: HEADER_HEIGHT,
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(0, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.action.hover,
  },
  labelRow: {
    height: ROW_HEIGHT,
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(0, 1.5),
    borderBottom: `1px solid ${theme.palette.divider}`,
    "&:last-child": {
      borderBottom: "none",
    },
  },
  svgColumn: {
    flex: 1,
    overflowX: "auto",
    overflowY: "auto",
  },
  selectionInfo: {
    marginTop: theme.spacing(1),
  },
}));

// Color palette for folder rows
const COLORS = [
  "#2196F3",
  "#4CAF50",
  "#FF9800",
  "#9C27B0",
  "#F44336",
  "#00BCD4",
  "#795548",
  "#607D8B",
];

export default function McapTimeline({
  onSwitchView,
}: {
  onSwitchView?: () => void;
}): JSX.Element {
  const { classes, theme } = useStyles();
  const { selectSource } = usePlayerSelection();
  const { dialogActions } = useWorkspaceActions();

  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [viewStart, setViewStart] = useState<number>(() => {
    // Default: center the view on the data
    const now = Date.now() / 1000;
    return now - VIEW_DURATIONS.week;
  });

  const apiBase = useMemo(() => {
    const serverConfig = (globalThis as Record<string, unknown>).FOXGLOVE_STUDIO_SERVER as
      | { apiBase?: string }
      | undefined;
    return serverConfig?.apiBase ?? "";
  }, []);

  const [files, setFiles] = useState<McapFileIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // Drag selection state
  const [selStart, setSelStart] = useState<number | undefined>();
  const [selEnd, setSelEnd] = useState<number | undefined>();
  const dragging = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Fetch index from server
  useEffect(() => {
    setLoading(true);
    setError(undefined);
    fetch(`${apiBase}/api/mcap/index`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        return (await res.json()) as McapFileIndex[];
      })
      .then((data) => {
        setFiles(data);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiBase]);

  // Group files by folder
  const folders = useMemo(() => {
    const map = new Map<string, McapFileIndex[]>();
    for (const file of files) {
      const key = file.folder || "(root)";
      const list = map.get(key) ?? [];
      list.push(file);
      map.set(key, list);
    }
    // Sort folders alphabetically, sort files within each folder by startTime
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [, list] of sorted) {
      list.sort((a, b) => a.startTime - b.startTime);
    }
    return sorted;
  }, [files]);

  const viewDuration = VIEW_DURATIONS[viewMode];
  const viewEnd = viewStart + viewDuration;

  // Auto-fit: center view on data when files change or view mode changes
  useEffect(() => {
    if (files.length === 0) {
      return;
    }
    const minTime = Math.min(...files.map((f) => f.startTime));
    const maxTime = Math.max(...files.map((f) => f.endTime));
    const dataCenter = (minTime + maxTime) / 2;
    setViewStart(dataCenter - viewDuration / 2);
  }, [files, viewDuration]);

  // SVG dimensions
  const svgWidth = 1200;
  const svgHeight = HEADER_HEIGHT + folders.length * ROW_HEIGHT;

  // Time-to-pixel conversion
  const timeToX = useCallback(
    (t: number) => ((t - viewStart) / viewDuration) * svgWidth,
    [viewStart, viewDuration, svgWidth],
  );

  // Pixel-to-time conversion
  const xToTime = useCallback(
    (x: number) => viewStart + (x / svgWidth) * viewDuration,
    [viewStart, viewDuration, svgWidth],
  );

  // Generate tick marks
  const ticks = useMemo(() => {
    const interval = getTickInterval(viewMode);
    const firstTick = Math.ceil(viewStart / interval) * interval;
    const result: number[] = [];
    for (let t = firstTick; t <= viewEnd; t += interval) {
      result.push(t);
    }
    return result;
  }, [viewStart, viewEnd, viewMode]);

  // Pan handlers
  const panAmount = viewDuration * 0.25;
  const panLeft = useCallback(() => {
    setViewStart((prev) => prev - panAmount);
  }, [panAmount]);
  const panRight = useCallback(() => {
    setViewStart((prev) => prev + panAmount);
  }, [panAmount]);

  // Drag selection handlers
  const getSvgX = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) {
        return 0;
      }
      const rect = svg.getBoundingClientRect();
      return e.clientX - rect.left;
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const rect = svg.getBoundingClientRect();
      const y = e.clientY - rect.top;
      if (y < HEADER_HEIGHT) {
        return;
      }
      const x = getSvgX(e);
      const time = xToTime(x);
      dragging.current = true;
      setSelStart(time);
      setSelEnd(time);
    },
    [getSvgX, xToTime],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging.current) {
        return;
      }
      const x = getSvgX(e);
      setSelEnd(xToTime(x));
    },
    [getSvgX, xToTime],
  );

  const handleMouseUp = useCallback(() => {
    if (!dragging.current) {
      return;
    }
    dragging.current = false;
    // If drag was too small (a click), clear selection
    if (selStart != undefined && selEnd != undefined) {
      const min = Math.min(selStart, selEnd);
      const max = Math.max(selStart, selEnd);
      if (max - min < viewDuration * 0.005) {
        setSelStart(undefined);
        setSelEnd(undefined);
      }
    }
  }, [selStart, selEnd, viewDuration]);

  // Compute selected files based on drag range
  const selectionRange = useMemo(() => {
    if (selStart == undefined || selEnd == undefined) {
      return undefined;
    }
    const min = Math.min(selStart, selEnd);
    const max = Math.max(selStart, selEnd);
    if (max - min < viewDuration * 0.005) {
      return undefined;
    }
    return { start: min, end: max };
  }, [selStart, selEnd, viewDuration]);

  const selectedFiles = useMemo(() => {
    if (!selectionRange) {
      return [];
    }
    return files.filter(
      (f) => f.startTime < selectionRange.end && f.endTime > selectionRange.start,
    );
  }, [files, selectionRange]);

  const [merging, setMerging] = useState(false);

  const totalSize = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + f.size, 0),
    [selectedFiles],
  );

  const onOpen = useCallback(() => {
    if (selectedFiles.length === 0) {
      return;
    }

    // Single file — open directly without merge
    if (selectedFiles.length === 1) {
      const urls = [
        `${apiBase}/api/mcap/files/${encodeURIComponent(selectedFiles[0]!.path)}`,
      ];
      selectSource("mcap-server", {
        type: "connection",
        params: { urls: JSON.stringify(urls) },
      });
      dialogActions.dataSource.close();
      return;
    }

    // Multiple files — merge on server first
    setMerging(true);
    const paths = selectedFiles.map((f) => f.path);
    fetch(`${apiBase}/api/mcap/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        return (await res.json()) as { url: string };
      })
      .then(({ url }) => {
        const fullUrl = `${window.location.origin}${url}`;
        selectSource("mcap-server", {
          type: "connection",
          params: { urls: JSON.stringify([fullUrl]) },
        });
        dialogActions.dataSource.close();
      })
      .catch((err: Error) => {
        console.error("Merge failed:", err);
        setMerging(false);
        setError(`Merge failed: ${err.message}`);
      });
  }, [apiBase, dialogActions.dataSource, selectSource, selectedFiles]);

  return (
    <View onOpen={selectedFiles.length > 0 ? onOpen : undefined}>
      <Stack className={classes.container}>
        <Typography variant="h3" fontWeight={600}>
          Browse recordings
        </Typography>

        {/* Toolbar */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          className={classes.toolbar}
        >
          <Stack direction="row" alignItems="center" gap={2}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_e, val: ViewMode | null) => {
                if (val) {
                  setViewMode(val);
                }
              }}
              size="small"
            >
              <ToggleButton value="day">Day</ToggleButton>
              <ToggleButton value="week">Week</ToggleButton>
              <ToggleButton value="month">Month</ToggleButton>
            </ToggleButtonGroup>

            <Stack direction="row" gap={0.5}>
              <ToggleButton value="left" size="small" onClick={panLeft}>
                <ChevronLeftIcon />
              </ToggleButton>
              <ToggleButton value="right" size="small" onClick={panRight}>
                <ChevronRightIcon />
              </ToggleButton>
            </Stack>
          </Stack>

          {onSwitchView && (
            <Button size="small" onClick={onSwitchView}>
              List view
            </Button>
          )}
        </Stack>

        {loading && (
          <Stack alignItems="center" padding={4} flex={1} justifyContent="center">
            <CircularProgress />
          </Stack>
        )}

        {error != undefined && (
          <Typography color="error">Failed to load index: {error}</Typography>
        )}

        {!loading && error == undefined && files.length === 0 && (
          <Typography color="text.secondary">No MCAP files found on the server.</Typography>
        )}

        {/* Timeline */}
        {!loading && files.length > 0 && <div className={classes.timelineWrapper}>
          {/* Left: folder labels */}
          <div className={classes.labelColumn}>
            <div className={classes.labelHeader}>
              <Typography variant="caption" fontWeight={600}>
                Folder
              </Typography>
            </div>
            {folders.map(([folderName], i) => (
              <div key={folderName} className={classes.labelRow}>
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: COLORS[i % COLORS.length],
                    mr: 1,
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2" noWrap title={folderName}>
                  {folderName}
                </Typography>
              </div>
            ))}
          </div>

          {/* Right: SVG timeline */}
          <div className={classes.svgColumn}>
            <svg
              ref={svgRef}
              width={svgWidth}
              height={svgHeight}
              style={{ display: "block", cursor: "crosshair", userSelect: "none" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
            >
              {/* Header background */}
              <rect
                x={0}
                y={0}
                width={svgWidth}
                height={HEADER_HEIGHT}
                fill={theme.palette.action.hover}
              />

              {/* Row backgrounds */}
              {folders.map(([folderName], i) => (
                <rect
                  key={folderName}
                  x={0}
                  y={HEADER_HEIGHT + i * ROW_HEIGHT}
                  width={svgWidth}
                  height={ROW_HEIGHT}
                  fill={i % 2 === 0 ? "transparent" : theme.palette.action.hover}
                />
              ))}

              {/* Row dividers */}
              {folders.map(([folderName], i) => (
                <line
                  key={`div-${folderName}`}
                  x1={0}
                  y1={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT}
                  x2={svgWidth}
                  y2={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT}
                  stroke={theme.palette.divider}
                  strokeWidth={1}
                />
              ))}

              {/* Header bottom border */}
              <line
                x1={0}
                y1={HEADER_HEIGHT}
                x2={svgWidth}
                y2={HEADER_HEIGHT}
                stroke={theme.palette.divider}
                strokeWidth={1}
              />

              {/* Tick marks and labels */}
              {ticks.map((t) => {
                const x = timeToX(t);
                return (
                  <g key={t}>
                    <line
                      x1={x}
                      y1={HEADER_HEIGHT - 8}
                      x2={x}
                      y2={svgHeight}
                      stroke={theme.palette.divider}
                      strokeWidth={1}
                      strokeDasharray="2,2"
                    />
                    <text
                      x={x}
                      y={HEADER_HEIGHT - 14}
                      textAnchor="middle"
                      fontSize={11}
                      fill={theme.palette.text.secondary}
                      fontFamily={theme.typography.fontFamily}
                    >
                      {formatTickLabel(t, viewMode)}
                    </text>
                  </g>
                );
              })}

              {/* File bars */}
              {folders.map(([, folderFiles], folderIdx) =>
                folderFiles.map((file) => {
                  const x1 = Math.max(0, timeToX(file.startTime));
                  const x2 = Math.min(svgWidth, timeToX(file.endTime));
                  const barWidth = Math.max(MIN_BAR_WIDTH, x2 - x1);
                  const y = HEADER_HEIGHT + folderIdx * ROW_HEIGHT + BAR_Y_OFFSET;
                  const color = COLORS[folderIdx % COLORS.length]!;
                  const isSelected = selectedFiles.includes(file);

                  return (
                    <Tooltip
                      key={file.path}
                      title={
                        <span>
                          <strong>{file.filename}</strong>
                          <br />
                          {new Date(file.startTime * 1000).toLocaleString()} —{" "}
                          {new Date(file.endTime * 1000).toLocaleString()}
                          <br />
                          {formatFileSize(file.size)}
                        </span>
                      }
                      arrow
                    >
                      <rect
                        x={x1}
                        y={y}
                        width={barWidth}
                        height={BAR_HEIGHT}
                        rx={3}
                        ry={3}
                        fill={color}
                        opacity={isSelected ? 1 : 0.7}
                        stroke={isSelected ? theme.palette.common.white : "none"}
                        strokeWidth={isSelected ? 2 : 0}
                        style={{ pointerEvents: "none" }}
                      />
                    </Tooltip>
                  );
                }),
              )}

              {/* Drag selection overlay */}
              {selectionRange && (
                <rect
                  x={timeToX(selectionRange.start)}
                  y={HEADER_HEIGHT}
                  width={timeToX(selectionRange.end) - timeToX(selectionRange.start)}
                  height={svgHeight - HEADER_HEIGHT}
                  fill={theme.palette.primary.main}
                  opacity={0.15}
                  stroke={theme.palette.primary.main}
                  strokeWidth={1}
                  strokeDasharray="4,2"
                  style={{ pointerEvents: "none" }}
                />
              )}
            </svg>
          </div>
        </div>}

        {/* Selection info */}
        {selectedFiles.length > 0 && (
          <Stack direction="row" alignItems="center" gap={2} className={classes.selectionInfo}>
            <Typography variant="body2" color="text.secondary">
              {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} selected
              {" · "}
              {formatFileSize(totalSize)}
              {selectionRange && (
                <>
                  {" · "}
                  {new Date(selectionRange.start * 1000).toLocaleString()} —{" "}
                  {new Date(selectionRange.end * 1000).toLocaleString()}
                </>
              )}
            </Typography>
            {totalSize > 1024 * 1024 * 1024 && (
              <Typography variant="body2" color="warning.main" fontWeight={600}>
                ⚠ Large selection — merge may take a while
              </Typography>
            )}
            {merging && (
              <Stack direction="row" alignItems="center" gap={1}>
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  Merging files…
                </Typography>
              </Stack>
            )}
          </Stack>
        )}
      </Stack>
    </View>
  );
}
