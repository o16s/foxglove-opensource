// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { SvgIcon, SvgIconProps } from "@mui/material";

export function FoxgloveLogo(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon viewBox="0 0 96 96" {...props}>
      <title>octaview</title>
      <rect width="96" height="96" rx="21" fill="#0E0E16" />
      <polyline
        points="20,58 25,53 30,58 35,52 40,58"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="40,58 51,31 62,58"
        fill="none"
        stroke="#FF5C00"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points="62,58 68,58 76,58"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </SvgIcon>
  );
}
