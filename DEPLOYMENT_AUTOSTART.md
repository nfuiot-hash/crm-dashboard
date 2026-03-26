# Windows Auto-Start SOP

This project can auto-start the CRM app and Nginx after Windows sign-in.

## Files

- `scripts/start-crm-services.ps1`
- `scripts/start-crm-services.cmd`

## What the script does

1. Restores or starts `crm-dashboard` with PM2
2. Saves the PM2 process list if needed
3. Starts `C:\nginx\nginx.exe` if Nginx is not already running

## Manual test

Open PowerShell and run:

```powershell
cd "C:\Users\user\Desktop\Claude開發工具\crm-dashboard"
powershell -ExecutionPolicy Bypass -File ".\scripts\start-crm-services.ps1"
```

Then verify:

```powershell
pm2.cmd list
netstat -ano | findstr :3000
netstat -ano | findstr :80
```

## Add to Windows Startup folder

1. Press `Win + R`
2. Run:

```text
shell:startup
```

3. Create a shortcut in that folder pointing to:

```text
C:\Users\user\Desktop\Claude開發工具\crm-dashboard\scripts\start-crm-services.cmd
```

This will start the services after your Windows user signs in.

## Recommended later upgrade

For a more stable long-term setup, create a Windows Task Scheduler task with:

- Trigger: `At log on`
- Action: start `start-crm-services.cmd`
- Run with highest privileges: enabled

This is usually more reliable than a normal Startup shortcut.
