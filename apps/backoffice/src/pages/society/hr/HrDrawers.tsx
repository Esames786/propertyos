import { ApiError, HR_DOCUMENT_KINDS, LEAVE_TYPES, type AssignmentView, type Candidate, type Employee360, type EmploymentView, type HrDocumentKind, type LeaveRequestView, type LeaveType, type PublicProfile, type ShiftTemplate } from '@repo/contracts';
import { Button, Drawer, InlineAlert, PlainCheckbox, PlainTextArea, PlainTextField, SelectControl, useApiMutation, useApiQuery, useT, useToast } from '@repo/ui';
import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { ProblemAlert } from '../kit';
import { DateInput, fieldErrorKey, ShiftTime, StaffSelect, timeRangeText, useRole, useShiftName, type StaffOption } from './hkit';

/**
 * Drawers shared by Employee 360, the roster, leave and documents: assign a shift (with who is free
 * and why others are not), request leave, add a document (a simulated upload: only the file's name,
 * type and size are kept), change employment status with an effective date, and the resident-facing
 * profile with its consent. Every rule is the server's; these explain it before and after.
 */

const shiftWindow = (t: Pick<ShiftTemplate, 'start' | 'end' | 'crossesMidnight'>, date: string) => {
  const end = t.crossesMidnight ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date;
  return { start: `${date}T${t.start}:00+05:00`, end: `${end}T${t.end}:00+05:00` };
};

