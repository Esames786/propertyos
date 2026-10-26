import { describe, expect, it } from 'vitest';
import { ApiProblemSchema, fromLaravelValidation } from './api';

describe('fromLaravelValidation', () => {
  it('maps a Laravel 422 body to the error contract', () => {
    const problem = fromLaravelValidation(
      { message: 'The given data was invalid.', errors: { phone: ['forms:errors.phoneInvalid'], cnic: ['The cnic format is invalid.'] } },
      'req-123',
    );
    expect(ApiProblemSchema.parse(problem)).toEqual(problem);
    expect(problem.errors?.phone?.[0]?.code).toBe('forms:errors.phoneInvalid');
    expect(problem.errors?.cnic?.[0]).toEqual({
      code: 'errors:server.fieldInvalid',
      params: { detail: 'The cnic format is invalid.' },
    });
    expect(problem.changed).toBe(false);
    expect(problem.correlationId).toBe('req-123');
  });
});
