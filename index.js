// const express = require("express");
// const app = express();
// require("dotenv").config();
// const cors = require("cors");
// const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");
// const admin = require("firebase-admin");
// const path = require("path");

// const serviceAccount = require(path.join(
//   __dirname,
//   "./firebaseServiceAccount.json"
// ));

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// const port = process.env.PORT || 3000;
// app.use(cors());
// app.use(express.json());

// const uri = process.env.MONGO_URI;
// const client = new MongoClient(uri, {
//   serverApi: {
//     version: ServerApiVersion.v1,
//     strict: true,
//     deprecationErrors: true,
//   },
// });

// const verifyFbToken = async (req, res, next) => {
//   const authHeader = req.headers?.authorization;
//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     return res.status(401).send({message: "Unauthorized: Token not provided"});
//   }

//   const token = authHeader.split(" ")[1];

//   try {
//     const decodedToken = await admin.auth().verifyIdToken(token);
//     req.user = decodedToken;
//     next();
//   } catch (error) {
//     console.error("Invalid Firebase token:", error);
//     return res.status(401).send({message: "Unauthorized: Invalid token"});
//   }
// };

// async function run() {
//   try {
//     await client.connect();
//     const database = client.db("HatBajar");
//     const Users = database.collection("Users");

//     app.post("/users", async (req, res) => {
//       try {
//         const newUser = req.body;
//         const result = await Users.insertOne(newUser);
//         res.status(201).send(result);
//       } catch (error) {
//         console.error("❌ Error inserting user:", error);
//         res.status(500).send({message: "Failed to add user"});
//       }
//     });

//     app.get("/allProduct", async (req, res) => {
//       try {
//         const {sort, search, from, to} = req.query;
//         const filter = {role: "vendor"};
//         if (search) {
//           filter.$or = [
//             {name: {$regex: search, $options: "i"}},
//             {market: {$regex: search, $options: "i"}},
//           ];
//         }
//         let results = await Users.find(filter).toArray();
//         if (from || to) {
//           const fromDate = from ? new Date(from) : null;
//           const toDate = to ? new Date(to) : null;
//           results = results.filter((item) => {
//             const itemDate = new Date(item.createdAt);
//             if (isNaN(itemDate)) return false;
//             if (fromDate && itemDate < fromDate) return false;
//             if (toDate && itemDate > toDate) return false;
//             return true;
//           });
//         }
//         if (sort) {
//           results.sort((a, b) => {
//             if (sort === "lowToHigh") return a.price - b.price;
//             if (sort === "highToLow") return b.price - a.price;
//             return 0;
//           });
//         }
//         res.status(200).json(results);
//       } catch (error) {
//         console.error("❌ Error fetching all products:", error);
//         res.status(500).send({message: "Failed to fetch products"});
//       }
//     });

//     app.get("/product/:id", verifyFbToken, async (req, res) => {
//       const {id} = req.params;
//       try {
//         const product = await Users.findOne({_id: new ObjectId(id)});
//         if (!product) {
//           return res.status(404).send({message: "Product not found"});
//         }
//         res.send(product);
//       } catch (error) {
//         console.error("Error fetching product:", error);
//         res.status(500).send({message: "Failed to fetch product"});
//       }
//     });
//     // ✅ example: backend/index.js or server.js
//     app.post("/wishlist", async (req, res) => {
//       try {
//         const wishlistData = req.body;
//         const wishlistCollection = client.db("HatBajar").collection("wishlist");

//         const alreadyExists = await wishlistCollection.findOne({
//           userEmail: wishlistData.userEmail,
//           productId: wishlistData.productId,
//         });

//         if (alreadyExists) {
//           return res.status(409).send({message: "Product already in wishlist"});
//         }

//         const result = await wishlistCollection.insertOne({
//           ...wishlistData,
//           createdAt: new Date(),
//         });

