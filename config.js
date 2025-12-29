const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

// Determine which .env file to load based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' 
    ? '.env.production' 
    : '.env.development';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, envFile) });

const config = {
    // App mode
    appMode: process.env.APP_MODE || 'TEST',
    
    // Razorpay
    razorpay: {
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
        mode: process.env.APP_MODE // TEST or LIVE
    },
    
    // PhonePe
    phonepe: {
        clientId: process.env.PHONEPE_CLIENT_ID,
        clientSecret: process.env.PHONEPE_CLIENT_SECRET,
        env: process.env.PHONEPE_ENV,
        clientVersion: process.env.PHONEPE_CLIENT_VERSION || '1',
        mode: process.env.APP_MODE
    },
    
    // CC Avenue
    ccavenue: {
        merchant_id: process.env.CCAVENUE_MERCHANT_ID,
        working_key: process.env.CCAVENUE_WORKING_KEY,
        access_code: process.env.CCAVENUE_ACCESS_CODE,
        redirect_url: process.env.REDIRECT_URL,
        payment_url: process.env.CCAVENUE_PAYMENT_URL,
        cancel_url: process.env.CCAVENUE_CANCEL_URL,
        mode: process.env.APP_MODE
    },
    
    // Frontend URLs
    frontend: {
        paymentResultUrl: process.env.FRONTEND_PAYMENT_RESULT_URL
    }
};

// Validate required config
const validateConfig = () => {
    const required = ['razorpay', 'phonepe', 'ccavenue'];
    required.forEach(service => {
        Object.keys(config[service]).forEach(key => {
            if (!config[service][key] && key !== 'mode') {
                console.warn(`⚠️ Missing ${service}.${key} in ${envFile}`);
            }
        });
    });
};

validateConfig();

module.exports = config;