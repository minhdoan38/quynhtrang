import React from 'react';
import type { ColorValue, GradientDirection } from './color-types';

export function gradientDirectionToCssAngle(direction: GradientDirection): string {
  switch (direction) {
    case 'right':
      return '90deg';
    case 'bottom-right':
      return '135deg';
    case 'bottom':
      return '180deg';
    case 'bottom-left':
      return '225deg';
    default:
      return '90deg';
  }
}

export function colorValueToCss(value: ColorValue): string {
  if (value.kind === 'solid') {
    return value.color;
  }
  if (value.gradientType === 'linear') {
    const angle = gradientDirectionToCssAngle(value.direction);
    return `linear-gradient(${angle}, ${value.colors[0]}, ${value.colors[1]})`;
  }
  return `radial-gradient(circle at center, ${value.colors[0]}, ${value.colors[1]})`;
}

export function colorValueToTextStyle(value: ColorValue): React.CSSProperties {
  if (value.kind === 'solid') {
    return { color: value.color };
  }
  const gradientCss = colorValueToCss(value);
  return {
    backgroundImage: gradientCss,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    color: 'transparent',
    display: 'inline-block',
  };
}
