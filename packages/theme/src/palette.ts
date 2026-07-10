// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { PaletteOptions } from "@mui/material/styles";
import { CSSProperties } from "react";

declare module "@mui/material/styles" {
  interface Palette {
    name: string;
    appBar: {
      main: CSSProperties["color"];
      primary: CSSProperties["color"];
      text: CSSProperties["color"];
    };
  }
  interface PaletteOptions {
    name: string;
    appBar: {
      main: CSSProperties["color"];
      primary: CSSProperties["color"];
      text: CSSProperties["color"];
    };
  }
  interface TypeBackground {
    menu: CSSProperties["color"];
  }
}

export const dark: PaletteOptions = {
  name: "dark",
  mode: "dark",
  tonalOffset: 0.15,
  appBar: {
    main: "#0E0E16",
    primary: "#FF5C00",
    text: "#ffffff",
  },
  primary: { main: "#FF5C00" },
  secondary: { main: "#B9B9C2" },
  error: { main: "#E5484D" },
  warning: { main: "#F5B82E" },
  success: { main: "#30A46C" },
  info: { main: "#3E63DD" },
  text: {
    primary: "#F7F7F5",
    secondary: "#B9B9C2",
  },
  divider: "#2B2B3A",
  background: {
    default: "#0E0E16",
    paper: "#191926",
    menu: "#232334",
  },
  grey: {
    50: "#0E0E16",
    100: "#141420",
    200: "#191926",
    300: "#1E1E2C",
    400: "#232334",
    500: "#2B2B3A",
    600: "#3C3C4A",
    700: "#6E6E7C",
    800: "#B9B9C2",
    900: "#E3E3E8",
    A100: "#232334",
    A200: "#6E6E7C",
    A400: "#B9B9C2",
    A700: "#E3E3E8",
  },
};

export const light: PaletteOptions = {
  name: "light",
  mode: "light",
  tonalOffset: 0.22,
  appBar: {
    main: "#0E0E16",
    primary: "#FF5C00",
    text: "#ffffff",
  },
  primary: { main: "#FF5C00" },
  secondary: { main: "#6E6E7C" },
  error: { main: "#E5484D" },
  warning: { main: "#F5B82E" },
  success: { main: "#30A46C" },
  info: { main: "#3E63DD" },
  background: {
    default: "#F7F7F5",
    paper: "#ffffff",
    menu: "#ffffff",
  },
  text: {
    primary: "#0E0E16",
    secondary: "#3C3C4A",
  },
  divider: "#E3E3E8",
  grey: {
    50: "#FAFAFA",
    100: "#F7F7F5",
    200: "#E3E3E8",
    300: "#D0D0D6",
    400: "#B9B9C2",
    500: "#9E9EA8",
    600: "#6E6E7C",
    700: "#3C3C4A",
    800: "#2B2B3A",
    900: "#0E0E16",
    A100: "#E3E3E8",
    A200: "#B9B9C2",
    A400: "#6E6E7C",
    A700: "#3C3C4A",
  },
};
