// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DownloadIcon from "@mui/icons-material/Download";
import {
  Button,
  CircularProgress,
  LinearProgress,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeStyles } from "tss-react/mui";

import Stack from "@foxglove/studio-base/components/Stack";
import { usePlayerSelection } from "@foxglove/studio-base/context/PlayerSelectionContext";
import { useWorkspaceActions } from "@foxglove/studio-base/context/Workspace/useWorkspaceActions";
import { storeDownloadedFiles } from "@foxglove/studio-base/dataSources/McapServerDataSourceFactory";

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

type DownloadProgress = {
  fileIndex: number;
  totalFiles: number;
  currentFilename: string;
  currentLoaded: number;
  currentTotal: number;
  completedBytes: number;
  grandTotal: number;
};

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 40;
const LABEL_WIDTH = 180;
const BAR_HEIGHT = 20;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const MIN_BAR_WIDTH = 4;
const SELECTION_SPAN = 5 * 60; // 5 minutes in seconds
const DOWNLOAD_DELAY_MS = 50; // brief pause between sequential downloads to ease server CPU

const VIEW_DURATIONS: Record<ViewMode, number> = {
  day: 24 * 3600,
  week: 7 * 24 * 3600,
  month: 30 * 24 * 3600,
};

// Adaptive tick intervals based on visible duration
const TICK_LEVELS = [
  { maxDuration: 600, interval: 60, format: "time" },         // < 10min → every minute
  { maxDuration: 3600, interval: 300, format: "time" },        // < 1h → every 5 min
  { maxDuration: 6 * 3600, interval: 1800, format: "time" },   // < 6h → every 30 min
  { maxDuration: 2 * 86400, interval: 3600, format: "time" },  // < 2d → every hour
  { maxDuration: 7 * 86400, interval: 86400, format: "date" }, // < 1w → every day
  { maxDuration: 30 * 86400, interval: 3 * 86400, format: "date" }, // < 1m → every 3 days
  { maxDuration: 90 * 86400, interval: 7 * 86400, format: "date" }, // < 3m → every week
  { maxDuration: Infinity, interval: 30 * 86400, format: "month" }, // else → every month
] as const;

function getTickConfig(duration: number): { interval: number; format: string } {
  for (const level of TICK_LEVELS) {
    if (duration <= level.maxDuration) {
      return { interval: level.interval, format: level.format };
    }
  }
  return { interval: 30 * 86400, format: "month" };
}

function formatTickLabel(time: number, format: string): string {
  const d = new Date(time * 1000);
  switch (format) {
    case "time":
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    case "date":
      return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    case "month":
      return d.toLocaleDateString([], { month: "short", year: "numeric" });
    default:
      return d.toLocaleDateString();
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

// CRC-32 lookup table (IEEE polynomial)
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
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
    position: "relative",
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
    cursor: "pointer",
    userSelect: "none" as const,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
    "&:last-child": {
      borderBottom: "none",
    },
  },
  labelRowSelected: {
    backgroundColor: theme.palette.action.selected,
    "&:hover": {
      backgroundColor: theme.palette.action.selected,
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
  tooltip: {
    position: "absolute",
    pointerEvents: "none",
    backgroundColor: theme.palette.grey[900],
    color: theme.palette.common.white,
    padding: theme.spacing(0.75, 1.5),
    borderRadius: theme.shape.borderRadius,
    fontSize: 12,
    lineHeight: 1.4,
    zIndex: 10,
    maxWidth: 300,
    whiteSpace: "nowrap",
  },
  dateInput: {
    height: 31,
    fontSize: 13,
    borderRadius: 4,
    border: `1px solid ${theme.palette.action.disabled}`,
    padding: "0 8px",
    background: "transparent",
    color: theme.palette.text.primary,
    outline: "none",
    "&:hover": {
      borderColor: theme.palette.text.primary,
    },
    "&:focus": {
      borderColor: theme.palette.primary.main,
    },
  },
  downloadOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.palette.background.paper,
    zIndex: 20,
    gap: theme.spacing(2),
    padding: theme.spacing(4),
  },
}));

