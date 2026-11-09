# ⚡ HireLoop — Backend REST API Service

Backend REST API for **HireLoop**, providing high-performance endpoints for job postings, candidate applications, user management, companies, and payments.

- **Live Production URL**: `https://hireloop-server-green-phi.vercel.app`
- **Database**: MongoDB Atlas

---

## 🛠️ Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Framework**: Express 5
- **Database**: MongoDB Driver (`mongodb` v7.8.0)
- **Deployment**: Vercel Serverless Functions

---

## 🔌 API Endpoints Reference

### 1. Health & Server Status
- `GET /` — Server status, live connectivity check, and version info.

### 2. Jobs Management
- `GET /jobs` — Fetch all job listings with support for query filters:
  - `?search=<term>`: Case-insensitive regex search on title, company, and location.
  - `?category=<category>`: Filter by industry/category.
  - `?type=<type>`: Filter by employment type (`Full-time`, `Contract`, `Freelance`, `Part-time`).
  - `?workplace=<policy>`: Filter remote or on-site opportunities.
  - `?status=<status>`: Filter by job listing status (`active`, `closed`).
- `GET /jobs/:id` — Fetch single job details by MongoDB `ObjectId` or string ID.
- `POST /jobs` — Create a new job listing.
- `PUT /jobs/:id` — Update an existing job listing.
- `DELETE /jobs/:id` — Permanently delete a job listing.
- `GET /jobs/seed` — Seed or verify initial database records.

### 3. Applications
- `GET /applications` — Fetch job applications (filterable by `jobId`, `userId`, `email`, or `company`).
- `POST /applications` — Submit a candidate job application:
  - Fields: `jobId`, `jobTitle`, `company`, `fullName`, `email`, `phoneNumber`, `portfolioUrl`, `linkedinUrl`, `note`, `userId`.
- `PATCH /applications/:id/status` & `PUT /applications/:id/stage` — Update candidate pipeline stage (`New`, `Reviewing`, `Interviewing`, `Shortlisted`, `Offer`, `Rejected`).

### 4. User Administration
- `GET /users` — Retrieve all users from the `user` collection with role, creation date, and status.
- `PUT /users/:id/role` — Update a user's role (`seeker`, `recruiter`, `admin`).
- `DELETE /users/:id` — Permanently delete a user profile.

### 5. Companies & Payments
- `GET /companies` — Dynamically aggregates all unique companies from active jobs collection with location, industry, and total posted jobs.
- `GET /payments` — Returns payment transaction records, auto-synced with initial user upgrades if empty.
- `POST /payments/upgrade` — Record upgraded Pro subscription checkouts with transaction IDs.

---

## 🚀 Local Development Setup

### 1. Prerequisites
- Node.js >= 20.0.0
- MongoDB URI (Atlas or Local)

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
DB_NAME=hireloop
```

### 3. Installation & Run
```bash
# Install dependencies
npm install

# Start development server with auto-reload
npm run dev

# Seed database with sample data
npm run seed
```

The API will be accessible at [http://localhost:5000](http://localhost:5000).

---

## 🚀 Deployment (Vercel)

Configured with `vercel.json` for serverless API execution:
```json
{
  "version": 2,
  "builds": [
    {
      "src": "index.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "index.js"
    }
  ]
}
```
Deploy instantly using the Vercel CLI or via GitHub integration:
```bash
vercel --prod
```
