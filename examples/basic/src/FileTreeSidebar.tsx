import { Check, ChevronDown, ChevronRight, FileText, Folder, FolderOpen, Paperclip } from 'lucide-react'
import type { CSSProperties } from 'react'

import { Badge } from './components/ui/badge.js'
import {
  quoteShellValue,
  WEBTUI_FILE_PATH_MIME,
  type FileTreeNode
} from './file-tree-data.js'

type FileTreeSidebarProps = {
  disabled: boolean
  error: string | null
  loading: boolean
  openFolderPaths: Set<string>
  selectedFileCount: number
  selectedFilePaths: Set<string>
  selectedFilePayload: string
  tree: FileTreeNode | null
  onToggleFile: (path: string) => void
  onToggleFolder: (path: string) => void
}

export function FileTreeSidebar({
  disabled,
  error,
  loading,
  openFolderPaths,
  selectedFileCount,
  selectedFilePaths,
  selectedFilePayload,
  tree,
  onToggleFile,
  onToggleFolder
}: FileTreeSidebarProps) {
  return (
    <aside className="file-sidebar" data-disabled={disabled} aria-disabled={disabled} aria-label="File tree selector">
      <div className="file-sidebar-header">
        <span>Files</span>
        <Badge variant={selectedFileCount > 0 ? 'default' : 'muted'} className="file-count-badge">
          <Paperclip />
          {selectedFileCount}
        </Badge>
      </div>

      <div className="file-tree" role="tree" aria-label="Files">
        {tree ? (
          <FileTreeRow
            node={tree}
            depth={0}
            openFolderPaths={openFolderPaths}
            selectedFilePaths={selectedFilePaths}
            selectedFilePayload={selectedFilePayload}
            disabled={disabled}
            onToggleFolder={onToggleFolder}
            onToggleFile={onToggleFile}
          />
        ) : (
          <div className="file-tree-empty">{error ?? (loading ? 'Loading files' : 'No files')}</div>
        )}
      </div>
    </aside>
  )
}

function FileTreeRow({
  node,
  depth,
  openFolderPaths,
  selectedFilePaths,
  selectedFilePayload,
  disabled,
  onToggleFolder,
  onToggleFile
}: {
  node: FileTreeNode
  depth: number
  openFolderPaths: Set<string>
  selectedFilePaths: Set<string>
  selectedFilePayload: string
  disabled: boolean
  onToggleFolder: (path: string) => void
  onToggleFile: (path: string) => void
}) {
  const isDirectory = node.kind === 'directory'
  const isOpen = openFolderPaths.has(node.path)
  const isSelected = selectedFilePaths.has(node.path)
  const rowStyle = { paddingLeft: 8 + depth * 14 } satisfies CSSProperties

  if (isDirectory) {
    const FolderIcon = isOpen ? FolderOpen : Folder
    return (
      <div role="none">
        <button
          className="file-tree-row"
          data-kind="directory"
          type="button"
          role="treeitem"
          aria-expanded={isOpen}
          disabled={disabled}
          style={rowStyle}
          onClick={() => onToggleFolder(node.path)}
        >
          {isOpen ? <ChevronDown /> : <ChevronRight />}
          <FolderIcon />
          <span className="file-tree-name">{node.name}</span>
        </button>
        {isOpen ? (
          <div role="group">
            {node.children.map((child) => (
              <FileTreeRow
                key={child.path}
                node={child}
                depth={depth + 1}
                openFolderPaths={openFolderPaths}
                selectedFilePaths={selectedFilePaths}
                selectedFilePayload={selectedFilePayload}
                disabled={disabled}
                onToggleFolder={onToggleFolder}
                onToggleFile={onToggleFile}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <button
      className="file-tree-row"
      data-kind="file"
      data-selected={isSelected}
      type="button"
      role="treeitem"
      aria-selected={isSelected}
      disabled={disabled}
      draggable={!disabled}
      style={rowStyle}
      onClick={() => onToggleFile(node.path)}
      onDragStart={(event) => {
        if (disabled) {
          event.preventDefault()
          return
        }
        const payload = isSelected && selectedFilePayload ? selectedFilePayload : quoteShellValue(node.path)
        event.dataTransfer.effectAllowed = 'copy'
        event.dataTransfer.setData(WEBTUI_FILE_PATH_MIME, node.path)
        event.dataTransfer.setData('text/plain', payload)
      }}
    >
      <span className="file-tree-indent" />
      <FileText />
      <span className="file-tree-name">{node.name}</span>
      {isSelected ? <Check className="file-tree-check" /> : null}
    </button>
  )
}
