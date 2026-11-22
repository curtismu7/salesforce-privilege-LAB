# Talk track

<!-- Generated from server/src/data.js by `npm run talk-track`. Do not edit by hand. -->

> Every statement about Salesforce or PingOne Privilege here is observed on one org and one Privilege build, UNVERIFIED as a product claim. It is not a Ping statement.

## Start with the honest part

This is a rehearsal of something that really went wrong several times on the way to working. Fabrikam Bank's admin Maya Chen connects a Salesforce Developer org to PingOne Privilege. The mock is built from one real setup, so every behaviour is labelled: observed on one org and one Privilege build, not a Ping statement.

## Connect: three things that all have to be true

Privilege signs in as one integration user with a signed JWT. That works only if the External Client App has JWT enabled with the right certificate and scopes, is pre-authorized for admin-approved users, and has a permission set linked to the app and assigned to the signing-in user. Break each one in turn and show the cause and the fix.

## Wait for it (lab-inferred)

A new app can take up to 10 minutes to activate. Move the lab clock: the same sign-in that failed with invalid_grant works once the clock passes ten minutes.

## Link: the email is the key

Privilege links a person only when the email is identical, and refuses when two Privilege records share it ("its email matches 2 Privilege users"). Priya Nair and Priya Nair (contractor) share an email, so neither links; Omar Reyes is unique and links on the first Sync. A Federation ID did not rescue it in the one test run.

## Grant for a window

Grant Ledger Reader to Omar Reyes for 60 minutes. The receipt says Granted and the reconciliation reads 1 confirmed; in the mock org the assignment is really there. The grant dialog showed four things in the real run: a plain set, one that needs a permission set license, one the user already holds, and one under a different user licence (License Salesforce ≠ Cloud Integration User).

## Expire by itself, or revoke by deleting the policy (lab-invented)

Delete the policy: it first reads "Revoke pending, access still live", then the assignment is gone (observed). Which action clears it, and the automatic expiry when you move the clock past the window, are lab-invented: say so. Two Deletes exist and only the policy one is modelled here.

## Drift (lab-invented)

Assign a permission set by hand in the org. Everything here is lab-invented: the lab's reconcile finds it outside any policy, calls it discovered, or orphaned if Privilege once granted it, and lets you revoke it.

## The scripted scenarios (Mock mode)

1. **Connect, link, grant, revoke.** The whole cycle once, with nothing going wrong: connect the org, link Omar Reyes, grant Ledger Reader for a window, see it in Salesforce, delete the policy and see it gone. The guide observed the removal but not which action clears "Revoke pending": the lab's "the next reconcile removes it" is its own reading, so this card is lab-inferred.
2. **Sign-in fails: invalid_client_id.** The Consumer Key was copied wrongly. Salesforce answers invalid_client_id; copy it again.
3. **Sign-in fails: not propagated yet.** Everything is right, but the app is a minute old. invalid_grant, "user hasn't approved this consumer", until the lab clock passes 10 minutes.
4. **Sign-in fails: JWT Bearer Flow not enabled.** The app has no JWT Bearer Flow or no certificate. Enable it and upload the .crt.
5. **Sign-in fails: not pre-authorized.** Permitted Users was left at "All users can self-authorize", which does not work for JWT. invalid_grant.
6. **Sign-in fails: refresh_token scope missing.** Without refresh_token, offline_access Salesforce rejects the flow.
7. **Sign-in fails: certificate does not match the key.** The wizard was refreshed (a new key), so the certificate uploaded to the app no longer matches. Upload the new .crt.
8. **Sign-in fails: certificate expired.** The wizard's certificate is valid two years. Move the lab clock past that and the same sign-in fails; regenerate and upload a new one.
9. **Sign-in fails: the email was given, not the Username.** The Authorized User is the exact Username from Setup, Users; the email address does not work.
10. **Sign-in fails: permission set not linked, then not assigned.** Both look the same from outside: invalid_grant. The permission set must be linked to the app and assigned to the signing-in user.
11. **Link refused: its email matches 2 Privilege users.** Two Privilege records share an email, so neither links. Federation ID does not help; pick a user whose email is unique.
12. **Link pitfalls: Federation ID, duplicate username, no seats.** A Federation ID does not rescue a mismatched email, a Salesforce username is unique across all orgs, and the observed org had 4 seats.
13. **Grant refused: license rules and "Already has".** Some permission sets need a permission set license, some belong to a different user license, and one the user already holds cannot be granted twice.
14. **Grant, then expire by itself.** Nobody deletes the policy: the window closes and the reaper removes the assignment.
15. **Revoke by deleting the policy.** There is no Revoke button: delete the policy. First "Revoke pending, access still live", then the next reconcile removes it (the lab's reading, so this card is lab-inferred).
16. **Drift: a permission set assigned by hand.** An admin assigns a permission set in Salesforce without a Privilege policy. Reconcile finds it; it can be revoked. Discovered and orphaned are the lab's names for it.
17. **Downstream failure: Privilege can no longer sign in.** Two years on the certificate expires. A new grant fails with a structured 502, a grant whose window closed cannot be removed, and both are fixed by replacing the certificate.

## Lab-invented (say so when you present it)

- Automatic expiry by a reaper: when the window closes the lab removes the assignment by itself. The guide observed removal only by deleting the policy, and that the default grant lasted about a year.
- "The next reconcile or Sync clears Revoke pending": the guide observed it clearing after a wait; which action clears it is the lab's reading.
- Case-sensitive email matching: the guide says the emails must be identical; whether Privilege folds case was not tested.
- "Discovered" and "orphaned" for access assigned by hand in Salesforce, and revoking it from Privilege: how the product classifies and handles it was not observed.
- The authorized user's required permissions (System Administrator, or API Enabled and the others) are not checked: any Salesforce-licensed active user who holds the linked permission set signs in.
- The list of durations offered when granting.

## Not demonstrated

- Anything the real console, a real Salesforce org or a real Privilege build does that was not seen in the one setup the guide records: nothing here ran against one.
- Granting profiles or permission set groups, approval flows and Set Up SSO: not tested.
- The exact wording of the errors for a missing refresh_token scope, a mismatched certificate, an expired certificate, a wrong username and an inactive or unlicensed user: the guide records the symptom and the fix, not Salesforce's own words, so the lab shows the cause and the fix and leaves the wording empty.
- Whether email matching ignores case (the lab is case-sensitive, lab-invented), and what Privilege does with a Salesforce user that has no email.
- Lab-invented: automatic expiry by a reaper (the guide observed removal only by deleting the policy), and "the next reconcile or Sync clears Revoke pending" (the guide observed it clearing after a wait).
- Lab-invented: the authorized user's required permissions are not checked.
- The seats line the grant dialog shows beside a permission set ("0 of 4 seats free") is recorded but not modelled, and what a full count does to a grant is not known.
- How the product classifies access assigned by hand in Salesforce: "discovered" and "orphaned" are the lab's own names for it (lab-invented).
- The durations Privilege offers: the lab offers a list of its own.
