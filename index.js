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

const port = process.env.PORT || 3000;

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

// Middleware to check if user is Vendor
const requireVendor = async (req, res, next) => {
  try {
    const email = req.user.email.toLowerCase();
    const user = await MainUsers.findOne({email});
    if (!user) {
      return res.status(404).send({message: "User not found"});
    }
    if (user.role !== "vendor") {
      return res.status(403).send({message: "Forbidden: Vendor access only"});
    }
    req.user.role = user.role;
    next();
  } catch (error) {
    console.error("Error in requireVendor middleware:", error);
    res.status(500).send({message: "Internal server error"});
  }
};

// Middleware to check if user is Admin
const requireAdmin = async (req, res, next) => {
  try {
    const email = req.user.email.toLowerCase();
    const user = await MainUsers.findOne({email});
    if (!user) {
      return res.status(404).send({message: "User not found"});
    }
    if (user.role !== "admin") {
      return res.status(403).send({message: "Forbidden: Admin access only"});
    }
    req.user.role = user.role;
    next();
  } catch (error) {
    console.error("Error in requireAdmin middleware:", error);
    res.status(500).send({message: "Internal server error"});
  }
};

async function run() {
  try {
    await client.connect();
    const database = client.db("HatBajar");

    const Users = database.collection("Users");
    const MainUsers = database.collection("MainUsers");

    const Payments = database.collection("payments");
    const Wishlist = database.collection("wishlist");
    const Reviews = database.collection("reviews");
    const advertisementsCollection = database.collection("advertisements");
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

    app.get("/payments/total-amount", verifyFbToken, async (req, res) => {
      try {
        const emailFromQuery = req.query.email;
        const emailFromToken = req.user.email;

        if (!emailFromQuery) {
          return res
            .status(400)
            .json({message: "Email query parameter required"});
        }
        if (emailFromQuery !== emailFromToken) {
          return res.status(403).json({message: "Forbidden: Email mismatch"});
        }

        const totalResult = await Payments.aggregate([
          {$match: {email: emailFromQuery}},
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
        res
          .status(500)
          .send({message: "Failed to calculate total payment amount"});
      }
    });

    app.get("/vendorRevenue", verifyFbToken, async (req, res) => {
      try {
        const vendorEmail = req.user?.email;
        if (!vendorEmail)
          return res.status(401).json({message: "Unauthorized"});

        // Fetch payments where vendor email matches
        // Assuming each payment doc has: amount, status, product with vendor email
        const payments = await Payments.find({
          "product.vendorEmail": vendorEmail,
          status: "succeeded",
        }).toArray();

        // Sum total amount
        const totalRevenue = payments.reduce(
          (sum, p) => sum + Number(p.amount),
          0
        );

        res.status(200).json({totalRevenue});
      } catch (error) {
        console.error("Error fetching vendor revenue:", error);
        res.status(500).json({message: "Failed to fetch vendor revenue"});
      }
    });

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

    app.post("/users", async (req, res) => {
      try {
        const {email, name, role} = req.body;
        if (!email || !role) {
          return res.status(400).send({error: "Missing fields"});
        }

        const existing = await Users.findOne({email});
        if (existing) {
          return res.send({message: "User already exists"});
        }

        const result = await Users.insertOne({
          email,
          name,
          role,
          createdAt: new Date(),
        });
        res.send({message: "User created", result});
      } catch (error) {
        console.error("Error in POST /users:", error);
        res.status(500).send({error: "Internal Server Error"});
      }
    });

    app.post("/products", async (req, res) => {
      try {
        const product = req.body;

        // Basic validation
        if (
          !product.name ||
          !product.price ||
          !product.market ||
          !product.vendor ||
          !product.description
        ) {
          return res
            .status(400)
            .send({error: "Missing fields in product data"});
        }

        // Insert product into Users collection
        const result = await Users.insertOne(product);

        res.send({message: "Product created", insertedId: result.insertedId});
      } catch (error) {
        console.error("Error in POST /products:", error);
        res.status(500).send({error: "Internal Server Error"});
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await Users.findOne({email});
        if (!user) return res.status(404).send({error: "User not found"});
        res.send({role: user.role});
      } catch (error) {
        console.error("Error in GET /users/:email:", error);
        res.status(500).send({error: "Internal Server Error"});
      }
    });

    app.post("/mainusers", async (req, res) => {
      try {
        const {email, name, role} = req.body;
        if (!email || !role) {
          return res.status(400).send({error: "Missing fields"});
        }

        const existing = await MainUsers.findOne({email});
        if (existing) {
          return res.send({message: "MainUser already exists"});
        }

        const result = await MainUsers.insertOne({
          email,
          name,
          role,
          createdAt: new Date(),
        });
        res.send({message: "MainUser created", result});
      } catch (error) {
        console.error("Error in POST /mainusers:", error);
        res.status(500).send({error: "Internal Server Error"});
      }
    });

    app.get("/mainusers/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await MainUsers.findOne({email});
        if (!user) return res.status(404).send({error: "MainUser not found"});
        res.send({role: user.role, market: user.market});
      } catch (error) {
        console.error("Error in GET /mainusers/:email:", error);
        res.status(500).send({error: "Internal Server Error"});
      }
    });

    app.put("/mainusers/become-vendor", verifyFbToken, async (req, res) => {
      try {
        const email = req.user.email.toLowerCase();
        const {market} = req.body;

        if (!market) {
          return res.status(400).send({message: "Market is required"});
        }

        const existingUser = await MainUsers.findOne({
          email: {$regex: `^${email}$`, $options: "i"},
        });

        if (!existingUser) {
          return res.status(404).send({message: "MainUser not found"});
        }

        const result = await MainUsers.findOneAndUpdate(
          {email: {$regex: `^${email}$`, $options: "i"}},
          {
            $set: {
              role: "vendor",
              market,
              updatedAt: new Date(),
            },
          },
          {returnDocument: "after"}
        );

        res.send({
          message: "User role updated to vendor",
          user: result.value,
        });
      } catch (error) {
        console.error("Error updating to vendor:", error);
        res.status(500).send({message: "Failed to update vendor info"});
      }
    });

    app.get("/allProduct", async (req, res) => {
      try {
        const {sort, search, from, to} = req.query;
        const filter = {role: "vendor", status: "approved"};

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

    app.get("/pendingProducts", async (req, res) => {
      try {
        const {search, from, to, sort} = req.query;
        const filter = {role: "vendor", status: "pending"};

        // Search filter (by name or market)
        if (search) {
          filter.$or = [
            {name: {$regex: search, $options: "i"}},
            {market: {$regex: search, $options: "i"}},
          ];
        }

        let results = await Users.find(filter).toArray(); // or Products.find() if you store in 'Products'

        // Date range filter
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

        // Sort by price
        if (sort) {
          results.sort((a, b) => {
            if (sort === "lowToHigh") return a.price - b.price;
            if (sort === "highToLow") return b.price - a.price;
            return 0;
          });
        }

        res.status(200).json(results);
      } catch (error) {
        console.error("Error in GET /pendingProducts:", error);
        res.status(500).send({message: "Failed to fetch pending products"});
      }
    });

    app.put("/product/:id", async (req, res) => {
      const id = req.params.id;
      const {name, price} = req.body;

      try {
        const result = await Users.updateOne(
          {_id: new ObjectId(id)},
          {
            $set: {
              name,
              price,
              updatedAt: new Date(),
            },
          }
        );

        res.send({message: "Product updated", result});
      } catch (err) {
        console.error("Update Error:", err);
        res.status(500).send({error: "Failed to update product"});
      }
    });

    app.delete("/product/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await Users.deleteOne({_id: new ObjectId(id)});
        res.send({message: "Product deleted", result});
      } catch (err) {
        console.error("Delete Error:", err);
        res.status(500).send({error: "Failed to delete product"});
      }
    });

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

        const insertedReview = await Reviews.findOne({_id: result.insertedId});

        res.status(201).send(insertedReview);
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

    app.post("/advertisements", verifyFbToken, async (req, res) => {
      try {
        const ad = req.body;

        if (
          !ad.image ||
          !ad.price ||
          !ad.market ||
          !ad.description ||
          !ad.email
        ) {
          return res.status(400).json({message: "Missing required fields"});
        }

        ad.createdAt = new Date();

        const result = await advertisementsCollection.insertOne(ad);
        res.status(201).json(result);
      } catch (err) {
        console.error("Failed to add ad:", err);
        res.status(500).json({error: "Internal server error"});
      }
    });

    // ✅ GET /advertisements - Get all ads
    app.get("/advertisements", async (req, res) => {
      try {
        const ads = await advertisementsCollection
          .find({})
          .sort({createdAt: -1})
          .toArray();

        res.json(ads);
      } catch (err) {
        console.error("Failed to fetch ads:", err);
        res.status(500).json({error: "Internal server error"});
      }
    });

    app.put("/advertisements/:id", verifyFbToken, async (req, res) => {
      const id = req.params.id;
      const {price, description, market} = req.body;

      if (!price || !description || !market) {
        return res.status(400).json({message: "Missing fields to update"});
      }

      try {
        const result = await advertisementsCollection.updateOne(
          {_id: new ObjectId(id)},
          {
            $set: {
              price,
              description,
              market,
              updatedAt: new Date(),
            },
          }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({message: "Ad not found"});
        }

        res.json({message: "Advertisement updated", result});
      } catch (err) {
        console.error("Failed to update ad:", err);
        res.status(500).json({error: "Internal server error"});
      }
    });

    app.delete("/advertisements/:id", verifyFbToken, async (req, res) => {
      const id = req.params.id;

      try {
        const result = await advertisementsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({message: "Ad not found"});
        }

        res.json({message: "Advertisement deleted", result});
      } catch (err) {
        console.error("Failed to delete ad:", err);
        res.status(500).json({error: "Internal server error"});
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
