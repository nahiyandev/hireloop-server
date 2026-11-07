import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const client = new MongoClient(uri);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("MongoDB Connection Error:", err);
  }
}

await connectToMongoDB();

const dbName = process.env.MONGODB_DB_NAME || 'hireloopdb';
const database = client.db(dbName);
const usersCollection = database.collection('user');
const jobsCollection = database.collection('jobs');

app.get('/', (req, res) => {
  res.send('Hello World!');
});

import { demoUsers, seedUsers, demoJobs, seedJobs } from './seed.js';

// ==========================================
// JOBS API ENDPOINTS
// ==========================================

// 1. Submit / Create New Job Post
app.post('/jobs', async (req, res) => {
  try {
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
    const { search, category, status } = req.query;
    const query = {};

    if (status && status !== "all") {
      query.status = new RegExp(`^${status}$`, "i");
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
    const { id } = req.params;
    let query = { _id: id };
    try {
      const { ObjectId } = await import('mongodb');
      if (ObjectId.isValid(id)) {
        query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
      }
    } catch {}

    const job = await jobsCollection.findOne(query);
    if (!job) return res.status(404).json({ error: "Job listing not found." });
    res.json(job);
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 4. Delete Job Post by ID
app.delete('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let query = { _id: id };
    try {
      const { ObjectId } = await import('mongodb');
      if (ObjectId.isValid(id)) {
        query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
      }
    } catch {}

    const result = await jobsCollection.deleteOne(query);
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Job listing not found." });
    }
    res.json({ message: "Job post deleted successfully." });
  } catch (err) {
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

app.get('/users', async (req, res) => {
  try {
    const role = req.query.role;
    const query = role ? { role } : {};
    const users = await usersCollection.find(query).sort({ createdAt: -1 }).toArray();
    res.json(users);
  } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Endpoint to quickly re-seed demo users from browser/client
app.get('/users/seed', async (req, res) => {
  try {
    await seedUsers();
    const count = await usersCollection.countDocuments();
    res.json({ message: "25 Demo users seeded successfully!", totalUsers: count });
  } catch (err) {
    res.status(500).json({ error: "Failed to seed demo users" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
