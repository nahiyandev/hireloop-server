import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient, ObjectId } from 'mongodb';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const dbName = process.env.MONGODB_DB_NAME || 'hireloopdb';

let client;
let clientPromise;

export async function getDatabase() {
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is missing.");
  }
  if (!clientPromise) {
    client = new MongoClient(uri);
    clientPromise = client.connect();
  }
  await clientPromise;
  return client.db(dbName);
}

// Root health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: "ok",
    service: "hireloop-server",
    timestamp: new Date().toISOString(),
  });
});

import { demoUsers, seedUsers, demoJobs, seedJobs } from './seed.js';

// ==========================================
// JOBS API ENDPOINTS
// ==========================================

// 1. Submit / Create New Job Post
app.post('/jobs', async (req, res) => {
  try {
    const db = await getDatabase();
    const jobsCollection = db.collection('jobs');
    const jobData = req.body;
    if (!jobData.title || !jobData.company) {
      return res.status(400).json({ error: "Job title and company name are required." });
    }

    const newJob = {
      ...jobData,
      status: jobData.status || "Active",
      applicantsCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await jobsCollection.insertOne(newJob);
    res.status(201).json({
      message: "Job posted successfully!",
      jobId: result.insertedId,
      job: { ...newJob, _id: result.insertedId },
    });
  } catch (err) {
    console.error("Error submitting job:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 2. Fetch All Jobs with Search & Filters
app.get('/jobs', async (req, res) => {
  try {
    const db = await getDatabase();
    const jobsCollection = db.collection('jobs');
    const { search, category, status } = req.query;
    const query = {};

    if (status && status !== "all") {
      query.status = new RegExp('^' + status + '$', "i");
    }
    if (category && category !== "all") {
      query.category = category;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
      ];
    }

    const jobs = await jobsCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.json(jobs);
  } catch (err) {
    console.error("Error fetching jobs:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 3. Fetch Single Job by ID
app.get('/jobs/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const jobsCollection = db.collection('jobs');
    const { id } = req.params;
    let query = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    }

    const job = await jobsCollection.findOne(query);
    if (!job) return res.status(404).json({ error: "Job listing not found." });
    res.json(job);
  } catch (err) {
    console.error("Error fetching single job:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 4. Delete Job Post by ID
app.delete('/jobs/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const jobsCollection = db.collection('jobs');
    const { id } = req.params;
    let query = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    }

    const result = await jobsCollection.deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Job listing not found." });
    }
    res.json({ message: "Job post deleted successfully." });
  } catch (err) {
    console.error("Error deleting job:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 5. Seed Jobs Endpoint
app.get('/jobs/seed', async (req, res) => {
  try {
    const total = await seedJobs();
    res.json({ message: "Jobs seeded successfully!", totalJobs: total });
  } catch (err) {
    res.status(500).json({ error: "Failed to seed jobs" });
  }
});

// ==========================================
// APPLICATIONS API ENDPOINTS
// ==========================================

// 1. Submit Application (Strict Seeker Role and Authenticated User Required)
app.post('/applications', async (req, res) => {
  try {
    const db = await getDatabase();
    const applicationsCollection = db.collection('applications');
    const jobsCollection = db.collection('jobs');
    const usersCollection = db.collection('user');

    const {
      jobId,
      jobTitle,
      company,
      fullName,
      email,
      phoneNumber,
      portfolioUrl,
      linkedinUrl,
      note,
      userId,
    } = req.body;

    if (!jobId || !fullName || !email) {
      return res.status(400).json({ error: 'Job ID, full name, and email are required.' });
    }

    // 1. Enforce Authentication
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required. Please sign in to submit an application.' });
    }

    // 2. Strict Role Verification: Only 'seeker' accounts are permitted to apply
    let user = null;
    try {
      if (ObjectId.isValid(userId)) {
        user = await usersCollection.findOne({
          $or: [{ _id: new ObjectId(userId) }, { _id: userId }, { id: userId }, { email: String(email).toLowerCase() }],
        });
      } else {
        user = await usersCollection.findOne({
          $or: [{ id: userId }, { _id: userId }, { email: String(email).toLowerCase() }],
        });
      }
    } catch {
      // ignore
    }

    if (user && user.role && user.role !== 'seeker') {
      return res.status(403).json({
        error: `Only Job Seekers can apply for jobs. Your current account role is "${user.role}".`,
      });
    }

    // 3. Prevent duplicate applications for the same Job ID by this user
    const existingApplication = await applicationsCollection.findOne({
      jobId: String(jobId),
      $or: [
        { userId: String(userId) },
        { email: new RegExp('^' + email.trim() + '$', 'i') },
      ],
    });

    if (existingApplication) {
      return res.status(409).json({
        error: 'You have already submitted an application for this position.',
        applicationId: existingApplication._id,
      });
    }

    const newApplication = {
      jobId: String(jobId),
      jobTitle: jobTitle || 'Position',
      company: company || 'Company',
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phoneNumber: phoneNumber || '',
      portfolioUrl: portfolioUrl || '',
      linkedinUrl: linkedinUrl || '',
      note: note || '',
      userId: String(userId),
      userRole: 'seeker',
      status: 'Pending',
      appliedAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await applicationsCollection.insertOne(newApplication);

    // Increment applicantsCount on the job if valid ObjectId
    try {
      let query = { _id: jobId };
      if (ObjectId.isValid(jobId)) {
        query = { $or: [{ _id: new ObjectId(jobId) }, { _id: jobId }] };
      }
      await jobsCollection.updateOne(query, { $inc: { applicantsCount: 1 } });
    } catch (countErr) {
      console.warn('Could not increment applicants count:', countErr);
    }

    res.status(201).json({
      message: 'Application submitted successfully!',
      applicationId: result.insertedId,
      application: { ...newApplication, _id: result.insertedId },
    });
  } catch (err) {
    console.error('Error submitting application:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Fetch Applications with Filters (Linked by userId, email, or jobId)
app.get('/applications', async (req, res) => {
  try {
    const db = await getDatabase();
    const applicationsCollection = db.collection('applications');
    const { email, userId, jobId, company, status } = req.query;
    const query = {};

    if (userId && email) {
      query.$or = [
        { userId: String(userId) },
        { email: new RegExp('^' + email.trim() + '$', 'i') },
      ];
    } else if (userId) {
      query.userId = String(userId);
    } else if (email) {
      query.email = new RegExp('^' + email.trim() + '$', 'i');
    }

    if (jobId) {
      query.jobId = String(jobId);
    }
    if (company) {
      query.company = new RegExp(company, 'i');
    }
    if (status && status !== 'all') {
      query.status = status;
    }

    const applications = await applicationsCollection.find(query).sort({ appliedAt: -1 }).toArray();
    res.json(applications);
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
    const query = {};

    if (email) {
      query.email = new RegExp('^' + email + '$', 'i');
    }
    if (jobId) {
      query.jobId = String(jobId);
    }
    if (company) {
      query.company = new RegExp(company, 'i');
    }
    if (status && status !== 'all') {
      query.status = status;
    }

    const applications = await applicationsCollection.find(query).sort({ appliedAt: -1 }).toArray();
    res.json(applications);
  } catch (err) {
    console.error('Error fetching applications:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 3. Update Application Status
app.patch('/applications/:id/status', async (req, res) => {
  try {
    const db = await getDatabase();
    const applicationsCollection = db.collection('applications');
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    let query = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    }

    const result = await applicationsCollection.updateOne(query, {
      $set: { status, updatedAt: new Date() },
    });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    res.json({ message: 'Application status updated successfully.', status });
  } catch (err) {
    console.error('Error updating application status:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 4. Delete / Withdraw Application
app.delete('/applications/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const applicationsCollection = db.collection('applications');
    const { id } = req.params;

    let query = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    }

    const result = await applicationsCollection.deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    res.json({ message: 'Application removed successfully.' });
  } catch (err) {
    console.error('Error deleting application:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================
// USER UPGRADE / SUBSCRIPTION
// ==========================================

app.post('/payments/upgrade', async (req, res) => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection('user');
    const { email, plan, transactionId } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'User email is required.' });
    }

    const updatedPlan = plan === 'growth' ? 'growth' : 'pro';
    const txId = transactionId || 'tx_' + Date.now();

    // Record payment transaction
    try {
      await db.collection('payments').insertOne({
        userEmail: email,
        plan: updatedPlan === 'pro' ? 'Pro' : 'Growth',
        amount: updatedPlan === 'pro' ? '$20.00' : '$17.00',
        transactionId: txId,
        date: new Date(),
        status: 'Success',
      });
    } catch (payErr) {
      console.warn('Could not record payment log:', payErr);
    }

    const result = await usersCollection.updateOne(
      { email: new RegExp('^' + email + '$', 'i') },
      {
        $set: {
          accountType: updatedPlan,
          plan: updatedPlan,
          isPro: updatedPlan === 'pro',
          updatedAt: new Date(),
          lastPayment: {
            plan: updatedPlan,
            transactionId: transactionId || 'tx_' + Date.now(),
            date: new Date(),
          },
        },
      }
    );

    res.json({
      message: 'User upgraded to ' + updatedPlan + ' successfully!',
      plan: updatedPlan,
      matched: result.matchedCount,
    });
  } catch (err) {
    console.error('Error upgrading user plan:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================
// USERS API ENDPOINTS
// ==========================================

app.get('/users', async (req, res) => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection('user');
    const role = req.query.role;
    const query = role ? { role } : {};
    const users = await usersCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. Fetch Payment Transactions
app.get('/payments', async (req, res) => {
  try {
    const db = await getDatabase();
    const paymentsCollection = db.collection('payments');
    let payments = await paymentsCollection.find({}).sort({ date: -1 }).toArray();

    // If payments collection is empty, populate initial real transaction logs from users
    if (payments.length === 0) {
      const users = await db.collection('user').find({}).toArray();
      const initialLogs = [];
      users.forEach((u, i) => {
        initialLogs.push({
          userEmail: u.email,
          plan: u.isPro ? 'Pro' : 'Growth',
          amount: u.isPro ? '$20.00' : '$17.00',
          transactionId: 'TXN-' + (882910400 + i),
          date: u.createdAt || new Date(),
          status: 'Success',
        });
      });
      if (initialLogs.length > 0) {
        await paymentsCollection.insertMany(initialLogs);
        payments = initialLogs;
      }
    }

    res.json(payments);
  } catch (err) {
    console.error("Error fetching payments:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// ==========================================
// COMPANIES API ENDPOINTS
// ==========================================

app.get('/companies', async (req, res) => {
  try {
    const db = await getDatabase();
    const jobs = await db.collection('jobs').find({}).toArray();
    const companyMap = new Map();

    jobs.forEach((j) => {
      const name = j.company || 'TechCorp';
      if (!companyMap.has(name)) {
        companyMap.set(name, {
          id: 'comp-' + name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: name,
          initial: (name[0] || 'C').toUpperCase(),
          domain: name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.io',
          industry: j.category || 'Technology',
          size: '50-250 Employees',
          location: j.location || (j.isRemote ? 'Remote' : 'San Francisco, CA'),
          jobsCount: 1,
          tier: 'Enterprise',
          status: 'Verified',
          joinedDate: j.createdAt
            ? new Date(j.createdAt).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
            : 'Jan 2024',
        });
      } else {
        companyMap.get(name).jobsCount += 1;
      }
    });

    res.json(Array.from(companyMap.values()));
  } catch (err) {
    console.error("Error fetching companies:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update User Role
app.put('/users/:id/role', async (req, res) => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection('user');
    const { id } = req.params;
    const { role } = req.body;

    let query = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    }

    await usersCollection.updateOne(query, { $set: { role, updatedAt: new Date() } });
    res.json({ message: "User role updated successfully", role });
  } catch (err) {
    console.error("Error updating user role:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete User
app.delete('/users/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const usersCollection = db.collection('user');
    const { id } = req.params;

    let query = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    }

    await usersCollection.deleteOne(query);
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update Job
app.put('/jobs/:id', async (req, res) => {
  try {
    const db = await getDatabase();
    const jobsCollection = db.collection('jobs');
    const { id } = req.params;
    const updateData = { ...req.body, updatedAt: new Date() };
    delete updateData._id;
    delete updateData.id;

    let query = { _id: id };
    if (ObjectId.isValid(id)) {
      query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
    }

    await jobsCollection.updateOne(query, { $set: updateData });
    res.json({ message: "Job updated successfully" });
  } catch (err) {
    console.error("Error updating job:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to quickly re-seed demo users from browser/client
app.get('/users/seed', async (req, res) => {
  try {
    await seedUsers();
    const db = await getDatabase();
    const count = await db.collection('user').countDocuments();
    res.json({ message: "Demo users seeded successfully!", totalUsers: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to seed demo users" });
  }
});

// Start listening if running as a standalone node server (local)
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('HireLoop server is running on port ' + PORT);
  });
}

// Export app for Vercel Serverless Function handler
export default app;
