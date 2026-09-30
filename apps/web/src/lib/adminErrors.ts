/**
 * Admin approve/reject error codes → messages an admin can act on.
 *
 * The API returns terse messages (e.g. "exceeds the approval envelope")
 * that don't say WHAT to do. Every admin screen shows these verbatim, so
 * the mapping lives in ONE place and all three screens stay consistent.
 * Unknown codes fall back to the server's own message.
 */
export function adminActionErrorMessage(code: string | undefined, serverMessage: string | undefined): string {
  switch (code) {
    case 'OVERRIDE_REQUIRED':
      return (
        'This credit is above the maximum a single admin can approve ' +
        '(the Max Deposit setting). The request is recorded — a SECOND admin ' +
        'must open this same deposit and approve the exact same amount to release it.'
      );
    case 'DUAL_CONTROL_SAME_ADMIN':
      return (
        'You recorded this override request, so you cannot approve it yourself. ' +
        'A second admin must approve the same amount.'
      );
    case 'OVERRIDE_AMOUNT_MISMATCH':
      return (
        (serverMessage ? serverMessage + ' ' : '') +
        'Approve exactly the requested amount, or have the requesting admin cancel it.'
      );
    case 'OVERRIDE_ALREADY_DECIDED':
      return 'This override request was already approved or rejected by another admin.';
    case 'DEPOSIT_ALREADY_PROCESSED':
      return 'This deposit was already approved or rejected. The list is refreshing.';
    case 'REASON_REQUIRED':
      return 'An approval reason is required (at least 4 characters).';
    case 'INVALID_CREDIT_AMOUNT':
      return 'Credit amount must be greater than zero, with at most 2 decimal places.';
    case 'DEPOSIT_NOT_FOUND':
      return 'This deposit no longer exists — refresh the list.';
    default:
      return serverMessage || 'The action failed. Please try again.';
  }
}
