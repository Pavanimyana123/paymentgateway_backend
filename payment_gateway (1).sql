-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 30, 2026 at 07:11 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `payment_gateway`
--

-- --------------------------------------------------------

--
-- Table structure for table `company_profile`
--

CREATE TABLE `company_profile` (
  `id` int(11) NOT NULL,
  `company_name` varchar(255) NOT NULL,
  `company_email` varchar(255) DEFAULT NULL,
  `company_phone` varchar(20) DEFAULT NULL,
  `company_address` text DEFAULT NULL,
  `company_city` varchar(100) DEFAULT NULL,
  `company_state` varchar(100) DEFAULT NULL,
  `company_country` varchar(100) DEFAULT NULL,
  `company_pincode` varchar(10) DEFAULT NULL,
  `company_gst` varchar(50) DEFAULT NULL,
  `company_pan` varchar(20) DEFAULT NULL,
  `company_website` varchar(255) DEFAULT NULL,
  `company_logo` varchar(255) DEFAULT NULL,
  `currency` varchar(20) DEFAULT 'INR',
  `timezone` varchar(50) DEFAULT 'Asia/Kolkata',
  `environment` varchar(10) DEFAULT 'test',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `company_profile`
--

INSERT INTO `company_profile` (`id`, `company_name`, `company_email`, `company_phone`, `company_address`, `company_city`, `company_state`, `company_country`, `company_pincode`, `company_gst`, `company_pan`, `company_website`, `company_logo`, `currency`, `timezone`, `environment`, `created_at`, `updated_at`) VALUES
(1, 'iiiQbets', 'contact@iiiqbets.com', '8041119030', 'Skyline Beverly Park # D 402, Amruthahalli Main Road, Amruthahalli Bangalore – 560092', ' Mysore', 'Karnataka, INDIA', '', '570008', '29AAICK7493G1ZX', 'AAICK7493G', 'https://www.iiiqbets.com', '/uploads/company-logos/company-logo-1767078810372-962848535.png', 'INR', 'Asia/Kolkata', 'test', '2025-12-30 07:13:30', '2026-01-12 06:43:42');

-- --------------------------------------------------------

--
-- Table structure for table `razorpay_customers`
--

CREATE TABLE `razorpay_customers` (
  `id` int(11) NOT NULL,
  `customer_id` varchar(100) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `contact` varchar(20) DEFAULT NULL,
  `environment` enum('test','live') DEFAULT 'test',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `razorpay_plans`
--

CREATE TABLE `razorpay_plans` (
  `id` int(11) NOT NULL,
  `plan_id` varchar(100) NOT NULL,
  `plan_name` varchar(255) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `currency` varchar(10) DEFAULT NULL,
  `period` varchar(20) DEFAULT NULL,
  `interval_count` int(11) DEFAULT NULL,
  `environment` enum('test','live') DEFAULT 'test',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `razorpay_subscriptions`
--

CREATE TABLE `razorpay_subscriptions` (
  `id` int(11) NOT NULL,
  `subscription_id` varchar(100) NOT NULL,
  `customer_id` varchar(100) DEFAULT NULL,
  `plan_id` varchar(100) DEFAULT NULL,
  `payment_id` varchar(100) DEFAULT NULL,
  `status` varchar(50) DEFAULT NULL,
  `environment` enum('test','live') DEFAULT 'test',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `split_payouts`
--

CREATE TABLE `split_payouts` (
  `id` int(11) NOT NULL,
  `reference_number` bigint(20) NOT NULL,
  `sub_account_id` varchar(100) NOT NULL,
  `sub_account_id2` varchar(100) DEFAULT NULL,
  `merchant_commission` decimal(10,2) NOT NULL,
  `vendor_payout` decimal(10,2) NOT NULL,
  `status` varchar(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `ccavenue_fee` decimal(10,2) DEFAULT 0.00,
  `tax_on_transaction` decimal(10,2) DEFAULT 0.00,
  `sub_account1_amount` decimal(10,2) DEFAULT NULL,
  `sub_account2_amount` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `transactions`
--

CREATE TABLE `transactions` (
  `id` int(11) NOT NULL,
  `appointment_id` varchar(255) DEFAULT NULL,
  `gateway` varchar(50) NOT NULL,
  `order_id` varchar(100) NOT NULL,
  `payment_id` varchar(100) DEFAULT NULL,
  `bank_ref_no` varchar(100) DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'INR',
  `status` varchar(20) NOT NULL,
  `split_payment_status` varchar(50) DEFAULT NULL,
  `environment` varchar(10) DEFAULT 'test',
  `customer_name` varchar(255) DEFAULT NULL,
  `salon_name` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `transactions`
--

INSERT INTO `transactions` (`id`, `appointment_id`, `gateway`, `order_id`, `payment_id`, `bank_ref_no`, `amount`, `currency`, `status`, `split_payment_status`, `environment`, `customer_name`, `salon_name`, `created_at`, `updated_at`) VALUES
(80, NULL, 'ccavenue', 'ORD_24042026120129', '315014061447', NULL, 1000.00, 'INR', 'SUCCESS', 'PENDING', 'test', 'Kovidh', 'Salonee', '2026-04-24 06:31:29', '2026-04-24 06:31:42');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `company_profile`
--
ALTER TABLE `company_profile`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `razorpay_customers`
--
ALTER TABLE `razorpay_customers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `razorpay_plans`
--
ALTER TABLE `razorpay_plans`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `razorpay_subscriptions`
--
ALTER TABLE `razorpay_subscriptions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `split_payouts`
--
ALTER TABLE `split_payouts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_reference_number` (`reference_number`),
  ADD KEY `idx_status` (`status`);

--
-- Indexes for table `transactions`
--
ALTER TABLE `transactions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uk_order_id` (`order_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `company_profile`
--
ALTER TABLE `company_profile`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `razorpay_customers`
--
ALTER TABLE `razorpay_customers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `razorpay_plans`
--
ALTER TABLE `razorpay_plans`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `razorpay_subscriptions`
--
ALTER TABLE `razorpay_subscriptions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `split_payouts`
--
ALTER TABLE `split_payouts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=25;

--
-- AUTO_INCREMENT for table `transactions`
--
ALTER TABLE `transactions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=81;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
