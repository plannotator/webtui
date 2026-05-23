export type TerminalDropEvent = {
  event: DragEvent
  text: string
  files: File[]
}

export function installTerminalDropHandler(
  container: HTMLElement,
  onDrop: ((event: TerminalDropEvent) => void) | undefined
): () => void {
  if (!onDrop) {
    return () => undefined
  }
  const onDragOver = (event: DragEvent): void => {
    event.preventDefault()
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }
  const onDropEvent = (event: DragEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    onDrop({
      event,
      text: event.dataTransfer?.getData('text/plain') ?? '',
      files: event.dataTransfer ? Array.from(event.dataTransfer.files) : []
    })
  }
  container.addEventListener('dragover', onDragOver, true)
  container.addEventListener('drop', onDropEvent, true)
  return () => {
    container.removeEventListener('dragover', onDragOver, true)
    container.removeEventListener('drop', onDropEvent, true)
  }
}
