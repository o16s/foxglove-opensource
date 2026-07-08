// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as Comlink from "comlink";

import { IterableSourceInitializeArgs } from "@foxglove/studio-base/players/IterablePlayer/IIterableSource";
import { WorkerIterableSourceWorker } from "@foxglove/studio-base/players/IterablePlayer/WorkerIterableSourceWorker";

import { McapIterableSource } from "./McapIterableSource";
import { McapMultiSource } from "./McapMultiSource";

export function initialize(args: IterableSourceInitializeArgs): WorkerIterableSourceWorker {
  if (args.files && args.files.length > 1) {
    const source = new McapMultiSource(args.files);
    const wrapped = new WorkerIterableSourceWorker(source);
    return Comlink.proxy(wrapped);
  } else if (args.urls && args.urls.length > 1) {
    const source = new McapMultiSource(args.urls);
    const wrapped = new WorkerIterableSourceWorker(source);
    return Comlink.proxy(wrapped);
  } else if (args.file ?? args.files?.[0]) {
    const file = args.file ?? args.files![0]!;
    const source = new McapIterableSource({ type: "file", file });
    const wrapped = new WorkerIterableSourceWorker(source);
    return Comlink.proxy(wrapped);
  } else if (args.url ?? args.urls?.[0]) {
    const url = args.url ?? args.urls![0]!;
    const source = new McapIterableSource({ type: "url", url });
    const wrapped = new WorkerIterableSourceWorker(source);
    return Comlink.proxy(wrapped);
  }

  throw new Error("file or url required");
}

Comlink.expose(initialize);
