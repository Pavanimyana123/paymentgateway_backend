const express = require("express");
const { randomUUID } = require("crypto");
const {
  StandardCheckoutClient,
  Env,
  StandardCheckoutPayRequest,
} = require("pg-sdk-node");
const db = require("./db");

const router = express.Router();

// Helper function to get PhonePe credentials
const getPhonePeCredentials = (env) => {
  const envSuffix = env === 'live' ? '_LIVE' : '_TEST';
  return {
    clientId: process.env[`PHONEPE_CLIENT_ID${envSuffix}`],
    clientSecret: process.env[`PHONEPE_CLIENT_SECRET${envSuffix}`],
    phonePeEnv: process.env[`PHONEPE_ENV${envSuffix}`] || 'SANDBOX'
  };
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

// Initialize on module load
(async () => {
  try {
    currentEnv = await getEnvironmentFromCompanyProfile();
    console.log(`PhonePe environment initialized to: ${currentEnv}`);
  } catch (error) {
    console.error("Error initializing PhonePe environment:", error);
    currentEnv = 'test'; // Fallback to test
  }
})();

// Create or get client based on environment
let phonePeClientCache = {
  test: null,
  live: null
};

const getPhonePeClient = (env) => {
  const credentials = getPhonePeCredentials(env);
  
  // If client for this environment already exists, return it
  if (phonePeClientCache[env]) {
    return phonePeClientCache[env];
  }
  
  // Create new client
  const client = StandardCheckoutClient.getInstance(
    credentials.clientId,
    credentials.clientSecret,
    Number(process.env.PHONEPE_CLIENT_VERSION) || 1,
    credentials.phonePeEnv === "PRODUCTION" ? Env.PRODUCTION : Env.SANDBOX
  );
  
  // Cache the client
  phonePeClientCache[env] = client;
  return client;
};

// Function to get the current environment (fetches from DB)
const getCurrentEnvironment = async () => {
  // Always fetch fresh from DB
  return await getEnvironmentFromCompanyProfile();
};

const FRONTEND_PAYMENT_RESULT_URL = process.env.FRONTEND_PAYMENT_RESULT_URL;

/* ================= COMBINED PHONEPE API ================= */
router.post("/phonepe/orders", async (req, res) => {
  try {
    const { action, amount, currency, merchantOrderId } = req.body;
    
    // Get environment from company profile table
    const env = await getCurrentEnvironment();
    console.log(`PhonePe API called - Action: ${action}, Env: ${env}`);
    
    if (action === 'create-order') {
      // Create Order
      if (!amount) {
        return res.status(400).json({
          success: false,
          message: "Amount is required"
        });
      }
      
      const amountInPaise = Math.round(Number(amount) * 100);
      const orderId = merchantOrderId || randomUUID();

      // Get the PhonePe client for the current environment
      const client = getPhonePeClient(env);
      
      const request = StandardCheckoutPayRequest.builder()
        .merchantOrderId(orderId)
        .amount(amountInPaise)
        .redirectUrl(
          `${FRONTEND_PAYMENT_RESULT_URL}?orderId=${orderId}&gateway=phonepe&environment=${env}`
        )
        .build();

      const response = await client.pay(request);

      await db.execute(
        `INSERT INTO transactions
         (gateway, order_id, amount, currency, status, environment)
         VALUES (?, ?, ?, ?, ?, ?)`,
        ["phonepe", orderId, amount, currency || "INR", "CREATED", env]
      );

      return res.json({
        success: true,
        action: 'order-created',
        checkoutPageUrl: response.redirectUrl,
        merchantOrderId: orderId,
        amount: amount,
        currency: currency || "INR",
        environment: env
      });
      
    } else if (action === 'check-status') {
      // Check Status
      if (!merchantOrderId) {
        return res.status(400).json({
          success: false,
          message: "merchantOrderId is required"
        });
      }

      console.log(`Checking PhonePe status for: ${merchantOrderId}, env: ${env}`);

      // Get the PhonePe client for the current environment
      const client = getPhonePeClient(env);
      const response = await client.getOrderStatus(merchantOrderId);
      
      console.log("PhonePe API response:", response);
      
      const phonepeStatus = response.state || response.status;
      let finalStatus = "PENDING";

      if (phonepeStatus === "COMPLETED" || phonepeStatus === "SUCCESS") {
        finalStatus = "SUCCESS";
        await db.execute(
          `UPDATE transactions SET status=? WHERE order_id=?`,
          ["SUCCESS", merchantOrderId]
        );
      } else if (phonepeStatus === "FAILED") {
        finalStatus = "FAILED";
        await db.execute(
          `UPDATE transactions SET status=? WHERE order_id=?`,
          ["FAILED", merchantOrderId]
        );
      }

      return res.json({
        success: true,
        action: 'status-checked',
        merchantOrderId,
        status: finalStatus,
        phonepeStatus: phonepeStatus,
        environment: env
      });
      
    } else if (action === 'get-transaction') {
      // Get Transaction Details
      if (!merchantOrderId) {
        return res.status(400).json({
          success: false,
          message: "merchantOrderId is required"
        });
      }

      // Get from database
      const [dbRows] = await db.execute(
        `SELECT * FROM transactions WHERE order_id = ?`,
        [merchantOrderId]
      );

      if (dbRows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Transaction not found"
        });
      }

      // Get current status from PhonePe
      const client = getPhonePeClient(env);
      const phonepeResponse = await client.getOrderStatus(merchantOrderId);
      
      const transaction = dbRows[0];
      
      return res.json({
        success: true,
        action: 'transaction-details',
        transaction: {
          ...transaction,
          phonepeStatus: phonepeResponse.state || phonepeResponse.status,
          phonepeResponse: phonepeResponse
        }
      });
      
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid action. Use: create-order, check-status, or get-transaction"
      });
    }
    
  } catch (error) {
    console.error("PhonePe API error:", error);
    res.status(500).json({
      success: false,
      message: "PhonePe operation failed",
      error: error.message
    });
  }
});

module.exports = router;