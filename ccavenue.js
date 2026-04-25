const express = require("express");
const { randomUUID } = require("crypto");
const qs = require("querystring");
const db = require("./db");
const ccav = require("./ccavenueCrypto");
const axios = require("axios");

const router = express.Router();

// Helper function to get CCAvenue configuration
const getCCAvenueConfig = (env) => {
  const envSuffix = env === "live" ? "_LIVE" : "_TEST";
  return {
    merchant_id: process.env[`CCAVENUE_MERCHANT_ID${envSuffix}`],
    working_key: process.env[`CCAVENUE_WORKING_KEY${envSuffix}`],
    access_code: process.env[`CCAVENUE_ACCESS_CODE${envSuffix}`],
    payment_url: process.env[`CCAVENUE_PAYMENT_URL${envSuffix}`],
    split_api_url:
      env === "live"
        ? "https://login.ccavenue.com/apis/servlet/DoWebTrans"
        : "https://apitest.ccavenue.com/apis/servlet/DoWebTrans",
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
      return env === "live" || env === "test" ? env : "test";
    }
  } catch (error) {
    console.error("Error fetching environment from company profile:", error);
  }
  return "test"; // Default to test if not found
};

// Initialize currentEnv from database
let currentEnv = "test"; // Default value

// Initialize on module load
(async () => {
  try {
    currentEnv = await getEnvironmentFromCompanyProfile();
    console.log(`CC Avenue environment initialized to: ${currentEnv}`);
  } catch (error) {
    console.error("Error initializing CC Avenue environment:", error);
    currentEnv = "test"; // Fallback to test
  }
})();

// Function to get the current environment (fetches from DB)
const getCurrentEnvironment = async () => {
  // Always fetch fresh from DB
  return await getEnvironmentFromCompanyProfile();
};

const FRONTEND_PAYMENT_RESULT_URL = process.env.FRONTEND_PAYMENT_RESULT_URL;

const generateOrderId = () => {
  const now = new Date();

  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = now.getFullYear();

  const HH = String(now.getHours()).padStart(2, "0");
  const MM = String(now.getMinutes()).padStart(2, "0");
  const SS = String(now.getSeconds()).padStart(2, "0");

  return `ORD_${dd}${mm}${yyyy}${HH}${MM}${SS}`;
};

