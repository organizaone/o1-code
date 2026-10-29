/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type ColorsTheme, Theme } from './theme.js';

const githubLightColors: ColorsTheme = {
  type: 'light',
  Background: '#f8f8f8',
  Foreground: '#24292E',
  LightBlue: '#006385',
  AccentBlue: '#458',
  AccentPurple: '#900',
  AccentCyan: '#00691a',
  AccentGreen: '#006565',
  AccentYellow: '#990073',
  AccentRed: '#b30d37',
  AccentYellowDim: '#705605',
  AccentRedDim: '#993333',
  DiffAdded: '#C6EAD8',
  DiffRemoved: '#FFCCCC',
  Comment: '#5b5b51',
  Gray: '#5a5a5a',
  GradientColors: ['#458', '#008080'],
};

export const GitHubLight: Theme = new Theme(
  'GitHub Light',
  'light',
  {
    hljs: {
      display: 'block',
      overflowX: 'auto',
      padding: '0.5em',
      color: githubLightColors.Foreground,
      background: githubLightColors.Background,
    },
    'hljs-comment': {
      color: githubLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-quote': {
      color: githubLightColors.Comment,
      fontStyle: 'italic',
    },
    'hljs-keyword': {
      color: githubLightColors.Foreground,
      fontWeight: 'bold',
    },
    'hljs-selector-tag': {
      color: githubLightColors.Foreground,
      fontWeight: 'bold',
    },
    'hljs-subst': {
      color: githubLightColors.Foreground,
      fontWeight: 'normal',
    },
    'hljs-number': {
      color: githubLightColors.AccentGreen,
    },
    'hljs-literal': {
      color: githubLightColors.AccentGreen,
    },
    'hljs-variable': {
      color: githubLightColors.AccentGreen,
    },
    'hljs-template-variable': {
      color: githubLightColors.AccentGreen,
    },
    'hljs-tag .hljs-attr': {
      color: githubLightColors.AccentGreen,
    },
    'hljs-string': {
      color: githubLightColors.AccentRed,
    },
    'hljs-doctag': {
      color: githubLightColors.AccentRed,
    },
    'hljs-title': {
      color: githubLightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-section': {
      color: githubLightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-selector-id': {
      color: githubLightColors.AccentPurple,
      fontWeight: 'bold',
    },
    'hljs-type': {
      color: githubLightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-class .hljs-title': {
      color: githubLightColors.AccentBlue,
      fontWeight: 'bold',
    },
    'hljs-tag': {
      color: githubLightColors.AccentBlue,
      fontWeight: 'normal',
    },
    'hljs-name': {
      color: githubLightColors.AccentBlue,
      fontWeight: 'normal',
    },
    'hljs-attribute': {
      color: githubLightColors.AccentBlue,
      fontWeight: 'normal',
    },
    'hljs-regexp': {
      color: githubLightColors.AccentCyan,
    },
    'hljs-link': {
      color: githubLightColors.AccentCyan,
    },
    'hljs-symbol': {
      color: githubLightColors.AccentYellow,
    },
    'hljs-bullet': {
      color: githubLightColors.AccentYellow,
    },
    'hljs-built_in': {
      color: githubLightColors.LightBlue,
    },
    'hljs-builtin-name': {
      color: githubLightColors.LightBlue,
    },
    'hljs-meta': {
      color: githubLightColors.Gray,
      fontWeight: 'bold',
    },
    'hljs-deletion': {
      background: '#fdd',
    },
    'hljs-addition': {
      background: '#dfd',
    },
    'hljs-emphasis': {
      fontStyle: 'italic',
    },
    'hljs-strong': {
      fontWeight: 'bold',
    },
  },
  githubLightColors,
);
