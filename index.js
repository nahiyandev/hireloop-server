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

const database = client.db('hireloopdb');
const usersCollection = database.collection('user');


app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/users', async (req, res) => {
  try {
    const users = await usersCollection.find({}).toArray();
    const result = await Cursor.toArray();
    res.json(users);
    } catch (err) {
    console.error("Error fetching users:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
