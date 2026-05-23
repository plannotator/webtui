export type HostPlatform = NodeJS.Platform | 'browser' | (string & {})

export function quoteCommandArgument(value: string, platform: HostPlatform): string {
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`
  }

  return `'${value.replace(/'/g, `'\\''`)}'`
}

export function clearEnvVarCommand(name: string, platform: HostPlatform): string {
  return platform === 'win32' ? `set "${name}="` : `unset ${name}`
}
