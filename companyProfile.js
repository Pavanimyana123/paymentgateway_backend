const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("./db");

const router = express.Router();

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/company-logos/';
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'company-logo-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: function (req, file, cb) {
        // Accept only image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

/* ================= GET COMPANY PROFILE ================= */
router.get("/company-profile", async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT * FROM company_profile ORDER BY id DESC LIMIT 1`
        );

        if (rows.length === 0) {
            return res.json({
                success: true,
                profile: {
                    company_name: '',
                    company_email: '',
                    company_phone: '',
                    company_address: '',
                    company_city: '',
                    company_state: '',
                    company_country: '',
                    company_pincode: '',
                    company_gst: '',
                    company_pan: '',
                    company_website: '',
                    company_logo: '',
                    currency: 'INR',
                    timezone: 'Asia/Kolkata'
                }
            });
        }

        res.json({
            success: true,
            profile: rows[0]
        });
    } catch (error) {
        console.error("Error fetching company profile:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch company profile"
        });
    }
});

/* ================= UPDATE COMPANY PROFILE ================= */
router.post("/company-profile", upload.single('company_logo'), async (req, res) => {
    try {
        const {
            company_name,
            company_email,
            company_phone,
            company_address,
            company_city,
            company_state,
            company_country,
            company_pincode,
            company_gst,
            company_pan,
            company_website,
            currency,
            timezone,
            environment
        } = req.body;

        // Check if profile exists
        const [existingRows] = await db.execute(
            `SELECT * FROM company_profile`
        );

        let company_logo = null;
        
        // Handle file upload
        if (req.file) {
            company_logo = `/uploads/company-logos/${req.file.filename}`;
            
            // Delete old logo if exists
            if (existingRows.length > 0 && existingRows[0].company_logo) {
                const oldLogoPath = path.join(__dirname, '..', existingRows[0].company_logo);
                if (fs.existsSync(oldLogoPath)) {
                    fs.unlinkSync(oldLogoPath);
                }
            }
        }

        if (existingRows.length === 0) {
            // Create new profile
            await db.execute(
                `INSERT INTO company_profile (
                    company_name, company_email, company_phone, company_address,
                    company_city, company_state, company_country, company_pincode,
                    company_gst, company_pan, company_website, company_logo,
                    currency, timezone, environment
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    company_name, company_email, company_phone, company_address,
                    company_city, company_state, company_country, company_pincode,
                    company_gst, company_pan, company_website, company_logo,
                    currency || 'INR', timezone || 'Asia/Kolkata', environment
                ]
            );
        } else {
            // Update existing profile
            const updateFields = [];
            const updateValues = [];

            const fields = {
                company_name, company_email, company_phone, company_address,
                company_city, company_state, company_country, company_pincode,
                company_gst, company_pan, company_website, currency, timezone, environment
            };

            Object.keys(fields).forEach(key => {
                if (fields[key] !== undefined) {
                    updateFields.push(`${key} = ?`);
                    updateValues.push(fields[key]);
                }
            });

            if (company_logo) {
                updateFields.push('company_logo = ?');
                updateValues.push(company_logo);
            }

            if (updateFields.length > 0) {
                updateValues.push(existingRows[0].id);
                await db.execute(
                    `UPDATE company_profile SET ${updateFields.join(', ')} WHERE id = ?`,
                    updateValues
                );
            }
        }

        // Get updated profile
        const [updatedRows] = await db.execute(
            `SELECT * FROM company_profile ORDER BY id DESC LIMIT 1`
        );

        res.json({
            success: true,
            message: "Company profile updated successfully",
            profile: updatedRows[0]
        });

    } catch (error) {
        console.error("Error updating company profile:", error);
        
        // Delete uploaded file if error occurred
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: error.message || "Failed to update company profile"
        });
    }
});

/* ================= DELETE COMPANY LOGO ================= */
router.delete("/company-profile/logo", async (req, res) => {
    try {
        const [existingRows] = await db.execute(
            `SELECT company_logo FROM company_profile ORDER BY id DESC LIMIT 1`
        );

        if (existingRows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Company profile not found"
            });
        }

        const oldLogoPath = existingRows[0].company_logo;

        if (oldLogoPath) {
            const fullPath = path.join(__dirname, '..', oldLogoPath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }

            // Update database
            await db.execute(
                `UPDATE company_profile SET company_logo = NULL WHERE id = ?`,
                [existingRows[0].id]
            );
        }

        res.json({
            success: true,
            message: "Company logo deleted successfully"
        });

    } catch (error) {
        console.error("Error deleting company logo:", error);
        res.status(500).json({
            success: false,
            message: "Failed to delete company logo"
        });
    }
});

/* ================= GET CURRENCIES LIST ================= */
router.get("/currencies", (req, res) => {
    const currencies = [
        { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
        { code: 'USD', name: 'US Dollar', symbol: '$' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
        { code: 'GBP', name: 'British Pound', symbol: '£' },
        { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
        { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
        { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
        { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
        { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
        { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' }
    ];
    res.json({ success: true, currencies });
});

/* ================= GET TIMEZONES LIST ================= */
router.get("/timezones", (req, res) => {
    const timezones = [
        'Asia/Kolkata',
        'Asia/Dubai',
        'Asia/Singapore',
        'Asia/Tokyo',
        'America/New_York',
        'America/Los_Angeles',
        'Europe/London',
        'Europe/Berlin',
        'Australia/Sydney',
        'Pacific/Auckland'
    ];
    res.json({ success: true, timezones });
});

router.get("/transactions", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT * FROM transactions 
      ORDER BY created_at DESC
    `);
    
    res.json({
      success: true,
      transactions: rows,
      total: rows.length
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch transactions"
    });
  }
});

module.exports = router;