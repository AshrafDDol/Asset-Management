# IMS Production Deployment — aaPanel (no SSH)

Everything below is done in the **aaPanel web UI**. Where a command is needed,
use aaPanel's built-in **Terminal** (left menu → Terminal). No SSH client required.

Stack: **Node 20 · MySQL 8 · Prisma · PM2 · Nginx** (all installed from the aaPanel App Store).

```
Browser / Handheld ──► Nginx :80/:443 ──┬──► /api/*  → Express (PM2) 127.0.0.1:4000
                                        └──► /*      → web-admin dist/ (React SPA)
```

Nginx serves the frontend and proxies the API on the same domain, so the browser
never makes a cross-origin call and port 4000 is never exposed.

| Folder in repo | What it is | Where it goes on the server |
|---|---|---|
| `server/`    | Express + Prisma API  | `/www/wwwroot/ims/server` (run by PM2) |
| `web-admin/` | React + Vite frontend | `/www/wwwroot/ims-web` (static files, served by Nginx) |

---

## 0. Decide before you start

| Decision | Why it matters |
|---|---|
| **Domain / subdomain** (e.g. `ims.client.com`) | Required for a free Let's Encrypt SSL certificate. Without it the system runs on plain `http://<IP>` and login tokens travel unencrypted. |
| **Branch** | Production is deployed from `dev2`. |
| **First admin password** | There is no seed script — you create the first admin by hand (§5). Pick a strong one. |

> ⚠️ Never put server passwords, database passwords or GitHub tokens into docs,
> chat or commits. If one has been shared that way, rotate it.

---

## 1. Install software (App Store)

aaPanel → **App Store** → install:

1. **Nginx** (latest stable)
2. **MySQL 8.0**
3. **PM2 Manager** — this also installs Node.js. In its settings choose **Node 20 LTS**.
   (Newer aaPanel versions call this *Website → Node Project* / *Node.js version manager*; either works, both use PM2.)

Check in Terminal:
```bash
node -v      # v20.x
npm -v
pm2 -v
git --version   # if missing: apt install -y git   (or yum install -y git)
```

**Firewall** (aaPanel → Security): allow only 80, 443 and the aaPanel port.
Do **not** open 4000 (API) or 3306 (MySQL) — both are reached via localhost only.

---

## 2. Create the database

aaPanel → **Databases** → **Add database**

| Field | Value |
|---|---|
| Database name | `ims_db` |
| Username | `ims_user` |
| Password | click *generate* (aaPanel creates a random one) — copy it |
| Access permission | **Local server** |
| Charset | `utf8mb4` |

---

## 3. Get the code onto the server

The repo is private, so the server needs read access. Easiest safe option is a
**GitHub deploy key** (read-only, this repo only):

```bash
ssh-keygen -t ed25519 -C "ims-deploy" -f ~/.ssh/ims_deploy -N ""
cat ~/.ssh/ims_deploy.pub
```
GitHub → repo → Settings → **Deploy keys** → Add → paste the key (leave *write access* off). Then:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github-ims
  HostName github.com
  User git
  IdentityFile ~/.ssh/ims_deploy
EOF

cd /www/wwwroot
git clone -b dev2 git@github-ims:Evolve-Technologies-Sdn-Bhd/Inventory-Management-System.git ims
```
The whole repo is now at `/www/wwwroot/ims`; the backend is `/www/wwwroot/ims/server`.
Only `server/` is used on the server — the frontend is built on your PC (§6).

> Simpler alternative with no git on the server: zip the `server/` folder on your PC
> (**without** `node_modules`, `dist`, `.env`), upload via aaPanel **Files**, and extract
> to `/www/wwwroot/ims/server`. You lose `git pull` for updates, though.

The rest of this guide assumes the backend is at **`/www/wwwroot/ims/server`**.

---

## 4. Backend

### 4a. Environment file

aaPanel → **Files** → `/www/wwwroot/ims/server` → New file `.env`:

```ini
DATABASE_URL="mysql://ims_user:DB_PASSWORD_FROM_STEP_2@127.0.0.1:3306/ims_db"

# Generate in Terminal:  openssl rand -base64 48
JWT_SECRET=REPLACE_WITH_LONG_RANDOM_STRING
JWT_EXPIRES_IN=7d

