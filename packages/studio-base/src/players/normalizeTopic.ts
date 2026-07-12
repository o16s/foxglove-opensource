// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/**
 * Ensure a topic name starts with a leading slash.
 * This normalizes topics from all data sources (MCAP, WebSocket, ROS)
 * so that message paths work consistently regardless of source.
 */
export function normalizeTopic(topic: string): string {
  return topic.startsWith("/") ? topic : `/${topic}`;
}
