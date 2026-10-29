/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const ayuLightColors: ColorsTheme = {
  type: 'light',
  Background: '#f8f9fa',
  Foreground: '#51565b',
  LightBlue: '#2d6172',
  AccentBlue: '#225e89',
  AccentPurple: '#694f84',
  AccentCyan: '#286551',
  AccentGreen: '#496200',
  AccentYellow: '#745323',
  AccentRed: '#8f4343',
  AccentYellowDim: '#8B7000',
  AccentRedDim: '#993333',
  DiffAdded: '#C6EAD8',
  DiffRemoved: '#FFCCCC',
  Comment: '#58595c',
  Gray: '#575a5c',
  GradientColors: ['#399ee6', '#86b300'],
};

export const AyuLight: Theme = new Theme(
  'Ayu Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      background: ayuLightColors.Background,
      color: ayuLightColors.Foreground,
    },
    'hljs-comment': {
      color: ayuLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: ayuLightColors.AccentCyan,
      fontStyle: 'italic',
    },
    'hljs-string': {
      color: ayuLightColors.AccentGreen,
    },
    'hljs-constant': {
      color: ayuLightColors.AccentCyan,
    },
    'hljs-number': {
      color: ayuLightColors.AccentPurple,
    },
    'hljs-keyword': {
      color: ayuLightColors.AccentYellow,
    },
    'hljs-selector-tag': {
      color: ayuLightColors.AccentYellow,
    },
    'hljs-attribute': {
      color: ayuLightColors.AccentYellow,
    },
    'hljs-variable': {
      color: ayuLightColors.Foreground,
    },
    'hljs-variable.language': {
      color: ayuLightColors.LightBlue,
      fontStyle: 'italic',
    },
    'hljs-title': {
      color: ayuLightColors.AccentBlue,
    },
    'hljs-section': {
      color: ayuLightColors.AccentGreen,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: ayuLightColors.LightBlue,
    },
    'hljs-class .hljs-title': {
      color: ayuLightColors.AccentBlue,
    },
    'hljs-tag': {
      color: ayuLightColors.LightBlue,
    },
    'hljs-name': {
      color: ayuLightColors.AccentBlue,
    },
    'hljs-builtin-name': {
      color: ayuLightColors.AccentYellow,
    },
    'hljs-meta': {
      color: ayuLightColors.AccentYellow,
    },
    'hljs-symbol': {
      color: ayuLightColors.AccentRed,
    },
    'hljs-bullet': {
      color: ayuLightColors.AccentYellow,
    },
    'hljs-regexp': {
      color: ayuLightColors.AccentCyan,
    },
    'hljs-link': {
      color: ayuLightColors.LightBlue,
    },
    'hljs-deletion': {
      color: ayuLightColors.AccentRed,
    },
    'hljs-addition': {
      color: ayuLightColors.AccentGreen,
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
    'hljs-literal': {
      color: ayuLightColors.AccentCyan,
    },
    'hljs-built_in': {
      color: ayuLightColors.AccentRed,
    },
    'hljs-doctag': {
      color: ayuLightColors.AccentRed,
    },
    'hljs-template-variable': {
      color: ayuLightColors.AccentCyan,
    },
    'hljs-selector-id': {
      color: ayuLightColors.AccentRed,
    },
  },
  ayuLightColors,
);
