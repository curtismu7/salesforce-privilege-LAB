# Connecting a Salesforce Developer org to PingOne Privilege

Source: a real setup done once by the lab's owner. Every identifier in this file is a placeholder
(`<your-org>`, `you@<your-org>.example`); the lab itself never calls a real Salesforce or Privilege.
Product behaviour described here was observed on one org and one Privilege build, so treat it as
observed, not as a Ping claim.

## What you get

A free Salesforce Developer org can be connected to PingOne Privilege so Privilege grants and removes
Salesforce permission sets for a user on a timer. The full cycle was verified once: connect, link a user,
grant, confirm in Salesforce, revoke, confirm removal.

- Privilege signs in to Salesforce as one integration user with a signed JWT (no password, no consent screen).
- It syncs users, profiles, permission sets and permission set groups, and assigns or removes permission sets.
- It never creates Salesforce users. The Add Users dialog says: "Privilege doesn't create Salesforce users. Each user you add waits here with a Create in Salesforce link that opens the prefilled New User form; after you create them in Salesforce, the next Sync links them." So the link only opens a prefilled New User form in Salesforce; the person who creates the user is you.

## Before you start

- **Org:** Developer Edition (free). Trial and Starter orgs can lack API access.
- **Privilege path:** Permission Management, SaaS Apps, Add Application, Salesforce, Integrate.
- **Org URL:** paste any address from the signed-in org (Lightning or Setup). Privilege converts it to the
  My Domain URL, such as `https://<your-org>.develop.my.salesforce.com`.
- **Network:** the machine running Privilege must reach the org's My Domain host outbound.
- **Keep the wizard open.** The private key exists only in that form. A refresh or close means a new key
  and a new certificate upload to the app.

## Salesforce side: the External Client App

The wizard's Prepare step has six checklist items. Do them in order and tick Mark done on each.

1. **Org URL.** Paste any address from your signed-in org.
2. **Key and certificate.** Generate Key And Certificate. It downloads a `.crt` valid two years.
   Do not Regenerate later unless you re-upload the certificate.
3. **Create the app.** Setup, External Client App Manager, New External Client App.
   - Name: the wizard's App name. Contact Email: yours. Distribution State: Local.
   - API (Enable OAuth Settings): Enable OAuth. Callback URL `https://login.salesforce.com`
     (required by Salesforce, never used by JWT).
   - OAuth Scopes: `api` and `refresh_token, offline_access`. Without refresh_token Salesforce rejects the flow.
   - Flow Enablement: Enable JWT Bearer Flow, upload the `.crt`. The app then lists the certificate with its
     common name and expiry date.
4. **Pre-authorize.** App, Policies, Edit, OAuth Policies, Permitted Users, "Admin approved users are
   pre-authorized", Save. The default (All users can self-authorize) does not work for JWT.
5. **Permission set.** Setup, Permission Sets, New, label `Integration Access`, license None, Save, leave it
   empty. Then App, Policies, Edit, App Policies, Select Permission Sets, move it to Selected, Save.
6. **Assign it.** Permission set, Manage Assignments, Add Assignment, the user Privilege signs in as, Assign.
   Use a Salesforce-licensed user (the org admin), not the built-in Integration User.

A new External Client App can take up to 10 minutes to activate.

## Privilege side: the wizard

Step 2 needs three values; Privilege signs in to check them as soon as they are filled.

- **Instance URL:** pre-filled from step 1.
- **Consumer Key (Client ID):** in the app, Settings, OAuth Settings, Consumer Key and Secret. Salesforce emails
  a verification code to the app's contact email first. Copy only the Consumer Key (it starts with `3MVG9`).
  The Consumer Secret is not used. Type it into the form, never into chat or a ticket.
- **Authorized User:** the exact **Username** from Setup, Users, not the email. In a Developer org it often
  looks like `name.<random>@<some-domain>`. The user needs the System Administrator profile, or API Enabled,
  View Setup and Configuration, Manage Users, Manage Profiles and Permission Sets, and Assign Permission Sets.

A green line "Signed in to ... as ..." means the key, certificate, pre-authorization and permission set link
are all correct. Continue, name the application (at least 4 characters), Create Application. One application
per Salesforce org. The app page then shows Sync Status Ready. Set Up SSO is optional and not needed for grants.

## Linking users: the part that bites

Privilege links a Salesforce user to a Privilege user only when their **email addresses are identical**, and it
refuses to link when that email belongs to more than one Privilege record. Federation ID on the Salesforce user
did not override this in the one test run.

