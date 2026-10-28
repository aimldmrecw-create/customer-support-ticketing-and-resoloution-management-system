# Customer Support Ticketing and Resolution Management System

A beginner-friendly full-stack support desk. Customers can create tickets, see status and priority, and reply in a conversation. Support agents can review tickets and update status/priority. Administrators can also assign tickets to support staff.

## 1. Problem and objectives

Support requests often arrive in scattered emails or messages, making ownership and progress difficult to track. This application centralizes each request into a ticket with a unique ID, status, priority, category, comments, and timestamps.

### Roles
- **Customer:** register, sign in, create tickets, view only their own tickets, and reply.
- **Agent:** view tickets, update status/priority, and reply.
- **Admin:** agent permissions plus assigning tickets to agents/admins.

New registrations are always customers. Promote trusted accounts to agent/admin manually in Supabase SQL Editor.

## 2. Features

- Responsive sign-in and registration.
- Ticket creation with server-side validation.
- Ticket list, search, status filter, and priority filter.
- Ticket details, conversation replies, status/priority management.
- Dashboard counts.
- Role checks on backend routes.
- Password hashing, HTTP-only session cookie, login rate limiting, Helmet security headers.
- Persistent PostgreSQL storage via Supabase.

Not included in this MVP: email notifications, attachments, password reset, public ticket sharing, SLA automation, and a dedicated audit log.

## 3. Technology stack

- HTML5, CSS3, Vanilla JavaScript
- Node.js 20+ and Express 5
- Supabase PostgreSQL
- npm packages: `@supabase/supabase-js`, `bcryptjs`, `cookie-parser`, `dotenv`, `express`, `express-rate-limit`, `helmet`, `jsonwebtoken`, `zod`
- Git and GitHub

## 4. Folder structure

```text
customer-support-ticketing-and-resolution-management-system/
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/
│   ├── routes/
│   │   ├── auth.js
│   │   └── tickets.js
│   ├── middleware/
│   │   └── auth.js
│   ├── utils/
│   ├── server.js
│   ├── supabase.js
│   ├── package.json
│   ├── .env
│   ├── .env.example
│   └── .gitignore
├── database/
│   └── schema.sql
├── .gitignore
└── README.md
```

## 5. Prerequisites

