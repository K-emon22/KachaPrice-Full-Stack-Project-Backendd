const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require(path.join(
  __dirname,
  "./firebaseServiceAccount.json"
));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const port = process.env.PORT || 3000;

// CORS options to allow only your frontend origin with credentials support
const corsOptions = {
  origin: "http://localhost:5174", // your frontend URL
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // allow cookies/auth headers
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

// Middleware to verify Firebase ID token
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

    // Collections
    const Users = database.collection("Users");
    const Payments = database.collection("payments");
    const Wishlist = database.collection("wishlist");
    const Reviews = database.collection("reviews");

    // Create Payment Intent
    app.post("/create-payment-intent", async (req, res) => {
      try {
        const {price} = req.body;

        if (!price || price <= 0) {
          return res.status(400).send({message: "Invalid amount"});
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(price * 100), // amount in cents
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({clientSecret: paymentIntent.client_secret});
      } catch (error) {
        console.error(error);
        res.status(500).send({message: "Failed to create payment intent"});
      }
    });

    // Save Payment Info
    app.post("/payments", async (req, res) => {
      try {
        const paymentInfo = req.body;

        if (!paymentInfo.transactionId || !paymentInfo.email) {
          return res.status(400).send({
            success: false,
            message: "Missing required payment fields",
          });
        }

        const result = await Payments.insertOne({
          ...paymentInfo,
          createdAt: new Date(),
        });

        res.send({
          success: true,
          message: "Payment recorded",
          id: result.insertedId,
        });
      } catch (error) {
        console.error("Payment save error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to save payment info",
        });
      }
    });

    // Get total payment amount
    app.get("/payments/total-amount", async (req, res) => {
      try {
        const totalResult = await Payments.aggregate([
          {
            $group: {
              _id: null,
              totalAmount: {$sum: "$amount"},
            },
          },
        ]).toArray();

        const totalAmount = totalResult[0]?.totalAmount || 0;

        res.status(200).json({totalAmount});
      } catch (error) {
        console.error("Failed to calculate total payment amount:", error);
        res.status(500).send({
          message: "Failed to calculate total payment amount",
        });
      }
    });

    // Add User
    app.post("/users", async (req, res) => {
      try {
        const newUser = {
          ...req.body,
          createdAt: new Date(),
        };
        const result = await Users.insertOne(newUser);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({message: "Failed to add user"});
      }
    });

    // Get All Products with filtering & sorting
    app.get("/allProduct", async (req, res) => {
      try {
        const {sort, search, from, to} = req.query;
        const filter = {role: "vendor"};

        if (search) {
          filter.$or = [
            {name: {$regex: search, $options: "i"}},
            {market: {$regex: search, $options: "i"}},
          ];
        }

        let results = await Users.find(filter).toArray();

        if (from || to) {
          const fromDate = from ? new Date(from) : null;
          const toDate = to ? new Date(to) : null;

          results = results.filter((item) => {
            const itemDate = new Date(item.createdAt);
            if (isNaN(itemDate)) return false;
            if (fromDate && itemDate < fromDate) return false;
            if (toDate && itemDate > toDate) return false;
            return true;
          });
        }

        if (sort) {
          results.sort((a, b) => {
            if (sort === "lowToHigh") return a.price - b.price;
            if (sort === "highToLow") return b.price - a.price;
            return 0;
          });
        }

        res.status(200).json(results);
      } catch (error) {
        res.status(500).send({message: "Failed to fetch products"});
      }
    });

    // Get price trend for a specific product by ID
    app.get("/price-trend/:id", async (req, res) => {
      const {id} = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({message: "Invalid ID format"});
      }

      try {
        const product = await Users.findOne(
          {_id: new ObjectId(id), role: "vendor"},
          {projection: {name: 1, prices: 1}}
        );

        if (!product) {
          return res.status(404).json({message: "Product not found"});
        }

        res.status(200).json(product);
      } catch (error) {
        console.error("Failed to get price trend:", error);
        res.status(500).json({message: "Internal server error"});
      }
    });

    // Get lowest six approved products by market
    app.get("/lowestSix", async (req, res) => {
      try {
        const pipeline = [
          {$match: {status: "approved"}},
          {$sort: {price: 1}},
          {
            $group: {
              _id: "$market",
              product: {$first: "$$ROOT"},
            },
          },
          {$sort: {"product.price": 1}},
          {$limit: 6},
          {$replaceRoot: {newRoot: "$product"}},
        ];

        const lowestSix = await Users.aggregate(pipeline).toArray();
        res.status(200).json(lowestSix);
      } catch (error) {
        res.status(500).json({message: "Failed to fetch products"});
      }
    });

    // Get product by id (protected)
    app.get("/product/:id", verifyFbToken, async (req, res) => {
      const {id} = req.params;
      try {
        const product = await Users.findOne({_id: new ObjectId(id)});
        if (!product) {
          return res.status(404).send({message: "Product not found"});
        }
        res.send(product);
      } catch (error) {
        res.status(500).send({message: "Failed to fetch product"});
      }
    });

    // Wishlist routes
    app.post("/wishlist", async (req, res) => {
      try {
        const wishlistData = req.body;

        const alreadyExists = await Wishlist.findOne({
          userEmail: wishlistData.userEmail,
          productId: wishlistData.productId,
        });

        if (alreadyExists) {
          return res.status(409).send({message: "Product already in wishlist"});
        }

        const result = await Wishlist.insertOne({
          ...wishlistData,
          createdAt: new Date(),
        });

        res.status(201).send({
          message: "Added to watchlist",
          insertedId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({message: "Failed to add to watchlist"});
      }
    });

    app.get("/wishlist/:email", async (req, res) => {
      const {email} = req.params;
      try {
        const wishlistItems = await Wishlist.find({userEmail: email}).toArray();
        res.send(wishlistItems);
      } catch (error) {
        res.status(500).send({message: "Error fetching wishlist"});
      }
    });

    // DELETE from wishlist using email and productId
    app.delete(
      "/wishlist/:email/:productId",
      verifyFbToken,
      async (req, res) => {
        const {email, productId} = req.params;

        try {
          if (req.user.email !== email) {
            return res.status(403).json({error: "Unauthorized request"});
          }

          const result = await Wishlist.deleteOne({
            userEmail: email,
            productId: productId,
          });

          if (result.deletedCount > 0) {
            return res
              .status(200)
              .json({message: "Item removed from wishlist"});
          } else {
            return res.status(404).json({error: "Item not found in wishlist"});
          }
        } catch (err) {
          console.error("Error deleting wishlist item:", err);
          return res.status(500).json({error: "Server error during deletion"});
        }
      }
    );

    // Reviews routes
    app.post("/reviews", verifyFbToken, async (req, res) => {
      try {
        const review = req.body;
        if (
          !review.productId ||
          !review.userEmail ||
          !review.rating ||
          !review.comment
        ) {
          return res.status(400).send({message: "Missing review fields"});
        }

        const result = await Reviews.insertOne({
          ...review,
          createdAt: new Date(),
        });

        res.status(201).send(result.ops ? result.ops[0] : review);
      } catch (error) {
        res.status(500).send({message: "Failed to post review"});
      }
    });

    app.get("/reviews", async (req, res) => {
      try {
        const allReviews = await Reviews.find({})
          .sort({createdAt: -1})
          .toArray();
        res.status(200).send(allReviews);
      } catch (error) {
        console.error("Failed to fetch reviews:", error);
        res.status(500).send({message: "Failed to fetch reviews"});
      }
    });

    app.get("/reviews/:productId", async (req, res) => {
      const {productId} = req.params;
      try {
        const reviews = await Reviews.find({productId})
          .sort({createdAt: -1})
          .toArray();
        res.send(reviews);
      } catch (error) {
        res.status(500).send({message: "Failed to fetch reviews"});
      }
    });

    app.delete("/reviews/:id", verifyFbToken, async (req, res) => {
      try {
        const {id} = req.params;
        const email = req.user.email;

        const review = await Reviews.findOne({_id: new ObjectId(id)});
        if (!review) return res.status(404).send({message: "Review not found"});

        if (review.userEmail !== email) {
          return res
            .status(403)
            .send({message: "Unauthorized to delete this review"});
        }

        await Reviews.deleteOne({_id: new ObjectId(id)});
        res.status(200).send({message: "Review deleted successfully"});
      } catch (err) {
        res.status(500).send({error: "Delete failed"});
      }
    });

    app.put("/reviews/:id", verifyFbToken, async (req, res) => {
      try {
        const {id} = req.params;
        const updateData = req.body;

        const result = await Reviews.updateOne(
          {_id: new ObjectId(id)},
          {
            $set: {
              rating: updateData.rating,
              comment: updateData.comment,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({message: "Review not found"});
        }

        const updatedReview = await Reviews.findOne({_id: new ObjectId(id)});
        res.status(200).send(updatedReview);
      } catch (error) {
        res.status(500).send({message: "Failed to update review"});
      }
    });

    // Get all payments (protected)
    app.get("/payments", verifyFbToken, async (req, res) => {
      try {
        const userEmail = req.user?.email;
        const payments = await Payments.find({email: userEmail}).toArray();
        res.status(200).json(payments);
      } catch (error) {
        console.error("Failed to fetch payments:", error);
        res.status(500).send({message: "Failed to fetch payments"});
      }
    });

    // Get payment by id
    app.get("/payments/:id", async (req, res) => {
      const {id} = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({message: "Invalid payment ID"});
      }

      try {
        const payment = await Payments.findOne({_id: new ObjectId(id)});
        if (!payment) {
          return res.status(404).send({message: "Payment not found"});
        }
        res.status(200).json(payment);
      } catch (error) {
        console.error("Failed to fetch payment:", error);
        res.status(500).send({message: "Failed to fetch payment"});
      }
    });

    app.get("/", (req, res) => {
      res.send("✅ Backend is running");
    });
  } catch (error) {
    console.error(error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
