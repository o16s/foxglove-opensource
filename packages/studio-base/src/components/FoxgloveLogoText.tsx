// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { SvgIcon, SvgIconProps } from "@mui/material";

export default function FoxgloveLogoText(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon viewBox="0 0 240 56" {...props}>
      <title>octaview</title>
      <g transform="translate(0,4)">
        {/* Icon */}
        <rect width="48" height="48" rx="10.5" fill="#0E0E16" />
        <polyline
          points="10,29 12.5,26.5 15,29 17.5,26 20,29"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="20,29 25.5,15.5 31,29"
          fill="none"
          stroke="#FF5C00"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="31,29 34,29 38,29"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      {/* Wordmark — always lowercase per design system */}
      <text
        x="56"
        y="38"
        fontFamily="'Poppins', system-ui, -apple-system, sans-serif"
        fontSize="28"
        fontWeight="700"
        letterSpacing="-0.28"
        fill="currentColor"
      >
        octaview
      </text>
    </SvgIcon>
  );
}
