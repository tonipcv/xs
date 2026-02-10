import { SVGProps } from 'react'

interface YogaIconProps extends SVGProps<SVGSVGElement> {
  className?: string
}

export function YogaIcon({ className = "h-8 w-8", ...props }: YogaIconProps) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path 
        d="M12 3C13.1046 3 14 3.89543 14 5C14 6.10457 13.1046 7 12 7C10.8954 7 10 6.10457 10 5C10 3.89543 10.8954 3 12 3Z" 
        fill="currentColor"
      />
      <path 
        d="M9 17.5C9 15.6761 9.89015 14.0317 11.2541 13.0179C11.7274 12.6441 12 12.0963 12 11.5V9.5C12 8.67157 12.6716 8 13.5 8C14.3284 8 15 8.67157 15 9.5V11.5C15 12.0963 15.2726 12.6441 15.7459 13.0179C17.1098 14.0317 18 15.6761 18 17.5C18 20.5376 15.5376 23 12.5 23C9.46243 23 7 20.5376 7 17.5C7 15.6761 7.89015 14.0317 9.25407 13.0179C9.72741 12.6441 10 12.0963 10 11.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
} 