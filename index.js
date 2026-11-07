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

app.get('/', (req, res) => {
  res.send('Hello World!');
});

import { demoUsers, seedUsers } from './seed.js';

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
