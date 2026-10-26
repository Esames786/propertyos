import { formatNumber, useLocale } from '@repo/i18n';
import { FileText, Paperclip, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button as AriaButton, DropZone, FileTrigger, Text } from 'react-aria-components';
import { useController } from 'react-hook-form';
import { useAnnounce } from '../a11y/LiveAnnouncer';
import { useT } from '../lib/useT';
import { buttonClass } from '../primitives/Button';
import { FieldLabel, StandaloneError } from './FieldParts';
import { useFieldMeta } from './Form';
import { descriptionClass, fieldWrap } from './fieldStyles';

const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_BYTES = 5 * 1024 * 1024;

function Preview({ file }: { file: File }) {
  const { t } = useT();
  const url = useMemo(() => (file.type.startsWith('image/') ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url ? (
    <img src={url} alt={t('forms:upload.preview', { name: file.name })} className="size-12 rounded-sm object-cover" />
  ) : (
    <FileText aria-hidden className="size-8 text-muted" />
  );
}

/**
 * File upload with a real button (native picker; camera on phones). Drag-and-drop is an optional
 * extra, never the only way (04: no drag-only input). Files stay in memory in this prototype.
 */
export function FileUploadField({
  name,
  label,
  description,
  optional,
  allowsMultiple = false,
}: {
  name: string;
  label: string;
  description?: string;
  optional?: boolean;
  allowsMultiple?: boolean;
}) {
  const { t } = useT();
  const { locale } = useLocale();
  const announce = useAnnounce();
  const { id } = useFieldMeta(name, label);
  const { field, fieldState } = useController({ name });
  const files: File[] = field.value ?? [];
  const [rejection, setRejection] = useState<{ key: string; params: Record<string, string> } | null>(null);
  const descId = `${id}-desc`;
  const errId = `${id}-error`;

  const add = (list: File[]) => {
    setRejection(null);
    const accepted: File[] = [];
    for (const file of list) {
      if (!ACCEPTED.includes(file.type)) setRejection({ key: 'forms:errors.fileType', params: { name: file.name } });
      else if (file.size > MAX_BYTES) setRejection({ key: 'forms:errors.fileSize', params: { name: file.name, max: '5 MB' } });
      else accepted.push(file);
    }
    if (accepted.length) {
      field.onChange(allowsMultiple ? [...files, ...accepted] : accepted.slice(0, 1));
      announce(t('forms:upload.fileAdded', { name: accepted.map((f) => f.name).join(', ') }));
    }
  };

  const errorKey = rejection?.key ?? fieldState.error?.message;

  return (
    <div className={fieldWrap} id={id} role="group" aria-labelledby={`${id}-label`} aria-describedby={[descId, errorKey ? errId : ''].filter(Boolean).join(' ')}>
      <span id={`${id}-label`}>
        <FieldLabel label={label} optional={optional} />
      </span>
      <DropZone
        onDrop={async (e) => {
          const dropped = await Promise.all(
            e.items.filter((i) => i.kind === 'file').map((i) => (i as unknown as { getFile: () => Promise<File> }).getFile()),
          );
          add(dropped);
        }}
        className="flex flex-wrap items-center gap-3 rounded-card border-2 border-dashed border-border-control bg-sunken/50 p-4 data-drop-target:border-primary data-drop-target:bg-primary-soft"
      >
        <FileTrigger
          acceptedFileTypes={ACCEPTED}
          allowsMultiple={allowsMultiple}
          defaultCamera="environment"
          onSelect={(list) => list && add(Array.from(list))}
        >
          <AriaButton className={buttonClass('secondary', 'md')} onBlur={field.onBlur}>
            <Paperclip aria-hidden className="size-4" />
            {files.length && allowsMultiple ? t('forms:upload.chooseAnother') : t('forms:upload.choose')}
          </AriaButton>
        </FileTrigger>
        <Text slot="label" className="text-sm text-muted max-sm:hidden">
          {t('forms:upload.dropHere')}
        </Text>
      </DropZone>
      <p id={descId} className={descriptionClass}>
        {description}
      </p>
      <StandaloneError id={errId} messageKey={errorKey} params={rejection?.params} />
      {files.length === 0 ? (
        <p className="text-sm text-muted">{t('forms:upload.noFiles')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {files.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-3 p-3">
              <Preview file={file} />
              <span className="min-w-0 flex-1 text-sm">
                <bdi className="block truncate font-medium text-text">{file.name}</bdi>
                <span className="text-xs text-muted">{formatNumber(Math.max(1, Math.round(file.size / 1024)), locale)} KB</span>
              </span>
              <AriaButton
                aria-label={t('forms:upload.removeFile', { name: file.name })}
                onPress={() => {
                  field.onChange(files.filter((_, j) => j !== i));
                  announce(t('forms:upload.fileRemoved', { name: file.name }));
                }}
                className="grid size-10 place-items-center rounded-control text-muted data-hovered:bg-sunken data-hovered:text-error"
              >
                <X aria-hidden className="size-4" />
              </AriaButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
