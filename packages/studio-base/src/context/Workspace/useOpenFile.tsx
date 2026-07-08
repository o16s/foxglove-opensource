// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import path from "path";
import { useCallback, useMemo } from "react";

import {
  IDataSourceFactory,
  usePlayerSelection,
} from "@foxglove/studio-base/context/PlayerSelectionContext";
import showOpenFilePicker from "@foxglove/studio-base/util/showOpenFilePicker";

export function useOpenFile(sources: readonly IDataSourceFactory[]): () => Promise<void> {
  const { selectSource } = usePlayerSelection();

  const allExtensions = useMemo(() => {
    return sources.reduce<string[]>((all, source) => {
      if (!source.supportedFileTypes) {
        return all;
      }

      return [...all, ...source.supportedFileTypes];
    }, []);
  }, [sources]);

  return useCallback(async () => {
    const fileHandles = await showOpenFilePicker({
      multiple: true,
      types: [
        {
          description: allExtensions.join(", "),
          accept: { "application/octet-stream": allExtensions },
        },
      ],
    });
    if (fileHandles.length === 0) {
      return;
    }

    const files = await Promise.all(fileHandles.map((h) => h.getFile()));
    const firstFile = files[0]!;

    // Find the first _file_ source which can load our extension
    const matchingSources = sources.filter((source) => {
      if (!source.supportedFileTypes || source.type !== "file") {
        return false;
      }

      const extension = path.extname(firstFile.name);
      return source.supportedFileTypes.includes(extension);
    });

    if (matchingSources.length > 1) {
      throw new Error(`Multiple source matched ${firstFile.name}. This is not supported.`);
    }

    const foundSource = matchingSources[0];
    if (!foundSource) {
      throw new Error(`Cannot find source to handle ${firstFile.name}`);
    }

    if (files.length === 1) {
      selectSource(foundSource.id, { type: "file", handle: fileHandles[0] });
    } else {
      selectSource(foundSource.id, { type: "file", files });
    }
  }, [allExtensions, selectSource, sources]);
}
