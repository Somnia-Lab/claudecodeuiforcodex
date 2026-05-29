import { FileIcon, XIcon } from 'lucide-react';

type FileAttachmentProps = {
  name: string;
  path?: string;
  size?: number;
  mimeType?: string;
  onRemove?: () => void;
  compact?: boolean;
};

const formatFileSize = (size?: number): string | null => {
  if (typeof size !== 'number' || Number.isNaN(size) || size < 0) {
    return null;
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const FileAttachment = ({
  name,
  path,
  size,
  mimeType,
  onRemove,
  compact = false,
}: FileAttachmentProps) => {
  const formattedSize = formatFileSize(size);
  const secondaryText = path || [mimeType, formattedSize].filter(Boolean).join(' · ');

  return (
    <div
      className={`group flex min-w-0 items-start gap-3 rounded-xl border border-border/50 bg-background/80 text-foreground ${
        compact ? 'px-3 py-2' : 'px-3 py-2.5'
      }`}
    >
      <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileIcon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {secondaryText && (
          <div className="truncate text-xs text-muted-foreground">{secondaryText}</div>
        )}
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md p-1 text-muted-foreground opacity-100 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
          aria-label="Remove file"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default FileAttachment;