// Data visualization palette (octaview design system, colorblind-aware)
const COLORS = [
  "#3E63DD",
  "#30A46C",
  "#FF5C00",
  "#8E4EC6",
  "#00A2C7",
  "#E5484D",
  "#F5B82E",
  "#6E6E7C",
];

type VisibleBar = {
  file: McapFileIndex;
  x: number;
  width: number;
  y: number;
  color: string;
  folderIdx: number;
};

export default function McapTimeline(): JSX.Element {
  const { classes, theme } = useStyles();
  const { selectSource } = usePlayerSelection();
  const { dialogActions } = useWorkspaceActions();

  const [viewDuration, setViewDuration] = useState(VIEW_DURATIONS.week);
  const [viewStart, setViewStart] = useState<number>(() => {
    const now = Date.now() / 1000;
    return now - VIEW_DURATIONS.week;
  });
  const [dateInput, setDateInput] = useState("");

  const apiBase = useMemo(() => {
    const serverConfig = (globalThis as Record<string, unknown>).OCTAVIEW_STUDIO_SERVER as
      | { apiBase?: string }
      | undefined;
    return serverConfig?.apiBase ?? "";
  }, []);

  const [files, setFiles] = useState<McapFileIndex[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>();

  // Row (folder) selection state — unselected by default
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());

  const handleRowClick = useCallback((folderName: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(folderName)) {
        next.delete(folderName);
      } else {
        next.add(folderName);
      }
      return next;
    });
  }, []);

  // Click selection state — fixed 5-minute span
  const [selCenter, setSelCenter] = useState<number | undefined>();
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Hover tooltip state
  const [tooltipState, setTooltipState] = useState<{
    file: McapFileIndex;
    x: number;
    y: number;
  } | null>(null);

  // Download state
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | undefined>();
  const downloadAbortRef = useRef<AbortController | undefined>();

  // Fetch index from server
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    fetch(`${apiBase}/api/mcap/index`, { signal: controller.signal })
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
        if (err.name === "AbortError") {
          return;
        }
        setError(err.message);
        setLoading(false);
      });
    return () => { controller.abort(); };
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
    const sorted = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [, list] of sorted) {
      list.sort((a, b) => a.startTime - b.startTime);
    }
    return sorted;
  }, [files]);

  const viewEnd = viewStart + viewDuration;

  const activePreset = useMemo((): ViewMode | undefined => {
    for (const [key, val] of Object.entries(VIEW_DURATIONS) as [ViewMode, number][]) {
      if (Math.abs(viewDuration - val) < 1) {
        return key;
      }
    }
    return undefined;
  }, [viewDuration]);

  // Auto-fit: center view on data when files load
  const hasAutoFit = useRef(false);
  useEffect(() => {
    if (files.length === 0 || hasAutoFit.current) {
      return;
    }
    hasAutoFit.current = true;
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

  // Compute visible bars with viewport culling
  const visibleBars = useMemo((): VisibleBar[] => {
    const bars: VisibleBar[] = [];
    for (let folderIdx = 0; folderIdx < folders.length; folderIdx++) {
      const [, folderFiles] = folders[folderIdx]!;
      const color = COLORS[folderIdx % COLORS.length]!;
      const rowY = HEADER_HEIGHT + folderIdx * ROW_HEIGHT + BAR_Y_OFFSET;

      for (const file of folderFiles) {
        if (file.endTime < viewStart || file.startTime > viewEnd) {
          continue;
        }
        const x1 = Math.max(0, timeToX(file.startTime));
        const x2 = Math.min(svgWidth, timeToX(file.endTime));
        const barWidth = Math.max(MIN_BAR_WIDTH, x2 - x1);
        bars.push({ file, x: x1, width: barWidth, y: rowY, color, folderIdx });
      }
    }
    return bars;
  }, [folders, viewStart, viewEnd, timeToX, svgWidth]);

  // Generate tick marks
  const tickConfig = useMemo(() => getTickConfig(viewDuration), [viewDuration]);
  const ticks = useMemo(() => {
    const firstTick = Math.ceil(viewStart / tickConfig.interval) * tickConfig.interval;
    const result: number[] = [];
    for (let t = firstTick; t <= viewEnd; t += tickConfig.interval) {
      result.push(t);
    }
    return result;
  }, [viewStart, viewEnd, tickConfig.interval]);

  // Pan handlers
  const panAmount = viewDuration * 0.25;
  const panLeft = useCallback(() => {
    setViewStart((prev) => prev - panAmount);
  }, [panAmount]);
  const panRight = useCallback(() => {
    setViewStart((prev) => prev + panAmount);
  }, [panAmount]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const svg = svgRef.current;
      if (!svg) {
        return;
      }
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseTime = viewStart + (mouseX / svgWidth) * viewDuration;

      const zoomFactor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const minDuration = 60;
      const maxDuration = 365 * 86400;
      const newDuration = Math.max(minDuration, Math.min(maxDuration, viewDuration * zoomFactor));

      const ratio = mouseX / svgWidth;
      const newStart = mouseTime - ratio * newDuration;

      setViewDuration(newDuration);
      setViewStart(newStart);
    },
    [viewStart, viewDuration, svgWidth],
  );

  // Jump to a specific date
  const handleDateJump = useCallback(
    (dateStr: string) => {
      setDateInput(dateStr);
      if (!dateStr) {
        return;
      }
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        return;
      }
      const timeSec = date.getTime() / 1000;
      setViewStart(timeSec - viewDuration / 2);
    },
    [viewDuration],
  );

  // Click handler — place a 5-minute selection window
  const handleSvgClick = useCallback(
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
      const x = e.clientX - rect.left;
      const time = viewStart + (x / svgWidth) * viewDuration;
      startTransition(() => {
        if (selCenter != undefined && Math.abs(time - selCenter) < SELECTION_SPAN / 2) {
          setSelCenter(undefined);
        } else {
          setSelCenter(time);
        }
      });
    },
    [viewStart, viewDuration, svgWidth, selCenter],
  );

  // Hover handler — hit-test visible bars
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      const wrapper = wrapperRef.current;
      if (!svg || !wrapper) {
        setTooltipState(null);
        return;
      }
      const svgRect = svg.getBoundingClientRect();
      const mx = e.clientX - svgRect.left;
      const my = e.clientY - svgRect.top;

      let found: McapFileIndex | undefined;
      for (const bar of visibleBars) {
        if (mx >= bar.x && mx <= bar.x + bar.width && my >= bar.y && my <= bar.y + BAR_HEIGHT) {
          found = bar.file;
          break;
        }
      }

      if (found) {
        const wrapperRect = wrapper.getBoundingClientRect();
        setTooltipState({
          file: found,
          x: e.clientX - wrapperRect.left + 12,
          y: e.clientY - wrapperRect.top - 10,
        });
      } else {
        setTooltipState(null);
      }
    },
    [visibleBars],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipState(null);
  }, []);

  // Compute selection
  const selectionRange = useMemo(() => {
    if (selCenter == undefined) {
      return undefined;
    }
    return { start: selCenter - SELECTION_SPAN / 2, end: selCenter + SELECTION_SPAN / 2 };
  }, [selCenter]);

  const selectedFiles = useMemo(() => {
    if (!selectionRange || selectedRows.size === 0) {
      return [];
    }
    return files.filter((f) => {
      const folder = f.folder || "(root)";
      return (
        selectedRows.has(folder) &&
        f.startTime < selectionRange.end &&
        f.endTime > selectionRange.start
      );
    });
  }, [files, selectionRange, selectedRows]);

  const totalSize = useMemo(
    () => selectedFiles.reduce((sum, f) => sum + f.size, 0),
    [selectedFiles],
  );

  const selectedPaths = useMemo(() => new Set(selectedFiles.map((f) => f.path)), [selectedFiles]);

  // Download selected files sequentially with progress tracking.
  // Returns the downloaded File[] or undefined if aborted/failed.
  const downloadFiles = useCallback(async (): Promise<File[] | undefined> => {
    if (selectedFiles.length === 0) {
      return undefined;
    }

    const abortController = new AbortController();
    downloadAbortRef.current = abortController;

    const grandTotal = selectedFiles.reduce((sum, f) => sum + f.size, 0);
    let completedBytes = 0;
    const downloadedFiles: File[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        if (abortController.signal.aborted) {
          return undefined;
        }

        const fileInfo = selectedFiles[i]!;
        const url = `${apiBase}/api/mcap/files/${encodeURIComponent(fileInfo.path)}`;

        setDownloadProgress({
          fileIndex: i,
          totalFiles: selectedFiles.length,
          currentFilename: fileInfo.filename,
          currentLoaded: 0,
          currentTotal: fileInfo.size,
          completedBytes,
          grandTotal,
        });

        const response = await fetch(url, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`Failed to download ${fileInfo.filename}: HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error(`No response body for ${fileInfo.filename}`);
        }

        const chunks: Uint8Array[] = [];
        let loaded = 0;

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          chunks.push(value);
          loaded += value.byteLength;

          setDownloadProgress({
            fileIndex: i,
            totalFiles: selectedFiles.length,
            currentFilename: fileInfo.filename,
            currentLoaded: loaded,
            currentTotal: fileInfo.size,
            completedBytes,
            grandTotal,
          });
        }

        const blob = new Blob(chunks);
        downloadedFiles.push(new File([blob], fileInfo.filename));
        completedBytes += loaded;

        // Brief pause between files to ease server CPU load
        if (i < selectedFiles.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_DELAY_MS));
        }
      }

      return downloadedFiles;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return undefined;
      }
      setError(err instanceof Error ? err.message : String(err));
      return undefined;
    } finally {
      setDownloadProgress(undefined);
      downloadAbortRef.current = undefined;
    }
  }, [apiBase, selectedFiles]);

  // Download files and open in player
  const onOpen = useCallback(async () => {
    const downloaded = await downloadFiles();
    if (!downloaded || downloaded.length === 0) {
      return;
    }
    const downloadId = `dl-${Date.now()}`;
    storeDownloadedFiles(downloadId, downloaded);
    selectSource("mcap-server", {
      type: "connection",
      params: { downloadId },
    });
    dialogActions.dataSource.close();
  }, [downloadFiles, dialogActions.dataSource, selectSource]);

  // Download files and export as ZIP to disk (client-side)
  const onExport = useCallback(async () => {
    const downloaded = await downloadFiles();
    if (!downloaded || downloaded.length === 0) {
      return;
    }

    // Build a ZIP file in memory using Store mode (no compression — MCAP is already compressed)
    const zipParts: Uint8Array[] = [];
    const centralDir: Uint8Array[] = [];
    let offset = 0;
    const encoder = new TextEncoder();

    for (const file of downloaded) {
      const nameBytes = encoder.encode(file.name);
      const fileData = new Uint8Array(await file.arrayBuffer());

      // CRC-32 computation
      const crc = crc32(fileData);

      // Local file header (30 bytes + name)
      const localHeader = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(localHeader);
      lv.setUint32(0, 0x04034b50, true);   // signature
      lv.setUint16(4, 20, true);             // version needed
      lv.setUint16(6, 0, true);              // flags
      lv.setUint16(8, 0, true);              // compression: Store
      lv.setUint16(10, 0, true);             // mod time
      lv.setUint16(12, 0, true);             // mod date
      lv.setUint32(14, crc, true);           // crc-32
      lv.setUint32(18, fileData.length, true); // compressed size
      lv.setUint32(22, fileData.length, true); // uncompressed size
      lv.setUint16(26, nameBytes.length, true); // filename length
      lv.setUint16(28, 0, true);             // extra field length
      new Uint8Array(localHeader).set(nameBytes, 30);

      const localHeaderBytes = new Uint8Array(localHeader);
      zipParts.push(localHeaderBytes);
      zipParts.push(fileData);

      // Central directory entry (46 bytes + name)
      const cdEntry = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(cdEntry);
      cv.setUint32(0, 0x02014b50, true);    // signature
      cv.setUint16(4, 20, true);              // version made by
      cv.setUint16(6, 20, true);              // version needed
      cv.setUint16(8, 0, true);               // flags
      cv.setUint16(10, 0, true);              // compression: Store
      cv.setUint16(12, 0, true);              // mod time
      cv.setUint16(14, 0, true);              // mod date
      cv.setUint32(16, crc, true);            // crc-32
      cv.setUint32(20, fileData.length, true); // compressed size
      cv.setUint32(24, fileData.length, true); // uncompressed size
      cv.setUint16(28, nameBytes.length, true); // filename length
      cv.setUint16(30, 0, true);              // extra field length
      cv.setUint16(32, 0, true);              // comment length
      cv.setUint16(34, 0, true);              // disk number
      cv.setUint16(36, 0, true);              // internal attrs
      cv.setUint32(38, 0, true);              // external attrs
      cv.setUint32(42, offset, true);         // local header offset
      new Uint8Array(cdEntry).set(nameBytes, 46);

      centralDir.push(new Uint8Array(cdEntry));
      offset += localHeaderBytes.length + fileData.length;
    }

    // Central directory
    const cdOffset = offset;
    let cdSize = 0;
    for (const entry of centralDir) {
      zipParts.push(entry);
      cdSize += entry.length;
    }

    // End of central directory (22 bytes)
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);       // signature
    ev.setUint16(4, 0, true);                 // disk number
    ev.setUint16(6, 0, true);                 // cd start disk
    ev.setUint16(8, downloaded.length, true);  // entries on disk
    ev.setUint16(10, downloaded.length, true); // total entries
    ev.setUint32(12, cdSize, true);            // cd size
    ev.setUint32(16, cdOffset, true);          // cd offset
    ev.setUint16(20, 0, true);                 // comment length
    zipParts.push(new Uint8Array(eocd));

    const zipBlob = new Blob(zipParts, { type: "application/zip" });
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recordings.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [downloadFiles]);

  // Cancel download on unmount
  useEffect(() => {
    return () => { downloadAbortRef.current?.abort(); };
  }, []);

  const isDownloading = downloadProgress != undefined;

  return (
    <View onOpen={!isDownloading && selectedFiles.length > 0 ? onOpen : undefined}>
      <Stack className={classes.container} style={{ position: "relative" }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" style={{ marginBottom: 16 }}>
          <Typography variant="h3" fontWeight={600}>
            Browse recordings
          </Typography>
          {selectedFiles.length > 0 && !isDownloading && (
            <Button
              variant="outlined"
              size="small"
              startIcon={<DownloadIcon />}
              onClick={onExport}
            >
              Export ZIP
            </Button>
          )}
        </Stack>

        {/* Toolbar */}
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          className={classes.toolbar}
        >
          <Stack direction="row" alignItems="center" gap={2}>
            <ToggleButtonGroup
              value={activePreset ?? false}
              exclusive
              onChange={(_e, val: ViewMode | null) => {
                if (val) {
                  const center = viewStart + viewDuration / 2;
                  const newDur = VIEW_DURATIONS[val];
                  setViewDuration(newDur);
                  setViewStart(center - newDur / 2);
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

            <input
              type="date"
              value={dateInput}
              onChange={(e) => { handleDateJump(e.target.value); }}
              className={classes.dateInput}
            />
          </Stack>
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
        {!loading && files.length > 0 && <div ref={wrapperRef} className={classes.timelineWrapper}>
          {/* Left: folder labels */}
          <div className={classes.labelColumn}>
            <div className={classes.labelHeader}>
              <Typography variant="caption" fontWeight={600}>
                Folder
              </Typography>
            </div>
            {folders.map(([folderName], i) => {
              const isRowSelected = selectedRows.has(folderName);
              return (
                <div
                  key={folderName}
                  className={`${classes.labelRow} ${isRowSelected ? classes.labelRowSelected : ""}`}
                  onClick={() => { handleRowClick(folderName); }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      backgroundColor: isRowSelected ? COLORS[i % COLORS.length] : "transparent",
                      border: `2px solid ${COLORS[i % COLORS.length]!}`,
                      marginRight: 8,
                      flexShrink: 0,
                      display: "inline-block",
                      boxSizing: "border-box",
                    }}
                  />
                  <Typography variant="body2" noWrap title={folderName}>
                    {folderName}
                  </Typography>
                </div>
              );
            })}
          </div>

          {/* Right: SVG timeline */}
          <div className={classes.svgColumn}>
            <svg
              ref={svgRef}
              width={svgWidth}
              height={svgHeight}
              style={{ display: "block", cursor: "pointer", userSelect: "none" }}
              onClick={handleSvgClick}
              onWheel={handleWheel}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
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
              {folders.map(([folderName], i) => {
                const isRowSelected = selectedRows.has(folderName);
                return (
                  <rect
                    key={folderName}
                    x={0}
                    y={HEADER_HEIGHT + i * ROW_HEIGHT}
                    width={svgWidth}
                    height={ROW_HEIGHT}
                    fill={
                      isRowSelected
                        ? theme.palette.action.selected
                        : i % 2 === 0
                          ? "transparent"
                          : theme.palette.action.hover
                    }
                  />
                );
              })}

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
                      {formatTickLabel(t, tickConfig.format)}
                    </text>
                  </g>
                );
              })}

              {/* File bars */}
              {visibleBars.map((bar) => {
                const folderName = folders[bar.folderIdx]![0];
                const isRowActive = selectedRows.has(folderName);
                const isFileSelected = selectedPaths.has(bar.file.path);
                return (
                  <rect
                    key={bar.file.path}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={BAR_HEIGHT}
                    rx={3}
                    ry={3}
                    fill={bar.color}
                    opacity={isFileSelected ? 1 : isRowActive ? 0.7 : 0.3}
                    stroke={isFileSelected ? theme.palette.common.white : "none"}
                    strokeWidth={isFileSelected ? 2 : 0}
                  />
                );
              })}

              {/* Selection overlay */}
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

          {/* Single hover tooltip */}
          {tooltipState && (
            <div
              className={classes.tooltip}
              style={{ left: tooltipState.x, top: tooltipState.y }}
            >
              <strong>{tooltipState.file.filename}</strong>
              <br />
              {new Date(tooltipState.file.startTime * 1000).toLocaleString()} —{" "}
              {new Date(tooltipState.file.endTime * 1000).toLocaleString()}
              <br />
              {formatFileSize(tooltipState.file.size)}
            </div>
          )}

          {/* Download progress overlay */}
          {downloadProgress && (
            <div className={classes.downloadOverlay}>
              <Typography variant="h5" fontWeight={600}>
                Downloading recordings
              </Typography>
              <Typography variant="body2" color="text.secondary">
                File {downloadProgress.fileIndex + 1} of {downloadProgress.totalFiles}
                {" — "}
                {downloadProgress.currentFilename}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={
                  downloadProgress.grandTotal > 0
                    ? ((downloadProgress.completedBytes + downloadProgress.currentLoaded) / downloadProgress.grandTotal) * 100
                    : 0
                }
                sx={{ width: "100%", maxWidth: 400, height: 8, borderRadius: 4 }}
              />
              <Typography variant="body2" color="text.secondary">
                {formatFileSize(downloadProgress.completedBytes + downloadProgress.currentLoaded)}
                {" / "}
                {formatFileSize(downloadProgress.grandTotal)}
              </Typography>
            </div>
          )}
        </div>}

        {/* Selection info */}
        {selectedFiles.length > 0 && !isDownloading && (
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
                Warning: Large selection — loading may be slow
              </Typography>
            )}
          </Stack>
        )}
      </Stack>
    </View>
  );
}
