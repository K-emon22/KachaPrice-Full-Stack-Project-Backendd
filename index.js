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
    const AdvertisementCollection = database.collection("advertisement");
    // API to save a new user if they don't already exist
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

    // API to get all users
    app.get("/allUser", verifyFbToken, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        res.status(500).send({error: "Failed to fetch users"});
      }
    });

    // API to get all users with the role 'user'
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

    // API to get all users with the role 'vendor'
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

    app.get("/users/role/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;

        const user = await usersCollection.findOne({email});

        if (!user) {
          return res.status(404).send({error: "User not found"});
        }

        res.send({role: user.role || "user"}); // default to "user" if role not set
      } catch (error) {
        res.status(500).send({error: "Failed to fetch user role"});
      }
    });

    // API to get a specific user by their email
    // app.get("/allUser/email", verifyFbToken, async (req, res) => {
    //   const email = req.query.email;

    //   if (!email) {
    //     return res.status(400).send({error: "Email query is required"});
    //   }

    //   try {
    //     const user = await usersCollection.findOne({email});
    //     if (!user) {
    //       return res.status(404).send({error: "User not found"});
    //     }
    //     res.send(user);
    //   } catch (error) {
    //     res.status(500).send({error: "Failed to fetch user by email"});
    //   }
    // });

    app.get("/allUser/email", verifyFbToken, async (req, res) => {
      const email = req.query.email;

      if (!email) {
        return res.status(400).send({error: "Email query is required"});
      }

      try {
        // First, check if the user exists
        const user = await usersCollection.findOne({email});

        if (!user) {
          return res.status(404).send({error: "User not found"});
        }

        // Update the user to add vendorRequest: true
        await usersCollection.updateOne({email}, {$set: {vendorRequest: true}});

        // Return the updated user
        const updatedUser = await usersCollection.findOne({email});
        res.send(updatedUser);
      } catch (error) {
        console.error("Error updating user vendorRequest:", error);
        res.status(500).send({error: "Failed to update user"});
      }
    });

    // PATCH /users/vendor-request?email=abc@gmail.com
    app.patch("/users/vendor-request", verifyFbToken, async (req, res) => {
      const email = req.query.email;
      const {vendorRequest} = req.body;

      if (!email) {
        return res.status(400).send({error: "Email query is required"});
      }

      try {
        const result = await usersCollection.updateOne(
          {email},
          {$set: {vendorRequest: vendorRequest === true}}
        );
        res.send(result);
      } catch (error) {
        res.status(500).send({error: "Failed to update vendor request"});
      }
    });

    app.post("/allProduct", verifyFbToken, async (req, res) => {
      try {
        const product = req.body;
        const result = await allProductCollection.insertOne(product);
        res.send(result);
      } catch (err) {
        res.status(500).send({error: "Failed to add product"});
      }
    });

    // API to get all products
    app.get("/allProduct", async (req, res) => {
      try {
        const products = await allProductCollection.find().toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({error: "Failed to fetch products"});
      }
    });

    // API to get approved products with filtering, sorting, and pagination
    app.get("/allProduct/approved", async (req, res) => {
      try {
        const {search, sort, from, to, page = 1, limit = 10} = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        const filter = {status: "approved"};
        if (search) {
          filter.$or = [
            {name: {$regex: search, $options: "i"}},
            {market: {$regex: search, $options: "i"}},
          ];
        }

        let allMatchingProducts = await allProductCollection
          .find(filter)
          .toArray();

        if (from || to) {
          const fromDate = from ? new Date(from) : null;
          const toDate = to ? new Date(to) : null;
          if (toDate) {
            toDate.setHours(23, 59, 59, 999);
          }

          allMatchingProducts = allMatchingProducts.filter((item) => {
            const itemDate = new Date(item.createdAt);
            if (isNaN(itemDate)) return false;
            if (fromDate && itemDate < fromDate) return false;
            if (toDate && itemDate > toDate) return false;
            return true;
          });
        }

        const total = allMatchingProducts.length;

        if (sort) {
          allMatchingProducts.sort((a, b) => {
            if (sort === "lowToHigh") return a.price - b.price;
            if (sort === "highToLow") return b.price - a.price;
            return 0;
          });
        }

        const start = (pageNum - 1) * limitNum;
        const paginatedProducts = allMatchingProducts.slice(
          start,
          start + limitNum
        );

        res.status(200).send({
          products: paginatedProducts,
          total: total,
        });
      } catch (err) {
        console.error("Error fetching approved products:", err);
        res.status(500).send({error: "Failed to fetch approved products"});
      }
    });

    // API to get all products with a 'pending' status
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

    // API to get all products listed by a specific email
    app.get("/allProduct/email", verifyFbToken, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({error: "Email query is required"});
      }

      try {
        const products = await allProductCollection
          .find({vendorEmail: email})
          .toArray();
        res.send(products);
      } catch (err) {
        res.status(500).send({error: "Failed to fetch products by email"});
      }
    });

    // app.put("/allProduct/:id", verifyFbToken, async (req, res) => {
    //   const id = req.params.id;
    //   const updatedData = req.body;

    //   try {
    //     const result = await allProductCollection.updateOne(
    //       { _id: new ObjectId(id) },
    //       { $set: updatedData }
    //     );

    //     res.send(result);
    //   } catch (err) {
    //     console.error("Error updating product:", err);
    //     res.status(500).send({ error: "Failed to update product" });
    //   }
    // });

    app.put("/allProduct/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({error: "Invalid product ID"});
        }

        const product = await allProductCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res.status(404).send({error: "Product not found"});
        }

        // If price is being changed, store the old price in 'prices' array
        const priceUpdates = {};
        if (updatedData.price && updatedData.price !== product.price) {
          priceUpdates.$push = {
            prices: {
              price: product.price,
              date: new Date(),
            },
          };
        }

        const updateFields = {
          $set: {
            ...updatedData,
            updatedAt: new Date(),
          },
          ...(priceUpdates.$push ? {} : {$push: {}}), // placeholder if no push needed
        };

        const finalUpdate = priceUpdates.$push
          ? {...updateFields, $push: priceUpdates.$push}
          : updateFields;

        const result = await allProductCollection.updateOne(
          {_id: new ObjectId(id)},
          finalUpdate
        );

        res.send({
          message: "Product updated successfully",
          modifiedCount: result.modifiedCount,
        });
      } catch (error) {
        console.error("Error updating product:", error);
        res.status(500).send({error: "Failed to update product"});
      }
    });

    app.patch("/allProduct/:id", verifyFbToken, async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;

      try {
        const result = await allProductCollection.updateOne(
          {_id: new ObjectId(id)},
          {$set: updateData}
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({error: "Product not found"});
        }

        res.send({message: "Product updated successfully", result});
      } catch (err) {
        res.status(500).send({error: "Failed to update product"});
      }
    });

    app.delete("/allProduct/:id", verifyFbToken, async (req, res) => {
      const id = req.params.id;

      try {
        const result = await allProductCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({error: "Product not found"});
        }

        res.send({message: "Product deleted successfully", result});
      } catch (err) {
        res.status(500).send({error: "Failed to delete product"});
      }
    });

    app.get("/allProduct/:id", verifyFbToken, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({error: "Invalid product ID"});
        }

        const product = await allProductCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!product) {
          return res.status(404).send({error: "Product not found"});
        }

        res.status(200).send(product);
      } catch (err) {
        console.error("Error fetching product by ID:", err);
        res.status(500).send({error: "Failed to fetch product"});
      }
    });

    // API to get a single approved product by its ID
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

    // API to get 6 recent, unique products from different markets
    app.get("/allProduct/sortedsix", async (req, res) => {
      try {
        const products = await allProductCollection
          .aggregate([
            {$match: {status: "approved"}},
            {$sort: {createdAt: -1}},
            {
              $group: {
                _id: "$market",
                latestProduct: {$first: "$$ROOT"},
              },
            },
            {$replaceRoot: {newRoot: "$latestProduct"}},
            {$sort: {createdAt: -1}},
            {$limit: 6},
          ])
          .toArray();

        res.status(200).send({products});
      } catch (err) {
        console.error("Error fetching sorted six approved products:", err);
        res.status(500).send({error: "Failed to fetch sorted six products"});
      }
    });

    // API to add a product to a user's wishlist
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

    // API to get all wishlist items for a specific user
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

    // API to remove a product from a user's wishlist
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

    // API to post a new review for a product
    app.post("/reviews", verifyFbToken, async (req, res) => {
      const {productId, userName, userEmail, userImage, rating, comment} =
        req.body;

      if (!productId || !userEmail || !rating || !comment) {
        return res.status(400).json({message: "Missing required fields"});
      }

      try {
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

    // Get reviews by user email
    app.get("/reviews/user/:email", verifyFbToken, async (req, res) => {
      try {
        const email = req.params.email;

        if (!email) {
          return res.status(400).json({message: "Email is required"});
        }

        const userReviews = await reviewsCollection
          .find({userEmail: email})
          .sort({createdAt: -1}) // optional: sort newest first
          .toArray();

        res.status(200).json({
          success: true,
          totalReviews: userReviews.length,
          reviews: userReviews,
        });
      } catch (error) {
        console.error("Error fetching user reviews:", error);
        res
          .status(500)
          .json({success: false, message: "Failed to fetch reviews"});
      }
    });

    // API to get all reviews for a specific product
    app.get("/reviews/:productId", verifyFbToken, async (req, res) => {
      const {productId} = req.params;

      try {
        const reviews = await reviewsCollection
          .find({productId})
          .sort({createdAt: -1})
          .toArray();
        res.status(200).json(reviews);
      } catch (err) {
        console.error(err);
        res.status(500).json({message: "Failed to fetch reviews"});
      }
    });

    // API to update an existing review
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

    // API to delete a review
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

    // API to create a Stripe payment intent
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

    // API to save payment information to the database
    app.post("/payments", verifyFbToken, async (req, res) => {
      try {
        const paymentInfo = req.body;
        if (!paymentInfo.transactionId || !paymentInfo.email) {
          return res.status(400).send({
            success: false,
            message: "Missing required payment fields",
          });
        }

        const result = await PaymentsCollection.insertOne({
          ...paymentInfo,
          createdAt: new Date(),
        });

        res.send({
          success: true,
          message: "Payment recorded",
          id: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "Failed to save payment info",
          error: error.message,
        });
      }
    });

    // API to get all payments for a specific user
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

    // API to get all payments for a specific product
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

    // API to get all payments for a specific vendor
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

    // API to get payments for a specific product from a specific vendor
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

    app.get("/advertisements", verifyFbToken, async (req, res) => {
      const vendorEmail = req.query.vendorEmail;
      if (!vendorEmail)
        return res.status(400).json({error: "Missing vendorEmail"});

      try {
        const ads = await AdvertisementCollection.find({vendorEmail}).toArray();
        res.send(ads);
      } catch (error) {
        res.status(500).json({error: "Failed to fetch advertisements"});
      }
    });

    // ✅ POST a new advertisement
    app.post("/advertisements", verifyFbToken, async (req, res) => {
      const ad = req.body;

      if (!ad.title || !ad.description || !ad.vendorEmail) {
        return res.status(400).json({error: "Missing required fields"});
      }

      ad.status = "pending";
      ad.createdAt = new Date();

      try {
        const result = await AdvertisementCollection.insertOne(ad);
        res.status(201).json({
          message: "Advertisement added",
          insertedId: result.insertedId,
        }); 
      } catch (error) {
        res.status(500).json({error: "Failed to add advertisement"});
      }
    });
  
    // ✅ PUT update advertisement by ID
    app.put("/advertisements/:id", verifyFbToken, async (req, res) => {
      const id = req.params.id;
      const updated = req.body;

      try {
        const result = await AdvertisementCollection.updateOne(
          {_id: new ObjectId(id)},
          {
            $set: {
              title: updated.title,
              description: updated.description,
              image: updated.image,

              updatedAt: new Date(),
            },
          }
        );

        if (result.modifiedCount === 0) {
          return res
            .status(404)
            .json({error: "Advertisement not found or no changes made"});
        }

        res.json({message: "Advertisement updated"});
      } catch (error) {
        res.status(500).json({error: "Failed to update advertisement"});
      }
    });

    // ✅ DELETE advertisement by ID
    app.delete("/advertisements/:id", verifyFbToken, async (req, res) => {
      const id = req.params.id;

      try {
        const result = await AdvertisementCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).json({error: "Advertisement not found"});
        }

        res.json({message: "Advertisement deleted"});
      } catch (error) {
        res.status(500).json({error: "Failed to delete advertisement"});
      }
    });

    // API for server health check
    app.get("/", (req, res) => {
      res.send("✅ Backend is running");
    });

    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("❌ Server Error:", error);
  }
}

run().catch(console.dir);
