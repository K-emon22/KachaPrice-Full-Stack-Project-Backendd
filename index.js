const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
const admin = require("firebase-admin");
const path = require("path");
const {log} = require("console");

const serviceAccount = require(path.join(
  __dirname,
  "./firebaseServiceAccount.json"
)); 
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 4000;

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};
app.use(cors(corsOptions));
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyFbToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({message: "Unauthorized: Token not provided"});
  }

  const token = authHeader.split(" ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    return res.status(401).send({message: "Unauthorized: Invalid token"});
  }
};

async function run() {
  try {
    await client.connect();
    const database = client.db("HatBajar");

    app.post("/create-payment-intent", async (req, res) => {
      try {
        const {price} = req.body;
        if (!price || price <= 0) {
          return res.status(400).send({message: "Invalid amount"});
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(price * 100), // convert to cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({clientSecret: paymentIntent.client_secret});
      } catch (error) {
        console.error(error);
        res.status(500).send({message: "Failed to create payment intent"});
      }
    });

    app.get("/", (req, res) => {
      res.send("✅ Backend is running");
    });

    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
    });
  } catch (error) {
    console.error(error);
  }
}

run().catch(console.dir);
