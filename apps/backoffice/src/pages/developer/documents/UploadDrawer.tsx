import { ApiError, DOC_KINDS, type DocKind, type DocumentCreated, type DocumentDetail, type RecordRef } from '@repo/contracts';
import { Button, Drawer, InlineAlert, PlainTextArea, PlainTextField, SelectControl, useAnnounce, useApiQuery, useT, useToast, useKeyedCreate } from '@repo/ui';
import { FilePlus2, FileText, Paperclip, Trash2, Upload } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { FileTrigger, Button as AriaButton } from 'react-aria-components';
import { ProblemAlert } from '../../society/kit';
import { DateInput, useFieldError } from '../../society/hr/hkit';
import { ACCEPT, DemoFileBadge, readDemoFile, RecordPicker, sizeText, type DemoFile } from './dkit';

/**
 * DOC-003 upload drawer: a new document on a record the person may change, or a new version of an
 * open document. Every field is checked here first (inline, on submit) and again by the mock server;
 * a refused upload changes nothing. The file stays in this browser's demo store (labelled demo): no
 * storage service and no network. One create key per form (Issue #21): pressing again after a
 * failure is the same upload, never a second document.
 */
export type UploadMode = { kind: 'new'; forRecordId?: string | null } | { kind: 'version'; doc: Pick<DocumentDetail, 'id' | 'title' | 'kind'> };

type Field = 'recordId' | 'title' | 'kind' | 'file' | 'expiresOn' | 'note';

function sampleFile(): DemoFile {
  const text = 'Fictional demo document for PropertyOS (Demo). Not a real record.\n';
  return { fileName: 'demo-sample.txt', mimeType: 'text/plain', sizeBytes: new TextEncoder().encode(text).length, content: `data:text/plain;base64,${btoa(text)}` };
}

