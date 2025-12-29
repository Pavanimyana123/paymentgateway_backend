const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const db = require("./db");

const router = express.Router();

// Helper function to get credentials based on environment
const getRazorpayCredentials = (env) => {
  const envSuffix = env === 'live' ? '_LIVE' : '_TEST';
  return {
    key_id: process.env[`RAZORPAY_KEY_ID${envSuffix}`],
    key_secret: process.env[`RAZORPAY_KEY_SECRET${envSuffix}`]
  };
};

// Initialize Razorpay based on environment
const initializeRazorpay = (env) => {
  const credentials = getRazorpayCredentials(env);
  return new Razorpay({
    key_id: credentials.key_id,
    key_secret: credentials.key_secret,
  });
};

// Function to get environment from company profile
const getEnvironmentFromCompanyProfile = async () => {
  try {
    const [companyRows] = await db.execute(
      `SELECT environment FROM company_profile ORDER BY id DESC LIMIT 1`
    );

    if (companyRows.length > 0 && companyRows[0].environment) {
      const env = companyRows[0].environment;
      return (env === 'live' || env === 'test') ? env : 'test';
    }
  } catch (error) {
    console.error("Error fetching environment from company profile:", error);
  }
  return 'test'; // Default to test if not found
};

// Initialize currentEnv from database
let currentEnv = 'test'; // Default value
let razorpay = null; // Initialize later

// Initialize environment and Razorpay client on module load
(async () => {
  try {
    currentEnv = await getEnvironmentFromCompanyProfile();
    razorpay = initializeRazorpay(currentEnv);
    console.log(`Razorpay environment initialized to: ${currentEnv}`);
  } catch (error) {
    console.error("Error initializing Razorpay environment:", error);
    currentEnv = 'test'; // Fallback to test
    razorpay = initializeRazorpay(currentEnv);
  }
})();

function getPublicImageUrl(logoPath, req) {
  // If you have a public domain, use it
  if (process.env.BACKEND_URL) {
    return `${process.env.BACKEND_URL}${logoPath}`;
  }

  // For development, you might need to use a publicly accessible image
  // Razorpay cannot access localhost images
  return logoPath.startsWith('http') ?
    logoPath :
    // Use a placeholder or ensure the image is publicly accessible
    'https://via.placeholder.com/150';
}

