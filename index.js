const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
const admin = require("firebase-admin");
const path = require("path");

// 🔐 Firebase Admin Setup
const serviceAccount = require(path.join(
  __dirname,
  "./firebaseServiceAccount.json"
));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// 🔗 Middleware
const port = process.env.PORT || 4000;
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://localhost:5175",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// 🔗 MongoDB Setup
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

const verifyUser = async (req, res, next) => {
  const email = req.user?.email;
  if (!email)
    return res.status(403).send({message: "Forbidden: No user email"});

  const user = await usersCollection.findOne({email});
  if (user?.role !== "user") {
    return res.status(403).send({message: "Forbidden: User access only"});
  }

  next();
};

const verifyAdmin = async (req, res, next) => {
  const email = req.user?.email;
  if (!email)
    return res.status(403).send({message: "Forbidden: No user email"});

  const user = await usersCollection.findOne({email});
  if (user?.role !== "admin") {
    return res.status(403).send({message: "Forbidden: Admin access only"});
  }

  next();
};

const verifyVendor = async (req, res, next) => {
  const email = req.user?.email;
  if (!email)
    return res.status(403).send({message: "Forbidden: No user email"});

  const user = await usersCollection.findOne({email});
  if (user?.role !== "vendor") {
    return res.status(403).send({message: "Forbidden: Vendor access only"});
  }

  next();
};