export function AssignShiftDrawer({
  open,
  onClose,
  templates,
  employee,
  date: initialDate,
  templateId: initialTemplate,
  coverFor,
  today,
}: {
  open: boolean;
  onClose: () => void;
  templates: ShiftTemplate[];
  /** Assign this person (Employee 360); otherwise choose among the candidates. */
  employee?: { id: string; name: string; department: string };
  date?: string;
  templateId?: string;
  /** Bring in cover for someone absent (On duty now). */
  coverFor?: { assignmentId: string; employeeName: string };
  today: string;
}) {
  const { t } = useT();
  const toast = useToast();
  const shiftName = useShiftName();
  const role = useRole();
  const usable = templates.filter((x) => !employee || x.department === employee.department);
  const [templateId, setTemplateId] = useState(initialTemplate ?? usable[0]?.id ?? '');
  const [date, setDate] = useState(initialDate ?? today);
  const [post, setPost] = useState('');
  const [staff, setStaff] = useState<string | null>(employee?.id ?? null);
  const [error, setError] = useState<unknown>(null);
  const [askLeave, setAskLeave] = useState(false);
  const save = useApiMutation<AssignmentView>();
  const template = templates.find((x) => x.id === templateId);
  const candidates = useApiQuery<Candidate[]>(open && template && !employee ? { method: 'GET', path: '/hr/roster/candidates', query: { templateId, date } } : null, { placeholderData: (prev) => prev });
  const reason = (c: Candidate) => (c.blocked ? t(`hr:assign.blocked.${c.blocked}`) : c.pendingLeave ? t('hr:assign.pendingLeave') : c.restHours !== undefined ? t('hr:assign.rest', { hours: c.restHours }) : t('hr:assign.free'));
  const options: StaffOption[] = (candidates.data ?? []).map((c) => ({ id: c.employeeId, name: c.name, role: c.role, hint: reason(c), disabled: !!c.blocked }));
  const close = () => {
    setError(null);
    setAskLeave(false);
    onClose();
  };
  const submit = async (acknowledgeLeave = false) => {
    setError(null);
    try {
      const a = await save.mutateAsync({ method: 'POST', path: '/hr/roster/assignments', body: { employeeId: staff, templateId, date, ...(post ? { post } : {}), ...(coverFor ? { coverFor: coverFor.assignmentId } : {}), ...(acknowledgeLeave ? { acknowledgeLeave: true } : {}) } });
      toast.success(t(coverFor ? 'hr:assign.coverDone' : 'hr:assign.done', { name: a.employeeName, shift: shiftName(a.shiftKey, template?.department) }));
      close();
    } catch (e) {
      if (e instanceof ApiError && e.problem.code === 'leave_pending') setAskLeave(true);
      else setError(e);
    }
  };
  const w = template ? shiftWindow(template, date) : null;
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={coverFor ? t('hr:assign.coverTitle', { name: coverFor.employeeName }) : employee ? t('hr:assign.titleFor', { name: employee.name }) : t('hr:assign.title')}
      subtitle={t('hr:assign.subtitle')}
      size="md"
      testId="hr-assign-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button variant="primary" isPending={save.isPending} isDisabled={!staff || !templateId} onPress={() => void submit()} data-testid="hr-assign-save">
            {coverFor ? t('hr:assign.coverSave') : t('hr:assign.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <SelectControl
          label={t('hr:assign.shift')}
          value={templateId}
          onChange={(v) => {
            if (!v) return;
            setTemplateId(v);
            if (!employee) setStaff(null);
          }}
          isDisabled={!!coverFor}
          options={usable.map((x) => ({ id: x.id, label: `${shiftName(x.key, x.department)} · ${timeRangeText(x.start, x.end)}${x.crossesMidnight ? ` ${t('hr:shift.nextDay')}` : ''}` }))}
          testId="hr-assign-shift"
        />
        <DateInput id="hr-assign-date" label={t('hr:assign.date')} value={date} onChange={(v) => v && setDate(v)} min={coverFor ? date : today} testId="hr-assign-date" />
        {w && (
          <p className="text-sm text-muted" data-testid="hr-assign-window">
            {t('hr:assign.window')} <ShiftTime start={w.start} end={w.end} className="font-medium text-text" />
          </p>
        )}
        {employee ? (
          <p className="text-sm">
            <span className="text-muted">{t('hr:assign.person')}</span> <bdi className="font-semibold text-text">{employee.name}</bdi>
          </p>
        ) : (
          <StaffSelect label={t('hr:assign.person')} options={options} value={staff} onChange={(id) => setStaff(id)} testId="hr-assign-person" description={t('hr:assign.personHint')} />
        )}
        {template && template.posts.length > 0 && !coverFor && (
          <SelectControl label={t('hr:assign.post')} value={post || '-'} onChange={(v) => setPost(!v || v === '-' ? '' : v)} options={[{ id: '-', label: t('hr:assign.noPost') }, ...template.posts.map((p) => ({ id: p, label: p }))]} testId="hr-assign-post" />
        )}
        {candidates.data && !employee && options.length > 0 && (
          <details className="text-sm">
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">{t('hr:assign.whoAndWhy', { count: options.length })}</summary>
            <ul className="space-y-1" data-testid="hr-assign-candidates">
              {candidates.data.map((c) => (
                <li key={c.employeeId} className="flex flex-wrap justify-between gap-x-3 break-words">
                  <span>
                    <bdi className="font-medium">{c.name}</bdi> <span className="text-muted">· {role(c.role)}</span>
                  </span>
                  <span className={c.blocked ? 'text-muted' : 'text-success'}>{reason(c)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {askLeave && (
          <InlineAlert tone="warning" role="alert" title={t('hr:assign.leaveTitle')} data-testid="hr-assign-leave-warning">
            <p>{t('hr:assign.leaveBody')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" isPending={save.isPending} onPress={() => void submit(true)} data-testid="hr-assign-anyway">
                {t('hr:assign.anyway')}
              </Button>
              <Button size="sm" variant="quiet" onPress={() => setAskLeave(false)}>
                {t('hr:assign.chooseOther')}
              </Button>
            </div>
          </InlineAlert>
        )}
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

export function LeaveDrawer({ open, onClose, employee, staff, today }: { open: boolean; onClose: () => void; employee?: { id: string; name: string }; staff?: StaffOption[]; today: string }) {
  const { t } = useT();
  const toast = useToast();
  const [who, setWho] = useState<string | null>(employee?.id ?? null);
  const [type, setType] = useState<LeaveType>('annual');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<LeaveRequestView>();
  const close = () => {
    setError(null);
    setReason('');
    onClose();
  };
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={employee ? t('hr:leave.newFor', { name: employee.name }) : t('hr:leave.new')}
      subtitle={t('hr:leave.newSubtitle')}
      testId="hr-leave-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={save.isPending}
            isDisabled={!who}
            onPress={async () => {
              setError(null);
              try {
                const l = await save.mutateAsync({ method: 'POST', path: '/hr/leave', body: { employeeId: who, type, from, to, reason } });
                toast.success(t('hr:leave.requested', { ref: l.ref }));
                if (l.conflicts.length) toast.info(t('hr:leave.conflictsToast', { count: l.conflicts.length }));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="hr-leave-save"
          >
            {t('hr:leave.submit')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {!employee && staff && <StaffSelect label={t('hr:leave.employee')} options={staff} value={who} onChange={setWho} testId="hr-leave-employee" />}
        <SelectControl label={t('hr:leave.type')} value={type} onChange={(v) => v && setType(v as LeaveType)} options={LEAVE_TYPES.map((x) => ({ id: x, label: t(`hr:leave.types.${x}`) }))} testId="hr-leave-type" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateInput id="hr-leave-from" label={t('hr:leave.from')} value={from} onChange={(v) => setFrom(v)} testId="hr-leave-from" />
          <DateInput id="hr-leave-to" label={t('hr:leave.to')} value={to} onChange={(v) => setTo(v)} min={from} testId="hr-leave-to" />
        </div>
        <PlainTextArea label={t('hr:leave.reason')} value={reason} onChange={setReason} rows={3} testId="hr-leave-reason" {...(fieldErrorKey(error, 'reason') ? { errorKey: fieldErrorKey(error, 'reason')! } : {})} />
        <InlineAlert tone="info" data-testid="hr-leave-policy">
          {t('hr:leave.policyNote')}
        </InlineAlert>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

const FILE_ACCEPT = 'application/pdf,image/jpeg,image/png';

export function DocumentDrawer({ open, onClose, employee, staff, kind: initialKind }: { open: boolean; onClose: () => void; employee?: { id: string; name: string }; staff?: StaffOption[]; kind?: HrDocumentKind }) {
  const { t } = useT();
  const toast = useToast();
  const [who, setWho] = useState<string | null>(employee?.id ?? null);
  const [kind, setKind] = useState<HrDocumentKind>(initialKind ?? 'police_verification');
  const [file, setFile] = useState<{ name: string; type: string; sizeBytes: number } | null>(null);
  const [number, setNumber] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [expiresOn, setExpiresOn] = useState('');
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<Employee360>();
  const close = () => {
    setError(null);
    setFile(null);
    setNumber('');
    onClose();
  };
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={employee ? t('hr:documents.addFor', { name: employee.name }) : t('hr:documents.add')}
      subtitle={t('hr:documents.simulated')}
      testId="hr-document-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            icon={FileUp}
            isPending={save.isPending}
            isDisabled={!who || !file}
            onPress={async () => {
              setError(null);
              try {
                await save.mutateAsync({ method: 'POST', path: '/hr/documents', body: { employeeId: who, kind, file, ...(number ? { number } : {}), ...(issuedOn ? { issuedOn } : {}), ...(expiresOn ? { expiresOn } : {}) } });
                toast.success(t('hr:documents.saved', { kind: t(`hr:documents.kind.${kind}`) }));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="hr-document-save"
          >
            {t('hr:documents.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {!employee && staff && <StaffSelect label={t('hr:documents.employee')} options={staff} value={who} onChange={setWho} testId="hr-document-employee" />}
        <SelectControl label={t('hr:documents.kindLabel')} value={kind} onChange={(v) => v && setKind(v as HrDocumentKind)} options={HR_DOCUMENT_KINDS.map((k) => ({ id: k, label: t(`hr:documents.kind.${k}`) }))} testId="hr-document-kind" />
        <div className="space-y-1">
          <label htmlFor="hr-document-file" className="block text-sm font-medium text-text">
            {t('hr:documents.file')}
          </label>
          <input
            id="hr-document-file"
            type="file"
            accept={FILE_ACCEPT}
            onChange={(e) => {
              const f = e.currentTarget.files?.[0];
              setFile(f ? { name: f.name, type: f.type, sizeBytes: f.size } : null);
            }}
            className="block w-full text-sm text-text file:me-3 file:min-h-10 file:rounded-control file:border file:border-border-control file:bg-panel file:px-3 file:text-sm file:font-medium"
            data-testid="hr-document-file"
          />
          <p className="text-xs text-muted">{t('hr:documents.fileHint')}</p>
        </div>
        {(kind === 'cnic' || kind === 'police_verification') && (
          <PlainTextField label={kind === 'cnic' ? t('hr:fields.cnic') : t('hr:documents.reference')} value={number} onChange={setNumber} dir="ltr" testId="hr-document-number" {...(fieldErrorKey(error, 'number') ? { errorKey: fieldErrorKey(error, 'number')! } : {})} />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateInput id="hr-document-issued" label={t('hr:documents.issuedOn')} value={issuedOn} onChange={setIssuedOn} testId="hr-document-issued" />
          <DateInput id="hr-document-expires" label={t('hr:documents.expiresOn')} value={expiresOn} onChange={setExpiresOn} testId="hr-document-expires" />
        </div>
        <InlineAlert tone="info">{t('hr:documents.privacy')}</InlineAlert>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

/** Effective-dated employment status: suspend from today, end on a date, reinstate, or rehire. */
export function StatusDrawer({ open, onClose, employee, today }: { open: boolean; onClose: () => void; employee: { id: string; name: string; status: EmploymentView; endDate?: string }; today: string }) {
  const { t } = useT();
  const toast = useToast();
  const choices = employee.status === 'ended' ? (['active'] as const) : employee.status === 'suspended' ? (['active', 'ended'] as const) : (['suspended', 'ended'] as const);
  const [to, setTo] = useState<string>(choices[0]);
  const [on, setOn] = useState(today);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<Employee360>();
  const close = () => {
    setError(null);
    setReason('');
    onClose();
  };
  const label = (s: string) => (s === 'active' ? t(employee.status === 'ended' ? 'hr:status.rehire' : 'hr:status.reinstate') : t(`hr:status.${s as 'suspended' | 'ended'}`));
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      title={t('hr:status.title', { name: employee.name })}
      subtitle={t('hr:status.subtitle')}
      testId="hr-status-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={close}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant={to === 'ended' ? 'danger' : 'primary'}
            isPending={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                await save.mutateAsync({ method: 'POST', path: `/hr/employees/${employee.id}/status`, body: { status: to, on: to === 'suspended' ? today : on, reason } });
                toast.success(t('hr:status.saved'));
                close();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="hr-status-save"
          >
            {label(to)}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <SelectControl label={t('hr:status.change')} value={to} onChange={(v) => v && setTo(v)} options={choices.map((c) => ({ id: c, label: label(c) }))} testId="hr-status-choice" />
        {to !== 'suspended' && <DateInput id="hr-status-on" label={to === 'ended' ? t('hr:status.lastDay') : t('hr:status.from')} value={on} onChange={setOn} testId="hr-status-on" />}
        <p className="text-sm text-muted">{t(`hr:status.effect.${to === 'active' ? (employee.status === 'ended' ? 'rehire' : 'reinstate') : to}` as 'hr:status.effect.ended')}</p>
        <PlainTextArea label={t('hr:status.reason')} value={reason} onChange={setReason} rows={2} testId="hr-status-reason" {...(fieldErrorKey(error, 'reason') ? { errorKey: fieldErrorKey(error, 'reason')! } : {})} />
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}

/** What residents may see: the role always; the name (and initials) only with recorded consent. */
export function ProfileDrawer({ open, onClose, employee, profile, roleLabel }: { open: boolean; onClose: () => void; employee: { id: string; name: string }; profile: PublicProfile; roleLabel: string }) {
  const { t } = useT();
  const toast = useToast();
  const [consent, setConsent] = useState(profile.consent);
  const [showName, setShowName] = useState(profile.showName);
  const [showPhoto, setShowPhoto] = useState(profile.showPhoto);
  const [error, setError] = useState<unknown>(null);
  const save = useApiMutation<Employee360>();
  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => !o && onClose()}
      title={t('hr:profile.title', { name: employee.name })}
      subtitle={t('hr:profile.subtitle')}
      testId="hr-profile-drawer"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="quiet" onPress={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            variant="primary"
            isPending={save.isPending}
            onPress={async () => {
              setError(null);
              try {
                await save.mutateAsync({ method: 'POST', path: `/hr/employees/${employee.id}/profile`, body: { consent, showName: consent && showName, showPhoto: consent && showPhoto } });
                toast.success(t('hr:profile.saved'));
                onClose();
              } catch (e) {
                setError(e);
              }
            }}
            data-testid="hr-profile-save"
          >
            {t('hr:profile.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-text">{t('hr:profile.always', { role: roleLabel })}</p>
        <PlainCheckbox isSelected={consent} onChange={setConsent} testId="hr-profile-consent">
          {t('hr:profile.consent', { name: employee.name })}
        </PlainCheckbox>
        <div className="space-y-3 ps-7">
          <PlainCheckbox isSelected={consent && showName} isDisabled={!consent} onChange={setShowName} testId="hr-profile-name">
            {t('hr:profile.showName')}
          </PlainCheckbox>
          <PlainCheckbox isSelected={consent && showPhoto} isDisabled={!consent} onChange={setShowPhoto} testId="hr-profile-photo">
            {t('hr:profile.showInitials')}
          </PlainCheckbox>
        </div>
        <InlineAlert tone="info" title={t('hr:profile.neverTitle')}>
          {t('hr:profile.never')}
        </InlineAlert>
        <p className="rounded-tile border border-border bg-sunken/40 p-3 text-sm" data-testid="hr-profile-preview">
          <span className="block text-xs font-semibold tracking-wide text-muted uppercase">{t('hr:profile.preview')}</span>
          {consent && showName ? `${employee.name} · ${roleLabel}` : roleLabel}
        </p>
        {error ? <ProblemAlert error={error} /> : null}
      </div>
    </Drawer>
  );
}
