import { MAX_TEXT_LENGTH, REDACTED, redactText, scrubEvent } from '../scrub';

/**
 * What a crash report may carry off the device (`CLAUDE.md` §30).
 *
 * Two kinds of test here, and they are not equally strong. The structural ones are guarantees: a
 * request body cannot be forwarded because it is never copied. The text ones are best effort, and
 * the tests say so — they pin the mechanical leaks (tokens, addresses, ids, pasted rows) and make
 * no claim about a sentence someone interpolated into an error message.
 */

describe('dropping whole fields', () => {
  // §30 names auth tokens explicitly, and a header is where they live.
  it('never forwards request headers', () => {
    const scrubbed = scrubEvent({
      request: {
        url: 'https://example.supabase.co/rest/v1/symptom_logs',
        headers: { authorization: 'Bearer abc.def.ghi', apikey: 'public-anon-key' },
      },
    });

    expect(scrubbed.request).toEqual({
      url: 'https://example.supabase.co/rest/v1/symptom_logs',
    });
  });

  // The body of a request from this app is a health log, always.
  it('never forwards a request body', () => {
    const scrubbed = scrubEvent({
      request: {
        url: 'https://example.supabase.co/rest/v1/symptom_logs',
        data: { symptom_type: 'bloating', severity: 9, note: 'after the curry' },
      },
    });

    expect(JSON.stringify(scrubbed)).not.toContain('bloating');
    expect(JSON.stringify(scrubbed)).not.toContain('curry');
  });

  it('drops the query string, where an id would end up', () => {
    const scrubbed = scrubEvent({
      request: { url: 'https://example.supabase.co/rest/v1/meal_logs?user_id=eq.abc&select=*' },
    });

    expect(scrubbed.request?.url).toBe('https://example.supabase.co/rest/v1/meal_logs');
  });

  // A bag whose contents nobody reviews is how health data reaches a vendor by accident.
  it('never forwards extra context', () => {
    const scrubbed = scrubEvent({
      message: 'Save failed',
      extra: { draft: { items: ['garlic', 'cream'] }, journal: 'felt awful all evening' },
    });

    expect(scrubbed.extra).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain('garlic');
  });

  it('never forwards breadcrumb data', () => {
    const scrubbed = scrubEvent({
      breadcrumbs: [
        { category: 'db', message: 'insert symptom_logs', data: { severity: 9, note: 'awful' } },
      ],
    });

    expect(scrubbed.breadcrumbs).toEqual([{ category: 'db', message: 'insert symptom_logs' }]);
  });

  // Enough to tie a crash to a support conversation; nothing that identifies a person by itself.
  it('keeps only the user id', () => {
    const scrubbed = scrubEvent({
      user: {
        id: 'user-1',
        email: 'someone@example.com',
        username: 'someone',
        ip_address: '203.0.113.4',
      },
    });

    expect(scrubbed.user).toEqual({ id: 'user-1' });
  });

  it('sends no user at all when there is no id', () => {
    expect(scrubEvent({ user: { email: 'someone@example.com' } }).user).toBeUndefined();
  });
});

describe('building by allowlist', () => {
  // The ordering property that makes this safe over time: a field added to the event type later
  // is dropped by default rather than forwarded by default.
  it('returns nothing at all for an empty event', () => {
    expect(scrubEvent({})).toEqual({});
  });

  it('does not carry across a field it does not know about', () => {
    const scrubbed = scrubEvent({
      message: 'Save failed',
      // A future SDK field, or one added upstream without anyone reading this file.
      ...({ contexts: { device: { name: "Vivaan's iPhone" } } } as object),
    });

    expect(JSON.stringify(scrubbed)).not.toContain('iPhone');
  });
});

describe('redacting text', () => {
  it('removes an auth token', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJldmFsdWU';

    expect(redactText(`Request failed with ${token}`)).toBe(`Request failed with ${REDACTED}`);
  });

  it('removes an authorization header that reached a message', () => {
    expect(redactText('headers: authorization: Bearer sk-abcdef123456789')).toContain(REDACTED);
    expect(redactText('headers: authorization: Bearer sk-abcdef123456789')).not.toContain('sk-abc');
  });

  it('removes an email address', () => {
    expect(redactText('No account for someone@example.com')).toBe(`No account for ${REDACTED}`);
  });

  // Every row id and user id in this app is a UUID.
  it('removes a uuid', () => {
    const text = 'Row 3f2504e0-4f89-11d3-9a0c-0305e82c3301 not found';

    expect(redactText(text)).toBe(`Row ${REDACTED} not found`);
  });

  // A long quoted run is a value; a short one is a column or constraint name worth keeping.
  it('keeps a constraint name but removes a quoted value', () => {
    const kept = redactText('duplicate key violates "meal_logs_pkey"');
    expect(kept).toContain('meal_logs_pkey');

    const removed = redactText(
      `invalid input: "chicken curry with extra garlic and cream, eaten late"`
    );
    expect(removed).not.toContain('garlic');
    expect(removed).toContain(REDACTED);
  });

  it('truncates a message long enough to be a payload', () => {
    const long = 'x'.repeat(MAX_TEXT_LENGTH + 200);
    const result = redactText(long);

    expect(result.length).toBeLessThan(MAX_TEXT_LENGTH + 40);
    expect(result).toContain(REDACTED);
  });

  it('leaves an ordinary error message alone', () => {
    const message = 'Network request failed';

    expect(redactText(message)).toBe(message);
  });
});

describe('what this does not claim', () => {
  // Stated as a test so nobody reads the module and assumes free text is safe. The defence
  // against this is not interpolating user content into error messages in the first place — which
  // is why summariseError and the analytics warning both name keys rather than values.
  it('DOES NOT catch health content written as an ordinary sentence', () => {
    const message = 'Could not save: user reported bloating after dairy';

    expect(redactText(message)).toContain('bloating');
  });
});

describe('a realistic report', () => {
  it('keeps the diagnosis and loses the diary', () => {
    const scrubbed = scrubEvent({
      message: 'Failed to upsert symptom_logs',
      exception: [
        {
          type: 'PostgrestError',
          value:
            'duplicate key value violates unique constraint "symptom_logs_pkey" for row 3f2504e0-4f89-11d3-9a0c-0305e82c3301',
        },
      ],
      breadcrumbs: [{ category: 'sync', message: 'push batch', data: { rows: ['note: awful'] } }],
      tags: { operation: 'sync_push' },
      user: { id: 'user-1', email: 'someone@example.com' },
      request: {
        url: 'https://example.supabase.co/rest/v1/symptom_logs?on_conflict=id',
        headers: { authorization: 'Bearer abc' },
        data: { note: 'felt awful after the curry' },
      },
    });

    // The parts an engineer needs survive.
    expect(scrubbed.message).toBe('Failed to upsert symptom_logs');
    expect(scrubbed.exception?.[0]?.type).toBe('PostgrestError');
    expect(scrubbed.exception?.[0]?.value).toContain('symptom_logs_pkey');
    expect(scrubbed.tags).toEqual({ operation: 'sync_push' });

    // Nothing about the person or what they ate does.
    const serialised = JSON.stringify(scrubbed);
    for (const forbidden of ['someone@example.com', 'Bearer', 'curry', 'awful', '3f2504e0']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
