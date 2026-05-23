import type { InputHTMLAttributes } from 'react'

import { cn } from '../../lib/cn.js'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input data-slot="input" className={cn('ui-input', className)} {...props} />
}