1. App, Users tab, **Add Users**, tick the Privilege user. A row appears as "Waiting for Salesforce".
2. Make sure a Salesforce user exists whose Email equals that Privilege user's email exactly. Create one in
   Setup, Users, New User (License: Salesforce, Profile: Minimum Access - Salesforce). Do not use
   "Create in Salesforce" if the user already exists (that link only opens the prefilled New User form).
3. **Sync.** The row becomes a linked user with its Salesforce profile, and Grant Permission becomes available.

**Check for duplicate emails before you pick a demo user.** In Privilege, Directory, Users, open each candidate and
compare Email. When two records share an email neither links, and the records were read-only in the observed
environment. A user with a unique email linked on the first Sync.

**Licenses:** Salesforce-licensed profiles showed 0 of 4 seats free once four users existed. Deactivate unused
users to free a seat.

## Grant and revoke

Access is granted through a policy on the app and removed by deleting that policy.

1. **Create something to grant.** Setup, Permission Sets, New, label `Account Read Access`, license None.
   Object Settings, Accounts, Edit, tick Read, Save. Do not assign it to anyone. In Privilege, Sync, then check
   the Permissions tab lists it.
2. **Grant.** Users tab, click the user, Grant Permission, Permission Sets tab, tick the set, choose a duration,
   confirm. Many sets say "Needs a permission set license"; pick a plain one. A set the user already holds shows
   "Already has this permission set" and cannot be ticked.
   What the grant dialog showed for four permission sets (placeholders for the set names), observed in one real run:
   - `<plain-set>`: "Permission set · Salesforce · 0 of 4 seats free" (a set under the Salesforce user licence, with its seats line).
   - `<needs-license-set>`: "Permission set · Needs a permission set license".
   - `<already-assigned-set>`: "Already has this permission set", greyed out and not tickable.
   - `<other-licence-set>`: "Permission set · Cloud Integration User · 1 of 1 seats free", refused with "License Salesforce ≠ Cloud Integration User" (it needs a different user licence than the user holds).
   What a full seat count ("0 of 4 seats free") does to a grant was not recorded.
3. **Confirm.** Access Receipts shows user, set, end date and status Granted. The reconciliation line should read
   1 confirmed. In Salesforce the user's Permission Set Assignments lists the set.
4. **Revoke.** Active Policies, the three-dot menu on the policy, Delete. There is no separate Revoke button.
   Expect "Revoke pending, access still live" briefly, then the policy count drops to 0 and Expired / Revoked
   shows 1.
5. **Verify.** Reload the user's Permission Set Assignments in Salesforce. The set is gone.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `invalid_grant` or "user hasn't approved this consumer" | Pre-authorization, permission set link or assignment missing, or a change has not propagated | Recheck steps 4 to 6, wait 2 to 10 minutes |
| Salesforce rejects the flow | `refresh_token` scope missing | Add refresh_token, offline_access to the app |
| `invalid_client_id` | Consumer Key copied wrongly | Copy it again |
| Signature or certificate error | Uploaded certificate does not match the key in the form | Upload the matching `.crt` |
| Permission Sets list looks empty | List filtered by one letter | Click All |
| Users (0) after a Sync | No user added, or no Salesforce email matches | Add Users; make the emails identical |
| "its email matches 2 Privilege users" | Two Privilege records share that email | Use a user with a unique email |
| Federation ID set but still waiting | Privilege matches on email | Use a unique email |
| "Already has this permission set" | The user already holds it | Check Active Policies and Access Receipts |
| "Needs a permission set license" | The set requires a license the user lacks | Choose a plain permission set |
| "License Salesforce ≠ (another licence)" | The set belongs to a different user licence than the user holds | Choose a set under the user's own licence |
| "Duplicate username" on a new Salesforce user | Usernames are unique across all orgs | Change the Username, keep the Email |
| No Salesforce licenses available | Developer org seats used up | Deactivate an unused user |
| "Revoke pending, access still live" | The removal is queued | Wait, refresh, check Activity Logs |
| No Sync button | On the card list, or the header is cut off | Open More Info on the card, zoom out, or Refresh on Access Receipts |

## Demo tips and limits

- The default grant lasted about a year. Use the shortest duration offered so access visibly expires.
- Two different Deletes: the three-dot menu on a policy removes that policy and its grant; the red Delete on the
  app card or page removes the whole Salesforce connection.
- Keep the empty integration permission set linked to the app and assigned to the integration user.
- The certificate expires two years after creation; regenerating means uploading a new one.
- Not tested: granting profiles or permission set groups, approval flows, Set Up SSO.