//         res
//           .status(201)
//           .send({message: "Added to wishlist", insertedId: result.insertedId});
//       } catch (error) {
//         console.error("❌ Error inserting into wishlist:", error);
//         res.status(500).send({message: "Failed to add to wishlist"});
//       }
//     });

//     app.get("/wishlist/:email", async (req, res) => {
//       const {email} = req.params;

//       try {
//         const wishlistCollection = client.db("HatBajar").collection("wishlist");

//         const wishlistItems = await wishlistCollection
//           .find({userEmail: email})
//           .toArray();

//         res.send(wishlistItems);
//       } catch (error) {
//         console.error("❌ Error fetching wishlist:", error);
//         res.status(500).send({message: "Error fetching wishlist"});
//       }
//     });

//     // 👇 Add these in your `run()` function after existing routes

//     const Reviews = client.db("HatBajar").collection("reviews");

//     // ✅ Add a new review
//     app.post("/reviews", verifyFbToken, async (req, res) => {
//       try {
//         const review = req.body;
//         if (
//           !review.productId ||
//           !review.userEmail ||
//           !review.rating ||
//           !review.comment
//         ) {
//           return res.status(400).send({message: "Missing review fields"});
//         }
//         const result = await Reviews.insertOne({
//           ...review,
//           createdAt: new Date(),
//         });
//         res.status(201).send(result.ops ? result.ops[0] : review);
//       } catch (error) {
//         console.error("❌ Error posting review:", error);
//         res.status(500).send({message: "Failed to post review"});
//       }
//     });

//     // ✅ Get all reviews for a product
//     app.get("/reviews/:productId", async (req, res) => {
//       const {productId} = req.params;
//       try {
//         const reviews = await Reviews.find({productId})
//           .sort({createdAt: -1})
//           .toArray();
//         res.send(reviews);
//       } catch (error) {
//         console.error("❌ Error fetching reviews:", error);
//         res.status(500).send({message: "Failed to fetch reviews"});
//       }
//     });

//     // DELETE a review
//     app.delete("/reviews/:id", verifyFbToken, async (req, res) => {
//       try {
//         const {id} = req.params;
//         const email = req.user.email;

//         const review = await Reviews.findOne({_id: new ObjectId(id)});
//         if (!review) return res.status(404).send({message: "Review not found"});

//         if (review.userEmail !== email) {
//           return res
//             .status(403)
//             .send({message: "Unauthorized to delete this review"});
//         }

//         const result = await Reviews.deleteOne({_id: new ObjectId(id)});
//         res.status(200).send({message: "Review deleted successfully"});
//       } catch (err) {
//         console.error("❌ Error deleting review:", err);
//         res.status(500).send({error: "Delete failed"});
//       }
//     });

//     app.put("/reviews/:id", verifyFbToken, async (req, res) => {
//       try {
//         const {id} = req.params;
//         const updateData = req.body;

//         // Validate data if needed here

//         const result = await Reviews.updateOne(
//           {_id: new ObjectId(id)},
//           {
//             $set: {
//               rating: updateData.rating,
//               comment: updateData.comment,
//               // You can update other fields if you want (e.g. updatedAt)
//               updatedAt: new Date(),
//             },
//           }
//         );

//         if (result.matchedCount === 0) {
//           return res.status(404).send({message: "Review not found"});
//         }

//         // Fetch the updated review to send back
//         const updatedReview = await Reviews.findOne({_id: new ObjectId(id)});
//         res.status(200).send(updatedReview);
//       } catch (error) {
//         console.error("❌ Error updating review:", error);
//         res.status(500).send({message: "Failed to update review"});
//       }
//     });
//     app.get("/product/:id/prices", async (req, res) => {
//       try {
//         const {id} = req.params;
//         if (!ObjectId.isValid(id)) {
//           return res.status(400).json({message: "Invalid product ID"});
//         }
//         const product = await Users.findOne(
//           {_id: new ObjectId(id), role: "vendor"},
//           {projection: {prices: 1}}
//         );
//         if (!product) {
//           return res.status(404).json({message: "Product not found"});
//         }
//         res.json({prices: product.prices || []});
//       } catch (error) {
//         console.error("Error fetching prices:", error);
//         res.status(500).json({message: "Failed to fetch prices"});
//       }
//     });
//     app.get("/", (req, res) => {
//       res.send("✅ Backend is running");
//     });
//   } catch (error) {
//     console.error("❌ MongoDB connection error:", error);
//   }
// }