async function run() {
  try {
    const database = client.db("KachaPrice");
    const usersCollection = database.collection("user");
    const allProductCollection = database.collection("allProduct");
    const productWishlist = database.collection("productWishlist");
    const reviewsCollection = database.collection("review");
    const PaymentsCollection = database.collection("payment");

    // ✅ Save User if Not Exists
    app.post("/allUser", async (req, res) => {
      const {name, email, role} = req.body;

      try {
        const existingUser = await usersCollection.findOne({email});
        if (existingUser) {
          return res.status(200).send({message: "User already exists"});
        }

        const result = await usersCollection.insertOne({
          name,
          email,
          role: role || "user",
          createdAt: new Date(),
        });

        res.send({success: true, insertedId: result.insertedId});
      } catch (error) {
        res.status(500).send({error: "Failed to save user"});
      }
    });

    // 🔐 Get all users (protected)
    app.get("/allUser", verifyFbToken, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({error: "Failed to fetch users"});
      }
    });

    // 🔐 Get all users with role = 'user' (protected)
    app.get(
      "/allUser/role/user",
      verifyAdmin,
      verifyFbToken,
      async (req, res) => {
        try {
          const users = await usersCollection.find({role: "user"}).toArray();
          res.send(users);
        } catch (error) {
          res.status(500).send({error: "Failed to fetch users with role user"});
        }
      }
    );

    // 🔐 Get all users with role = 'vendor' (protected)
    app.get(
      "/allUser/role/vendor",
      verifyAdmin,
      verifyFbToken,
      async (req, res) => {
        try {
          const vendors = await usersCollection
            .find({role: "vendor"})
            .toArray();
          res.send(vendors);
        } catch (error) {
          res.status(500).send({error: "Failed to fetch vendors"});
        }
      }
    );

    // 🔐 Get user by email (protected)
    app.get("/allUser/email", verifyFbToken, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({error: "Email query is required"});
      }

      try {
        const user = await usersCollection.findOne({email});
        if (!user) {
          return res.status(404).send({error: "User not found"});
        }
        res.send(user);
      } catch (error) {
        res.status(500).send({error: "Failed to fetch user by email"});
      }
    });

    // Product ??

    app.get("/allProduct", async (req, res) => {
      try {
        const products = await allProductCollection.find().toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({error: "Failed to fetch products"});
      }
    });

    app.get("/allProduct/approved", async (req, res) => {
      try {
        const {search, sort, from, to} = req.query;

        // Base filter: only approved products
        const filter = {status: "approved"};

        // Search filter
        if (search) {
          filter.$or = [
            {name: {$regex: search, $options: "i"}},
            {market: {$regex: search, $options: "i"}},
          ];
        }

        // Date range filter

        // Fetch filtered products
        let results = await allProductCollection.find(filter).toArray();

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
        // Sort by price using latest price
        if (sort) {
          results.sort((a, b) => {
            const getLatestPrice = (item) =>
              item.price ??
              (item.prices?.length
                ? item.prices[item.prices.length - 1].price
                : 0);

            if (sort === "lowToHigh")
              return getLatestPrice(a) - getLatestPrice(b);
            if (sort === "highToLow")
              return getLatestPrice(b) - getLatestPrice(a);
            return 0;
          });
        }

        // Format for frontend
        const formattedResults = results.map((product) => ({
          _id: product._id.toString(),
          image: product.image,
          name: product.name,
          price:
            product.price ??
            (product.prices?.length
              ? product.prices[product.prices.length - 1].price
              : null),
          status: product.status,
          prices: product.prices,
          createdAt: product.createdAt,
          market: product.market,
          description: product.description,
          role: product.role,
          vendor: {
            name: product.vendorName,
            email: product.vendorEmail,
            image: product.vendorImage,
          },
        }));

        res.status(200).send(formattedResults);
      } catch (err) {
        console.error(err);
        res.status(500).send({error: "Failed to fetch approved products"});
      }
    });

    app.get("/allProduct/pending", verifyFbToken, async (req, res) => {
      try {
        const products = await allProductCollection
          .find({status: "pending"})
          .toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({error: "Failed to fetch pending products"});
      }
    });

    app.get("/allProduct/email", verifyFbToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({error: "Email query is required"});
      }

      try {
        const products = await allProductCollection.find({email}).toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({error: "Failed to fetch products by email"});
      }
    });

    app.get("/allProduct/approved/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({error: "Invalid product ID"});
        }

        const product = await allProductCollection.findOne({
          _id: new ObjectId(id),
          status: "approved",
        });

        if (!product) {
          return res.status(404).send({error: "Approved product not found"});
        }

        res.status(200).send(product);
      } catch (err) {
        console.error("Error fetching approved product by ID:", err);
        res.status(500).send({error: "Failed to fetch approved product"});
      }
    });

    app.post("/product/wishlist", verifyFbToken, async (req, res) => {
      const {productId, userEmail} = req.body;
      if (!productId || !userEmail) {
        return res
          .status(400)
          .json({message: "Missing productId or userEmail"});
      }
      try {
        const exists = await productWishlist.findOne({productId, userEmail});
        if (exists) {
          return res.status(200).json({message: "Product already in wishlist"});
        }
        await productWishlist.insertOne({
          productId,
          userEmail,
          createdAt: new Date(),
        });
        res.status(201).json({message: "Added to wishlist"});
      } catch (error) {
        res.status(500).json({message: "Failed to add to wishlist"});
      }
    });

    app.get("/product/wishlist/:userEmail", async (req, res) => {
      const userEmail = req.params.userEmail;
      if (!userEmail) {
        return res.status(400).json({message: "Missing userEmail"});
      }
      try {
        const wishlistItems = await productWishlist.find({userEmail}).toArray();
        res.status(200).json(wishlistItems);
      } catch (error) {
        res.status(500).json({message: "Failed to fetch wishlist items"});
      }
    });

    app.delete("/wishlist/:userEmail/:productId", async (req, res) => {
      const {userEmail, productId} = req.params;

      if (!userEmail || !productId) {
        return res
          .status(400)
          .json({message: "Missing userEmail or productId"});
      }

      try {
        const result = await productWishlist.deleteOne({userEmail, productId});

        if (result.deletedCount === 0) {
          return res.status(404).json({message: "Wishlist item not found"});
        }

        res.status(200).json({message: "Successfully removed from wishlist"});
      } catch (error) {
        res.status(500).json({message: "Failed to delete wishlist item"});
      }
    });

    // 🔐 Protect with Firebase token verification
    app.post("/reviews", verifyFbToken, async (req, res) => {
      const {productId, userName, userEmail, userImage, rating, comment} =
        req.body;

      if (!productId || !userEmail || !rating || !comment) {
        return res.status(400).json({message: "Missing required fields"});
      }

      try {
        // Only allow one review per product per user
        const existing = await reviewsCollection.findOne({
          productId,
          userEmail,
        });
        if (existing) {
          return res
            .status(409)
            .json({message: "You already submitted a review"});
        }

        const newReview = {
          productId,
          userName,
          userEmail,
          userImage,
          rating,
          comment,
          createdAt: new Date(),
        };

        const result = await reviewsCollection.insertOne(newReview);
        res.status(201).json(result);
      } catch (err) {
        console.error(err);
        res.status(500).json({message: "Failed to add review"});
      }
    });

    // 📥 Get reviews for a product
    app.get("/reviews/:productId", verifyFbToken, async (req, res) => {
      const {productId} = req.params;

      try {
        const reviews = await reviewsCollection
          .find({productId})
          .sort({createdAt: -1}) // optional: newest first
          .toArray();
        res.status(200).json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({message: "Failed to fetch reviews"});
      }
    });

    // ✏️ Update a review (only if same user)
    app.put("/reviews/:id", verifyFbToken, async (req, res) => {
      const reviewId = req.params.id;
      const {rating, comment} = req.body;

      if (!ObjectId.isValid(reviewId)) {
        return res.status(400).json({message: "Invalid review ID"});
      }

      try {
        const review = await reviewsCollection.findOne({
          _id: new ObjectId(reviewId),
        });

        if (!review) {
          return res.status(404).json({message: "Review not found"});
        }

        if (req.user.email !== review.userEmail) {
          return res
            .status(403)
            .json({message: "You can only update your own review"});
        }

        const result = await reviewsCollection.updateOne(
          {_id: new ObjectId(reviewId)},
          {
            $set: {
              rating,
              comment,
              updatedAt: new Date(),
            },
          }
        );

        res.status(200).json({message: "Review updated", result});
      } catch (err) {
        console.error(err);
        res.status(500).json({message: "Failed to update review"});
      }
    });

    // ❌ Delete review (only by same user)
    app.delete("/reviews/:id", verifyFbToken, async (req, res) => {
      const reviewId = req.params.id;

      if (!ObjectId.isValid(reviewId)) {
        return res.status(400).json({message: "Invalid review ID"});
      }

      try {
        const review = await reviewsCollection.findOne({
          _id: new ObjectId(reviewId),
        });

        if (!review) {
          return res.status(404).json({message: "Review not found"});
        }

        if (req.user.email !== review.userEmail) {
          return res
            .status(403)
            .json({message: "You can only delete your own review"});
        }

        await reviewsCollection.deleteOne({_id: new ObjectId(reviewId)});
        res.status(200).json({message: "Review deleted"});
      } catch (err) {
        console.error(err);
        res.status(500).json({message: "Failed to delete review"});
      }
    });

    // ✅ Stripe Payment
    app.post("/create-payment-intent", verifyFbToken, async (req, res) => {
      try {
        const {price} = req.body;
        if (!price || price <= 0) {
          return res.status(400).send({message: "Invalid amount"});
        }

        const paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(price * 100),
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({clientSecret: paymentIntent.client_secret});
      } catch (error) {
        console.error(error);
        res.status(500).send({message: "Failed to create payment intent"});
      }
    });

    app.post("/payments", verifyFbToken, async (req, res) => {
      try {
        const paymentInfo = req.body;

        console.log("🧾 Incoming payment data:", paymentInfo);

        if (!paymentInfo.transactionId || !paymentInfo.email) {
          console.log("❌ Missing required fields");
          return res.status(400).send({
            success: false,
            message: "Missing required payment fields",
          });
        }

        const result = await PaymentsCollection.insertOne({
          ...paymentInfo,
          createdAt: new Date(),
        });

        console.log("✅ Payment saved with ID:", result.insertedId);

        res.send({
          success: true,
          message: "Payment recorded",
          id: result.insertedId,
        });
      } catch (error) {
        console.error("🔥 Payment save error:", error);
        res.status(500).send({
          success: false,
          message: "Failed to save payment info",
          error: error.message,
        });
      }
    });

    app.get("/payments/user/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;
        const payments = await PaymentsCollection.find({email}).toArray();
        const totalAmount = payments.reduce(
          (sum, p) => sum + (p.amount || 0),
          0
        );

        res.send({
          success: true,
          totalAmount,
          totalPayments: payments.length,
          payments,
        });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({success: false, message: "Failed to fetch user payments"});
      }
    });

    app.get("/payments/product/:productId", verifyFbToken, async (req, res) => {
      try {
        const productId = req.params.productId;
        const payments = await PaymentsCollection.find({productId}).toArray();
        const totalAmount = payments.reduce(
          (sum, p) => sum + (p.amount || 0),
          0
        );

        res.send({
          success: true,
          totalAmount,
          totalSales: payments.length,
          payments,
        });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({success: false, message: "Failed to fetch product payments"});
      }
    });

    app.get("/payments/vendor/:email", verifyFbToken, async (req, res) => {
      try {
        const vendorEmail = req.params.email;
        const payments = await PaymentsCollection.find({vendorEmail}).toArray();
        const totalEarnings = payments.reduce(
          (sum, p) => sum + (p.amount || 0),
          0
        );

        res.send({
          success: true,
          totalEarnings,
          totalProductsSold: payments.length,
          payments,
        });
      } catch (err) {
        console.error(err);
        res
          .status(500)
          .send({success: false, message: "Failed to fetch vendor payments"});
      }
    });

    app.get(
      "/payments/vendor/:email/product/:productId",
      verifyFbToken,
      async (req, res) => {
        try {
          const {email, productId} = req.params;
          const payments = await PaymentsCollection.find({
            vendorEmail: email,
            productId,
          }).toArray();

          const totalAmount = payments.reduce(
            (sum, p) => sum + (p.amount || 0),
            0
          );

          res.send({
            success: true,
            totalAmount,
            buyersCount: payments.length,
            payments,
          });
        } catch (err) {
          console.error(err);
          res.status(500).send({
            success: false,
            message: "Failed to fetch vendor's product payments",
          });
        }
      }
    );

    // ✅ Health Check Route
    app.get("/", (req, res) => {
      res.send("✅ Backend is running");
    });

    // ✅ Start Server
    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("❌ Server Error:", error);
  }
}

run().catch(console.dir);