Install:
- [Visual Studio Code](https://code.visualstudio.com/)
- [Node.js LTS](https://nodejs.org/) (includes npm; use Node 20 or newer)
- [Git](https://git-scm.com/downloads)
- A free [Supabase](https://supabase.com/) account

Check installations in a new VS Code terminal:
```powershell
node --version
npm --version
git --version
```
Each command should print a version. If not, install the software and reopen the terminal.

## 6. Create and configure Supabase

1. Sign in to Supabase and create a new project. Save the database password securely.
2. Open **Project Settings → API** (the dashboard labels may vary). Copy the project URL and the **service_role/secret server-side key** for backend use only.
3. Open **SQL Editor → New query**.
4. Copy all of `database/schema.sql`, paste it into the editor, and run it.
5. In **Table Editor**, confirm `profiles`, `tickets`, and `ticket_comments` exist.
6. Keep the service-role key private. It bypasses RLS, so this app uses it only inside Express and performs authorization checks in backend code. Never place it in `frontend/app.js`, HTML, CSS, or GitHub.

### Configure environment variables

Open `backend/.env`. Replace the placeholder values:
```env
PORT=3000
NODE_ENV=development
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_REAL_SERVER_SIDE_KEY
JWT_SECRET=YOUR_RANDOM_SECRET
COOKIE_SECURE=false
```
Get `SUPABASE_URL` and the server-side key from your own Supabase project. Do not use the placeholder literally. `.env` contains local secrets and is ignored by Git; `.env.example` documents variable names and safe placeholders.

Generate a strong JWT secret from the `backend` folder:
```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
Copy the output into `JWT_SECRET`. Never share or commit it. For production HTTPS, set `COOKIE_SECURE=true`.

## 7. Install and run (Windows)

1. Open the project root folder in VS Code.
2. Choose **Terminal → New Terminal**.
3. Move into the backend folder:
   ```powershell
   cd backend
   ```
4. Install dependencies:
   ```powershell
   npm install
   ```
   npm should finish without errors and create `node_modules/` and `package-lock.json`.
5. Check JavaScript syntax:
   ```powershell
   npm run check
   ```
6. Ensure `backend/.env` has your real Supabase URL, service-role key, and generated JWT secret.
7. Start the server:
   ```powershell
   npm start
   ```
   Expected output: `SupportDesk running at http://localhost:3000`
8. Open [http://localhost:3000](http://localhost:3000). Do not open `index.html` directly from the file system; use the server URL.
9. Register an account and create a test ticket.

For development auto-restart, use `npm run dev`.

## 8. Create an administrator and agent

1. Register your own account from the web interface.
2. In Supabase SQL Editor, run this query with your registered email:
   ```sql
   update public.profiles set role = 'admin' where email = 'your-email@example.com';
   ```
3. Sign out and sign in again so the app reads the updated role.
4. To promote a second trusted account to agent:
   ```sql
   update public.profiles set role = 'agent' where email = 'agent-email@example.com';
   ```
Only an admin can assign tickets in this MVP. Public registration never accepts a role field.

## 9. Architecture

```text
Browser (HTML/CSS/Vanilla JS)
        | fetch() + HTTP-only session cookie
        v
Express REST API (validation + authentication + role checks)
        | Supabase server-side client
        v
Supabase PostgreSQL (profiles, tickets, ticket_comments)
```

Passwords are hashed with bcrypt. A signed JWT is stored in an HTTP-only, same-site cookie; browser JavaScript cannot read it. The server uses the cookie to identify the user. The service-role key bypasses PostgreSQL RLS, so the Express layer must enforce access control for every route. RLS is enabled with no public policies to prevent accidental direct browser access; browser-side Supabase access is not used.

## 10. API reference

All responses are JSON. Authenticated routes use the `support_session` cookie.

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API health check |
| POST | `/api/auth/register` | Public | Create customer account (`name`, `email`, `password`) |
| POST | `/api/auth/login` | Public | Sign in (`email`, `password`) |
| GET | `/api/auth/me` | Signed in | Current user |
| POST | `/api/auth/logout` | Public | Clear session cookie |
| GET | `/api/tickets` | Signed in | List own tickets (customer) or all tickets (agent/admin) |
| GET | `/api/tickets/stats` | Signed in | Ticket counts for permitted tickets |
| POST | `/api/tickets` | Signed in | Create ticket (`subject`, `description`, `category`, `priority`) |
| GET | `/api/tickets/:id` | Ticket owner or staff | Ticket details and comments |
| PATCH | `/api/tickets/:id` | Agent/admin | Update `status`, `priority`; admin may also send `assigneeId` |
| POST | `/api/tickets/:id/comments` | Ticket owner or staff | Add reply (`message`) |

Typical errors: `400` invalid input, `401` missing/expired session, `403` forbidden role, `404` missing or inaccessible ticket, `409` duplicate email, `500` server/database failure.

## 11. Database tables

- `profiles`: account name, unique email, bcrypt password hash, role.
- `tickets`: unique ticket number, customer, optional assignee, subject, description, category, priority, status and timestamps.
- `ticket_comments`: ticket conversation messages linked to author and ticket.

Foreign keys, check constraints, and indexes protect relationships and improve common queries. A trigger updates `tickets.updated_at` when a ticket changes.

## 12. Manual testing checklist

| Test | Expected result |
|---|---|
| Open `/api/health` | JSON status `ok` |
| Register with valid data | Account created and signed in |
| Register same email again | Friendly duplicate-email error |
| Register with short password | Validation error |
| Sign in with wrong password | Generic authentication error |
| Create valid ticket | Ticket appears in list and database |
| Submit short subject/description | Server rejects invalid input |
| Search/filter tickets | List updates to matching tickets |
| Customer opens another customer's ticket ID | Ticket is not returned |
| Customer calls `PATCH /api/tickets/:id` | `403` forbidden |
| Agent updates status/priority | Changes persist after reload |
| Customer adds reply | Reply appears in conversation |
| Admin assigns valid agent | Assignee updates |
| Open app at mobile width | Layout adapts to narrow screen |
| Stop Supabase/configure wrong key | API displays a generic error; inspect server terminal privately |

No live Supabase connection or browser session is included in this package; you must configure your own credentials and run the manual checks above.

## 13. Troubleshooting

- **`SUPABASE_URL` / key error:** Check `backend/.env`, remove extra quotes/spaces, and restart the server.
- **Tables not found:** Run `database/schema.sql` in the correct Supabase project and confirm the table names.
- **Login says incorrect password after SQL role update:** The role update should not change a password. Confirm you are using the same email and account.
- **Admin role not reflected:** Sign out and sign in again.
- **`Cannot find module`:** Run `npm install` from `backend/`.
- **Port already in use:** Change `PORT=3001` in `backend/.env` and visit `http://localhost:3001`.
- **Cookie/session trouble:** Use `http://localhost` during local development and keep `COOKIE_SECURE=false`; HTTPS deployments should set it to `true`.
- **Blank page / 404:** Start Express and browse to `http://localhost:3000`, not the HTML file directly.
- **Database errors:** Check the server terminal and Supabase project status. The API intentionally does not reveal raw database errors to visitors.

## 14. Git and GitHub

From the **project root**:
```powershell
git init
git status
git add .
git status
git commit -m "Build support ticketing system"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```
Replace `YOUR_GITHUB_REPOSITORY_URL` with your repository's actual HTTPS or SSH URL. Create an empty repository on GitHub first. If Git asks for identity, configure it with `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`.

Before `git add .`, verify that `backend/.env`, `node_modules/`, real keys, private user data, and database exports are not tracked. `git status` should show `.env.example`, but not `.env`. A `.gitignore` does not remove a secret already committed. If a credential leaks, rotate it immediately and remove it from repository history.

## 15. Security and limitations

- This is an educational MVP. Before public deployment, add CSRF protection suitable for cookie authentication, email verification, password reset, stronger account abuse controls, audit logging, and production deployment hardening.
- The service-role key is highly privileged and bypasses RLS. It must remain server-side. The server implements ticket ownership and role checks; review all backend routes before extending the app.
- Do not expose this app publicly with demo credentials or unreviewed security settings.
- The UI currently uses a single-page layout with dialogs for ticket creation and detail view.

## 16. Future improvements

Email notifications, file attachments with controlled storage, ticket assignment rules, SLA deadlines, pagination, exportable reports, audit history, and automated API tests.
