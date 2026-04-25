const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const razorpayRoutes = require("./razorpay");
const phonepayRoutes = require("./phonepe");
const ccavenueRoutes = require("./ccavenue");
const companyProfileRoutes = require("./companyProfile");

const app = express();

// 🔥 FIX: Configure CORS properly for Razorpay
app.use(cors({
  origin: ['https://api.razorpay.com', 'https://checkout.razorpay.com', 'http://localhost:3000', 'http://localhost:3001', ],
  credentials: true,
  exposedHeaders: ['x-rtb-fingerprint-id'] // Allow Razorpay headers
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files with proper headers
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, path) => {
    // 🔥 FIX: Allow Razorpay to access images
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// Store environment in app locals
app.locals.paymentEnv = process.env.PAYMENT_ENV || 'test';

console.log(`🚀 Payment Gateway running in ${app.locals.paymentEnv.toUpperCase()} mode`);

app.use("/api", razorpayRoutes);
app.use("/api", phonepayRoutes);
app.use("/api", ccavenueRoutes);
app.use("/api", companyProfileRoutes);

// Add endpoint to get current environment
app.get("/api/environment", (req, res) => {
  res.json({ environment: app.locals.paymentEnv });
});

app.listen(5000, () => {
  console.log("🚀 Server running on http://localhost:5000");
});