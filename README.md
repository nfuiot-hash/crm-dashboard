# CRM Dashboard

CRM dashboard with JWT authentication, MySQL storage, and Google Sheets sync. The project is currently structured for:

- static HTML pages
- Node.js + Express API
- MySQL database
- optional Nginx reverse proxy in front of the app

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy environment variables

```bash
copy .env.example .env
```

3. Fill in `.env`

- `JWT_SECRET`
- `DB_ROOT_USER` / `DB_ROOT_PASS`
- `DB_USER` / `DB_PASS`
- `SPREADSHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_JSON` or `credentials.json`

4. Initialize the database

```bash
npm run init-db
```

5. Start the app

```bash
npm run start
```

## Default URLs

- Home: `http://localhost:3000/`
- CRM: `http://localhost:3000/crm.html`
- Inventory: `http://localhost:3000/inventory.html`
- Login: `http://localhost:3000/login.html`
- Admin: `http://localhost:3000/admin.html`

## Default admin account

- Username: `admin`
- Password: `Admin@2026!`

Change the password immediately after first login.

## Scripts

- `npm run start` - start the app
- `npm run dev` - run with nodemon
- `npm run init-db` - create schema and default admin
- `npm run sync` - sync Google Sheets into MySQL

## Deployment target

Recommended production layout:

```text
Browser
  -> HTTPS
Nginx
  -> static HTML pages
  -> /api -> Node.js Express
Node.js Express
  -> MySQL
```

## Production checklist

1. Set `NODE_ENV=production`
2. Use a strong `JWT_SECRET`
3. Keep `.env` and `credentials.json` outside version control
4. Change the default admin password
5. Run the app with PM2 or another process manager
6. Put Nginx in front of the app for HTTPS
7. Expose only ports `80` and `443` publicly
8. Do not expose MySQL directly to the internet
9. Back up MySQL regularly
10. Verify Google Sheets sync on the server

## PM2

An `ecosystem.config.js` file is included. Example:

```bash
pm2 start ecosystem.config.js
pm2 save
```

## Nginx example

Example reverse proxy idea:

```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

If you later separate static pages from the Node server, Nginx can serve the HTML directly and keep `/api` proxied to Express.