PORT=4000
NODE_ENV=production
```

If the DB password contains `@ : / # ?` etc., URL-encode those characters in
`DATABASE_URL` (or regenerate a password without them).

Lock it down:
```bash
chmod 600 /www/wwwroot/ims/server/.env
```

### 4b. Install, migrate, build

```bash
cd /www/wwwroot/ims/server
npm ci                     # needs devDependencies: typescript + prisma CLI
npx prisma generate
npx prisma migrate deploy  # applies prisma/migrations/* in order
npm run build              # tsc → dist/server.js
```

Use **`prisma migrate deploy`**, not `migrate dev` (that one can reset the DB) and
not `db push` (this project has a migration history — use it).

Expected: `All migrations have been successfully applied.`

### 4c. Start with PM2

```bash
cd /www/wwwroot/ims/server
pm2 start dist/server.js --name ims-server --cwd /www/wwwroot/ims/server
pm2 logs ims-server --lines 20     # expect: "Evolve Inventory Management API is running on port 4000"
pm2 save
pm2 startup                        # run the command it prints, so it survives reboot
```

`--cwd` matters: the app loads `.env` from the working directory. Started from
anywhere else it boots without `DATABASE_URL`/`JWT_SECRET`.

(You can do the same through the PM2 Manager UI: *Add project* → start file
`/www/wwwroot/ims/server/dist/server.js`, run dir `/www/wwwroot/ims/server`,
name `ims-server`.)

Sanity check:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:4000/api/auth/login
```
`400` = alive.

---

## 5. Create the first admin user

The database is empty after migrating and nobody can log in yet. There is
deliberately **no seed** — create just the first admin:

```bash
cd /www/wwwroot/ims/server
npm run create-admin
```

It asks for username, full name, email and password (typed hidden), creates the
`Admin` role if it doesn't exist, and creates that one user. It never deletes
anything; if the username or email already exists it stops and changes nothing,
so running it twice is harmless.

Log in with that username (or email) after §7. Create departments, locations,
categories, roles and real staff accounts from inside the app.

---

## 6. Frontend — build on your PC, upload the output

### 6a. Set the API URL for production

`web-admin/src/api/axios.ts` falls back to `http://localhost:4000/api` when
`VITE_API_URL` is empty — so an empty value **breaks** production. Use a relative path.

This is already set in the repo's `web-admin/.env.production`, which Vite uses
automatically for `npm run build` (your local `.env` is still used for `npm run dev`):
```ini
VITE_API_URL=/api
```

`VITE_*` values are baked in at build time. If this is wrong the build still
succeeds and the app fails in the browser — always check it.

### 6b. Build

```powershell
cd web-admin
npm ci
npm run build
```
Output is `web-admin/dist/` (`index.html` + `assets/`).

### 6c. Create the site and upload

aaPanel → **Website** → **Add site**

| Field | Value |
|---|---|
| Domain | `ims.client.com` (or the server IP if no domain) |
| Root directory | `/www/wwwroot/ims-web` |
| PHP version | **Static / Pure static** |
| Database / FTP | none |

Then zip the **contents** of `dist/` on your PC, open aaPanel **Files** →
`/www/wwwroot/ims-web`, delete aaPanel's default `index.html` / `404.html`,
upload the zip and **Extract** there. You should end up with
`/www/wwwroot/ims-web/index.html` and `/www/wwwroot/ims-web/assets/`.

---

## 7. Nginx (site config)

aaPanel → **Website** → your site → **Config** (or *Conf*).

### 7a. SPA routing
Go to the **URL rewrite** tab and enter:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```
Without this, refreshing any page other than `/` (e.g. `/assets/123`) returns 404.

### 7b. API reverse proxy
In the **Config file** tab, add this inside the `server { ... }` block, **above**
the `include ... rewrite ...conf;` line:

```nginx
    # Asset import posts rows as JSON — keep large uploads from 413-ing at Nginx
    client_max_body_size 20M;

    location ^~ /api/ {
        proxy_pass         http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;   # bulk imports can exceed the 60s default
        proxy_send_timeout 300s;
    }
