# Deploying to Railway

This project deploys as **two services** on Railway:
1. **Backend** (Node.js + serves built React frontend)
2. **Python Analytics** (Flask ML microservice)

---

## Step 1 — Push to GitHub first

Railway deploys from GitHub. Make sure the repo is pushed.

---

## Step 2 — Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **New Project** → **Deploy from GitHub Repo**
3. Select your repo

---

## Step 3 — Add PostgreSQL

In your Railway project:
1. Click **+ New** → **Database** → **PostgreSQL**
2. Railway automatically sets `DATABASE_URL` in your services

---

## Step 4 — Configure the Backend service

Set these environment variables in Railway (Settings → Variables):

```
JWT_SECRET=<generate with: openssl rand -hex 64>
NODE_ENV=production
PORT=3001
PYTHON_SERVICE_URL=<URL of your Python service after it's deployed>
```

For the build command: Railway will use `Dockerfile.backend` automatically.
Or set manually:
- **Build**: `cd client && npm install && npm run build && cd .. && npm install`
- **Start**: `node server/src/index.js`

---

## Step 5 — Add the Python service

1. In your Railway project, click **+ New** → **GitHub Repo** (same repo)
2. Set the root directory to `python-service/`
3. Set:
   - **Build**: `pip install -r requirements.txt`
   - **Start**: `python app.py`
4. Set environment variable: `PORT=8000`

---

## Step 6 — Link the services

Once the Python service is deployed, copy its Railway URL and set it on the Backend service:

```
PYTHON_SERVICE_URL=https://your-python-service.up.railway.app
```

---

## Step 7 — Run the database migration

Use Railway's CLI or the web shell:

```bash
# Install Railway CLI
npm install -g @railway/cli

# Open a shell on the backend service
railway run node server/src/db/migrate.js
railway run node server/src/db/seed.js
```

---

## Environment Variables Summary

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Backend | Auto-set by Railway PostgreSQL plugin |
| `JWT_SECRET` | Backend | Run `openssl rand -hex 64` to generate |
| `NODE_ENV` | Backend | Set to `production` |
| `PORT` | Both | Railway sets this automatically |
| `PYTHON_SERVICE_URL` | Backend | URL of the deployed Python service |

---

## Notes

- The Node backend serves the built React frontend as static files in production
- Both services can be on Railway's free Hobby plan
- Railway provides HTTPS automatically
- Set up a custom domain in Railway → Settings → Networking
