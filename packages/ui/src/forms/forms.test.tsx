import { isValidPkPhone, useLocale } from '@repo/i18n';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { renderWithProviders } from '../test/render';
import { Form, zodResolver } from './Form';
import { CnicField, PhoneField, TextField } from './TextFields';

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
