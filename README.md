# CRM Dashboard

CRM dashboard backed by MySQL, JWT authentication, and Google Sheets sync.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your values.

3. Initialize the database:

```bash
npm run init-db
```

4. Start the app:

```bash
npm run start
```

## Default admin account

- Username: `admin`
- Password: `Admin@2026!`

Change the password after first login.

## Scripts

- `npm run start` - start the app
- `npm run dev` - run with nodemon
- `npm run init-db` - create the database schema and default admin
- `npm run sync` - sync Google Sheets data into MySQL

## Notes

- Keep `.env` and `credentials.json` out of version control.
- `npm run init-db` uses `DB_ROOT_USER` and `DB_ROOT_PASS` to create the schema and the runtime app user.
