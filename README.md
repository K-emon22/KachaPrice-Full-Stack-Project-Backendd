
# KachaPrice - Backend Server

This repository contains the backend server code for the **KachaDam** application. It is a Node.js and Express.js API that handles user authentication, role-based access control, product data management, vendor submissions, and payment processing.

**Frontend Repo:** [Frontend repo](https://github.com/Programming-Hero-Web-Course4/b11a12-client-side-K-emon22)

---

## 🚀 API Features

-   **Authentication:** Secure user registration and login using JWT. Implements Firebase Admin SDK for token verification, including social logins.
-   **Role-Based Access:** Middleware to protect routes based on user roles (User, Vendor, Admin).
-   **Product Management:** CRUD operations for products, with vendors submitting price data and admins approving or rejecting submissions.
-   **User Management:** Admins can view and manage all users and their roles.
-   **Payment Processing:** Securely handles payments for advertisements or products via the Stripe API.
-   **Data Handling:** Advanced filtering, sorting, and pagination for product and user queries, implemented on the server side for performance.

---

## 🛠️ Technologies & Packages Used

| Package             | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| **`express`** | A fast, unopinionated, minimalist web framework for Node.js. |
| **`mongodb`** | The official MongoDB driver for Node.js.                   |
| **`cors`** | Middleware for enabling Cross-Origin Resource Sharing.     |
| **`dotenv`** | Manages environment variables from a `.env` file.          |
| **`firebase-admin`**| For backend integration with Firebase (e.g., verifying tokens). |
| **`stripe`** | The official Node.js library for the Stripe API.           |
| **`nodemon`** | (Dev) Automatically restarts the server during development.    |

---

## ⚙️ Environment Variables Setup

To run this project, you need to set up your environment variables. Create a file named `.env` in the root of the project and add the following key-value pairs.

```env
# Server Configuration
PORT=5000

# MongoDB Credentials
DB_USER=your_mongodb_username
DB_PASS=your_mongodb_password

# JWT Secret
ACCESS_TOKEN_SECRET=your_super_secret_jwt_token_string

# Stripe API Key
STRIPE_SECRET_KEY=your_stripe_secret_key_here

# Firebase Admin SDK Configuration
# You get this JSON from your Firebase project settings -> Service accounts
FIREBASE_ADMIN_SDK={
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "your-private-key-id",
  "private_key": "-----BEGIN PRIVATE KEY-----\your-private-key\n-----END PRIVATE KEY-----\n",
  "client_email": "your-client-email@your-project-id.iam.gserviceaccount.com",
  "client_id": "your-client-id",
  "auth_uri": "[https://accounts.google.com/o/oauth2/auth](https://accounts.google.com/o/oauth2/auth)",
  "token_uri": "[https://oauth2.googleapis.com/token](https://oauth2.googleapis.com/token)",
  "auth_provider_x509_cert_url": "[https://www.googleapis.com/oauth2/v1/certs](https://www.googleapis.com/oauth2/v1/certs)",
  "client_x509_cert_url": "[https://www.googleapis.com/robot/v1/metadata/x509/your-client-email.iam.gserviceaccount.com](https://www.googleapis.com/robot/v1/metadata/x509/your-client-email.iam.gserviceaccount.com)"
}