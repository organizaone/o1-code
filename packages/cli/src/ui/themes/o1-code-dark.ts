/**
 * @license
 * Copyright 2025 Google LLC
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const o1codeDarkColors: ColorsTheme = {
  type: 'dark',
  Background: '#0a1220',
  Foreground: '#e6ecf5',
  LightBlue: '#8fb2ff',
  AccentBlue: '#6e9bff',
  AccentPurple: '#a48bff',
  AccentCyan: '#3fc7d6',
  AccentGreen: '#3fd07f',
  AccentYellow: '#ffa347',
  AccentRed: '#ff6b6b',
  AccentYellowDim: '#8a5a2b',
  AccentRedDim: '#8a3d45',
  DiffAdded: '#123624',
  DiffRemoved: '#3b1a20',
  Comment: '#8593aa',
  Gray: '#95a5be',
  GradientColors: ['#6e9bff', '#8fb2ff'],
};

export const O1CodeDark: Theme = new Theme(
  'O1-Code Dark',
  'dark',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: o1codeDarkColors.Background,
      color: o1codeDarkColors.Foreground,
    },
    'hljs-keyword': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-literal': {
      color: o1codeDarkColors.AccentPurple,
    },
    'hljs-symbol': {
      color: o1codeDarkColors.AccentCyan,
    },
    'hljs-name': {
      color: o1codeDarkColors.LightBlue,
    },
    'hljs-link': {
      color: o1codeDarkColors.AccentBlue,
    },
    'hljs-function .hljs-keyword': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-subst': {
      color: o1codeDarkColors.Foreground,
    },
    'hljs-string': {
      color: o1codeDarkColors.AccentGreen,
    },
    'hljs-title': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-type': {
      color: o1codeDarkColors.AccentBlue,
    },
    'hljs-attribute': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-bullet': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-addition': {
      color: o1codeDarkColors.AccentGreen,
    },
    'hljs-variable': {
      color: o1codeDarkColors.Foreground,
    },
    'hljs-template-tag': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-template-variable': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-comment': {
      color: o1codeDarkColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: o1codeDarkColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-deletion': {
      color: o1codeDarkColors.AccentRed,
    },
    'hljs-meta': {
      color: o1codeDarkColors.AccentYellow,
    },
    'hljs-doctag': {
      fontWeight: 'bold',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
  },
  o1codeDarkColors,
  {
    text: {
      // The terminal's own foreground: stays readable if background detection
      // fails and this default theme lands on a light terminal.
      primary: '',
      secondary: '#95a5be',
      link: '#6e9bff',
      accent: '#a48bff',
      code: '#3fc7d6',
    },
    background: {
      primary: '#0a1220',
      diff: { added: '#123624', removed: '#3b1a20' },
    },
    border: { default: '#46598a', focused: '#6e9bff' },
    ui: {
      comment: '#8593aa',
      symbol: '#95a5be',
      gradient: o1codeDarkColors.GradientColors,
    },
    status: {
      error: '#ff6b6b',
      success: '#3fd07f',
      warning: '#ffa347',
      errorDim: '#8a3d45',
      warningDim: '#8a5a2b',
    },
  },
  {
    text: { muted: '#8593aa', placeholder: '#7a879e' },
    ui: {
      separator: '#52679c',
      rule: '#46598a',
      brand: '#6e9bff',
      brandSoft: '#8fb2ff',
    },
    activity: {
      info: '#6e9bff',
      read: '#3fc7d6',
      write: '#a48bff',
      execute: '#ffa347',
      success: '#3fd07f',
    },
  },
);
