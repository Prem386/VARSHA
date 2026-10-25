import React from 'react'

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number
  strokeWidth?: number
  className?: string
}

export const IconRain: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
    <path d="M16 14v6" />
    <path d="M8 14v6" />
    <path d="M12 16v6" />
  </svg>
)

export const IconAlert: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
)

export const IconRefresh: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 21h5v-5" />
  </svg>
)

export const IconInfo: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4" />
    <path d="M12 8h.01" />
  </svg>
)

export const IconSearch: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
)

export const IconSwap: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="m7 15 5 5 5-5" />
    <path d="m7 9 5-5 5 5" />
  </svg>
)

export const IconPin: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </svg>
)

export const IconTarget: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" />
  </svg>
)

export const IconShield: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
  </svg>
)

export const IconClose: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

export const IconChevron: React.FC<IconProps & { direction?: 'up' | 'down' | 'left' | 'right' }> = ({
  size = 20,
  strokeWidth = 1.5,
  direction = 'down',
  className,
  ...props
}) => {
  const rotation = {
    up: 'rotate-180',
    down: '',
    left: 'rotate-90',
    right: '-rotate-90',
  }[direction]

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${rotation} ${className || ''}`}
      aria-hidden="true"
      {...props}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export const IconCheck: React.FC<IconProps> = ({ size = 20, strokeWidth = 1.5, className, ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true" {...props}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)
