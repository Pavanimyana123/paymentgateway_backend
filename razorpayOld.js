const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const router = express.Router();

// ✅ Initialize Razorpay
const razorpay = new Razorpay({
  key_id: "rzp_test_jIUzBukJnwE5kE",
  key_secret: "ZhnhUtHuusGrZBSqBAnwXhAI",
});

/* ================================
   CREATE ORDER
================================ */
router.post("/api/razorpay/orders", async (req, res) => {
  try {
    const options = {
      amount: Number(req.body.amount), // in paise
      currency: req.body.currency || "INR",
      receipt: `receipt_${Date.now()}`,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    res.json({
      order_id: order.id,
      currency: order.currency,
      amount: order.amount,
    });
  } catch (error) {
    console.error("Order error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

/* ================================
   VERIFY PAYMENT
================================ */
router.post("/api/razorpay/verify-payment", (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  const sign = `${razorpay_order_id}|${razorpay_payment_id}`;

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "xxxxxxxx")
    .update(sign)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    res.json({ success: true, message: "Payment verified" });
  } else {
    res.status(400).json({ success: false, message: "Invalid signature" });
  }
});

/* ================================
   CREATE CUSTOMER
================================ */
router.post("/razorpay/customer", async (req, res) => {
  try {
    const customer = await razorpay.customers.create({
      name: req.body.name,
      email: req.body.email,
      contact: req.body.contact ? String(req.body.contact) : undefined,
      notes: req.body.notes || {},
    });

    res.status(201).json({
      success: true,
      customer_id: customer.id,
      customer,
    });
  } catch (error) {
    console.error("Customer error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================================
   CREATE PLAN
================================ */
router.post("/razorpay/plan", async (req, res) => {
  try {
    const plan = await razorpay.plans.create({
      period: req.body.period || "monthly",
      interval: req.body.interval || 1,
      item: {
        name: req.body.plan_name,
        description: req.body.description,
        amount: Math.round(Number(req.body.amount) * 100),
        currency: req.body.currency || "INR",
      },
    });

    res.status(201).json({ success: true, plan });
  } catch (error) {
    console.error("Plan error:", error);
    res.status(500).json({ error: error.message });
  }
});

/* ================================
   CREATE SUBSCRIPTION
================================ */
router.post("/razorpay/subscription", async (req, res) => {
  try {
    const subscription = await razorpay.subscriptions.create({
      plan_id: req.body.plan_id,
      customer_id: req.body.customer_id,
      total_count: req.body.total_count || 12,
      customer_notify: 1,
      notes: req.body.notes || {},
    });

    res.json({ success: true, subscription });
  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
