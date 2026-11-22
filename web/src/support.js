// Which of the three beats of the Support P1 story the world is in. Derived from the server's state, never stored:
// 1 = no access yet, 2 = access for the job (a request is live, Revoke pending included), 3 = no access again and a receipt.
export const beatOf = (support) => {
  if (!support || !support.ready) return 0;
  if (support.requests.length === 0) return 1;
  return support.canSeeCases || support.access ? 2 : 3;
};
export const BEATS = ["No access", "Access for the job", "No access again, and a receipt"];