```

`^~` is important: aaPanel's default config has regex locations for `.js`/`.css`
caching, and `^~` stops those from catching API URLs.

Save — aaPanel tests and reloads Nginx. Don't use the separate *Reverse proxy* tab
for this; it proxies the whole site, which would hide the frontend.

---

## 8. HTTPS (needs a domain)

aaPanel → Website → your site → **SSL** → **Let's Encrypt** → tick the domain → Apply.
Then enable **Force HTTPS**. Renewal is automatic.

No code change is needed: the frontend uses a relative `/api`, so it follows
whatever scheme the page was loaded on.

---

## 9. Handheld app (InventoryMobile)

The backend URL is set **in the app** (RFID Settings screen), so no rebuild is needed.
On each device set it to:
```
https://ims.client.com/api        (or http://<SERVER_IP>/api without a domain)
```
The old `adb reverse` / `127.0.0.1:4000` setup is for development only.

---

## 10. Backups — set up on day one

aaPanel → **Cron** → Add task:

| Field | Value |
|---|---|
| Type | **Backup database** |
| Database | `ims_db` |
| Schedule | Daily, 02:00 |
| Keep latest | 14 |
| Backup to | Local disk **and** a remote storage (S3 / Google Drive / FTP via *App Store → storage plugins*) |

A backup that only lives on the server it protects is not a backup — configure the
remote target.

Test it once: run the task manually, then download the file from
aaPanel → Databases → `ims_db` → **Backup** and check it is not tiny/empty.

---

## 11. Updating later

**Always back up the DB first** (Databases → `ims_db` → Backup) if the release touches
`server/prisma/`.

### Backend
```bash
cd /www/wwwroot/ims && git pull origin dev2
cd /www/wwwroot/ims/server
npm ci
npx prisma generate
npx prisma migrate status    # shows which new migrations will run
npx prisma migrate deploy
npm run build
pm2 restart ims-server
pm2 logs ims-server --lines 20
```

### Frontend
1. On your PC: `git pull`, confirm `web-admin/.env.production` is `VITE_API_URL=/api`, `npm ci && npm run build`.
2. aaPanel Files → rename `/www/wwwroot/ims-web` to `ims-web.old` (rollback copy), create a fresh `ims-web`, upload + extract the new `dist` contents.
3. Hard-refresh the browser (Ctrl+Shift+R).

Nothing to restart for the frontend. Rollback = rename `ims-web.old` back.

Order: when a release changes both, deploy the **backend first**.

---

## 12. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login page loads, login fails with network error | Frontend built without `VITE_API_URL=/api` → it's calling `localhost:4000`. Rebuild. |
| `502 Bad Gateway` on `/api` | Backend not running: `pm2 status`, `pm2 logs ims-server`. |
| Backend log: `Environment variable not found: DATABASE_URL` | PM2 started from the wrong directory — `pm2 delete ims-server` and start again with `--cwd`. |
| 404 when refreshing a page | URL rewrite (§7a) missing. |
| `413 Request Entity Too Large` on asset import | Nginx `client_max_body_size` missing (§7b). Express itself accepts up to 10 MB. |
| `P1001 Can't reach database` | Wrong password / special chars not URL-encoded in `DATABASE_URL`. |
| Assets/locations page 500 with `Value '...' not found in enum` | New migrations not applied — run `npx prisma migrate deploy` (§11). |

---

## 13. Go-live checklist

- [ ] Ports 4000 and 3306 **not** open in aaPanel Security
- [ ] `.env` is `chmod 600`, `JWT_SECRET` random, DB password from aaPanel generator
- [ ] `prisma migrate deploy` reports all migrations applied
- [ ] `pm2 save` + `pm2 startup` done — test with a reboot from aaPanel
- [ ] First admin created with `npm run create-admin` and can log in; real staff accounts created
- [ ] `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4000/api/users` returns `401` (API requires login)
- [ ] Refresh on a deep link (not `/`) loads the app, not 404
- [ ] HTTPS enabled + Force HTTPS (if domain)
- [ ] Asset import tested with a realistic file
- [ ] Handheld devices pointed at the production `/api` URL
- [ ] Daily DB backup cron exists, with a remote target, and one manual backup verified
