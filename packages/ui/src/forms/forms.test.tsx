import { isValidPkPhone, useLocale } from '@repo/i18n';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { renderWithProviders } from '../test/render';
import { Form, zodResolver } from './Form';
import { CnicField, PhoneField, TextField } from './TextFields';
import { CheckboxField, SelectControl } from './ChoiceFields';
import { DateField } from './DateField';

const schema = z.object({
  fullName: z.string().trim().min(1, 'forms:errors.required'),
  phone: z.string().trim().min(1, 'forms:errors.required').refine((v) => isValidPkPhone(v), 'forms:errors.phoneInvalid'),
  cnic: z.string(),
});

function DemoForm() {
  const methods = useForm({ resolver: zodResolver(schema), defaultValues: { fullName: '', phone: '', cnic: '' } });
  const { setLocale } = useLocale();
  return (
    <>
      <button type="button" onClick={() => setLocale('ur-PK')}>
        urdu
      </button>
      <Form methods={methods} onSubmit={() => undefined}>
        <TextField name="fullName" label="Full name" />
        <PhoneField name="phone" label="Mobile number" />
        <CnicField name="cnic" label="CNIC" optional />
        <button type="submit">submit</button>
      </Form>
    </>
  );
}

describe('Form + fields', () => {
  it('shows a focused validation summary with links, and errors bound to inputs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemoForm />);
    await user.click(screen.getByRole('button', { name: 'submit' }));

    const summary = await screen.findByTestId('validation-summary', {}, { timeout: 5000 });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(within(summary).getByRole('heading')).toHaveTextContent('Fix 2 problems to continue');
    expect(within(summary).getAllByRole('link')).toHaveLength(2);

    const name = screen.getByRole('textbox', { name: /full name/i });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/this field is required/i);
  });

  it('keeps typed values and re-translates errors when the language changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemoForm />);
    await user.type(screen.getByRole('textbox', { name: /full name/i }), 'Ayesha Malik');
    await user.type(screen.getByRole('textbox', { name: /mobile/i }), '12345');
    await user.click(screen.getByRole('button', { name: 'submit' }));
    expect(await screen.findAllByText(/Enter a Pakistani phone number/)).toHaveLength(2); // summary + field

    await act(async () => screen.getByRole('button', { name: 'urdu' }).click());

    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    expect(document.documentElement).toHaveAttribute('lang', 'ur-PK');
    expect(screen.getAllByText(/پاکستانی فون نمبر درج کریں/).length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Ayesha Malik')).toBeInTheDocument();
    expect(screen.getByDisplayValue('12345')).toBeInTheDocument();
  });

  it('masks CNIC as the user types and keeps data inputs left-to-right', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DemoForm />);
    const cnic = screen.getByRole('textbox', { name: /cnic/i });
    await user.type(cnic, '3520212345671');
    expect(cnic).toHaveValue('35202-1234567-1');
    expect(cnic).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('textbox', { name: /mobile/i })).toHaveAttribute('dir', 'ltr');
  });

  it('marks optional fields in the visible label', () => {
    renderWithProviders(<DemoForm />);
    expect(screen.getByText('(optional)')).toBeInTheDocument();
  });
});

// UX batch B2: errors and descriptions tied to their controls; calendar buttons named for what they do.
describe('B2 shared field fixes', () => {
  it('SH-04: SelectControl with an error key shows the message under the field, marks it invalid and describes the trigger', () => {
    renderWithProviders(<SelectControl label="Flat" value={null} onChange={() => undefined} options={[{ id: 'a', label: 'A-101' }]} errorKey="forms:errors.selectOne" testId="flat" />);
    expect(screen.getByText('Choose an option.')).toBeInTheDocument();
    expect(screen.getByTestId('flat')).toHaveAttribute('data-invalid', 'true');
    const trigger = screen.getByRole('button', { name: /flat/i });
    expect(trigger).toHaveAccessibleDescription(/Choose an option\./);
  });

  it('SH-04: without an error key the field is not invalid and shows no message; an explicit isInvalid still wins', () => {
    const { unmount } = renderWithProviders(<SelectControl label="Flat" value={null} onChange={() => undefined} options={[{ id: 'a', label: 'A-101' }]} testId="flat" />);
    expect(screen.getByTestId('flat')).not.toHaveAttribute('data-invalid');
    expect(screen.queryByText('Choose an option.')).toBeNull();
    unmount();
    renderWithProviders(<SelectControl label="Flat" value={null} onChange={() => undefined} options={[{ id: 'a', label: 'A-101' }]} isInvalid={false} errorKey="forms:errors.selectOne" testId="flat" />);
    expect(screen.getByTestId('flat')).not.toHaveAttribute('data-invalid');
  });

  function ConsentForm() {
    const methods = useForm({ resolver: zodResolver(z.object({ consent: z.boolean().refine((v) => v, 'forms:errors.required') })), defaultValues: { consent: false } });
    return (
      <Form methods={methods} onSubmit={() => undefined}>
        <CheckboxField name="consent" label="I agree to be contacted" description="We call only about this enquiry." />
        <button type="submit">submit</button>
      </Form>
    );
  }

  it('SH-12: CheckboxField ties its description and its error to the checkbox and marks it invalid', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ConsentForm />);
    const box = screen.getByRole('checkbox', { name: 'I agree to be contacted' });
    expect(box).toHaveAccessibleDescription('We call only about this enquiry.');
    expect(box).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: 'submit' }));
    await waitFor(() => expect(box).toHaveAttribute('aria-invalid', 'true'));
    expect(box).toHaveAccessibleDescription(/We call only about this enquiry\..*This field is required\./);
    await user.click(box);
    expect(box).toBeChecked();
  });

  function VisitForm() {
    const methods = useForm({ defaultValues: { on: '2026-11-05' } });
    const { setLocale } = useLocale();
    const [, force] = useState(0);
    return (
      <>
        <button type="button" onClick={() => (setLocale('ur-PK'), force((n) => n + 1))}>
          urdu
        </button>
        <Form methods={methods} onSubmit={() => undefined}>
          <DateField name="on" label="Visit date" />
        </Form>
      </>
    );
  }

  it('SH-11: the calendar month buttons are named "Previous month" and "Next month", and in Urdu', async () => {
    const user = userEvent.setup();
    renderWithProviders(<VisitForm />);
    const group = screen.getByRole('group', { name: /visit date/i });
    await user.click(within(group).getAllByRole('button').at(-1)!);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Previous month' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Next month' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Back' })).toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => screen.getByRole('button', { name: 'urdu' }).click());
    await user.click(within(screen.getByRole('group')).getAllByRole('button').at(-1)!);
    const ur = await screen.findByRole('dialog');
    expect(within(ur).getByRole('button', { name: 'پچھلا مہینہ' })).toBeInTheDocument();
    expect(within(ur).getByRole('button', { name: 'اگلا مہینہ' })).toBeInTheDocument();
  });
});
