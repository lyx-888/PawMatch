import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Standard Tailwind class merger. Use everywhere instead of template literals
// so conflicting utilities (e.g. `p-2` + `p-4`) collapse to the later one.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
