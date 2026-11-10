import type { SVGProps } from 'react'
import type { JSX } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function Base(props: P): JSX.Element {
  const { size = 16, children, ...rest } = props
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const IconPlay = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M7 4.5v15l12-7.5-12-7.5z" fill="currentColor" stroke="none" />
  </Base>
)
export const IconPause = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor" stroke="none" />
  </Base>
)
export const IconBack5 = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M11 6 4 9l7 3" />
    <path d="M4 9c1.6 4.6 5 8 10.5 8A7.5 7.5 0 0 0 21 9.5" />
  </Base>
)
export const IconFwd5 = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="m13 6 7 3-7 3" />
    <path d="M20 9c-1.6 4.6-5 8-10.5 8A7.5 7.5 0 0 1 3 9.5" />
  </Base>
)
export const IconLoop = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M17 3h4v4" />
    <path d="M21 7 9 19H3v-4h4" />
  </Base>
)
export const IconRec = (p: P): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="6" fill="currentColor" stroke="none" />
  </Base>
)
export const IconStop = (p: P): JSX.Element => (
  <Base {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </Base>
)
export const IconClose = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Base>
)
export const IconDownload = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M12 3v12m0 0 4-4m-4 4-4-4" />
    <path d="M4 21h16" />
  </Base>
)
export const IconHistory = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v4h4M12 7v5l3 3" />
  </Base>
)
export const IconKeyboard = (p: P): JSX.Element => (
  <Base {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
  </Base>
)
export const IconUpload = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M12 21V9m0 0 4 4m-4-4-4 4" />
    <path d="M20 16.5A4.5 4.5 0 0 0 17.5 8a6 6 0 0 0-11.2 1.9A4 4 0 0 0 7 17.5" />
  </Base>
)
export const IconMic = (p: P): JSX.Element => (
  <Base {...p}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
  </Base>
)
export const IconQueue = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Base>
)
export const IconScissors = (p: P): JSX.Element => (
  <Base {...p}>
    <circle cx="6" cy="6" r="2.5" />
    <circle cx="6" cy="18" r="2.5" />
    <path d="M8.2 7.8 20 19M8.2 16.2 20 5" />
  </Base>
)
export const IconGauge = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M12 20a8 8 0 1 1 8-8" />
    <path d="M12 12l4.5-3.5" />
  </Base>
)
export const IconOffline = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M5 16a4.5 4.5 0 0 1 1-8.9A6 6 0 0 1 17.7 9 3.5 3.5 0 0 1 20 15.6" />
    <path d="m2 2 20 20" />
  </Base>
)
export const IconCheck = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="m4 12.5 5 5L20 6.5" />
  </Base>
)
export const IconAlert = (p: P): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v5M12 16h.01" />
  </Base>
)
export const IconInfo = (p: P): JSX.Element => (
  <Base {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Base>
)
export const IconUndo = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </Base>
)
export const IconRedo = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H10a6 6 0 0 0 0 12h3" />
  </Base>
)
export const IconTrash = (p: P): JSX.Element => (
  <Base {...p}>
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    <path d="M10 11v6M14 11v6" />
  </Base>
)
export const IconX = IconClose
