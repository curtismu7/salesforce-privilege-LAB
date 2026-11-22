---
name: privilege-salesforce-setup
description: Connect a Salesforce Developer org to PingOne Privilege (SaaS Apps) and run time-boxed permission set grants and revokes. Use this whenever someone mentions Salesforce in Privilege, the Salesforce "Add Application" wizard, an External Client App for Privilege, JWT bearer or Consumer Key errors (invalid_grant, invalid_client_id, "user hasn't approved this consumer"), a Privilege user stuck on "Waiting for Salesforce", "its email matches 2 Privilege users", "Revoke pending", zero-standing-privilege demos with Salesforce, or the salesforce-privilege-LAB. Use it even if they never say "External Client App" or "JWT".
---

# Salesforce in PingOne Privilege

A free Salesforce Developer org can be connected to PingOne Privilege so Privilege grants and removes
Salesforce permission sets for a user on a timer. The full cycle was verified once (connect, link, grant,
confirm in Salesforce, revoke, confirm removal). Everything below was observed on one org and one Privilege
build, so say "observed" rather than "Ping says" when you relay it.

The full step-by-step guide is `docs/setup-guide.md` in the salesforce-privilege-LAB repo
(`~/Development/AI-DEMO-Standalone/standalone/salesforce-privilege-LAB/docs/setup-guide.md`). Read it when the
user needs every step; this file is the working summary and the order of operations.

## How it works, in one paragraph

Privilege signs in to Salesforce as one integration user with a signed JWT (no password, no consent screen).
That only works if three things are true in Salesforce: an External Client App has JWT Bearer Flow enabled with
Privilege's certificate and the scopes `api` and `refresh_token, offline_access`; the app's Permitted Users policy
is "Admin approved users are pre-authorized"; and a permission set is linked to the app and assigned to the user
Privilege signs in as. Miss any one and Salesforce refuses with a generic error, which is why the setup is the
hard part and the demo itself is easy.

## Order of operations

1. Developer Edition org, a Privilege admin login, Salesforce Setup open in a second tab.
2. In the Privilege wizard (Permission Management, SaaS Apps, Add Application, Salesforce, Integrate): paste an org
   URL, generate the key and certificate. Keep the wizard open: the private key lives only in that form.
3. In Salesforce create the External Client App (Distribution State Local, callback `https://login.salesforce.com`,
   the two scopes, JWT Bearer Flow plus the `.crt`), pre-authorize, create an empty permission set, link it to the
   app, assign it to a Salesforce-licensed admin user (not the built-in Integration User).
4. Back in the wizard: Consumer Key (from the app's Settings, emailed verification code first; copy only the key),
   Authorized User = the Salesforce **Username** (not the email). Wait for the green "Signed in to ... as ..." line.
5. Name the application, Create. Sync Status should read Ready.
6. Link users, then create something to grant, grant it, verify, revoke, verify.

## Linking users (the part that bites)

Privilege never creates the Salesforce user. The Add Users dialog says: "Privilege doesn't create Salesforce users. Each user you add waits here with a Create in Salesforce link that opens the prefilled New User form; after you create them in Salesforce, the next Sync links them." The link only opens a prefilled form in Salesforce.

Privilege links a Salesforce user to a Privilege user only when their emails are **identical**, and refuses when
that email belongs to more than one Privilege record ("its email matches 2 Privilege users"). Federation ID did not
override this. So before choosing a demo user, open Directory, Users in Privilege and check the candidate's email is
unique. Then: app, Users tab, Add Users, tick the user; make sure a Salesforce user with that exact Email exists
(Salesforce license, Minimum Access profile); Sync. Do not use the "Create in Salesforce" link if the user already exists.

## Grant and revoke

- Grant: Users tab, select the user, Grant Permission, Permission Sets tab, tick a plain set (no license needed),
  pick the **shortest** duration (the default was about a year), confirm. "Already has this permission set" means
  the user holds it already; check Active Policies and Access Receipts.
- What the grant dialog showed (observed once, placeholders for the names): `<plain-set>` "Permission set · Salesforce · 0 of 4 seats free"; `<needs-license-set>` "Permission set · Needs a permission set license"; `<already-assigned-set>` "Already has this permission set", greyed out; `<other-licence-set>` "Permission set · Cloud Integration User · 1 of 1 seats free", refused with "License Salesforce ≠ Cloud Integration User" (a different user licence than the user holds).
- Confirm: Access Receipts shows Granted and reconciliation reads 1 confirmed; Salesforce Permission Set
  Assignments lists the set.
- Revoke: Active Policies, three-dot menu on the policy, Delete (there is no Revoke button). Expect "Revoke
  pending, access still live" briefly. Verify by reloading the user's Permission Set Assignments in Salesforce.
- Two different Deletes exist. The one in the policy menu removes only that policy; the red Delete on the app card
  or page removes the whole Salesforce connection. Never click the second one without being asked.

## Troubleshooting map

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `invalid_grant`, "user hasn't approved this consumer" | Pre-authorization, permission set link or assignment missing, or not propagated yet | Recheck Permitted Users, the link, the assignment; wait 2 to 10 minutes |
| Salesforce rejects the flow | `refresh_token` scope missing | Add `refresh_token, offline_access` |
| `invalid_client_id` | Consumer Key copied wrongly | Copy it again |
| Signature or certificate error | Certificate does not match the key in the form (Regenerate or a refresh) | Upload the matching `.crt` |
| Permission Sets list looks empty | Salesforce list filtered by one letter | Click All |
| Users (0) after Sync | No user added, or no email match | Add Users; make the emails identical |
| "matches 2 Privilege users" | Duplicate email across Privilege records | Use a user with a unique email |
| "Needs a permission set license" | The set requires a license the user lacks | Pick a plain permission set |
| "License Salesforce ≠ (another licence)" | The set belongs to a different user licence than the user holds | Pick a set under the user's own licence |
| "Duplicate username" creating a user | Salesforce usernames are unique across all orgs | Change the Username, keep the Email |
| No Salesforce licenses | Developer org seats used (4) | Deactivate an unused user |
| No Sync button | On the SaaS Apps card list, or header cut off | Open More Info on the card; zoom out; Refresh on Access Receipts |

## Rules to keep

- Never ask the user to paste a Consumer Key, private key or password into chat. They type it into the form.
- Do not put real org URLs, usernames or emails in anything committed to a public repo; use placeholders.
- Granting, revoking and deleting policies change a real system. Only do them when the user asks, one step at a time,
  and say which Delete you mean.
- Not verified: granting profiles or permission set groups, approval flows, Set Up SSO.
