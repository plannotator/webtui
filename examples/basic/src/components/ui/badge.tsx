import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/cn.js'

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'muted' | 'outline'
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return <span data-slot="badge" data-variant={variant} className={cn('ui-badge', className)} {...props} />
}