// run().catch(console.dir);

// app.listen(port, () => {
//   console.log(`🚀 Server is running on port ${port}`);
// });
const express = require("express");
const app = express();
require("dotenv").config();
const cors = require("cors");
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
app.use(cors());
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
    console.error("Invalid Firebase token:", error);
    return res.status(401).send({message: "Unauthorized: Invalid token"});
  }
};

async function run() {
  try {
    await client.connect();
    const database = client.db("HatBajar");
    const Users = database.collection("Users");

    // ✅ FIXED: Add createdAt when inserting user/product
    app.post("/users", async (req, res) => {
      try {
        const newUser = {
          ...req.body,
          createdAt: new Date(),
        };
        const result = await Users.insertOne(newUser);
        res.status(201).send(result);
      } catch (error) {
        console.error("❌ Error inserting user:", error);
        res.status(500).send({message: "Failed to add user"});
      }
    });

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
        console.error("❌ Error fetching all products:", error);
        res.status(500).send({message: "Failed to fetch products"});
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
        console.error("Error fetching product:", error);
        res.status(500).send({message: "Failed to fetch product"});
      }
    });

    app.post("/wishlist", async (req, res) => {
      try {
        const wishlistData = req.body;
        const wishlistCollection = client.db("HatBajar").collection("wishlist");

        const alreadyExists = await wishlistCollection.findOne({
          userEmail: wishlistData.userEmail,
          productId: wishlistData.productId,
        });

        if (alreadyExists) {
          return res.status(409).send({message: "Product already in wishlist"});
        }

        const result = await wishlistCollection.insertOne({
          ...wishlistData,
          createdAt: new Date(),
        });

        res
          .status(201)
          .send({message: "Added to wishlist", insertedId: result.insertedId});
      } catch (error) {
        console.error("❌ Error inserting into wishlist:", error);
        res.status(500).send({message: "Failed to add to wishlist"});
      }
    });

    app.get("/wishlist/:email", async (req, res) => {
      const {email} = req.params;
      try {
        const wishlistCollection = client.db("HatBajar").collection("wishlist");
        const wishlistItems = await wishlistCollection
          .find({userEmail: email})
          .toArray();
        res.send(wishlistItems);
      } catch (error) {
        console.error("❌ Error fetching wishlist:", error);
        res.status(500).send({message: "Error fetching wishlist"});
      }
    });

    const Reviews = client.db("HatBajar").collection("reviews");

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
        console.error("❌ Error posting review:", error);
        res.status(500).send({message: "Failed to post review"});
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
        console.error("❌ Error fetching reviews:", error);
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

        const result = await Reviews.deleteOne({_id: new ObjectId(id)});
        res.status(200).send({message: "Review deleted successfully"});
      } catch (err) {
        console.error("❌ Error deleting review:", err);
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
        console.error("❌ Error updating review:", error);
        res.status(500).send({message: "Failed to update review"});
      }
    });

    app.get("/product/:id/prices", async (req, res) => {
      try {
        const {id} = req.params;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({message: "Invalid product ID"});
        }
        const product = await Users.findOne(
          {_id: new ObjectId(id), role: "vendor"},
          {projection: {prices: 1}}
        );
        if (!product) {
          return res.status(404).json({message: "Product not found"});
        }
        res.json({prices: product.prices || []});
      } catch (error) {
        console.error("Error fetching prices:", error);
        res.status(500).json({message: "Failed to fetch prices"});
      }
    });

    app.get("/", (req, res) => {
      res.send("✅ Backend is running");
    });
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