/* ================= CREATE CC AVENUE ORDER ================= */
router.post("/ccavenue/create-order", async (req, res) => {
  try {
    const { amount, currency, shippingAddress, orderMeta } = req.body;

    // Get environment from company profile table
    const env = await getCurrentEnvironment();
    const config = getCCAvenueConfig(env);

    const orderId = generateOrderId();

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
      merchant_param3: JSON.stringify({ ...orderMeta, environment: env }),
    };

    res.json({
      redirectUrl: process.env.REDIRECT_URL,
      paymentData,
      environment: env,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ================= CC AVENUE REQUEST HANDLER ================= */
router.post("/ccavRequestHandler", async (req, res) => {
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

    res.setHeader("Content-Type", "text/html");
    res.send(htmlForm);
  } catch (error) {
    console.error("❌ Error in ccavRequestHandler:", error);
    res
      .status(500)
      .send(`<h1>Payment Gateway Error</h1><p>${error.message}</p>`);
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
      const testConfig = getCCAvenueConfig("test");
      decrypted = ccav.decrypt(encResp, testConfig.working_key);
      responseData = qs.parse(decrypted);
      env = "test";
    } catch (testError) {
      // If test fails, try live environment
      try {
        const liveConfig = getCCAvenueConfig("live");
        decrypted = ccav.decrypt(encResp, liveConfig.working_key);
        responseData = qs.parse(decrypted);
        env = "live";
      } catch (liveError) {
        throw new Error(
          "Failed to decrypt response with both test and live keys"
        );
      }
    }

    const {
      order_id,
      order_status,
      tracking_id,
      bank_ref_no, // This is the bank reference number
      failure_message,
      status_code,
      status_message,
    } = responseData;

    if (order_status === "Success") {
      await db.execute(
        `UPDATE transactions 
         SET status=?, 
             payment_id=?, 
             bank_ref_no=?, 
             environment=? 
         WHERE order_id=?`,
        ["SUCCESS", tracking_id, bank_ref_no, env, order_id]
      );
    } else {
      await db.execute(
        `UPDATE transactions 
         SET status=?, 
             payment_id=?, 
             bank_ref_no=?, 
             environment=? 
         WHERE order_id=?`,
        ["FAILED", tracking_id || null, bank_ref_no || null, env, order_id]
      );
    }

    // Redirect to frontend with environment
    res.redirect(
      `${FRONTEND_PAYMENT_RESULT_URL}?status=${order_status}&orderId=${order_id}&gateway=ccavenue&environment=${env}`
    );
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .send(`<h1>Payment Processing Error</h1><p>${error.message}</p>`);
  }
});

router.post("/create-split-payout", async (req, res) => {
  try {
    const { reference_no, amount, sub_account_id } = req.body;

    if (!reference_no || !amount || !sub_account_id) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
      });
    }

    const env = await getCurrentEnvironment();
    const config = getCCAvenueConfig(env);

    /* ===============================
       🔢 CALCULATIONS
    =============================== */
    // Base amount
    const totalAmount = Number(amount);

    // Merchant & Vendor split
    const merchantCommissionGross = Number((totalAmount * 0.1).toFixed(2)); // 10%
    const vendorPayout = Number((totalAmount * 0.9).toFixed(2)); // 90%

    // CC Avenue charges
    const ccAvenueFee = Number((totalAmount * 0.0199).toFixed(2)); // 1.99%
    const taxOnTransaction = Number((ccAvenueFee * 0.18).toFixed(2)); // 18% GST
    const merchantCommissionNet = Number(
      (merchantCommissionGross - ccAvenueFee - taxOnTransaction).toFixed(2)
    );

    // Logs
    console.log("💰 Total Amount:", totalAmount);
    console.log("🏦 Merchant Commission (10%):", merchantCommissionGross);
    console.log("🧾 Vendor Payout (90%):", vendorPayout);
    console.log("💳 CC Avenue Fee (1.99%):", ccAvenueFee);
    console.log("📊 Tax on CC Avenue Fee (18%):", taxOnTransaction);

    /* ===============================
       📦 PAYLOAD
    =============================== */
    const payload = {
      reference_no,
      split_tdr_charge_type: "M",

      // ✅ FLOAT / NUMBER
      merComm: Number(merchantCommissionGross),

      split_data_list: [
        {
          // ✅ FLOAT / NUMBER
          splitAmount: Number(vendorPayout),
          subAccId: sub_account_id,
        },
      ],
    };
    console.log("Payload for split payout:", payload);

    /* ===============================
       🔐 ENCRYPT
    =============================== */
    const encRequest = ccav.encrypt(
      JSON.stringify(payload),
      config.working_key
    );

    const requestBody = qs.stringify({
      enc_request: encRequest,
      access_code: config.access_code,
      request_type: "JSON",
      command: "createSplitPayout",
      version: "1.2",
    });

    /* ===============================
       📡 API CALL
    =============================== */
    const response = await axios.post(config.split_api_url, requestBody, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    const parsedResponse = qs.parse(response.data);

    if (parsedResponse.status === "1") {
      return res.json({
        success: false,
        error: parsedResponse.enc_response,
      });
    }

    const decrypted = ccav.decrypt(
      parsedResponse.enc_response,
      config.working_key
    );

    const finalResponse = JSON.parse(decrypted);

    /* ===============================
       ✅ SAVE TO DB
    =============================== */
    if (finalResponse?.Create_Split_Payout_Result?.status === 0) {
      // const fee = Number(finalResponse?.Create_Split_Payout_Result?.fee || 0);
      // const tax = Number(finalResponse?.Create_Split_Payout_Result?.tax || 0);

      // console.log("fee and tax:", fee, tax);

      await db.execute(
        `INSERT INTO split_payouts
        (reference_number, sub_account_id, merchant_commission,
         vendor_payout, ccavenue_fee, tax_on_transaction, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reference_no,
          sub_account_id,
          merchantCommissionNet, // ✅ NET amount
          vendorPayout,
          ccAvenueFee,
          taxOnTransaction,
          "SUCCESS",
        ]
      );
    }

    res.json({ success: true, data: finalResponse });
  } catch (error) {
    console.error("❌ Split payout error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get("/split-payouts", async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM split_payouts ORDER BY created_at DESC`
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error("❌ Fetch split payouts error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