/* ================= COMBINED RAZORPAY API ================= */
router.post("/razorpay/orders", async (req, res) => {
  try {
    const { action, amount, currency, paymentData, returnOptions } = req.body;

    // Get environment from company profile table
    const env = await getEnvironmentFromCompanyProfile();
    
    // Update current environment if it changed
    if (env !== currentEnv) {
      currentEnv = env;
      razorpay = initializeRazorpay(currentEnv);
      console.log(`Razorpay environment updated to: ${currentEnv}`);
    }

    console.log(`Razorpay API called - Action: ${action}, Env: ${env}, Return Options: ${returnOptions}`);
    console.log(`Razorpay API called - Action: ${action}, Env: ${env}, Return Options: ${returnOptions}`);

    if (action === 'create-order') {
      // Create Order
      const credentials = getRazorpayCredentials(env);

      const amountInPaise = Math.round(Number(amount) * 100);

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: currency || "INR",
        receipt: `receipt_${Date.now()}_${env}`,
        payment_capture: 1,
      });

      // ✅ Store in DB with environment
      await db.execute(
        `INSERT INTO transactions 
         (gateway, order_id, amount, currency, status, environment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["razorpay", order.id, amount, order.currency, "CREATED", env]
      );

      // If returnOptions is true, return complete options object
      if (returnOptions) {
        // Fetch company profile
        const [companyRows] = await db.execute(
          `SELECT * FROM company_profile ORDER BY id DESC LIMIT 1`
        );

        const companyProfile = companyRows.length > 0 ? companyRows[0] : {
          company_name: "My Company",
          company_email: "",
          company_phone: "",
          company_website: "",
          company_logo: ""
        };

        // Build complete options object with UPI as default
        const options = {
          key: credentials.key_id,
          amount: amountInPaise,
          currency: order.currency,
          order_id: order.id,
          name: companyProfile.company_name || "My Company",
          description: `Payment of ${order.currency} ${amount}`,
          image: companyProfile.company_logo ?
            getPublicImageUrl(companyProfile.company_logo, req) :
            getPublicImageUrl('/default-logo.png', req),
          theme: {
            color: env === "live" ? "#28a745" : "#0d6efd"
          },
          prefill: {
            name: companyProfile.company_name || "",
            email: companyProfile.company_email || "",
            contact: companyProfile.company_phone || ""
          },
          notes: {
            environment: env,
            company: companyProfile.company_name,
            order_id: order.id,
            timestamp: new Date().toISOString()
          },
          modal: {
            ondismiss: function () {
              console.log("Razorpay checkout closed");
            },
            escape: true,
            backdropclose: true
          },
          config: {
            display: {
              blocks: {
                banks: {
                  name: "Bank Transfer",
                  instruments: [
                    {
                      method: "netbanking"
                    }
                  ]
                }
              },
              sequence: ["block.banks"],
              preferences: {
                show_default_blocks: true
              }
            }
          }
        };

        return res.json({
          success: true,
          action: 'order-created-with-options',
          options: options,
          order_id: order.id,
          amount: amount,
          currency: order.currency,
          environment: env
        });
      } else {
        // Return basic order info
        return res.json({
          success: true,
          action: 'order-created',
          order_id: order.id,
          amount: amount,
          currency: order.currency,
          environment: env,
          key: credentials.key_id
        });
      }

    } else if (action === 'verify-payment') {
      // Verify Payment
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;

      const body = `${razorpay_order_id}|${razorpay_payment_id}`;
      const credentials = getRazorpayCredentials(env);
      const key_secret = credentials.key_secret;

      const expectedSignature = crypto
        .createHmac("sha256", key_secret)
        .update(body)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        await db.execute(
          `UPDATE transactions SET status=?, environment=? WHERE order_id=?`,
          ["FAILED", env, razorpay_order_id]
        );

        return res.json({
          success: false,
          action: 'verification-failed',
          message: 'Payment verification failed'
        });
      }

      // ✅ Update transaction
      await db.execute(
        `UPDATE transactions 
         SET payment_id=?, status=?, environment=?
         WHERE order_id=?`,
        [razorpay_payment_id, "SUCCESS", env, razorpay_order_id]
      );

      return res.json({
        success: true,
        action: 'verification-success',
        message: 'Payment verified successfully'
      });

    } else if (action === 'get-order-details') {
      // Get Order Details
      const { order_id } = req.body;

      try {
        const order = await razorpay.orders.fetch(order_id);
        return res.json({
          success: true,
          action: 'order-details',
          order: order
        });
      } catch (error) {
        return res.status(404).json({
          success: false,
          action: 'order-not-found',
          message: 'Order not found'
        });
      }

    } else if (action === 'get-options') {
      // Get Razorpay options without creating order
      const credentials = getRazorpayCredentials(env);

      // Fetch company profile
      const [companyRows] = await db.execute(
        `SELECT * FROM company_profile ORDER BY id DESC LIMIT 1`
      );

      const companyProfile = companyRows.length > 0 ? companyRows[0] : {
        company_name: "My Company",
        company_email: "",
        company_phone: "",
        company_website: "",
        company_logo: ""
      };

      // Build options template
      const optionsTemplate = {
        key: credentials.key_id,
        name: companyProfile.company_name || "My Company",
        description: "Secure Payment",
        image: companyProfile.company_logo ?
          `${req.protocol}://${req.get('host')}${companyProfile.company_logo}` :
          `${req.protocol}://${req.get('host')}/default-logo.png`,
        theme: {
          color: env === "live" ? "#28a745" : "#0d6efd"
        },
        prefill: {
          name: companyProfile.company_name || "",
          email: companyProfile.company_email || "",
          contact: companyProfile.company_phone || ""
        },
        notes: {
          environment: env,
          company: companyProfile.company_name
        },
        modal: {
          ondismiss: function () {
            console.log("Razorpay checkout closed");
          },
          escape: true,
          backdropclose: true
        }
      };

      return res.json({
        success: true,
        action: 'options-template',
        options: optionsTemplate,
        environment: env
      });

    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use: create-order, verify-payment, get-order-details, or get-options'
      });
    }

  } catch (error) {
    console.error("Razorpay API error:", error);
    res.status(500).json({
      success: false,
      error: "Razorpay operation failed",
      details: error.message
    });
  }
});


module.exports = router;