export function UploadDrawer({ isOpen, onOpenChange, mode, onDone }: { isOpen: boolean; onOpenChange: (open: boolean) => void; mode: UploadMode; onDone?: (created: DocumentCreated) => void }) {
  const { t } = useT();
  const toast = useToast();
  const announce = useAnnounce();
  const ids = useId();
  const create = useKeyedCreate<DocumentCreated>(mode.kind === 'new' ? 'doc-upload' : 'doc-version');
  const forId = mode.kind === 'new' ? (mode.forRecordId ?? null) : null;
  const preset = useApiQuery<RecordRef>(forId ? { method: 'GET', path: '/workspace/resolve', query: { id: forId } } : null, { retry: false });
  const [record, setRecord] = useState<RecordRef | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DocKind | null>(null);
  const [file, setFile] = useState<DemoFile | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [expiresOn, setExpiresOn] = useState('');
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const serverError = useFieldError(create.error);

  // The address's record (?for=) is chosen once; the person can still choose another.
  const presetApplied = useRef(false);
  useEffect(() => {
    if (preset.data && !presetApplied.current) {
      presetApplied.current = true;
      setRecord(preset.data);
    }
  }, [preset.data]);

  const docKind: DocKind | null = mode.kind === 'version' ? mode.doc.kind : kind;
  const local: Partial<Record<Field, string>> = {};
  if (mode.kind === 'new') {
    if (!record) local.recordId = t('documents:upload.errors.record');
    if (title.trim().length < 3 || title.trim().length > 120) local.title = t('documents:upload.errors.title');
    if (!kind) local.kind = t('documents:upload.errors.kind');
  }
  if (!file) local.file = fileProblem ?? t('documents:upload.errors.file');
  if (docKind === 'identity' && !expiresOn) local.expiresOn = t('documents:upload.errors.expiry');
  if (mode.kind === 'version' && note.trim().length < 3) local.note = t('documents:upload.errors.note');
  if (note.trim().length > 300) local.note = t('documents:upload.errors.noteLong');
  const error = (f: Field) => (tried ? (local[f] ?? serverError(f)) : serverError(f));
  const notFound = create.error instanceof ApiError && create.error.problem.status === 404;

  const choose = async (files: FileList | null) => {
    const picked = files?.[0];
    if (!picked) return;
    const read = await readDemoFile(picked);
    if ('problem' in read) {
      setFile(null);
      setFileProblem(t(read.problem === 'type' ? 'documents:upload.errors.fileType' : read.problem === 'size' ? 'documents:upload.errors.fileSize' : 'documents:upload.errors.fileRead', { max: '1 MB' }));
      return;
    }
    setFileProblem(null);
    setFile(read);
    announce(t('documents:upload.fileChosen', { name: read.fileName }));
  };

  const submit = async () => {
    setTried(true);
    if (Object.keys(local).length) {
      announce(t('documents:upload.errors.summary'));
      return;
    }
    try {
      const body = mode.kind === 'new' ? { recordId: record!.id, title: title.trim(), kind: kind!, ...file!, expiresOn: expiresOn || null, note: note.trim() } : { ...file!, note: note.trim(), expiresOn: expiresOn || null };
      const created = await create.send({ method: 'POST', path: mode.kind === 'new' ? '/documents' : `/documents/${mode.doc.id}/versions`, body });
      const message = created.replayed ? t('documents:upload.replayed', { ref: created.ref }) : mode.kind === 'new' ? t('documents:upload.done', { ref: created.ref }) : t('documents:upload.versionDone', { ref: created.ref, n: created.version });
      toast.success(message, { reference: created.ref });
      onOpenChange(false);
      onDone?.(created);
    } catch {
      announce(t('documents:upload.errors.refused'));
    }
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={mode.kind === 'new' ? t('documents:upload.title') : t('documents:upload.versionTitle')}
      subtitle={mode.kind === 'version' ? <bdi>{mode.doc.title}</bdi> : t('documents:upload.subtitle')}
      testId="upload-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={() => onOpenChange(false)} data-testid="upload-cancel">
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" icon={Upload} isPending={create.isPending} onPress={() => void submit()} data-testid="upload-submit">
            {mode.kind === 'new' ? t('documents:upload.submit') : t('documents:upload.submitVersion')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <InlineAlert tone="info" data-testid="upload-demo-note">
          <span className="flex flex-wrap items-center gap-2">
            <DemoFileBadge />
            {t('documents:upload.demoNote')}
          </span>
        </InlineAlert>
        {notFound && (
          <InlineAlert tone="error" role="alert" data-testid="upload-not-found">
            {t('documents:upload.errors.unavailable')}
          </InlineAlert>
        )}
        {create.isError && !notFound && !(create.error instanceof ApiError && create.error.problem.status === 422) && <ProblemAlert error={create.error} />}
        {mode.kind === 'new' && (
          <>
            <RecordPicker value={record} onChange={setRecord} errorText={error('recordId')} />
            <PlainTextField label={t('documents:upload.docTitle')} value={title} onChange={setTitle} description={t('documents:upload.docTitleHint')} errorKey={error('title') ? 'documents:upload.errors.title' : undefined} testId="upload-title" />
            <SelectControl
              label={t('documents:upload.kind')}
              value={kind}
              onChange={(v) => setKind((v as DocKind) ?? null)}
              placeholder={t('documents:upload.kindPlaceholder')}
              options={DOC_KINDS.map((k) => ({ id: k, label: t(`documents:kinds.${k}`) }))}
              errorKey={error('kind') ? 'documents:upload.errors.kind' : undefined}
              testId="upload-kind"
            />
          </>
        )}
        <div className="space-y-1.5" role="group" aria-labelledby={`${ids}-file`} aria-describedby={`${ids}-file-hint`}>
          <p id={`${ids}-file`} className="text-sm font-medium text-text">
            {t('documents:upload.file')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <FileTrigger acceptedFileTypes={ACCEPT} onSelect={(files) => void choose(files)}>
              <AriaButton className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border-control bg-panel px-4 text-sm font-medium text-text outline-none data-hovered:bg-raised data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-focus pointer-coarse:min-h-11" data-testid="upload-choose">
                <Paperclip aria-hidden className="size-4" />
                {file ? t('documents:upload.chooseAnother') : t('documents:upload.choose')}
              </AriaButton>
            </FileTrigger>
            <Button
              variant="quiet"
              size="sm"
              icon={FileText}
              onPress={() => {
                setFile(sampleFile());
                setFileProblem(null);
              }}
              data-testid="upload-sample"
            >
              {t('documents:upload.sample')}
            </Button>
          </div>
          <p id={`${ids}-file-hint`} className="text-xs text-muted">
            {t('documents:upload.fileHint', { max: '1 MB' })}
          </p>
          {file && (
            <p className="flex flex-wrap items-center gap-2 rounded-control border border-border p-2 text-sm" data-testid="upload-file">
              <FilePlus2 aria-hidden className="size-4 text-muted" />
              <bdi dir="ltr" className="min-w-0 [overflow-wrap:anywhere]">
                {file.fileName}
              </bdi>
              <span className="text-xs text-muted">{sizeText(file.sizeBytes)}</span>
              <Button variant="quiet" size="sm" icon={Trash2} onPress={() => setFile(null)} data-testid="upload-file-remove">
                {t('documents:upload.removeFile')}
              </Button>
            </p>
          )}
          {error('file') && (
            <p className="text-xs font-medium text-error" role="alert" data-testid="upload-file-error">
              {error('file')}
            </p>
          )}
        </div>
        <DateInput id={`${ids}-expiry`} label={docKind === 'identity' ? t('documents:upload.expiryRequired') : t('documents:upload.expiry')} value={expiresOn} onChange={setExpiresOn} description={t('documents:upload.expiryHint')} testId="upload-expiry" />
        {error('expiresOn') && (
          <p className="-mt-2 text-xs font-medium text-error" role="alert" data-testid="upload-expiry-error">
            {error('expiresOn')}
          </p>
        )}
        <PlainTextArea
          label={mode.kind === 'version' ? t('documents:upload.whatChanged') : t('documents:upload.note')}
          value={note}
          onChange={setNote}
          optional={mode.kind === 'new'}
          description={t('documents:upload.noteHint')}
          errorKey={error('note') ? (note.trim().length > 300 ? 'documents:upload.errors.noteLong' : 'documents:upload.errors.note') : undefined}
          testId="upload-note"
        />
      </div>
    </Drawer>
  );
}
