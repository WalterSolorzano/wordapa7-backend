import React from 'react';

/** Logo oficial de identidad WordAPA7: monograma editorial con hoja APA y acento visual de marca */
export const AppBrandLogo: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 20,
  className,
  style,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flexShrink: 0, ...style }}
    className={className}
    aria-label="WordAPA7 Logo"
  >
    <rect width="24" height="24" rx="5.5" fill="var(--color-accent)" />
    <path
      d="M6.5 6C6.5 5.44772 6.94772 5 7.5 5H14.5L18 8.5V18C18 18.5523 17.5523 19 17 19H7.5C6.94772 19 6.5 18.5523 6.5 18V6Z"
      fill="var(--paper-white)"
      fillOpacity="0.96"
    />
    <path
      d="M14 5V9H18"
      stroke="var(--color-accent)"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M9 11.5H12M9 14H15M9 16.5H13.5"
      stroke="var(--color-accent)"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
