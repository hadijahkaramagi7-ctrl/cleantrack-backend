# CleanTrack Uganda Backend

CleanTrack Uganda is a student-learning waste management API built with Node.js, Express.js, MariaDB/MySQL, JWT authentication, bcrypt password hashing, and Multer image uploads.

## Tech Stack

- Node.js and Express.js for the API server
- MariaDB/MySQL for persistent data
- `mysql2/promise` for database queries
- JWT for protected routes
- bcrypt for password hashing
- Multer for pickup and proof photo uploads

## Folder Structure

- `config/db.js` creates the MariaDB connection pool.
- `controllers/` contains request logic and database queries.
- `middleware/` contains JWT authentication, role checks, and upload configuration.
- `routes/` maps API URLs to controller functions.
- `uploads/` stores uploaded pickup and proof photos.
- `database/schema.sql` creates tables.
- `database/seed.sql` inserts demo learning data.
- `server.js` configures Express and mounts all route files.

## Database Setup

1. Install and start MariaDB/MySQL.
2. Create or choose a database user with permission to create databases.
3. Copy the environment file:
   ```bash
   cp .env.example .env
   ```
4. Update `.env` with your real database credentials.
5. Create the schema and seed the demo records:
   ```bash
   npm run db:setup
   ```

For the default local setup used in this project, the MariaDB/MySQL username and password are both `root`:

```env
DB_USER=root
DB_PASSWORD=root
```

`npm run db:setup` runs both `database/schema.sql` and `database/seed.sql`. The schema file recreates the `cleantrack_uganda` database, so do not run it against data you need to keep.

Manual alternative:

```bash
mysql -u your_user -p < database/schema.sql
mysql -u your_user -p cleantrack_uganda < database/seed.sql
```

## Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Important values:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` connect to MariaDB/MySQL.
- `JWT_SECRET` signs login tokens.
- `FRONTEND_URL` controls CORS access from the React app.

## Run Backend

```bash
npm install
cp .env.example .env
npm run db:setup
npm run dev
```

The API runs at `http://localhost:5000`.

If port `5000` is already in use, change `PORT` in `.env`, for example:

```env
PORT=5002
```

Then update the frontend `VITE_API_URL` to match.

Quick health check:

```bash
curl http://localhost:5000/
```

Expected response:

```json
{ "message": "CleanTrack Uganda API is running" }
```

## CORS Setup

The backend allows the default Vite frontend origins:

- `http://localhost:5173`
- `http://127.0.0.1:5173`
- `http://localhost:5174`
- `http://127.0.0.1:5174`

If your frontend runs somewhere else, set `FRONTEND_URL` in `.env`, then restart the backend.

## API Endpoints

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

Customer locations:

- `POST /api/locations`
- `GET /api/locations/my-locations`
- `GET /api/locations/:id`
- `PUT /api/locations/:id`
- `DELETE /api/locations/:id`

Pickup requests:

- `POST /api/pickups`
- `GET /api/pickups/my-requests`
- `GET /api/pickups/:id`
- `PUT /api/pickups/:id/cancel`
- `GET /api/pickups/pending/all`

Assignments:

- `POST /api/assignments`
- `GET /api/assignments/driver/my-jobs`
- `GET /api/assignments/company/my-jobs`
- `PUT /api/assignments/:id/status`
- `PUT /api/assignments/:id/complete`
- `PUT /api/assignments/:id/failed`

Companies, trucks, categories, feedback, and admin routes are implemented in their matching `routes/` and `controllers/` files.

## Default Accounts

All seed accounts use password `password123`.

- Admin: `admin@cleantrack.ug`
- Customer: `customer@cleantrack.ug`
- Driver: `driver1@cleantrack.ug`
- Manager: `manager@greenroute.ug`

## JWT Authentication

When a user logs in, the backend signs a JWT containing the user id and role. Protected routes use `authMiddleware.js` to verify the token, load the current user from the database, and reject inactive accounts.

## Role-Based Access Control

`roleMiddleware.js` checks `req.user.role` before a request reaches a controller. For example, customers can report bins, drivers can update assigned jobs, managers can assign pickups, and admins can view system-wide records.

## Image Uploads

Multer stores customer bin photos in `uploads/pickup-photos/` and driver proof photos in `uploads/proof-photos/`. The backend serves `/uploads` statically so React can display saved images.

## How the Frontend Talks to the Backend

The React frontend uses Axios service files. After login, the JWT is stored in `localStorage`; the Axios interceptor attaches it as `Authorization: Bearer <token>` for protected API requests.

## Repository Notes

This folder is its own Git repository. `node_modules/`, `.env`, generated logs, and uploaded photos are ignored. The empty upload folders are kept with `.gitkeep` files so students can see where images are stored.

---

## Assignment Extensions (Karamagi Hadijah — M26B13/032)

This fork adds three new features on top of the original CleanTrack backend.

### 1. Favourite Locations

- New column `is_favourite` on `customer_locations` (migration `001_add_is_favourite.sql`).
- Endpoint: `PUT /api/locations/:id/favourite` — toggles favourite for the logged-in customer; only one favourite per customer at a time.

### 2. Notification Centre

- Endpoints:
  - `GET /api/notifications/my-notifications`
  - `GET /api/notifications/unread-count`
  - `PUT /api/notifications/:id/read`
  - `PUT /api/notifications/mark-all-read`
- Notifications are auto-created when a driver updates a pickup status.
- Uses the existing `notifications` table (no schema change).

### 3. Recurring Pickup Schedules

- New table `pickup_schedules` (migration `002_create_pickup_schedules.sql`).
- Endpoints:
  - `POST /api/schedules`
  - `GET /api/schedules/my-schedules`
  - `PUT /api/schedules/:id/pause`
  - `PUT /api/schedules/:id/resume`
  - `DELETE /api/schedules/:id`
- Background job (`scripts/runSchedules.js`) runs every 60 seconds, creates a new pickup request for each due schedule, sends a notification, and advances `next_run_at` by 1 or 2 weeks.

### Running the migrations

After `npm run db:setup`, run:
