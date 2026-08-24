import { resolveIncoming } from '../merge';

const remote = { id: 'a', updatedAt: '2026-08-24T12:00:00Z' };

describe('resolveIncoming', () => {
  it('applies a remote row the device has never seen', () => {
    expect(resolveIncoming({ remote, local: null, hasPendingLocalChange: false })).toBe(
      'apply_remote'
    );
  });

  it('applies a remote row that is newer — last writer wins', () => {
    expect(
      resolveIncoming({
        remote,
        local: { id: 'a', updatedAt: '2026-08-24T11:00:00Z' },
        hasPendingLocalChange: false,
      })
    ).toBe('apply_remote');
  });

  it('keeps the local row when it is newer', () => {
    expect(
      resolveIncoming({
        remote,
        local: { id: 'a', updatedAt: '2026-08-24T13:00:00Z' },
        hasPendingLocalChange: false,
      })
    ).toBe('keep_local');
  });

  it('keeps the local row on an exact tie, so a pull cannot churn rows it already has', () => {
    expect(
      resolveIncoming({
        remote,
        local: { id: 'a', updatedAt: '2026-08-24T12:00:00Z' },
        hasPendingLocalChange: false,
      })
    ).toBe('keep_local');
  });

  it('never clobbers an edit that has not been pushed yet', () => {
    // The whole point of the outbox: an unsynced local edit outranks anything the server says,
    // because the server has not yet been told about it.
    expect(
      resolveIncoming({
        remote,
        local: { id: 'a', updatedAt: '2026-08-24T09:00:00Z' },
        hasPendingLocalChange: true,
      })
    ).toBe('keep_local');
  });

  it('applies a remote row with an unparseable local timestamp rather than getting stuck', () => {
    expect(
      resolveIncoming({
        remote,
        local: { id: 'a', updatedAt: 'corrupt' },
        hasPendingLocalChange: false,
      })
    ).toBe('apply_remote');
  });
});
