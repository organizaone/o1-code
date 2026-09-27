/**
 * @license
 * Copyright 2025 Google LLC
 * Modified by the o1-code project; see NOTICE.
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const o1codeLightColors: ColorsTheme = {
  type: 'light',
  Background: '#f7f9fc',
  Foreground: '#162033',
  LightBlue: '#2f5fdb',
  AccentBlue: '#2b5bd7',
  AccentPurple: '#6547c9',
  AccentCyan: '#0a6d78',
  AccentGreen: '#157a44',
  AccentYellow: '#9a5200',
  AccentRed: '#c02d2d',
  AccentYellowDim: '#86683a',
  AccentRedDim: '#a04848',
  DiffAdded: '#dcf2e4',
  DiffRemoved: '#f9dddd',
  Comment: '#56637b',
  Gray: '#46546d',
  GradientColors: ['#2b5bd7', '#2f5fdb'],
};

export const O1CodeLight: Theme = new Theme(
  'O1-Code Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: o1codeLightColors.Background,
      color: o1codeLightColors.Foreground,
    },
    'hljs-comment': {
      color: o1codeLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: o1codeLightColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-string': {
      color: o1codeLightColors.AccentGreen,
    },
    'hljs-constant': {
      color: o1codeLightColors.AccentCyan,
    },
    'hljs-number': {
      color: o1codeLightColors.AccentPurple,
    },
    'hljs-keyword': {
      color: o1codeLightColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: o1codeLightColors.AccentYellow,
    },
    'hljs-attribute': {
      color: o1codeLightColors.AccentYellow,
    },
    'hljs-variable': {
      color: o1codeLightColors.Foreground,
    },
    'hljs-variable.language': {
      color: o1codeLightColors.LightBlue,
      fontStyle: 'italic',
    },
    'hljs-title': {
      color: o1codeLightColors.AccentBlue,
    },
    'hljs-section': {
      color: o1codeLightColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: o1codeLightColors.LightBlue,
    },
    'hljs-class .hljs-title': {
      color: o1codeLightColors.AccentBlue,
    },
    'hljs-tag': {
      color: o1codeLightColors.LightBlue,
    },
    'hljs-name': {
      color: o1codeLightColors.AccentBlue,
    },
    'hljs-builtin-name': {
      color: o1codeLightColors.AccentYellow,
    },
    'hljs-meta': {
      color: o1codeLightColors.AccentYellow,
    },
    'hljs-symbol': {
      color: o1codeLightColors.AccentRed,
    },
    'hljs-bullet': {
      color: o1codeLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: o1codeLightColors.AccentCyan,
    },
    'hljs-link': {
      color: o1codeLightColors.LightBlue,
    },
    'hljs-deletion': {
      color: o1codeLightColors.AccentRed,
    },
    'hljs-addition': {
      color: o1codeLightColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: o1codeLightColors.AccentCyan,
    },
    'hljs-built_in': {
      color: o1codeLightColors.AccentRed,
    },
    'hljs-doctag': {
      color: o1codeLightColors.AccentRed,
    },
    'hljs-template-variable': {
      color: o1codeLightColors.AccentCyan,
    },
    'hljs-selector-id': {
      color: o1codeLightColors.AccentRed,
    },
  },
  o1codeLightColors,
  {
    text: {
      primary: '#162033',
      secondary: '#46546d',
      link: '#2b5bd7',
      accent: '#6547c9',
      code: '#0a6d78',
    },
    background: {
      primary: '#f7f9fc',
      diff: { added: '#dcf2e4', removed: '#f9dddd' },
    },
    border: { default: '#cfd7e4', focused: '#2b5bd7' },
    ui: {
      comment: '#56637b',
      symbol: '#46546d',
      gradient: o1codeLightColors.GradientColors,
    },
    status: {
      error: '#c02d2d',
      success: '#157a44',
      warning: '#9a5200',
      errorDim: '#a04848',
      warningDim: '#86683a',
    },
  },
  {
    text: { muted: '#56637b', placeholder: '#65728a' },
    ui: {
      separator: '#b4bfd0',
      rule: '#cfd7e4',
      brand: '#2b5bd7',
      brandSoft: '#2f5fdb',
    },
    activity: {
      info: '#2b5bd7',
      read: '#0a6d78',
      write: '#6547c9',
      execute: '#9a5200',
      success: '#157a44',
    },
  },
);
