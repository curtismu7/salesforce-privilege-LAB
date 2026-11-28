# Talk track

<!-- Generated from server/src/data.js by `npm run talk-track`. Do not edit by hand. -->

> Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.

## Beat 1: no access

Emma Hartley is a support engineer at AirGuard Airlines with the Minimum Access profile and nothing else. Open Cases in the mock Salesforce: "You don't have access to Cases" (the lab's mock wording). No case titles, no counts. Case Read Access is the lab's example permission set, with the same mechanics as the guide's Account Read Access. Nobody has to remember to take anything away, because nothing was given.

## Beat 2: access for the job

A P1 lands. Emma Hartley makes a request in the lab with a note and an end time (the lab's own step; the lab does not claim Privilege stores the note), and Privilege grants Case Read Access with that end date. Cases now shows three cases with the P1 on top, because the mock Salesforce really holds the assignment. The receipt says Granted and the reconciliation reads 1 confirmed. When the P1 is fixed, End access deletes the policy: it reads "Revoke pending, access still live", the cases are still listed and the reconciliation line is still the last refresh. We are still in beat 2 until you press Refresh receipts: in the guide the removal is queued and a refresh shows it.

## Beat 3: no access again, and a receipt

After Refresh receipts the assignment is gone, Cases is denied again, and the receipt reads Expired / Revoked (the reconciliation now reads 0 confirmed). Nothing ended the access by itself: the end time is only the "until" date on the receipt. Compare "The old way": a permanent set an admin assigned and nobody removed. That panel is a narrative, not something Privilege says.

## Connect: three things that all have to be true

Privilege signs in as one integration user with a signed JWT. That works only if the External Client App has JWT enabled with the right certificate and scopes, is pre-authorized for admin-approved users, and has a permission set linked to the app and assigned to the signing-in user. Break each one in turn and show the cause and the fix.

## Link: the email is the key

Privilege links a person only when the email is identical, and refuses when two Privilege records share it ("its email matches 2 Privilege users"). Noah Reyes and Noah Reyes (contractor) share an email, so neither links; Emma Hartley is unique and links on the first Sync. A Federation ID did not rescue it in the one test run.

## Grant and revoke

Grant Case Read Access to Emma Hartley with a duration. The receipt says Granted and the reconciliation reads 1 confirmed. The grant dialog showed four things: a plain set, one that needs a permission set license, one the user already holds, and one under a different user licence (License Salesforce ≠ Cloud Integration User). To revoke, delete the policy: there is no Revoke button. The policy reads "Revoke pending, access still live" until the receipts are refreshed, then the receipt reads Expired / Revoked.

## The scripted scenarios (Mock mode)

1. **Support P1: no access, access for the job, no access again.** Emma Hartley is a support engineer with the Minimum Access profile and no access to Cases. A P1 lands: Emma Hartley asks for Case Read Access with a note and an end time, Privilege grants it, and Cases lists the P1. Ending the access deletes the policy: first "Revoke pending, access still live", then the assignment is gone and Cases is denied again. The receipt keeps the record.
2. **Connect, link, grant, revoke.** The whole cycle once, with nothing going wrong: connect the org, link Emma Hartley, grant Case Read Access for a window, see it in Salesforce, delete the policy and see it gone.
3. **Sign-in fails: invalid_client_id.** The Consumer Key was copied wrongly. Salesforce answers invalid_client_id; copy it again.
4. **Sign-in fails: not propagated yet.** Everything is right, but the app was only just created. invalid_grant, "user hasn't approved this consumer", until the lab clock has moved forward a few minutes.
5. **Sign-in fails: not pre-authorized.** Permitted Users was left at "All users can self-authorize", which does not work for JWT. invalid_grant.
6. **Sign-in fails: refresh_token scope missing.** Without refresh_token, offline_access Salesforce rejects the flow.
7. **Sign-in fails: certificate does not match the key.** The wizard was refreshed (a new key), so the certificate uploaded to the app no longer matches. Upload the new .crt.
8. **Sign-in fails: permission set not linked, then not assigned.** Both look the same from outside: invalid_grant. The permission set must be linked to the app and assigned to the signing-in user.
9. **Link refused: its email matches 2 Privilege users.** Two Privilege records share an email, so neither links. Federation ID does not help; pick a user whose email is unique.
10. **Link pitfalls: Federation ID, duplicate username, no seats.** A Federation ID does not rescue a mismatched email, a Salesforce username is unique across all orgs, and the observed org had 4 seats.
11. **Grant refused: license rules and "Already has".** Some permission sets need a permission set license, some belong to a different user license, and one the user already holds cannot be granted twice.
12. **Revoke by deleting the policy.** There is no Revoke button: delete the policy. First "Revoke pending, access still live", then the assignment is gone in Salesforce.
