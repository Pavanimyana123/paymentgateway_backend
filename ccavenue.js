const express = require("express");
const { randomUUID } = require("crypto");
const qs = require("querystring");
const db = require("./db");
const ccav = require("./ccavenueCrypto");

const router = express.Router();

// Helper function to get CCAvenue configuration
const getCCAvenueConfig = (env) => {
  const envSuffix = env === 'live' ? '_LIVE' : '_TEST';
  return {
    merchant_id: process.env[`CCAVENUE_MERCHANT_ID${envSuffix}`],
    working_key: process.env[`CCAVENUE_WORKING_KEY${envSuffix}`],
    access_code: process.env[`CCAVENUE_ACCESS_CODE${envSuffix}`],
    payment_url: process.env[`CCAVENUE_PAYMENT_URL${envSuffix}`],
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
    console.log(`CC Avenue environment initialized to: ${currentEnv}`);
  } catch (error) {
    console.error("Error initializing CC Avenue environment:", error);
    currentEnv = 'test'; // Fallback to test
  }
})();

// Function to get the current environment (fetches from DB)
const getCurrentEnvironment = async () => {
  // Always fetch fresh from DB
  return await getEnvironmentFromCompanyProfile();
};

const FRONTEND_PAYMENT_RESULT_URL = process.env.FRONTEND_PAYMENT_RESULT_URL;

/* ================= CREATE CC AVENUE ORDER ================= */
router.post("/ccavenue/create-order", async (req, res) => {
  try {
    const { amount, currency, shippingAddress, orderMeta } = req.body;
    
    // Get environment from company profile table
    const env = await getCurrentEnvironment();
    const config = getCCAvenueConfig(env);
    
    const orderId = randomUUID();

    // Save transaction with environment
    await db.execute(
      `INSERT INTO transactions (gateway, order_id, amount, currency, status, environment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ["ccavenue", orderId, amount, currency, "CREATED", env]
    );

    const paymentData = {
      merchant_id: config.merchant_id,
      order_id: orderId,
      amount: Number(amount).toFixed(2),
      currency: currency || "INR",
      redirect_url: process.env.CCAVENUE_REDIRECT_URL,
      cancel_url: process.env.CCAVENUE_CANCEL_URL,
      language: "EN",
      billing_name: shippingAddress.fullName,
      billing_address: shippingAddress.addressLine1,
      billing_city: shippingAddress.city,
      billing_state: shippingAddress.state,
      billing_zip: shippingAddress.postalCode,
      billing_country: shippingAddress.country,
      billing_tel: shippingAddress.phone,
      billing_email: shippingAddress.email,
      delivery_name: shippingAddress.fullName,
      delivery_address: shippingAddress.addressLine1,
      delivery_city: shippingAddress.city,
      delivery_state: shippingAddress.state,
      delivery_zip: shippingAddress.postalCode,
      delivery_country: shippingAddress.country,
      delivery_tel: shippingAddress.phone,
      merchant_param1: orderMeta.userId,
      merchant_param2: "ecommerce_order",
      merchant_param3: JSON.stringify({...orderMeta, environment: env}),
    };

    res.json({
      redirectUrl: process.env.REDIRECT_URL,
      paymentData,
      environment: env
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= CC AVENUE REQUEST HANDLER ================= */
router.post('/ccavRequestHandler', async (req, res) => {
  try {
    // Get environment from company profile table
    const env = await getCurrentEnvironment();
    const config = getCCAvenueConfig(env);
    
    const plainText = qs.stringify(req.body);
    const encRequest = ccav.encrypt(plainText, config.working_key);

    const htmlForm = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Redirecting to CCAvenue...</title>
    </head>
    <body>
        <center>
            <h1>Please wait, redirecting to CCAvenue...</h1>
            <p>Do not refresh or press back button.</p>
        </center>
        
        <form id="redirectForm" method="post" action="${config.payment_url}">
            <input type="hidden" name="encRequest" value="${encRequest}">
            <input type="hidden" name="access_code" value="${config.access_code}">
        </form>
        
        <script type="text/javascript">
            document.getElementById('redirectForm').submit();
        </script>
    </body>
    </html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(htmlForm);

  } catch (error) {
    console.error('❌ Error in ccavRequestHandler:', error);
    res.status(500).send(`<h1>Payment Gateway Error</h1><p>${error.message}</p>`);
  }
});

/* ================= CC AVENUE RESPONSE HANDLER ================= */
router.post("/ccavResponseHandler", async (req, res) => {
  try {
    const encResp = req.body.encResp;
    if (!encResp) throw new Error("No response from CCAvenue");

    // Try both environments for decryption (test first, then live)
    let responseData;
    let env;
    let decrypted;
    
    // First try with test environment
    try {
      const testConfig = getCCAvenueConfig('test');
      decrypted = ccav.decrypt(encResp, testConfig.working_key);
      responseData = qs.parse(decrypted);
      env = 'test';
    } catch (testError) {
      // If test fails, try live environment
      try {
        const liveConfig = getCCAvenueConfig('live');
        decrypted = ccav.decrypt(encResp, liveConfig.working_key);
        responseData = qs.parse(decrypted);
        env = 'live';
      } catch (liveError) {
        throw new Error("Failed to decrypt response with both test and live keys");
      }
    }
    
    const { order_id, order_status, tracking_id } = responseData;

    if (order_status === "Success") {
      await db.execute(
        `UPDATE transactions SET status=?, payment_id=?, environment=? WHERE order_id=?`,
        ["SUCCESS", tracking_id, env, order_id]
      );
    } else {
      await db.execute(
        `UPDATE transactions SET status=?, environment=? WHERE order_id=?`,
        ["FAILED", env, order_id]
      );
    }

    // Redirect to frontend with environment
    res.redirect(
      `${FRONTEND_PAYMENT_RESULT_URL}?status=${order_status}&orderId=${order_id}&gateway=ccavenue&environment=${env}`
    );

  } catch (error) {
    console.error(error);
    res.status(500).send(`<h1>Payment Processing Error</h1><p>${error.message}</p>`);
  }
});

module.exports = router;