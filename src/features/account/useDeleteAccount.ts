import { useMutation } from '@tanstack/react-query';

import { signOut } from '@/services/auth/authService';
import { deleteLocalDatabase } from '@/services/db/database';
import { getSupabaseClient } from '@/services/supabase/client';

import {
  runAccountDeletion,
  type DeleteAccountPorts,
  type DeleteAccountResult,
} from './deleteAccount';

/**
 * The edge of account deletion (spec §97).
 *
 * The ordering and every failure decision live in `deleteAccount.ts`, which is pure and tested.
 * This file only supplies the three real things it acts on, so the part worth getting right is
 * not the part that needs a device to exercise.
 *
 * **The server call carries no user id.** `functions.invoke` attaches the caller's access token,
 * and the Edge Function reads the id from that verified token — it accepts no id parameter at
 * all. Sending one from here would be harmless today and an invitation later, so nothing is sent.
 */
export function realDeleteAccountPorts(): DeleteAccountPorts {
  return {
    deleteOnServer: async () => {
      const { data, error } = await getSupabaseClient().functions.invoke<{ ok?: boolean }>(
        'delete-account',
        { method: 'POST' }
      );

      if (error) {
        // The message is for the person in front of us, so it says what to do rather than what
        // the status code was. A failure here means nothing has been touched.
        return {
          ok: false,
          message:
            'Your account could not be deleted just now. Nothing has been removed — check your ' +
            'connection and try again.',
        };
      }

      if (data?.ok !== true) {
        return {
          ok: false,
          message: 'Your account could not be deleted just now. Nothing has been removed.',
        };
      }

      return { ok: true };
    },

    clearLocalData: deleteLocalDatabase,

    signOut: async () => {
      await signOut();
    },
  };
}

export function useDeleteAccount() {
  return useMutation<DeleteAccountResult, Error, void>({
    mutationFn: () => runAccountDeletion(realDeleteAccountPorts()),
  });
}
