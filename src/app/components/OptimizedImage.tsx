import Image from 'next/image'

interface OptimizedImageProps {
  src: string
  alt: string
  className?: string
  width?: number
  height?: number
  fill?: boolean
  priority?: boolean
}

export function OptimizedImage({ src, alt, ...props }: OptimizedImageProps) {

  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      quality={85}
      loading={props.priority ? 'eager' : 'lazy'}
      blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Adicione um placeholder blur
      placeholder="blur"
    />
  )
} 