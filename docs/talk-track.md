# Talk track

<!-- Generated from server/src/data.js by `npm run talk-track`. Do not edit by hand. -->

> Simulated: every behaviour shown was recorded in one real Privilege and Salesforce run.

## Beat 1: no access

Omar Reyes is a support engineer at Fabrikam Bank with the Minimum Access profile and nothing else. Open Cases in Salesforce: "You don't have access to Cases". No case titles, no counts. Nobody has to remember to take anything away, because nothing was given.

## Beat 2: access for the job

A P1 lands. Omar Reyes asks for Case Read Access with a note about the job and an end time, and Privilege grants it. Cases now shows three cases with the P1 on top, because Salesforce really holds the assignment. The receipt says Granted and the reconciliation reads 1 confirmed.

## Beat 3: no access again, and a receipt

The P1 is fixed, so end the access by deleting the policy. First "Revoke pending, access still live", then the assignment is gone and Cases is denied again. The receipt now reads Revoked. Compare "The old way": a permanent set an admin assigned and nobody removed. That panel is the story of what usually happens, not something Privilege says.

## Connect: three things that all have to be true

Privilege signs in as one integration user with a signed JWT. That works only if the External Client App has JWT enabled with the right certificate and scopes, is pre-authorized for admin-approved users, and has a permission set linked to the app and assigned to the signing-in user. Break each one in turn and show the cause and the fix.

## Link: the email is the key

Privilege links a person only when the email is identical, and refuses when two Privilege records share it ("its email matches 2 Privilege users"). Priya Nair and Priya Nair (contractor) share an email, so neither links; Omar Reyes is unique and links on the first Sync. A Federation ID did not rescue it in the one test run.

## Grant and revoke

Grant Case Read Access to Omar Reyes with a duration. The receipt says Granted and the reconciliation reads 1 confirmed. The grant dialog showed four things: a plain set, one that needs a permission set license, one the user already holds, and one under a different user licence (License Salesforce ≠ Cloud Integration User). To revoke, delete the policy: there is no Revoke button.

## The scripted scenarios (Mock mode)

1. **Support P1: no access, access for the job, no access again.** Omar Reyes is a support engineer with the Minimum Access profile and no access to Cases. A P1 lands: Omar Reyes asks for Case Read Access with a note and an end time, Privilege grants it, and Cases lists the P1. Ending the access deletes the policy: first "Revoke pending, access still live", then the assignment is gone and Cases is denied again. The receipt keeps the record.
2. **Connect, link, grant, revoke.** The whole cycle once, with nothing going wrong: connect the org, link Omar Reyes, grant Case Read Access for a window, see it in Salesforce, delete the policy and see it gone.
3. **Sign-in fails: invalid_client_id.** The Consumer Key was copied wrongly. Salesforce answers invalid_client_id; copy it again.
4. **Sign-in fails: not propagated yet.** Everything is right, but the app is a minute old. invalid_grant, "user hasn't approved this consumer", until the lab clock has moved forward a few minutes.
5. **Sign-in fails: not pre-authorized.** Permitted Users was left at "All users can self-authorize", which does not work for JWT. invalid_grant.
6. **Sign-in fails: refresh_token scope missing.** Without refresh_token, offline_access Salesforce rejects the flow.
7. **Sign-in fails: certificate does not match the key.** The wizard was refreshed (a new key), so the certificate uploaded to the app no longer matches. Upload the new .crt.
8. **Sign-in fails: permission set not linked, then not assigned.** Both look the same from outside: invalid_grant. The permission set must be linked to the app and assigned to the signing-in user.
9. **Link refused: its email matches 2 Privilege users.** Two Privilege records share an email, so neither links. Federation ID does not help; pick a user whose email is unique.
10. **Link pitfalls: Federation ID, duplicate username, no seats.** A Federation ID does not rescue a mismatched email, a Salesforce username is unique across all orgs, and the observed org had 4 seats.
11. **Grant refused: license rules and "Already has".** Some permission sets need a permission set license, some belong to a different user license, and one the user already holds cannot be granted twice.
12. **Revoke by deleting the policy.** There is no Revoke button: delete the policy. First "Revoke pending, access still live", then the assignment is gone in Salesforce.
