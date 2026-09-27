-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 06, 2026 at 01:06 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

CREATE DATABASE IF NOT EXISTS `pharma_db`;
USE `pharma_db`;


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `pharma_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `accounts`
--

CREATE TABLE `accounts` (
  `account_id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) NOT NULL,
  `tenant_id` char(36) NOT NULL,
  `account_type_id` char(36) NOT NULL,
  `accountable_type` varchar(50) NOT NULL DEFAULT '',
  `accountable_id` char(36) DEFAULT NULL,
  `parent_account_id` char(36) DEFAULT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `accounts`
--

INSERT INTO `accounts` (`account_id`, `user_id`, `tenant_id`, `account_type_id`, `accountable_type`, `accountable_id`, `parent_account_id`, `is_primary`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('c97e079a-6adf-11f1-b9ca-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c9749f5a-6adf-11f1-b9ca-0a002700000b', 'staff', '09632669-6a16-11f1-895a-0a002700000b', NULL, 1, 1, 0, 0, '2026-06-18 06:34:41', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `account_roles`
--

CREATE TABLE `account_roles` (
  `account_role_id` char(36) NOT NULL DEFAULT uuid(),
  `account_id` char(36) NOT NULL,
  `role_id` char(36) NOT NULL,
  `granted_by_account_id` char(36) DEFAULT NULL,
  `requested_by_id` char(36) DEFAULT NULL,
  `approved_by_id` char(36) DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `denied_at` timestamp NULL DEFAULT NULL,
  `denied_reason` text DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `is_pending` tinyint(1) NOT NULL DEFAULT 0,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `account_roles`
--

INSERT INTO `account_roles` (`account_role_id`, `account_id`, `role_id`, `granted_by_account_id`, `requested_by_id`, `approved_by_id`, `approved_at`, `denied_at`, `denied_reason`, `expires_at`, `is_pending`, `is_primary`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('c97f42e0-6adf-11f1-b9ca-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c979a660-6adf-11f1-b9ca-0a002700000b', NULL, NULL, NULL, '2026-06-18 06:34:41', NULL, NULL, NULL, 0, 1, 1, 0, 0, '2026-06-18 06:34:41', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `account_types`
--

CREATE TABLE `account_types` (
  `account_type_id` char(36) NOT NULL DEFAULT uuid(),
  `code` varchar(50) NOT NULL,
  `name` varchar(80) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `account_types`
--

INSERT INTO `account_types` (`account_type_id`, `code`, `name`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('c9749f5a-6adf-11f1-b9ca-0a002700000b', 'staff', 'Staff', 1, 0, 0, '2026-06-18 06:34:41', NULL),
('c9759d17-6adf-11f1-b9ca-0a002700000b', 'customer', 'Customer', 1, 0, 0, '2026-06-18 06:34:41', NULL),
('c9771112-6adf-11f1-b9ca-0a002700000b', 'vendor', 'Vendor', 1, 0, 0, '2026-06-18 06:34:41', NULL),
('c9783c6b-6adf-11f1-b9ca-0a002700000b', 'contractor', 'Contractor', 1, 0, 0, '2026-06-18 06:34:41', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `activity_logs`
--

CREATE TABLE `activity_logs` (
  `activity_id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) DEFAULT NULL,
  `role` varchar(80) DEFAULT NULL,
  `module` varchar(80) NOT NULL,
  `action` varchar(80) NOT NULL,
  `description` text NOT NULL,
  `reference_id` varchar(80) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `activity_logs`
--

INSERT INTO `activity_logs` (`activity_id`, `user_id`, `role`, `module`, `action`, `description`, `reference_id`, `created_at`) VALUES
('035ea193-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 89A533', '03597aa0-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:42:37'),
('04a73454-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 89A533', '04a40e41-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:42:39'),
('0550efd9-89cc-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', 'User Management', 'Updated', 'Manager RBAC QA updated user Sales Clerk RBAC QA Edited', 'f6114576-89cb-11f1-ad23-706871ff20d7', '2026-07-27 15:01:18'),
('059ae300-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 89A533 Edited', '04a40e41-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:42:40'),
('0671763d-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 89A533 Edited', '03597aa0-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:42:42'),
('0793a63c-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 89A533', '078d776b-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:42:44'),
('0b0db1e4-a9ce-11f1-a501-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Purchase Order', 'Arrived', 'PO PO-20260905-165900-CF8A89 is Arrived', '54d6724e-a93a-11f1-9f59-0a002700000b', '2026-09-06 08:36:23'),
('0bc7aa88-a93a-11f1-9f59-0a002700000b', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', 'Purchase Request', 'Approved', 'PR-20260905-164411-7D8F Approved by Supervisor', '42daf1d0-a938-11f1-9f59-0a002700000b', '2026-09-05 14:56:58'),
('0c60b8f0-89cc-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', 'User Management', 'Deactivated', 'Manager RBAC QA deactivated user Cashier RBAC QA', 'eb546a74-89cb-11f1-ad23-706871ff20d7', '2026-07-27 15:01:29'),
('0c711b4a-a1f7-11f1-b8b1-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0827-0002 to Cashier', '74', '2026-08-27 09:09:46'),
('0c7a0ed8-a1f7-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0827-0002', '74', '2026-08-27 09:09:46'),
('0c99409b-a1f7-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0827-0002', '74', '2026-08-27 09:09:46'),
('0ca82a62-a1f7-11f1-b8b1-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0827-0003 to Cashier', '75', '2026-08-27 09:09:46'),
('0cb53879-a1f7-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0827-0003', '75', '2026-08-27 09:09:46'),
('0cc330b0-a1f7-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0827-0003', '75', '2026-08-27 09:09:46'),
('0cd215ca-a1f7-11f1-b8b1-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0827-0004 to Cashier', '76', '2026-08-27 09:09:46'),
('0cdd1d9c-a1f7-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0827-0004', '76', '2026-08-27 09:09:47'),
('0ced2402-a1f7-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0827-0004', '76', '2026-08-27 09:09:47'),
('0eca7541-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '0ec715a7-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:15'),
('0f52eeaa-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 619C7E', '0f50f0f4-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:15'),
('0ff1d2ed-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 619C7E', '0f50f0f4-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:17'),
('108c9b5d-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '0ec715a7-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:18'),
('11b1838e-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 619C7E', '11af10bb-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:19'),
('14dece70-9ad2-11f1-b0e5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Created', 'Sales Clerk created Order #SO-0818-0001', '63', '2026-08-18 06:57:30'),
('14edcbf5-9ad2-11f1-b0e5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0818-0001 to Cashier', '63', '2026-08-18 06:57:31'),
('14f772ff-89cc-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', 'User Management', 'Activated', 'Manager RBAC QA activated user Cashier RBAC QA', 'eb546a74-89cb-11f1-ad23-706871ff20d7', '2026-07-27 15:01:44'),
('15dcaec5-a1f3-11f1-b8b1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Sales', 'Created', 'Sales Clerk created Order #SO-0827-0001', '73', '2026-08-27 08:41:24'),
('15e9e34a-a1f3-11f1-b8b1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0827-0001 to Cashier', '73', '2026-08-27 08:41:24'),
('17380c33-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation E190F7', '1733de28-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:21:41'),
('18053446-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation E190F7', '18006f31-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:21:43'),
('18ae73d5-9b06-11f1-adeb-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Sales', 'Created', 'Sales Clerk created Order #SO-0818-0004', '66', '2026-08-18 13:09:51'),
('18c9985d-9b06-11f1-adeb-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0818-0004 to Cashier', '66', '2026-08-18 13:09:51'),
('18d1fa74-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation E190F7 Edited', '18006f31-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:21:44'),
('19fd7179-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation E190F7 Edited', '1733de28-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:21:46'),
('1a8126ca-a1f3-11f1-b8b1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0827-0001', '73', '2026-08-27 08:41:31'),
('1cb276ec-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '1caca511-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:38'),
('1d077019-9ad2-11f1-b0e5-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0818-0001', '63', '2026-08-18 06:57:44'),
('1d47e9be-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC A8C895', '1d45e817-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:39'),
('1d8467ec-a6f1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '1d7fe843-a6f1-11f1-b4bd-706871ff20d7', '2026-09-02 17:09:49'),
('1e69a504-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC A8C895', '1d45e817-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:41'),
('1e7e6300-a6f1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC CD11CC', '1e787a26-a6f1-11f1-b4bd-706871ff20d7', '2026-09-02 17:09:51'),
('1efb0810-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '1caca511-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:42'),
('1f80cf0e-a6f1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC CD11CC', '1e787a26-a6f1-11f1-b4bd-706871ff20d7', '2026-09-02 17:09:53'),
('1f98aabe-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor A8C895', '1f93ec34-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:46:43'),
('20dd15cb-a6f1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '1d7fe843-a6f1-11f1-b4bd-706871ff20d7', '2026-09-02 17:09:55'),
('21e2d10c-a6f1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor CD11CC', '21dfb3c4-a6f1-11f1-b4bd-706871ff20d7', '2026-09-02 17:09:57'),
('22b2e9e2-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation F4F750', '22ae389e-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:47:55'),
('22df733d-a6f1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU CD11CC', '22db23cc-a6f1-11f1-b4bd-706871ff20d7', '2026-09-02 17:09:58'),
('22e03a72-a6f1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU CD11CC', '22dd65d2-a6f1-11f1-b4bd-706871ff20d7', '2026-09-02 17:09:58'),
('237b028b-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 9B9AF6', '2377a32d-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:08'),
('238bd52f-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation F4F750', '23891d67-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:47:56'),
('244c7184-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 9B9AF6', '244a36ca-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:10'),
('249dac20-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation F4F750 Edited', '23891d67-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:47:58'),
('252c8690-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 9B9AF6 Edited', '244a36ca-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:11'),
('2582815d-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation F4F750 Edited', '22ae389e-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:47:59'),
('25cb42cc-a6c0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 400824', '25c8129a-a6c0-11f1-b4bd-706871ff20d7', '2026-09-02 11:19:22'),
('267cca3d-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 9B9AF6 Edited', '2377a32d-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:13'),
('268785b2-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension F4F750', '26839036-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:48:01'),
('2698e79c-a6c0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 400824', '2695df39-a6c0-11f1-b4bd-706871ff20d7', '2026-09-02 11:19:23'),
('27522e3b-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 9B9AF6', '274fab1f-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:15'),
('27d31572-a6c0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 400824 Edited', '2695df39-a6c0-11f1-b4bd-706871ff20d7', '2026-09-02 11:19:25'),
('28b26996-a6c0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 400824 Edited', '25c8129a-a6c0-11f1-b4bd-706871ff20d7', '2026-09-02 11:19:27'),
('28ba454a-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 48E8F4', '28b61ed3-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:23:52'),
('298e9b97-a6c0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 400824', '298bb125-a6c0-11f1-b4bd-706871ff20d7', '2026-09-02 11:19:28'),
('2992cb94-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 48E8F4', '298ed554-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:23:54'),
('2a7640f8-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 48E8F4 Edited', '298ed554-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:23:55'),
('2b55b9b0-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 48E8F4 Edited', '28b61ed3-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:23:57'),
('2c736d6a-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 48E8F4', '2c6e839e-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:23:58'),
('2d060d56-89cd-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Activated', 'Dr. ADMIN activated user Manager RBAC QA', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-27 15:09:34'),
('2e0d4d9d-9cb6-11f1-9340-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0818-0003', '65', '2026-08-20 16:42:49'),
('363dac11-a6f8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '363acf40-a6f8-11f1-b4bd-706871ff20d7', '2026-09-02 18:00:37'),
('372a82a2-a6f8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 4622EE', '3723d51b-a6f8-11f1-b4bd-706871ff20d7', '2026-09-02 18:00:39'),
('3838413f-a6f8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 4622EE', '3723d51b-a6f8-11f1-b4bd-706871ff20d7', '2026-09-02 18:00:41'),
('399755ae-a6f8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '363acf40-a6f8-11f1-b4bd-706871ff20d7', '2026-09-02 18:00:43'),
('39d200b3-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 4FAD9C', '39cd3c97-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:46'),
('3a9dae65-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 4FAD9C', '3a9a5c15-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:47'),
('3aaae1b3-a6f8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 4622EE', '3aa78124-a6f8-11f1-b4bd-706871ff20d7', '2026-09-02 18:00:45'),
('3bb0ea5b-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 4FAD9C Edited', '3a9a5c15-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:49'),
('3bfc5ada-a6f8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 4622EE', '3bf5caca-a6f8-11f1-b4bd-706871ff20d7', '2026-09-02 18:00:47'),
('3bfd0462-a6f8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 4622EE', '3bf9fda3-a6f8-11f1-b4bd-706871ff20d7', '2026-09-02 18:00:47'),
('3c7d3ff9-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 4FAD9C Edited', '39cd3c97-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:50'),
('3d579920-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 4FAD9C', '3d5378f2-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:12:52'),
('3e21d211-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '3e1b7eeb-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:32:12'),
('3f55c573-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 7AFCF8', '3f510cfb-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:32:14'),
('40c11030-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 7AFCF8', '3f510cfb-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:32:17'),
('420090db-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '3e1b7eeb-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:32:19'),
('42df9dbe-a938-11f1-9f59-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Purchase Request', 'Pending Supervisor Approval', 'PR-20260905-164411-7D8F created by Dr. ADMIN', '42daf1d0-a938-11f1-9f59-0a002700000b', '2026-09-05 14:44:11'),
('42e8317e-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 7AFCF8', '42e4c6ec-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:32:20'),
('43bdd297-9ad2-11f1-b0e5-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0818-0001', '63', '2026-08-18 06:58:49'),
('43e148c3-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 7AFCF8', '43dd905b-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:32:22'),
('43e2495c-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 7AFCF8', '43dfc30f-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:32:22'),
('46c22b42-a1f8-11f1-b8b1-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0827-0002 to Cashier', '78', '2026-08-27 09:18:33'),
('46cb07e2-a1f8-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0827-0002', '78', '2026-08-27 09:18:33'),
('46e5cb99-a1f8-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0827-0002', '78', '2026-08-27 09:18:33'),
('46f20d02-a1f8-11f1-b8b1-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0827-0003 to Cashier', '79', '2026-08-27 09:18:33'),
('46f8a542-a1f8-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0827-0003', '79', '2026-08-27 09:18:33'),
('470b3a22-a1f8-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0827-0003', '79', '2026-08-27 09:18:34'),
('47196dba-a1f8-11f1-b8b1-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0827-0004 to Cashier', '80', '2026-08-27 09:18:34'),
('47224c47-a1f8-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0827-0004', '80', '2026-08-27 09:18:34'),
('472ea427-a1f8-11f1-b8b1-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0827-0004', '80', '2026-08-27 09:18:34'),
('49b1e606-89cd-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Deactivated', 'Dr. ADMIN deactivated user Manager RBAC QA', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-27 15:10:22'),
('4a10cafe-a6e8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Norvasc', '4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '2026-09-02 16:06:39'),
('4aa54203-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 955C48', '4aa19995-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:34:43'),
('4b8786b5-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 955C48', '4b8528fa-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:34:44'),
('4ba5fe8f-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '4ba0e19b-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:42:29'),
('4c6a6348-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 955C48 Edited', '4b8528fa-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:34:46'),
('4c72eb57-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 323131', '4c6f606e-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:42:30'),
('4d49226d-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 323131', '4c6f606e-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:42:31'),
('4dc897f4-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 955C48 Edited', '4aa19995-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:34:48'),
('4e1d8725-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '4ba0e19b-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:42:33'),
('4eafbd47-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 955C48', '4ead2773-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:34:49'),
('4f6e118a-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 323131', '4f6a6b3c-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:42:35'),
('526206ae-a6e9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Moxylor', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 16:14:02'),
('54d7d937-a93a-11f1-9f59-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Purchase Order', 'Generated', '1 purchase order(s) generated from PR-20260905-164411-7D8F by Manager/Admin', '42daf1d0-a938-11f1-9f59-0a002700000b', '2026-09-05 14:59:00'),
('56b22bb6-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 8BFF91', '56aeb166-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:49:22'),
('5788ac57-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 8BFF91', '57849c21-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:49:23'),
('5867f1b8-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 8BFF91 Edited', '57849c21-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:49:25'),
('596d134b-a6ee-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Moxylor', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 16:50:01'),
('59d43060-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 8BFF91 Edited', '56aeb166-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:49:27'),
('5aacca5f-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 8BFF91', '5aa91785-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:49:29'),
('5c2a9b55-a6f0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '5c24515a-a6f0-11f1-b4bd-706871ff20d7', '2026-09-02 17:04:25'),
('5c9aee68-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Moxylor', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 17:33:04'),
('5cf59f26-a6f0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 9012B3', '5ceff3c4-a6f0-11f1-b4bd-706871ff20d7', '2026-09-02 17:04:26'),
('5dd0ae95-a6f0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 9012B3', '5ceff3c4-a6f0-11f1-b4bd-706871ff20d7', '2026-09-02 17:04:28'),
('5f02b9b5-a6df-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '5f00369d-a6df-11f1-b4bd-706871ff20d7', '2026-09-02 15:02:48'),
('5f1d1f0d-a6f0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '5c24515a-a6f0-11f1-b4bd-706871ff20d7', '2026-09-02 17:04:30'),
('5f2cf60c-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation ECE930', '5f28d695-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:23:42'),
('5f991975-a6df-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC D62D8F', '5f9796de-a6df-11f1-b4bd-706871ff20d7', '2026-09-02 15:02:49'),
('5ff31bf1-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation ECE930', '5feec508-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:23:43'),
('5ff44753-a6f0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 9012B3', '5ff154d4-a6f0-11f1-b4bd-706871ff20d7', '2026-09-02 17:04:31'),
('60c17294-a6f0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 9012B3', '60bd997c-a6f0-11f1-b4bd-706871ff20d7', '2026-09-02 17:04:33'),
('60c22513-a6f0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 9012B3', '60bf310d-a6f0-11f1-b4bd-706871ff20d7', '2026-09-02 17:04:33'),
('60cf8efa-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation ECE930 Edited', '5feec508-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:23:45'),
('60d80861-a6df-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC D62D8F', '5f9796de-a6df-11f1-b4bd-706871ff20d7', '2026-09-02 15:02:51'),
('617148fb-a6df-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '5f00369d-a6df-11f1-b4bd-706871ff20d7', '2026-09-02 15:02:52'),
('6198fdc4-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation ECE930 Edited', '5f28d695-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:23:46'),
('6211bf09-a6df-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor D62D8F', '620f4c90-a6df-11f1-b4bd-706871ff20d7', '2026-09-02 15:02:53'),
('62b7f1ad-a6f3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Biogesic', '62b2babe-a6f3-11f1-b4bd-706871ff20d7', '2026-09-02 17:26:04'),
('62db40da-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 63EFCD', '62d73b4c-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:25:30'),
('63b91fbb-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 63EFCD', '63b637ae-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:25:31'),
('63efead0-a9c9-11f1-a501-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Purchase Order', 'Pending', 'PO TEST-LIFECYCLE-63b04bdfa9 is Pending', '63b04bdf-a9c9-11f1-a501-0a002700000b', '2026-09-06 08:03:05'),
('64a1f37d-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 63EFCD Edited', '63b637ae-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:25:33'),
('65f5f0ad-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 63EFCD Edited', '62d73b4c-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:25:35'),
('66639411-9ad2-11f1-b0e5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Created', 'Sales Clerk created Order #SO-0818-0002', '64', '2026-08-18 06:59:47'),
('66736cec-9ad2-11f1-b0e5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0818-0002 to Cashier', '64', '2026-08-18 06:59:47'),
('66b2b96d-a6ea-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '66ac83a5-a6ea-11f1-b4bd-706871ff20d7', '2026-09-02 16:21:46'),
('66de6371-a6c9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 63EFCD', '66db7418-a6c9-11f1-b4bd-706871ff20d7', '2026-09-02 12:25:36'),
('672d43b0-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation A6402C', '672837d0-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:14:02'),
('677d1474-a6ea-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 7782EF', '6777c822-a6ea-11f1-b4bd-706871ff20d7', '2026-09-02 16:21:47'),
('67fb4624-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation A6402C', '67f8c95c-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:14:03'),
('685c057c-a6ea-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 7782EF', '6777c822-a6ea-11f1-b4bd-706871ff20d7', '2026-09-02 16:21:48'),
('694e7acf-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation A6402C Edited', '67f8c95c-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:14:06'),
('69abbcc7-a6ea-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '66ac83a5-a6ea-11f1-b4bd-706871ff20d7', '2026-09-02 16:21:51'),
('69e3d140-a9cd-11f1-a501-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Purchase Order', 'Supplier Payment', 'Supplier payment of 2,500.00 recorded for PO PO-20260905-165900-CF8A89', '54d6724e-a93a-11f1-9f59-0a002700000b', '2026-09-06 08:31:53'),
('6a240c07-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation A6402C Edited', '672837d0-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:14:07'),
('6a829a05-a6ea-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 7782EF', '6a7e8264-a6ea-11f1-b4bd-706871ff20d7', '2026-09-02 16:21:52'),
('6b024fb6-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension A6402C', '6affb187-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:14:08'),
('6b828bb6-9ad2-11f1-b0e5-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0818-0002', '64', '2026-08-18 06:59:56'),
('6de88c1b-89d3-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Updated', 'Dr. ADMIN updated user Manager', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-27 15:54:20'),
('6e53d65f-a235-11f1-b8b1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0827-0001', '73', '2026-08-27 16:36:12'),
('6fb63611-a6f2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '6fb0d6e9-a6f2-11f1-b4bd-706871ff20d7', '2026-09-02 17:19:17'),
('6fb8b377-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '6fb2b7f3-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:43:29'),
('708ecc7b-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 11076D', '708a3d58-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:43:31'),
('70a30ce4-a6f2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC AA4530', '709e15f1-a6f2-11f1-b4bd-706871ff20d7', '2026-09-02 17:19:18'),
('71abb22b-a6f2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC AA4530', '709e15f1-a6f2-11f1-b4bd-706871ff20d7', '2026-09-02 17:19:20'),
('71cf8e29-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 11076D', '708a3d58-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:43:33'),
('72a19f4c-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '6fb2b7f3-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:43:34'),
('72ee69ff-a6f2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '6fb0d6e9-a6f2-11f1-b4bd-706871ff20d7', '2026-09-02 17:19:22'),
('7362f0f6-9ad2-11f1-b0e5-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', 'Cashier', 'Completed', 'Cashier completed Sale #SO-0818-0002', '64', '2026-08-18 07:00:09'),
('7377e0d5-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 11076D', '7374df94-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:43:35'),
('73ad24e9-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation DC9D4A', '73a897a8-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:35:51'),
('73e5476c-a6f2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor AA4530', '73e1c930-a6f2-11f1-b4bd-706871ff20d7', '2026-09-02 17:19:24'),
('74b2d861-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 11076D', '74aec94a-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:43:38'),
('74b3b575-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 11076D', '74b11a1c-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:43:38'),
('74d902a0-a6f2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU AA4530', '74d3c68a-a6f2-11f1-b4bd-706871ff20d7', '2026-09-02 17:19:25'),
('74da0ece-a6f2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU AA4530', '74d6d0da-a6f2-11f1-b4bd-706871ff20d7', '2026-09-02 17:19:25'),
('750a4bc7-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation DC9D4A', '75064841-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:35:54'),
('75eff988-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation DC9D4A Edited', '75064841-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:35:55'),
('772de12f-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation DC9D4A Edited', '73a897a8-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:35:57'),
('77f29120-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation EC808B', '77ef4136-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:48:36'),
('78015235-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension DC9D4A', '77fe8d29-a6c2-11f1-b4bd-706871ff20d7', '2026-09-02 11:35:59'),
('787cd31f-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '787a97e5-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:02'),
('7883c186-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation EC808B', '7881b32c-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:48:37'),
('790f80c6-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl', '790d6f51-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:03'),
('797b9f65-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation EC808B Edited', '7881b32c-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:48:39'),
('79b163e3-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl', '790d6f51-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:04'),
('79e7cf5e-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation FB108E', '79e5050d-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:09:05'),
('7a14c2df-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation EC808B Edited', '77ef4136-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:48:40'),
('7a94bbfa-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation FB108E', '7a920e62-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:09:07'),
('7b0321ac-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '787a97e5-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:07'),
('7bad2079-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Deactivated', 'Dr. ADMIN deactivated user Sales Clerk RBAC QA Edited', 'f6114576-89cb-11f1-ad23-706871ff20d7', '2026-07-27 15:04:36'),
('7bc364e1-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation FB108E Edited', '7a920e62-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:09:09'),
('7c759a15-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation FB108E Edited', '79e5050d-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:09:10'),
('7d2882bc-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension FB108E', '7d264834-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:09:11'),
('7d5f76d8-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '7d59ac1a-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:33:59'),
('7e462fc9-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC BDFCC8', '7e41b3fc-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:34:00'),
('7f9005bd-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC BDFCC8', '7e41b3fc-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:34:02'),
('8086ee9b-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '7d59ac1a-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:34:04'),
('80e1276a-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Deactivated', 'Dr. ADMIN deactivated user Cashier RBAC QA', 'eb546a74-89cb-11f1-ad23-706871ff20d7', '2026-07-27 15:04:45'),
('819ac8d2-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor BDFCC8', '8195e024-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:34:06'),
('8329c7b4-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU BDFCC8', '8323e4a6-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:34:08'),
('832a7a55-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU BDFCC8', '832726ee-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:34:08'),
('85659d37-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Moxylor', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 17:34:12'),
('866e507b-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Deactivated', 'Dr. ADMIN deactivated user Manager RBAC QA', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-27 15:04:54'),
('88708a73-a6f5-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Cetzy-10', '886cc540-a6f5-11f1-b4bd-706871ff20d7', '2026-09-02 17:41:27'),
('891103a2-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '890f0995-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:30'),
('8a4aaeab-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl', '899e386b-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:32'),
('8aed10ab-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Updated', '899e386b-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:33'),
('8b6a9d80-a6e9-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Norvasc', '4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '2026-09-02 16:15:38'),
('8b7a1d81-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Updated', '890f0995-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:34'),
('8c195af2-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '8c173ba1-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:42:35'),
('8eb1ed24-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 92A6E4', '8eae85a1-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:46:30'),
('8f8c4b15-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 92A6E4', '8f8966db-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:46:32'),
('90873ca0-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 92A6E4 Edited', '8f8966db-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:46:33'),
('91e90210-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 92A6E4 Edited', '8eae85a1-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:46:36'),
('92bddd4e-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 92A6E4', '92bafc32-a6bb-11f1-b4bd-706871ff20d7', '2026-09-02 10:46:37'),
('94ca54ba-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Activated', 'Dr. ADMIN activated user Manager RBAC QA', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-27 15:05:18'),
('97794586-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation EDFBBF', '9776acc2-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:49:29'),
('9811a83a-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation EDFBBF', '980c418c-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:49:30'),
('98b0c52a-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation EDFBBF Edited', '980c418c-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:49:31'),
('9a02ed05-a6b3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation EDFBBF Edited', '9776acc2-a6b3-11f1-b4bd-706871ff20d7', '2026-09-02 09:49:33'),
('9a173e6e-a6b2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Pricing', 'Configured category defaults', '[{\"name\":\"Medicine\",\"markup\":5},{\"name\":\"Grocery\",\"markup\":15},{\"name\":\"Medical Supplies\",\"markup\":15}]', 'category-markups-v1', '2026-09-02 09:42:24'),
('9abd1e77-a6b2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation BF0FDF', '9ab94099-a6b2-11f1-b4bd-706871ff20d7', '2026-09-02 09:42:25'),
('9ca2e1a9-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '9c9e50a7-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:00'),
('9cf091f0-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', '9ced13f3-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:44:45'),
('9d7727ee-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 94EE80', '9d72304f-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:01'),
('9db980ca-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC FB5A5C', '9db5f19c-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:44:46'),
('9e4a8e4a-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 94EE80', '9d72304f-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:03'),
('9e945180-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC FB5A5C', '9db5f19c-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:44:48'),
('9f5ecd06-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '9c9e50a7-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:05'),
('9f62c69f-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', '9ced13f3-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:44:49'),
('a037d7b3-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 94EE80', 'a035548b-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:06'),
('a0b58e55-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor FB5A5C', 'a0b159f6-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:44:51');
INSERT INTO `activity_logs` (`activity_id`, `user_id`, `role`, `module`, `action`, `description`, `reference_id`, `created_at`) VALUES
('a18f638d-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU FB5A5C', 'a18b0859-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:44:53'),
('a1903b2a-a6ed-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU FB5A5C', 'a18cadf6-a6ed-11f1-b4bd-706871ff20d7', '2026-09-02 16:44:53'),
('a4dd50f4-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 88F997', 'a4d81998-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:10:17'),
('a5b57e72-a6b2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 6B7A0A', 'a5b2a9fa-a6b2-11f1-b4bd-706871ff20d7', '2026-09-02 09:42:43'),
('a60b13ba-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 88F997', 'a605171d-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:10:19'),
('a658c0ee-a6b2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 6B7A0A', 'a656249f-a6b2-11f1-b4bd-706871ff20d7', '2026-09-02 09:42:45'),
('a68aeef2-9c9d-11f1-9340-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Cashier', 'Accepted', 'Cashier accepted Order #SO-0818-0004', '66', '2026-08-20 13:47:14'),
('a6d77309-a6e8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Norvasc', '4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '2026-09-02 16:09:14'),
('a6ef6a22-a93e-11f1-9f59-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Purchase Order', 'Supplier Invoice', 'Supplier invoice 12345678 recorded for PO', '54d6724e-a93a-11f1-9f59-0a002700000b', '2026-09-05 15:29:56'),
('a6f960ea-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation EDEF07', 'a6f4c009-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:51:37'),
('a704a43d-a6b2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 6B7A0A Edited', 'a656249f-a6b2-11f1-b4bd-706871ff20d7', '2026-09-02 09:42:46'),
('a75fea30-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'a75c9777-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:43:21'),
('a7795e5b-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 88F997 Edited', 'a605171d-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:10:22'),
('a7f68ba6-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl', 'a7f3c7c8-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:43:22'),
('a804136e-a6b2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 6B7A0A Edited', 'a5b2a9fa-a6b2-11f1-b4bd-706871ff20d7', '2026-09-02 09:42:47'),
('a81119d4-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation EDEF07', 'a80b9d32-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:51:38'),
('a8db5758-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 88F997 Edited', 'a4d81998-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:10:24'),
('a8ee62ff-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Updated', 'a7f3c7c8-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:43:24'),
('a902bf0c-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation EDEF07 Edited', 'a80b9d32-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:51:40'),
('a908d4ed-8a2d-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Deactivated', 'Dr. ADMIN deactivated user Manager', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-28 02:40:13'),
('a988d315-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Updated', 'a75c9777-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:43:25'),
('a9e03154-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation EDEF07 Edited', 'a6f4c009-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:51:41'),
('aa225487-a6cf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 88F997', 'aa1ed945-a6cf-11f1-b4bd-706871ff20d7', '2026-09-02 13:10:26'),
('aa2514fa-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'aa233754-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:43:26'),
('aa861924-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'aa8239dc-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:23'),
('aac7784c-a6c4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension EDEF07', 'aac36c2e-a6c4-11f1-b4bd-706871ff20d7', '2026-09-02 11:51:43'),
('ab53005d-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 0E0A33', 'ab4ddb8f-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:25'),
('aca6067c-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 0E0A33', 'ab4ddb8f-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:27'),
('acb25a3b-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 66AAE2', 'acad79d3-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:54:30'),
('ad6e640e-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', 'aa8239dc-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:28'),
('ad78429d-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 66AAE2', 'ad758d69-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:54:31'),
('ae4eb978-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 66AAE2 Edited', 'ad758d69-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:54:33'),
('ae530d25-a6e2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 0E0A33', 'ae4f6c20-a6e2-11f1-b4bd-706871ff20d7', '2026-09-02 15:26:30'),
('af11c70f-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 66AAE2 Edited', 'acad79d3-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:54:34'),
('b0867aed-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 66AAE2', 'b08291bf-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:54:37'),
('b8db4153-a6b6-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation CB05F0', 'b8d6a794-a6b6-11f1-b4bd-706871ff20d7', '2026-09-02 10:11:54'),
('b9c0b695-a6fb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Cetzy-10', 'b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', '2026-09-02 18:25:46'),
('b9f4edfc-a6b6-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation CB05F0', 'b97ba5a4-a6b6-11f1-b4bd-706871ff20d7', '2026-09-02 10:11:55'),
('baa372a2-a6b6-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation CB05F0 Edited', 'b97ba5a4-a6b6-11f1-b4bd-706871ff20d7', '2026-09-02 10:11:57'),
('bb4a7ec4-a6b6-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation CB05F0 Edited', 'b8d6a794-a6b6-11f1-b4bd-706871ff20d7', '2026-09-02 10:11:58'),
('bbf56448-a93a-11f1-9f59-0a002700000b', NULL, NULL, 'Purchase Order', 'Draft', 'PO PO-20260905-165900-CF8A89 is Draft', '54d6724e-a93a-11f1-9f59-0a002700000b', '2026-09-05 14:59:00'),
('bcab6d50-79d9-11f1-a60b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Updated', 'Admin updated user Cashier', '9db5292a-7788-11f1-ae3b-0a002700000b', '2026-07-07 07:59:10'),
('bcad453b-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Deactivated', 'Dr. ADMIN deactivated user Manager RBAC QA', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-27 15:06:25'),
('bd9dbb8c-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation D1C9FC', 'bd9a61ca-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:26:21'),
('be6b0319-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation D1C9FC', 'be67e80b-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:26:22'),
('bef959d4-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'bef51110-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:35:49'),
('bfced421-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC BF45E3', 'bfc9f555-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:35:50'),
('bfd2a951-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation D1C9FC Edited', 'be67e80b-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:26:24'),
('c09d73c6-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'c09b15c2-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:03'),
('c0bb65f4-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation D1C9FC Edited', 'bd9a61ca-a6b8-11f1-b4bd-706871ff20d7', '2026-09-02 10:26:26'),
('c12203dc-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC BF45E3', 'bfc9f555-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:35:52'),
('c136cc82-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl', 'c1339c98-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:04'),
('c20242c2-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', 'bef51110-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:35:54'),
('c235f537-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Updated', 'c1339c98-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:06'),
('c2f275d7-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor BF45E3', 'c2ef266d-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:35:55'),
('c3120054-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Updated', 'c09b15c2-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:08'),
('c3b3f74d-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'c3b0a931-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:09'),
('c400bdc4-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU BF45E3', 'c3fcd3e8-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:35:57'),
('c4016051-a6f4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU BF45E3', 'c3fe795d-a6f4-11f1-b4bd-706871ff20d7', '2026-09-02 17:35:57'),
('c5f65ddb-a6c8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation E8783E', 'c5f2a672-a6c8-11f1-b4bd-706871ff20d7', '2026-09-02 12:21:07'),
('c6c98bb0-a6f7-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'c6c4ed01-a6f7-11f1-b4bd-706871ff20d7', '2026-09-02 17:57:30'),
('c6d182df-a6c8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation E8783E', 'c6ce736d-a6c8-11f1-b4bd-706871ff20d7', '2026-09-02 12:21:08'),
('c7c3b82f-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 2FC59B', 'c7bf8168-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:55:16'),
('c8272424-a6f7-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Validation OTC 7BFA7D', 'c7ea09a9-a6f7-11f1-b4bd-706871ff20d7', '2026-09-02 17:57:33'),
('c8458397-a6c8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation E8783E Edited', 'c6ce736d-a6c8-11f1-b4bd-706871ff20d7', '2026-09-02 12:21:10'),
('c84a0e14-8a2d-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Activated', 'Dr. ADMIN activated user Manager', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-28 02:41:06'),
('c8af1682-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 2FC59B', 'c8ab39df-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:55:17'),
('c9185266-a6c8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation E8783E Edited', 'c5f2a672-a6c8-11f1-b4bd-706871ff20d7', '2026-09-02 12:21:12'),
('c9452cd4-a6f7-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Validation OTC 7BFA7D', 'c7ea09a9-a6f7-11f1-b4bd-706871ff20d7', '2026-09-02 17:57:34'),
('c98ccc7d-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Powder for Suspension', 'c989093f-a6bf-11f1-b4bd-706871ff20d7', '2026-09-02 11:16:47'),
('c9fa507e-a6c8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension E8783E', 'c9f71ddb-a6c8-11f1-b4bd-706871ff20d7', '2026-09-02 12:21:13'),
('c9fb71cf-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 2FC59B Edited', 'c8ab39df-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:55:19'),
('ca536676-a6f7-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin', 'c6c4ed01-a6f7-11f1-b4bd-706871ff20d7', '2026-09-02 17:57:36'),
('cb7493d4-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 2FC59B Edited', 'c7bf8168-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:55:22'),
('cbe9d968-a6f7-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor 7BFA7D', 'cbe45819-a6f7-11f1-b4bd-706871ff20d7', '2026-09-02 17:57:39'),
('cc628d71-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 2FC59B', 'cc5ec8e6-a6bc-11f1-b4bd-706871ff20d7', '2026-09-02 10:55:23'),
('ccde9257-a6f7-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 7BFA7D', 'ccd8ce0c-a6f7-11f1-b4bd-706871ff20d7', '2026-09-02 17:57:40'),
('ccdf3c4d-a6f7-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Multi SKU 7BFA7D', 'ccdb3402-a6f7-11f1-b4bd-706871ff20d7', '2026-09-02 17:57:40'),
('d547723e-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'd5447537-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:38'),
('d5d12a45-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl', 'd5ce9275-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:39'),
('d6724fbd-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Updated', 'd5ce9275-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:40'),
('d7006f84-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Updated', 'd5447537-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:41'),
('d85751ff-a6dc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin', 'd85400a1-a6dc-11f1-b4bd-706871ff20d7', '2026-09-02 14:44:43'),
('d8f7c31f-a93c-11f1-9f59-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Purchase Order', 'Pending', 'PO PO-20260905-165900-CF8A89 is Pending', '54d6724e-a93a-11f1-9f59-0a002700000b', '2026-09-05 15:17:01'),
('e2b9557c-a6ec-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Moxylor', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 16:39:33'),
('e4dc3fbf-a6ba-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Amoxicillin Validation 1D4CB3', 'e4d7ba3e-a6ba-11f1-b4bd-706871ff20d7', '2026-09-02 10:41:45'),
('e6162783-a6ba-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Bisacodyl Validation 1D4CB3', 'e6128102-a6ba-11f1-b4bd-706871ff20d7', '2026-09-02 10:41:47'),
('e6d7fe41-a6dd-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', '2026-09-02 14:52:17'),
('e6ee69b8-a6ba-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Bisacodyl Validation 1D4CB3 Edited', 'e6128102-a6ba-11f1-b4bd-706871ff20d7', '2026-09-02 10:41:49'),
('e7b91dda-a6ba-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Updated', 'Product updated: Amoxicillin Validation 1D4CB3 Edited', 'e4d7ba3e-a6ba-11f1-b4bd-706871ff20d7', '2026-09-02 10:41:50'),
('e8911ec6-a6ba-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Products', 'Added', 'Product added: Moxylor Suspension 1D4CB3', 'e88d043f-a6ba-11f1-b4bd-706871ff20d7', '2026-09-02 10:41:52'),
('e92fe741-89ca-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Added', 'Dr. ADMIN added user Manager RBAC QA', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', '2026-07-27 14:53:21'),
('eb5532ef-89cb-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', 'User Management', 'Added', 'Manager RBAC QA added user Cashier RBAC QA', 'eb546a74-89cb-11f1-ad23-706871ff20d7', '2026-07-27 15:00:34'),
('f612e629-89cb-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', 'User Management', 'Added', 'Manager RBAC QA added user Sales Clerk RBAC QA', 'f6114576-89cb-11f1-ad23-706871ff20d7', '2026-07-27 15:00:52'),
('fa3794d1-9b05-11f1-adeb-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Sales', 'Created', 'Sales Clerk created Order #SO-0818-0003', '65', '2026-08-18 13:09:00'),
('fa58a9cd-9b05-11f1-adeb-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'Sales', 'Sent to Cashier', 'Sales Clerk sent Order #SO-0818-0003 to Cashier', '65', '2026-08-18 13:09:00'),
('fd1dec6b-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', 'User Management', 'Updated', 'Dr. ADMIN updated user Sales Clerk', 'e61815fe-7781-11f1-ae3b-0a002700000b', '2026-07-27 15:08:13');

-- --------------------------------------------------------

--
-- Table structure for table `auth_sessions`
--

CREATE TABLE `auth_sessions` (
  `auth_session_id` char(36) NOT NULL DEFAULT uuid(),
  `php_session_id` varchar(128) NOT NULL,
  `user_id` char(36) NOT NULL,
  `account_id` char(36) DEFAULT NULL,
  `tenant_id` char(36) DEFAULT NULL,
  `session_token_hash` char(64) NOT NULL,
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `is_revoked` tinyint(1) NOT NULL DEFAULT 0,
  `revoked_at` timestamp NULL DEFAULT NULL,
  `revoked_reason` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `auth_sessions`
--

INSERT INTO `auth_sessions` (`auth_session_id`, `php_session_id`, `user_id`, `account_id`, `tenant_id`, `session_token_hash`, `expires_at`, `ip_address`, `user_agent`, `is_revoked`, `revoked_at`, `revoked_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('0021fd5b-7444-11f1-a369-0a002700000b', 'eigsohosdef39lvl7alhtr6s6h', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '19882281ce711c61da2ab8a3f62a653937113b49e7322aeba0b2d49332459e4f', '2026-07-01 05:24:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:24:43', NULL),
('0073d0c8-a35b-11f1-a13c-706871ff20d7', 'k5984bm3dr09hjdhps0llbee7b', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5ae90a603e2ad999821da1a88dbd4192e169974071cbf3ea245f72f0d047ad4c', '2026-08-30 03:37:47', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-29 03:37:47', NULL),
('017a45f9-8a2e-11f1-85ca-706871ff20d7', 'fsehtoptdv5q5t25lbr26de86l', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '69647ef58c866bf78ac2fcac2ec05d812d54dff9aab6b69f95dc46eeb657b675', '2026-07-29 02:42:42', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 02:42:42', NULL),
('01cea78a-89c9-11f1-ad23-706871ff20d7', 'kahti6hpumh2mqqovs05a8g28a', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '29f2633028b6ba2b28f577d4ccfa103bf15ce5bf790a4eeb2298370516513185', '2026-07-28 14:39:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:39:43', NULL),
('0394e380-9585-11f1-92a6-706871ff20d7', '6vc635a98eal88mtdm8j41jj1d', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '1c628962ae03c727326f4b89b7c0c7c0cf5e4bb3f4f19441dbae4f1b780deec5', '2026-08-11 13:54:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-11 13:54:40', 'logout', 0, 0, 0, '2026-08-11 13:03:14', '2026-08-11 13:54:40'),
('03ba38f0-a08a-11f1-b4b0-706871ff20d7', 'it5qu96jm26b3eghv5bnv7l5os', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b42a6b4bc6088bbfa60d7bfd0bcb4323ddef5d4f1b831657ba88e3079946d7ad', '2026-08-26 13:36:43', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-25 13:36:43', NULL),
('04620d1b-9fc2-11f1-b4e1-706871ff20d7', 'ldibiqlqm53c6qdv3c2dq1knsp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a01f25e3902d9999ad06f50f456d905dce40b85766a808af06fee54f6fa93f0f', '2026-08-25 13:45:07', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 13:45:07', NULL),
('04c1f3a1-8b5d-11f1-b840-706871ff20d7', 'm54db2qt2ascln50e15t2a7jnj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bf1639dcc9d4ccd487d8fde0df858377525f576c53247fd0dd8dc5766497d252', '2026-07-30 14:51:45', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-29 14:51:45', NULL),
('050bc458-89b7-11f1-ad23-706871ff20d7', 'eeurq11hcchdau2mjq160cchj0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1cabcd5b88458cae54f117de6dd4be8eed96ac50afdb4a25e479801896ba9c5f', '2026-07-28 12:30:58', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:30:58', NULL),
('0531cbd0-8f16-11f1-b044-706871ff20d7', 'a28vc9l0g7iatsnp99meicm3m3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '8e9c562203dad51f2965aaa77a10a30ed0b365ad1b6535d4414c694e0e8b86e4', '2026-08-04 08:33:36', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-03 08:33:36', NULL),
('05b47564-6ae0-11f1-b9ca-0a002700000b', 'b036g1scalhe7o3rcah4fds879', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '86d6f31a23583c88ab5521c9307882f2d76250b05bcbdd3cecbf74d9fb5eba42', '2026-06-18 06:36:22', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, '2026-06-18 06:36:22', 'logout', 0, 0, 0, '2026-06-18 06:36:22', '2026-06-18 06:36:22'),
('06079c04-7783-11f1-ae3b-0a002700000b', 'n6io6ae7a9sk237sneo65bu877', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6e0e497cedbaef2e9b2efdd7804bf11b49dd440842490e0b2d9466458a20c29e', '2026-07-04 09:05:32', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, '2026-07-04 09:05:32', 'logout', 0, 0, 0, '2026-07-04 08:33:25', '2026-07-04 09:05:32'),
('062ce940-7f71-11f1-aa19-0a002700000b', 'v6hh38k112bes7d6k8mvbsiim3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c65eb52cead4c3e8a53aa41a7353ec34df29628adfdf0848a0612e36b4ca0e46', '2026-07-14 13:24:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-14 13:24:18', 'logout', 0, 0, 0, '2026-07-14 10:44:43', '2026-07-14 13:24:18'),
('068a7f32-8817-11f1-8a20-706871ff20d7', 'lbiljotio6bqtdii02vu7keqed', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'db21f770c52647b1cb8204af0fdad62b9a636a74f2890e988fe1497b519248e4', '2026-07-26 10:53:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-25 10:53:10', NULL),
('06917d4b-881c-11f1-8a20-706871ff20d7', 'pjpfkovjatar2v5iaacaceqkps', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'cc04843681fe6ca0f4b8bded202bee6935fdaaf74b116cf058c2355ead5a87e6', '2026-07-25 11:33:05', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-07-25 11:33:05', 'logout', 0, 0, 0, '2026-07-25 11:28:57', '2026-07-25 11:33:05'),
('06ec6aa7-89c9-11f1-ad23-706871ff20d7', 'd7tfs8cfn8ho34ddv0u3m6viud', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b607bed65ec371bc72cda988985203fd46de7f0dad4b1e08243435bc5c382ee1', '2026-07-28 14:39:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:39:52', NULL),
('071c7269-a6c2-11f1-b4bd-706871ff20d7', '52a5a6ri2gv5hhl6obug0nt3kj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '551bb3e518f29006da47d16054eac6e3bc99d2c9615ae8d439db300fd628aa1d', '2026-09-03 11:32:49', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 11:32:49', NULL),
('07c88781-7dd0-11f1-a5b1-0a002700000b', 'dm4pvm8jci2rb2s2gv2igktm0k', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '8b0e44fd38384ab035bf985d8d37e2b478dc03e39af6c01fd815732e430a1273', '2026-07-13 08:59:46', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:59:46', NULL),
('07d8fe88-8b5d-11f1-b840-706871ff20d7', '2ll6e5ian1p4sjp4qoaabnbs99', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '18e7ce4ae12d2cc89e2ac4cfbe94e2b5b50ae87e1d27c7ab49aad5baf5f3d88a', '2026-07-30 14:51:50', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-29 14:51:50', NULL),
('080a980b-7dd0-11f1-a5b1-0a002700000b', 'ba5k2j123m0buoj7s7is2kn2ll', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f733f6244dcc9234f21c0d915c3e0e452e11bdc6c3a74ea9444053f6cb1dada0', '2026-07-13 08:59:46', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:59:46', NULL),
('08226c11-84c2-11f1-b39b-0a002700000b', 'o4q35ff1cgacvbrhepqchb0p1h', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '25adb8ebfb5548604e64530f06dd4ab5f170b8eabfafda06c49676b7b4c1dbae', '2026-07-22 05:07:12', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:07:12', NULL),
('08f59d05-7445-11f1-a369-0a002700000b', '5cqhnfe580tsjj9o42i9hgpt61', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7df054036a3155d446b34c1a8500074e9b21046c2269d44900ed9a7ebf296cc0', '2026-07-01 05:32:07', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:32:07', NULL),
('0a230695-99db-11f1-9971-706871ff20d7', 'uhvtin6pvgfdmj5r2b7j16bt68', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f06bb9d9f7bb45034a2f637e1983c2f5f6e1b272525f48bd49228c8ccaa7fbbd', '2026-08-17 03:14:17', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-17 03:14:17', 'logout', 0, 0, 0, '2026-08-17 01:29:07', '2026-08-17 03:14:17'),
('0ae03da8-9fb2-11f1-b4e1-706871ff20d7', '3js28c4m6vpvqeh8k0cvf2tmm5', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '51d1dcd5f864fe408e328803802ece160b2c11f1c42a1fee4f51c7b522f7f733', '2026-08-25 11:50:46', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 11:50:46', NULL),
('0b880071-99ec-11f1-b09a-706871ff20d7', 'rrevfhqiqo3b5v4ih0ctb6gkmm', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3ceefec9e7b173dd32fc6325bf998938d3a99226487849dce148a54463d3be83', '2026-08-18 03:30:51', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-17 03:30:51', NULL),
('0c1698ca-9f9e-11f1-b4e1-706871ff20d7', 'rukbuiccgosfn0vgrkatu9jsmm', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c8948fee564e34c66649940e5cc30dec1a739733970f58d8efef7a91108bb13b', '2026-08-25 09:27:38', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 09:27:38', NULL),
('0d4861da-84cb-11f1-b39b-0a002700000b', 'asrafdouvjiv3hiiojktuod45b', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c673aee677455b1b58cb10c0995dffaad94184db9792dd6f4cccecb2c5ee6ad8', '2026-07-22 06:11:46', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:11:46', NULL),
('0e3139ca-89d4-11f1-ad23-706871ff20d7', 'rfqthf8nudbumqr88bh463pdsk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '8300254e9325f8729c10803c54acd5011d6248e1e12deeb14e059d0f8bafeb3d', '2026-07-28 15:58:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:58:48', NULL),
('0fce7926-7dcb-11f1-a5b1-0a002700000b', 'ljqfu743bb6323tklcrm1sf6ne', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '04fd97e6911469e2e42899d9f0b1d8b17cc37d64cda41e9e08be6a678dc26994', '2026-07-13 08:24:12', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:24:12', NULL),
('107b4c7d-964e-11f1-8c9f-706871ff20d7', 'f3q3trsh8hbdfurroh29m3hi3g', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '937f2b4e1a5983e60170717c3eb9d9daba55e4732e9db18b9b38bc95eefd5e0c', '2026-08-13 13:02:25', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-12 13:02:25', NULL),
('10f64877-743c-11f1-a369-0a002700000b', 'bnb2llmp8niu0nu7itqjj08rqm', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6ca28195e981c0dbef748c01a05da98afa8e1139d27675e8c2929d091ae28c1e', '2026-07-01 04:27:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-06-30 04:27:55', NULL),
('114a5f77-996c-11f1-bd62-706871ff20d7', '49pu5n42t6364s12iogc5sa57r', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2b58a2917834686737b1de8a572c2d460c2e57785baacc59af69d3c4a5c909a6', '2026-08-17 12:14:45', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-16 12:14:45', NULL),
('114d0c86-79c5-11f1-a60b-0a002700000b', 'g4fn2g93a0dtfjd2csg601tk8t', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'dab37e881cdbb0357c12e20049b73095c738e482a4d953ab066fd623633fe1c9', '2026-07-07 05:31:19', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-07 05:31:19', 'logout', 0, 0, 0, '2026-07-07 05:31:13', '2026-07-07 05:31:19'),
('11943875-7ad5-11f1-a017-0a002700000b', 'vg34nsnsn107emugbknajd8ro7', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '86ed3e6a6df3e91ab9ed12d97819a436e9f4055414a1503d54d2fbdbd4a3a309', '2026-07-09 13:58:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 13:58:16', NULL),
('11f2d53c-7f7b-11f1-aa19-0a002700000b', '3teu02soospl3getr668qu5j2t', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '49f28e15a9c60b290c55009145c68f73b48ec1e6759dfb8d4d3299199f0f2c64', '2026-07-15 11:56:38', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:56:38', NULL),
('1263f874-7a16-11f1-97ee-0a002700000b', '0ko1qdcaj5ntdrddheber6hc8b', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'c5864ca606a66b05bf7d859bdd9389f4142e70da0201e8a23712bd2fc79f0d8c', '2026-07-08 15:11:04', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 15:11:04', NULL),
('126e3745-7a16-11f1-97ee-0a002700000b', '74ktp5cltfk61nl944a7t8eb4p', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '41827b5fcb613225863e7d8f3dbee61b4cb2535b3d07ed01c40781e852eeda6e', '2026-07-08 15:11:04', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 15:11:04', NULL),
('1295825a-96e1-11f1-910b-706871ff20d7', 'kl5ijldqm704lq3oluh7jbumc7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '255c881293fb472c82724c65ea30f669450d0bd40e782ab3003ba9cbf1a25ca9', '2026-08-13 07:05:23', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-13 07:05:23', 'logout', 0, 0, 0, '2026-08-13 06:34:44', '2026-08-13 07:05:23'),
('12e5374c-84db-11f1-b39b-0a002700000b', 's9oknq80kh6k80cgib75vk6otf', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '502e0587820366c3c619e3e41927e1b6c35f1582a83552c19c6da9a0750720bd', '2026-07-22 08:06:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 08:06:27', NULL),
('1384f743-9cb5-11f1-9340-706871ff20d7', '2c1t1fhfg8vbcvc06es8jrro92', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'aa7443fb3c6b5ea8d22164928b4eb621574004c3a04f4baaf0308777bf125f44', '2026-08-21 16:34:55', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-20 16:34:55', NULL),
('15023fcc-96d8-11f1-910b-706871ff20d7', 'vlgt4pmp8fle3a29t5hod4f8cr', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '587b1743966a134d3dfcc4db5e38c64ee68f543e6ca1c5b7adf4496e002a3cd6', '2026-08-13 06:34:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-13 06:34:39', 'logout', 0, 0, 0, '2026-08-13 05:30:23', '2026-08-13 06:34:39'),
('16a1eeaf-79c5-11f1-a60b-0a002700000b', 'b6s767mcm3dcsgibl6e77i3cr1', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bb72c075568cdd8e0657582ed8a80aa223b1247358a66ac501913d31d0477d27', '2026-07-07 06:18:04', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-07 06:18:04', 'logout', 0, 0, 0, '2026-07-07 05:31:22', '2026-07-07 06:18:04'),
('17fbf04d-a6bb-11f1-b4bd-706871ff20d7', '242hfrgsn36m53q6g338b8d4r1', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'dc4dd9a7571e07cf3a0a17709e5e3360f93c09f5ba905227c92c7ef1e60753c6', '2026-09-03 10:43:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 10:43:11', NULL),
('1862b6d4-960e-11f1-8c9f-706871ff20d7', '37u420f3ivgfcatferbflda6v6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e46e0bb78d872200b492cb576237d143e29fbd38f924e8ac6f4ad5fccdf40a48', '2026-08-13 05:24:30', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-12 05:24:30', NULL),
('1872d4b7-7a0f-11f1-97ee-0a002700000b', 'nofq4fqhrk4npl5ov881ml5hse', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7dc1074d4b73fd56c386516922f13d07b033b3e9f057cfe5a92df39735b1dda6', '2026-07-07 14:51:20', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, '2026-07-07 14:51:20', 'logout', 0, 0, 0, '2026-07-07 14:21:07', '2026-07-07 14:51:20'),
('193570b1-9f81-11f1-b4e1-706871ff20d7', 'spq3imf3iv04bng858835up3u2', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '90c79b9e877beab4ce3e77ad181a978b849e20ad7b82db42f39827218a032b9e', '2026-08-25 06:00:24', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 06:00:24', NULL),
('197fd4b0-8faf-11f1-91e4-706871ff20d7', '12edvfsic6ei6hu1ta43a795op', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'ef3e5631b660c956165160b8b3c2b6094caad075944005e8de7db5f64999a4bf', '2026-08-04 02:49:28', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-04 02:49:28', 'logout', 0, 0, 0, '2026-08-04 02:49:23', '2026-08-04 02:49:28'),
('1ab434f1-75da-11f1-aaef-0a002700000b', 'bf84ia00ktn75dot6c7sh37mc0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1fbaf0a96f16b277897aaf85aa60798928786d49c734a10dedc98fcdd68398db', '2026-07-03 05:51:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-02 05:51:43', NULL),
('1ac5c70a-8019-11f1-9f4a-0a002700000b', '7383f4n27n522o01rq1q9hc7qu', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ccee8d6dbeb085a04d5aaaeae50ec2403378f077b5c48e2a0d23648a8a4849ac', '2026-07-15 10:34:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-15 10:34:48', 'logout', 0, 0, 0, '2026-07-15 06:47:53', '2026-07-15 10:34:48'),
('1b781f94-a6bb-11f1-b4bd-706871ff20d7', '90tltcaj69l531ilcmgn879bmh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '53ccb94a50eb41a35ea428c52b95ef905c8f4c413245d3af7fd60f48c37563aa', '2026-09-03 10:43:17', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 10:43:17', NULL),
('1bafc3fd-84c2-11f1-b39b-0a002700000b', '5nf0ar3f75irblmm7acifh7tj6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '10606968a33b92fc659c8e720837d4c4b056af3cb088ef92bef015af8d0f3ca0', '2026-07-22 05:07:44', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:07:44', NULL),
('1c04a535-9c8e-11f1-9340-706871ff20d7', '2p5uhq4f2ihfm5nb00pcclbm5v', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '17f462cc930ccbd763227e001044a592338cb6bdb0e0dff0a1688585d89f6c6e', '2026-08-20 15:23:35', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-20 15:23:35', 'logout', 0, 0, 0, '2026-08-20 11:55:59', '2026-08-20 15:23:35'),
('1c5bd6c5-8fa1-11f1-91e4-706871ff20d7', 'e5moc37fk5l7t430jgp767tv2d', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '4ef82bab73d926c861b43d0fa1bb9d950787cdf399297b1e7be8caa358a03020', '2026-08-05 01:09:15', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-04 01:09:15', NULL),
('1c5cfa54-785d-11f1-9aa3-0a002700000b', 'psofl44cq0sogrvuhn2hkll6iv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f21d953dfa246706598f5a382afb3752e9def62b8656a5894fad3f5b095970c9', '2026-07-05 10:34:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-05 10:34:40', 'logout', 0, 0, 0, '2026-07-05 10:34:32', '2026-07-05 10:34:40'),
('1c66dfd7-7dcb-11f1-a5b1-0a002700000b', 'nphh5n6jr976cb6tekr8j9eskp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9d4d4e94cac2bb5736145c8e925ff9562e0a160bb68c9806625b65e5f0b8afc2', '2026-07-13 08:24:33', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:24:33', NULL),
('1ccc360f-9304-11f1-90e7-706871ff20d7', '45v7fdovmrnkqa0nttifnd9sed', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '816a42834e6ce46c9f5b4651f4ecb58f773a25ea424702584f5c2dae16504e94', '2026-08-09 08:35:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-08 08:35:29', NULL),
('1e28df95-8faf-11f1-91e4-706871ff20d7', 'pk6snusm0tpll9f95di85nv7hu', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b6541b0fbb0a0e1edf0df460378ad1429e0b4fc7709952fb3dc8149a76f9d4be', '2026-08-04 03:35:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-04 03:35:52', 'logout', 0, 0, 0, '2026-08-04 02:49:31', '2026-08-04 03:35:52'),
('1e7ff139-9cab-11f1-9340-706871ff20d7', 'ouo0fknud5ioc5lsti9qqt6oqh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '781a884c775d797a749b73707d93f87b352195d57611b35daf963f8249ae3f9c', '2026-08-21 15:23:39', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-20 15:23:39', NULL),
('1fc8b7df-9226-11f1-a711-706871ff20d7', '5b96bh9flec3tce793f0b93nah', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b76870bd752813afa1d68cd87dd4bb65bfc5468d54afb19fd9113a0c8936c260', '2026-08-08 06:06:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:06:26', NULL),
('21e22927-7dc7-11f1-a5b1-0a002700000b', 'kd0nrj02aipurrdjgggub3cume', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '25e82135b5a087373659e999691fc484231753f119509b2e01033295b768fd30', '2026-07-13 07:56:04', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 07:56:04', NULL),
('222c92a2-7dd0-11f1-a5b1-0a002700000b', '1c5rkdvhjkif8jlsm593ussufe', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '368322b633130aac4880198135845a1b340a318cc82d061ecc388a87c1290262', '2026-07-13 09:00:30', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:00:30', NULL),
('2231118a-9520-11f1-a1ed-706871ff20d7', '8dvgi1mj5l5drthcrsd2ras61i', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '9f12a6f7104579c3df7a4279bcf5b27d684ee32529bfaabdcfa098a17c2eae8a', '2026-08-11 03:35:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-11 03:35:27', 'logout', 0, 0, 0, '2026-08-11 01:01:07', '2026-08-11 03:35:27'),
('22488d27-7ad5-11f1-a017-0a002700000b', 'rgbtspfb0q07v0h083dj8i79tp', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '09e5b893a1e743d895f9a30f3ec1a36a566aee6dc623c131586028123c4ec28f', '2026-07-09 13:58:44', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 13:58:44', NULL),
('2260da5c-a9c5-11f1-a501-0a002700000b', 'dfa89udeccjvdo4vlc6liuvgdf', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '9ac3e703bf3932a9b16712a5d7589d2a2345b4d9563725bc59a77334cda08a8b', '2026-09-07 07:32:37', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-06 07:32:37', NULL),
('2267c7a3-89d3-11f1-ad23-706871ff20d7', '56hfvdacu56iphfqe0i0741hcu', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c83f48ca76826f42a1fcb5cd2243535d2632b3abb0eaa7fc58d3fb9426bb8740', '2026-07-28 15:52:13', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:52:13', NULL),
('22ef629d-785d-11f1-9aa3-0a002700000b', 'kcnd5vfkdcora9ea2p0ns39ju9', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '24b0c6c6b21dc0fe740e38c0c7a8abad4c591876ee4260e348b760304ea7fc74', '2026-07-06 10:34:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-05 10:34:43', NULL),
('2314034a-9fbc-11f1-b4e1-706871ff20d7', '28de48sobk6ts3asa94uvav0j4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '42250813f99c9ed509858620df6d35b612d91d508fa0928bb5db07174653d14a', '2026-08-25 13:03:01', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-24 13:03:01', NULL),
('23458548-9f83-11f1-b4e1-706871ff20d7', 'mrc0otqlsueafr9c7ubc9cno1n', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1418120c8e806c575b4ffa52449db35e7473b9efecd54dac6071daa77d0282cb', '2026-08-25 06:15:00', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 06:15:00', NULL),
('23e9a884-785c-11f1-9aa3-0a002700000b', 'qphluuod332jc9njub7avguroo', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'd11add644829a1f9c780848005f4c20dc6a6b9ea84fe492a5c9b36a0c01dbe5d', '2026-07-05 10:27:46', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-05 10:27:46', 'logout', 0, 0, 0, '2026-07-05 10:27:36', '2026-07-05 10:27:46'),
('241e6885-7ac1-11f1-a017-0a002700000b', 'pkkfgu9ahrtm24c4hdd34ea3qc', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'f6bb7e7ada1bae28c0f694d6e13064644e68d5cde3aabb62f6ebcd7b1baa41cb', '2026-07-09 11:35:37', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 11:35:37', NULL),
('24819443-9226-11f1-a711-706871ff20d7', '800tm4o7tehce193afqdop0hb0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5ee8680419376c36015c2c6d1d17bb240b5a643974f65a57ce81ef531bc9368e', '2026-08-08 06:06:34', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:06:34', NULL),
('253abba2-84c7-11f1-b39b-0a002700000b', '0h66q6n577fl27epkf04r639ej', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '429e6e127c35bfb1a196ae5846fcab4d205e49d9f95edf806cede0db496a1682', '2026-07-22 05:43:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:43:48', NULL),
('26798db3-a5b3-11f1-a82a-706871ff20d7', 'ts4pcc4nlqcig5mv1orf9fa34l', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'fc14428a5fbdb8655f596391f6a8cee9be1e67ed51998457466177910843c070', '2026-09-02 03:13:48', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-01 03:13:48', NULL),
('26a83f57-7a12-11f1-97ee-0a002700000b', '4hb38rq6ok9i2vrscsu0gejpkb', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '3b10ea689371759262ed8026d588f8dc3549ba2a6783a56e7a570bfbf5c1fb7b', '2026-07-08 14:43:00', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:43:00', NULL),
('26e387b5-7a12-11f1-97ee-0a002700000b', 'rt03to1hme861oqm0mv3pgkdhh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9e37083a7feed8473f2ab2059c34f4aa7d4a85085a3f7a632a353d93da3033ce', '2026-07-08 14:43:00', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:43:00', NULL),
('271bfc63-a6bc-11f1-b4bd-706871ff20d7', '322rg9kk4rnrllv6rhmq0hi7vf', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '87dc813e9a188f05f059f56fb9ed78b8f19379ea19db60e4162445d3d796d0e2', '2026-09-03 10:50:46', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 10:50:46', NULL),
('27401fb5-99db-11f1-9971-706871ff20d7', 'eoftd76dfrf6u59mul022t0omk', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'd9c2d6a297ab7648e023075cf620c3a6ac92bc16e5f36e650fee43ff4bbeaffb', '2026-08-17 03:30:45', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-17 03:30:45', 'logout', 0, 0, 0, '2026-08-17 01:29:56', '2026-08-17 03:30:45'),
('2749467a-9614-11f1-8c9f-706871ff20d7', 'm5p9cujhteq4ne8vi9ol7dqblj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'dd153ea8833523ada2d1143f6243861b681d426895c1082bc3b16e740de592b9', '2026-08-13 06:07:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-12 06:07:52', NULL),
('27718471-805e-11f1-9f4a-0a002700000b', 'cg30i5nghr8m226kvou9g97p95', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '550621d4a099fc123b0119ee1dba0d673b8549c395902db75d23ecae244e956d', '2026-07-16 15:02:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-15 15:02:10', NULL),
('2787662e-7444-11f1-a369-0a002700000b', 'aleai6qngrt9m0ss5smre0je01', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1dc8a737197c0ef653a53107512bdad335ce252de7c5c43e41fb5ad80c3c4492', '2026-07-01 05:25:49', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:25:49', NULL),
('2787b76e-9226-11f1-a711-706871ff20d7', 'fq8tmbgq5fk3o63fvaciqqr5bp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7cc1630681f45bf2c35fea4c2ee59956b3e334e443003126a31f2e2b30d9bfc4', '2026-08-08 06:06:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:06:39', NULL),
('27e69f9c-7dd4-11f1-a5b1-0a002700000b', '7eb3ui7b4ftk6jkcmrjabtd4du', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '895cdf31a2483a021ca6ab8eea5ec1d1e7b00ceb195a4a215cfef9e0e45ba754', '2026-07-13 09:29:18', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:29:18', NULL),
('28343bb6-7dd4-11f1-a5b1-0a002700000b', '3fmt8gikvoq7bfad6pobucv2mt', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '371c40dabc7cf2510fe7cef99c5e7da3e12af4847400df4c7426fe5de6fa1237', '2026-07-13 09:29:18', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:29:18', NULL),
('289096dc-94be-11f1-958b-706871ff20d7', '5e62v6nl0avkgo6a8gpk33ee1q', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '016d83a4d7c8a4d35ce6ca864c7b9de3e19b7c7f28ea2e57f3e15dd2f3fe0e91', '2026-08-10 14:30:01', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-10 14:30:01', 'logout', 0, 0, 0, '2026-08-10 13:19:47', '2026-08-10 14:30:01'),
('28c517b9-9ecd-11f1-b6d5-706871ff20d7', '1dkl5q9sc67jl9c4iuah7dmrnb', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '8ac9ad95ecaf81fec19d4f49e4acbbf648ce5b4588fbcac734b81230df88f1e2', '2026-08-24 08:32:21', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-23 08:32:21', NULL),
('290497d3-8f4d-11f1-b044-706871ff20d7', 'ummhnshoa0gugo6p972vue7rqf', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '70b06296133140d986fb58efb09e93322d9161e0eccd928c9862675178b8597d', '2026-08-04 15:08:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:08:16', NULL),
('296f11b4-89cc-11f1-ad23-706871ff20d7', 'p91b7rkskrn75a2v8lu5mkfr4n', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'ac4d06d6a62eeacb51d4d8872d87d96ea6488c631fcd3b57e8768ec8807e2416', '2026-07-28 15:02:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:02:18', NULL),
('29db1396-9719-11f1-9fb5-706871ff20d7', 'j9ggprsqb0d3np2h83jersrf84', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bd0860720d8c6f243d5bd88e0189dba0a747fb3e40960dc36941d738594e5be0', '2026-08-14 13:16:15', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-13 13:16:15', NULL),
('2a355935-9634-11f1-8c9f-706871ff20d7', 'hgdm9pou7rqu8o3fgv4bmiknmu', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b506791633673895db6d9305e46edc5474e25368334a0772f545528fb4b62594', '2026-08-12 11:18:24', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 11:18:24', 'logout', 0, 0, 0, '2026-08-12 09:57:01', '2026-08-12 11:18:24'),
('2a8790bb-9226-11f1-a711-706871ff20d7', '6rp4pkk8tppvgvmhbvqq9fs047', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '437bf409c909632f9621a66f441a752077cbd81a43321fa92d15fa3bb0a9942e', '2026-08-08 06:06:44', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:06:44', NULL),
('2aad4c68-8b4a-11f1-b840-706871ff20d7', '3h8aaerheg5uj5nrt9ohkj6rod', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'fae4aadf7ddfa1cfc519fdd1beb2e27a24f05ded6667e470b2c6555fb509e01f', '2026-07-30 12:36:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-29 12:36:48', NULL),
('2b413c09-8f16-11f1-b044-706871ff20d7', 'vco7ifpcvjbrq57bgck8hru3pt', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9c9279d036b0b01712103d2a002aa8d0fcca234dae0b503a920d45e4bdd61e69', '2026-08-04 08:34:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-03 08:34:40', NULL),
('2c40246e-89c8-11f1-ad23-706871ff20d7', 's78ocut6h1gpdhfdv0k4htict0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd04d9a9b4be136986c45745ba862805bd94b2c67d82fc4922526f308510b3840', '2026-07-28 14:33:45', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:33:45', NULL),
('2c408880-785c-11f1-9aa3-0a002700000b', 'gk6d4q1me9mdg5ij5ln4adsalq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '847d44f00e6b2082ff26d9374b87d83b1884db06a7bc2fca1eecfd630b2ef924', '2026-07-06 10:27:49', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-05 10:27:49', NULL),
('2c71caf6-9615-11f1-8c9f-706871ff20d7', 'octm508pl2bft9hgudmm3v98bk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd00b8bdcca8b2b240d6cddc092dfe41803089e660ad4fac7c2df282579394b83', '2026-08-13 06:15:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-12 06:15:10', NULL),
('2cea2bc1-a6b8-11f1-b4bd-706871ff20d7', '55kl7mbvsmd8et4dvbsto7pfls', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3af7366fb9bf9b60b5be8de71edb584e329cb7d5a6bc39b5ae04d85f624c50a1', '2026-09-03 10:22:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 10:22:18', NULL),
('2dcc9e74-7770-11f1-ae3b-0a002700000b', '1gpev5an9ck482lghgkcipukv8', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7f220e9397af72042a232bb0a9243947029c1cfc30e7e24b04a4e7b3d4a52476', '2026-07-05 06:18:31', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-04 06:18:31', NULL),
('2e011041-95a2-11f1-92a6-706871ff20d7', '8r6ib0ds663ulij1c6u8a6iat3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd873c0153d3b58d28761e1f7ae43ebabc5944fffc2860edbacb9d2a9d7e1a333', '2026-08-12 16:32:01', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-11 16:32:01', NULL),
('2e02c0aa-7443-11f1-a369-0a002700000b', '044r4d19v6a1fidggm1185ab08', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c236c356593d189c3323c22bc7693479b0705d740e5a9d4e422d1e2eecc5696c', '2026-07-01 05:18:50', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:18:50', NULL),
('2e9f81bf-89c9-11f1-ad23-706871ff20d7', 'al6375hi4deci05t717c7a8atq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f776861e6e57def7296fc30917e402317bf05fd930bc4648f7a95e8b50761044', '2026-07-28 14:40:58', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:40:58', NULL),
('2eb6a289-8a2d-11f1-85ca-706871ff20d7', 'o3vbjkvqineh6iepetsft0f1jg', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7237b9dd09ecac556ca2f789fa0a5f7e59133a0410abb803256358583c5af63e', '2026-07-29 02:36:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 02:36:48', NULL),
('2f2ab210-8a2e-11f1-85ca-706871ff20d7', 'eu4l9ps9e8n7vrb8buanaa3g1q', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd9237d7426803298cbe4c9e0b6760a099c3040822653bb69f0bc01747c7100ae', '2026-07-29 02:43:58', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 02:43:58', NULL),
('2ff70f27-7045-11f1-9e75-0a002700000b', '2hrb4si1aump82d17mrb6qrv6s', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '51d163640df6d7a9ca3ef07e2fea89e18e8567ad8a567cae285db3e0f8e5f0cf', '2026-06-26 03:23:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-25 03:23:08', NULL),
('30450e2a-8819-11f1-8a20-706871ff20d7', 'gie5e6e33m4jv113s6d45k8ltf', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f0015164d1bffebc16ba5ee21c384b4b5c887cf1c4310640d6e72d552eeafe01', '2026-07-26 11:08:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-25 11:08:39', NULL),
('30d6db4a-89b4-11f1-ad23-706871ff20d7', 'opuu64n75levcd7ggl7shbredj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5334b2565d4f23a7e6812536af5faa8a6ca592c3bd753b77957e749e5c170427', '2026-07-27 13:30:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-27 13:30:47', 'logout', 0, 0, 0, '2026-07-27 12:10:43', '2026-07-27 13:30:47'),
('31387642-6e17-11f1-bbba-0a002700000b', '7p5glm9ghepvi7k1bn9qqlrui6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1c5d4a3417ff1e0a8dcfab2e7f46c6f97a32315eb4d2ae96f003c222176612a8', '2026-06-23 08:48:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-22 08:48:51', NULL),
('31606d59-7dc0-11f1-a5b1-0a002700000b', 'mslcvjbd4dqvhdmcjhiop83mpo', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'dda49c9f45aaec6c0a97af50346ef551e214e6862f02ae4d503032a108097e03', '2026-07-13 07:06:24', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 07:06:24', NULL),
('317b8f60-9f98-11f1-b4e1-706871ff20d7', '5146nq9kem91lcor4m04vijv43', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b872ba3fdc4ad15209934b71740588df1efdc63980f1bc7e859685df5d6f18e2', '2026-08-25 08:45:43', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 08:45:43', NULL),
('324c63ae-a03a-11f1-b4b0-706871ff20d7', '240a3shm16d7i9igfpmr0666nc', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b8149ceebc374ff5186b72af4c9c5ccaf758f5f965a108b3c15a8d69dfd5e857', '2026-08-25 07:08:48', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-25 07:08:48', 'logout', 0, 0, 0, '2026-08-25 04:05:24', '2026-08-25 07:08:48'),
('32a0d51b-7dcb-11f1-a5b1-0a002700000b', 'va5444q13d5lg1ist4c7nfudii', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9a0b2930b7b11aa09195756ab0cb58a816d01a39b8ec3cea7584ff0d21b0b4be', '2026-07-12 08:25:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-12 08:25:21', 'logout', 0, 0, 0, '2026-07-12 08:25:10', '2026-07-12 08:25:21');
INSERT INTO `auth_sessions` (`auth_session_id`, `php_session_id`, `user_id`, `account_id`, `tenant_id`, `session_token_hash`, `expires_at`, `ip_address`, `user_agent`, `is_revoked`, `revoked_at`, `revoked_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('32fc00e1-9796-11f1-9306-706871ff20d7', 'codexpreafe8c55e1bb3944cc6b43a0', '09632669-6a16-11f1-895a-0a002700000b', NULL, NULL, 'a3303f25bc844167d138ae5fa517cc6ac5d925b3845b2db93d0b577a0b676cd4', '2026-08-14 14:11:18', '127.0.0.1', 'Codex PR workflow test', 0, NULL, NULL, 1, 0, 0, '2026-08-14 04:11:18', NULL),
('33017a50-9796-11f1-9306-706871ff20d7', 'codexpr40da278f695e86b4cc51cd37', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'cfc02260b2272e07d6dd7c6f9899e394601885bd9feaea8ca1670a96fc79860f', '2026-08-14 14:11:18', '127.0.0.1', 'Codex PR workflow test', 0, NULL, NULL, 1, 0, 0, '2026-08-14 04:11:18', NULL),
('330261bd-9796-11f1-9306-706871ff20d7', 'codexpr85f18fbb142a404bc7ded093', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '5c9dbbaa20158fb6b76bcb1cde7448ccf74e7b8c5bb1087893717d0530728191', '2026-08-14 14:11:18', '127.0.0.1', 'Codex PR workflow test', 0, NULL, NULL, 1, 0, 0, '2026-08-14 04:11:18', NULL),
('351d4660-9ace-11f1-b0e5-706871ff20d7', '2ce15r74gdkatqnblikqnj9gmj', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '61f66c38c30524489f39ada4166677e4d98bc007501c1e389cc0fd79a7eab381', '2026-08-19 06:29:47', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-18 06:29:47', NULL),
('35aad486-958c-11f1-92a6-706871ff20d7', 'kh9a3bjhd6g19hov8knhfp0p9j', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'ef986cdf5257f94d3e00d2ca5a699ad9ebd8a1fd1c7c0c08c5bc846c0760335b', '2026-08-12 13:54:45', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-11 13:54:45', NULL),
('35ac41ee-89cd-11f1-ad23-706871ff20d7', 'pk5iv6cr2rpgfp6ha9d6cfsuvm', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'acb9d1f12b675f860cd67cde584ba8b5ab3588f4eb96c20c61e76530e9a2ab9f', '2026-07-27 15:10:00', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-07-27 15:10:00', 'logout', 0, 0, 0, '2026-07-27 15:09:48', '2026-07-27 15:10:00'),
('37935209-a6c2-11f1-b4bd-706871ff20d7', '60bh2tq0dl0vlddc5pu0l7k7te', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0410ae11bf99064ea3ade558bc51d3ae0e8b120f7d3697b055aa77674dced737', '2026-09-03 11:34:11', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-02 11:34:11', NULL),
('37a346cb-7ac1-11f1-a017-0a002700000b', 'ouda464ei9f9gggkeqte93877a', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '185ced178facf10277a1aed45d9f2ee6f564a2512436c0a93009adf1d8b8e629', '2026-07-09 11:36:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 11:36:10', NULL),
('381abf12-7f7a-11f1-aa19-0a002700000b', 'ii2ci1ft9q18ck62fhpu27lj22', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2ab00395bd1016af1151030ee799d1cdffd5408f197edce2541a8d2a473b5bdd', '2026-07-15 11:50:32', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:50:32', NULL),
('3862a754-9608-11f1-932e-706871ff20d7', 'jlcfenac69jcokuikfc518i7hi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b058aa0f2aa9ca4901095e7961ded1e12639bb71ebcf2801196e8d8ba645dfa2', '2026-08-12 08:12:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 08:12:57', 'logout', 0, 0, 0, '2026-08-12 04:42:27', '2026-08-12 08:12:57'),
('3908f54c-89c0-11f1-ad23-706871ff20d7', 'n7il79p8tjs1pa38t2q14jvge3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a89f2f9a958bc9dbff225b689bdb6fe80503a00efef57115a1bea022282687cf', '2026-07-27 15:07:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-27 15:07:18', 'logout', 0, 0, 0, '2026-07-27 13:36:50', '2026-07-27 15:07:18'),
('3917d076-8f4c-11f1-b044-706871ff20d7', 'tbqe2a5ga72nmek81fo41hvnvp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '26c99f2c0d732bec2db648533f0324aee5765eb1ad8c31435df1d6c85feb532b', '2026-08-04 15:01:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:01:33', NULL),
('3a333899-7f74-11f1-aa19-0a002700000b', 'rrh2refuthv80b6p04ca5ss0ei', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '8026f6a1aa03f0ba60a7369d7cd1a108a9e518ffcd62b581bc270ee6b4567bcd', '2026-07-15 11:07:39', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:07:39', NULL),
('3a522ced-89cc-11f1-ad23-706871ff20d7', 'jvk4s6bn2uk2dp3jlrepgtijdl', 'eb546a74-89cb-11f1-ad23-706871ff20d7', NULL, NULL, 'd7f529769b6c1c1a660f098ecd491f28ee52208d2e7bd9727ed79e03da8fa6ba', '2026-07-28 15:02:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:02:47', NULL),
('3ae58b89-7ae2-11f1-a017-0a002700000b', 'fmhjmhr12au3h2f5kkk72kisl3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0dec75a304b4b6a993df1577065835a4dd47847d831cad84c72c9d5429571565', '2026-07-09 15:32:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:32:29', NULL),
('3b47a0c1-7dcb-11f1-a5b1-0a002700000b', '00q1sjuqfrnnhirervch7mjder', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '28d7c90df9ede7610d1ca83764ede85dff772567e0ecc8d547a392872ece97e9', '2026-07-13 08:25:25', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:25:25', NULL),
('3c66974f-9536-11f1-a1ed-706871ff20d7', 'c218ffe7tv40aeq3r7scful1ic', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '524a929866cb9c5a549efdd6b29a98fffe5fa6123865dd1a5e917e8ed9b06c6e', '2026-08-12 03:39:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-11 03:39:16', NULL),
('3d409772-7ae2-11f1-a017-0a002700000b', '6s3lk5ksqgdjomhp9vsbebl7at', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'efebe2db4e376fd2fce67ed6456398be7f8845539a4eaa8d87952d31e42bd88a', '2026-07-09 15:32:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:32:33', NULL),
('3ddd0baf-957e-11f1-92a6-706871ff20d7', '353l4oaincbtuej1l118frq1a1', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '9b52c90b69c0bdf7ee9fc21e6edbb8d673549463de470a855ddadc5eb35c05d6', '2026-08-11 13:03:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-11 13:03:11', 'logout', 0, 0, 0, '2026-08-11 12:14:46', '2026-08-11 13:03:11'),
('3e8f58cc-9226-11f1-a711-706871ff20d7', 'l9pr30qqcg1mfu24lpjcp2e63t', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2a184577490dfd8d3f1f932ec98e78fa214eab3acb0254c2aab0d16d7c674c44', '2026-08-08 06:07:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:07:18', NULL),
('3ee81b66-89c7-11f1-ad23-706871ff20d7', 'ttdeao2rnsmae4ua7cvq7hg8h9', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5963831784353f69e367d3673d0e153b0d008984751873d387a08f99c21f28f6', '2026-07-28 14:27:07', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:27:07', NULL),
('3fb3ad6c-7f74-11f1-aa19-0a002700000b', 'k8tia25c2uvafut3tjm3qlaapb', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '57259a957cc7400ed077bfdeefa9dfbc21be64ae5ae5830187c196203dac94a8', '2026-07-15 11:07:48', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:07:48', NULL),
('4144c86f-7a0f-11f1-97ee-0a002700000b', '82pms2saae8nnsi1kjcnd239a1', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a951590ff3bbd07a5cf19abaf9150e1d43a01294ec77c064f411cf5ef4f51221', '2026-07-08 14:22:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:22:16', NULL),
('417c5cef-9faf-11f1-b4e1-706871ff20d7', '4uu48p8pg31bvutvtmt2u1c8kg', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '4626bc3ae7d7071c7dce47d9f148ebdee0c7a130437ecb10f570e51e5983d4c8', '2026-08-25 11:30:49', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 11:30:49', NULL),
('41b10983-7aeb-11f1-a017-0a002700000b', 'a5toanbi0oii4727qdns5hfacn', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '43b4a27a4ea438528743ca131f8879ba744c1b7d53ca0cd3436806ca10197646', '2026-07-09 16:37:06', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 16:37:06', NULL),
('420eaece-7ae2-11f1-a017-0a002700000b', '24t18ipht7ejn3povvumqdknbv', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '97476670804800e81e443879db61c20dd1a39d1d2c9d97161023839ddd9ed299', '2026-07-09 15:32:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:32:41', NULL),
('428bada5-89c7-11f1-ad23-706871ff20d7', 'kvvfrahs5g1mf7oa5i2ung350l', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'badf688f93456896fd9c3ca3f088a687cd24d02a3fcaeb2db0daf0b900268933', '2026-07-28 14:27:13', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:27:13', NULL),
('430f1a59-7a0f-11f1-97ee-0a002700000b', 'q85q68hgmh947vgb00mpq2i0fc', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '59aa9e76cfe5964f5e0ce19948a7d9a6975b3f86b435ed1aa0fff37ac4a7761e', '2026-07-08 14:22:19', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:22:19', NULL),
('4336de47-84cd-11f1-b39b-0a002700000b', 'sheslj1kuqlqjftpmbvkv69k0m', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd445d6dbc3af68bb723d1f8e532eaca93e4a9748b4bfe85fd59556d6d51ba172', '2026-07-22 06:27:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:27:35', NULL),
('4374ea38-99ea-11f1-b09a-706871ff20d7', 'dkbldgovv3oril0slgam7sncjq', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'd050a8876836227536cb73c40d94838885c557d2adeb0def6444f0af4ad9468f', '2026-08-18 03:18:05', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-17 03:18:05', NULL),
('44d397ad-9f8d-11f1-b4e1-706871ff20d7', '1a8t4g5fc95420t00trv8l8inr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e66a2781d5b22ba76892c5a19cb9cdba188e5e07658eceddfc0cb74d0e4466ef', '2026-08-25 07:27:31', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 07:27:31', NULL),
('44de52d1-6f96-11f1-8f3c-0a002700000b', '0jalnrqj3s3fgk4l4rr77m37kn', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f040359f9118c306ffe20c6bdb7e6462bedf24dd0a326b0e1329b5a92a2fb042', '2026-06-25 06:31:01', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-06-24 06:31:01', NULL),
('44fdb0c2-79cc-11f1-a60b-0a002700000b', 'k4lhl7v97bli634sqfskd3chnk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '01a481f60795d639f711f092da46da7a1fcb5876debbaffe77566ac82b8caac2', '2026-07-08 06:22:46', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 06:22:46', NULL),
('4527b4ad-8810-11f1-8a20-706871ff20d7', 'nco0210lt1hu352vlhk1b5muhc', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '32bc92b5598b1adf19796b5e53a613cd62b72848097fa2279b05bc7672b1fd27', '2026-07-25 10:52:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-07-25 10:52:14', 'logout', 0, 0, 0, '2026-07-25 10:04:48', '2026-07-25 10:52:14'),
('45384d27-8f4c-11f1-b044-706871ff20d7', 'sligtgcqb45ev2grddpvkve0tn', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7e1d63f1895ff6cead596f7540d8e4f1e70042e5be2c645c3157ab93b3f5cacd', '2026-08-04 15:01:54', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:01:54', NULL),
('454394e5-88df-11f1-8e9d-706871ff20d7', 'ad5jcra7cmevpfqopknnb1jjfq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5fddca89d4c5ce43407bd3c6c2dc1ccc8968bb42504b073dedefc630603376e4', '2026-07-27 10:46:34', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-26 10:46:34', NULL),
('45a37666-8f4d-11f1-b044-706871ff20d7', '04g9havh6ji4cf4jogf0bh82pq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9d70495cac51fad3a736fdd34e0b207373223d87bf21924281f04b1d052ca2b5', '2026-08-04 15:09:04', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:09:04', NULL),
('4692bf4e-89cd-11f1-ad23-706871ff20d7', 'jbd56tqsco6tmdemtk12n782hf', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6c8bdd4dfc1e8d518bf153fae18dbff326637cd61a37155dc61cdd7a38fa3b5d', '2026-07-28 15:10:17', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:10:17', NULL),
('46e938a3-7f74-11f1-aa19-0a002700000b', 'hr2rg217pehbcv0p2jba52qlt6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'af5c90400767ee87274d1560bd94b2ac8fe278aed893ab4f1c9fc9f109dcc10b', '2026-07-15 11:08:00', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:08:00', NULL),
('470c7857-7dc8-11f1-a5b1-0a002700000b', '3lcf2h7mepqr6uljpi8de6n8au', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7c5703ab3d3b20b4f62bcfac12b449a2a200bbc2a2a3109ff39504d4163f8bf8', '2026-07-13 08:04:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:04:16', NULL),
('4720971c-7ae2-11f1-a017-0a002700000b', '288nqgdt0c8utk9avgs9o92dvi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3bc1a11677b6daa766c5988d241cb87a25788334670894c36ed7f8f31291efdf', '2026-07-09 15:32:49', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:32:49', NULL),
('4727c238-923b-11f1-a711-706871ff20d7', 'hfkfb38v6g9or6qk941ig69fo4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd19d88d13536c31128ef9d46856774c0a6ceb7278c7395a97dba54352e16efbe', '2026-08-08 08:37:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:37:51', NULL),
('476bdcee-7ae8-11f1-a017-0a002700000b', 'k4eh8d1sdm19470fa0jogpvphi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0d35ddaea63cc2b54472dcd374b0c8bad9ca6e046b2b56a6c085ed05e14195ce', '2026-07-09 16:15:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 16:15:47', NULL),
('4775bcc3-923b-11f1-a711-706871ff20d7', 'usinmlgf6s4ft9rpm8s2434ckb', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'c0bf80816ace7e402aa3f0cd75e0f421723c1b07498e6f239432d742dc0c2339', '2026-08-08 08:37:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:37:52', NULL),
('47bc81cf-923b-11f1-a711-706871ff20d7', 'f5hfbtlscbt47u56avjn3jncnv', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'f810a638a7732e33ee7315fb5986b6c8bea3b1d68c5949e189073edfe3f684a7', '2026-08-08 08:37:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:37:52', NULL),
('4818b572-9309-11f1-90e7-706871ff20d7', 'd43e5ijtgmf47l5s4u0sj9sn4u', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b99586713038b6fed1e474416ef4c5fa82d42cf3f79383ef77af5567004355df', '2026-08-09 09:12:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-08 09:12:29', NULL),
('4819a72b-8f1b-11f1-b044-706871ff20d7', 'pskmfaunkmi6f6diffbv87jn40', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'abfaea1d1ec5514f3d33821499d162a3729317a5c3d11c91205d6207e117c431', '2026-08-04 09:11:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-03 09:11:16', NULL),
('4861a3c9-89c7-11f1-ad23-706871ff20d7', '20f0o59rqs420lmha92etvoicm', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '8a2c0a8bd01e1cc612e0b6ddb4bcd7074aeaf029d3ca5889b8f13ae61cfae4ef', '2026-07-28 14:27:23', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:27:23', NULL),
('48e0a511-7adf-11f1-a017-0a002700000b', 'aqae10qglt9vubfkp4t3ejj8vu', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a7a8b0e0df762cf100a092b66ad5b3f79a59c307288e383d74cce4da08115712', '2026-07-09 15:11:24', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:11:24', NULL),
('48f0730a-79cc-11f1-a60b-0a002700000b', 'lv7416aq7heb2ggutd64o0o4rt', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'f3eaba757297a53a6df38c4ec21bd0bb119f1f6468713fd0256f3aa228d25550', '2026-07-08 06:22:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 06:22:52', NULL),
('490167a8-7442-11f1-a369-0a002700000b', 'jog74173s4tdgm5i68hj7k83ip', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '05e0f9ea0e5e72bdc588ed95b9e12347a110970146037a112e046b598b35ce11', '2026-07-01 05:12:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:12:26', NULL),
('49d9c9e3-7a0e-11f1-97ee-0a002700000b', '4g8egbkf87f16joisahop307jb', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '2afaae3d9c8af61d32d95b7c070345d962e307dbe76498e8316dfeef56ea7430', '2026-07-08 14:15:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:15:21', NULL),
('49ff490e-9aa9-11f1-931b-706871ff20d7', 'codexreceive4feab3ba3f23ce16', '09632669-6a16-11f1-895a-0a002700000b', NULL, NULL, '4267ca66f4162366072ce4154fbdffe4fc2b85cad4d15b4c56886031245f3e0d', '2026-08-18 02:15:30', '127.0.0.1', 'Codex receiving test', 0, NULL, NULL, 1, 0, 0, '2026-08-18 02:05:30', NULL),
('4b020671-9fab-11f1-b4e1-706871ff20d7', 'm17l6kn40g0lfus344tvccf7tb', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f6887cb733248fcd9d25f4e193a7e71b58c825b5b27605c1ca5b50f1d7509401', '2026-08-25 11:02:27', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 11:02:27', NULL),
('4b2cceb3-7a11-11f1-97ee-0a002700000b', 'll0thl43c1586fhm7c42pqe131', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '402007e4e466bada82f810835255e43371f10644c840f9c28ac59c50090900ef', '2026-07-08 14:36:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:36:51', NULL),
('4b646941-7a11-11f1-97ee-0a002700000b', 'fd5msmn6fub7r063dl8ph7jk4d', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ae56af5b131b63d07491287d2d5a768ad127553d684be575b66842341e562610', '2026-07-08 14:36:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:36:52', NULL),
('4b8b43b1-7a11-11f1-97ee-0a002700000b', 'nqhrobrdkcenuj3do8m4hu1mue', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '0450655ca33dc9b5aba20880f350622cf1d4cd67f30f4acc0f9e9f7de6ed0d22', '2026-07-08 14:36:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:36:52', NULL),
('4bbdb94b-8057-11f1-9f4a-0a002700000b', 's9h3e0gu8katta36i0rmaibts4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '11d8a8c2a0a705eaddd3155036a8c593fb6d034560e2d64be3153df366e56712', '2026-07-16 14:13:04', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-15 14:13:04', NULL),
('4cf4ad17-72d3-11f1-9cf4-0a002700000b', 'e07901udl8gm2pqu1jgmh7ded7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f0e5b2e736c645b116711510923621e444e4868f291c893ddc90c695658d52f4', '2026-06-29 09:25:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-28 09:25:27', NULL),
('4cfdde0a-806b-11f1-9f4a-0a002700000b', 'llufgiondo47b90vu9t9go8oea', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a322fda41153c6ba9f4ed5711cb95adb6674ab45a13168e308c3c468106cb0d5', '2026-07-16 16:36:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-15 16:36:16', NULL),
('4d2b327b-7dd4-11f1-a5b1-0a002700000b', '8ql06m7mt4401i888nf7ulgeg0', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '4652fd972abfb980fc194a222137d8826efffacf846a25ea8880eb78e66de9f9', '2026-07-13 09:30:20', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:30:20', NULL),
('4d66ce93-7dd4-11f1-a5b1-0a002700000b', 'oc7kjjdgh1fl8s7ejekk5deplu', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7d5815d3d8533c37a1a5b7532f018331859bdd28d2eab30c9748bc19e0982a79', '2026-07-13 09:30:21', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:30:21', NULL),
('4f61eb4a-7628-11f1-b27c-0a002700000b', '32v68s2vbegl4efr14gns36nh3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd03d270d70b4d63bb0d2644239ad61dfc70a68ad87f12e6fb9122702a55ac1d4', '2026-07-03 15:11:32', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 15:11:32', NULL),
('502b8a82-93e6-11f1-977a-706871ff20d7', 'jafda1pfj36o60i9npsld09ef4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3161e77923c6993d38db5d074f3fadc01589296e74fa12809ed5e628f86cd92e', '2026-08-09 13:31:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-09 13:31:55', 'logout', 0, 0, 0, '2026-08-09 11:34:42', '2026-08-09 13:31:55'),
('50b0c362-9608-11f1-932e-706871ff20d7', 'ovm540d7npqerth5i4eba2f471', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '10c63c9bddb3dee7d97964e95cbf4a91451e5b9fe5d3e53a3d30cbf36f881606', '2026-08-12 08:14:01', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 08:14:01', 'logout', 0, 0, 0, '2026-08-12 04:43:08', '2026-08-12 08:14:01'),
('50bdc45d-762e-11f1-b27c-0a002700000b', '5jium8h0jbqpd7usjafpa99vjm', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f426e973fba29b61bd27b03f612eadaaac20b482273581644b2031844efbb0cd', '2026-07-03 15:54:32', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 15:54:32', NULL),
('50f01f5a-8f4c-11f1-b044-706871ff20d7', 'vddhosaaot21gplds7ucal6bu0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9b32cdcc5c800652a24706fbfe2bbfbc0df5bfd65457185687340be7549bbeaa', '2026-08-04 15:02:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:02:14', NULL),
('52e5744f-7f7f-11f1-aa19-0a002700000b', 'tdcf190lf11ibh0chjus9djh6q', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '4c5bf56ae09d8268ae48850c86397ee0c2070bda3befbc98c6c269e6e5056c03', '2026-07-15 12:27:05', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-14 12:27:05', NULL),
('52e5b837-89b6-11f1-ad23-706871ff20d7', 'a6g7fd85kc20hrjpjvl2sok2ke', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '40bc1916c1e4547ef439ffa2897694fa1772d2deb1a8a066d8fc5f77a78196aa', '2026-07-28 12:25:59', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:25:59', NULL),
('533c2be1-7505-11f1-9d3c-0a002700000b', '9mprt10t5m9htce6842fi0gvqi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ddbd83bff773754bed2e7450f0b281ea16f6be59531d5ce0523a52e5b44c1f6b', '2026-07-02 04:28:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-01 04:28:35', NULL),
('535416f1-7f87-11f1-aa19-0a002700000b', 'a6mk7lj5l24pun6neur9davol7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'be916166996031b1675ebbca27858d3d28ede6e238ce490879e958a938e1d4c6', '2026-07-14 16:05:42', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-14 16:05:42', 'logout', 0, 0, 0, '2026-07-14 13:24:22', '2026-07-14 16:05:42'),
('536505de-9aa2-11f1-931b-706871ff20d7', 'k1lbn56v26otri4e8ulpt86gc6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b4df760dbcbe48a618026a7f93c4539ebe16492070157c339292cda92b7e9e5a', '2026-08-18 03:59:03', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-18 03:59:03', 'logout', 0, 0, 0, '2026-08-18 01:15:39', '2026-08-18 03:59:03'),
('541a2b14-89cc-11f1-ad23-706871ff20d7', 'sd03l8abkvnv83lvc39cabm5ac', 'f6114576-89cb-11f1-ad23-706871ff20d7', NULL, NULL, '3c20f56f7aaab8a2f13e3d63a5850c5bc1201fd0a10fd7f21658230589adcdc2', '2026-07-27 15:03:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-07-27 15:03:57', 'logout', 0, 0, 0, '2026-07-27 15:03:30', '2026-07-27 15:03:57'),
('541c340f-84ca-11f1-b39b-0a002700000b', 'a5em8f29rgmc8l8sptd7b0528n', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1907bbbd4a0232470f5bb4c6b06ceb606d413fff31ce95748b7eea37060e0505', '2026-07-22 06:06:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:06:35', NULL),
('5423c0a0-a930-11f1-9f59-0a002700000b', 'codexsupplierc3529efa5cdcc4ea', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'b8d093ccbecb3cbf18499bb422969e517043cb5cff3c6ad024c11c26a766978c', '2026-09-05 23:47:24', '127.0.0.1', 'Codex supplier eligibility test', 0, NULL, NULL, 1, 0, 0, '2026-09-05 13:47:24', NULL),
('542619a7-a930-11f1-9f59-0a002700000b', 'codexsupplierbdc041e64ee2694f', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '9eae5c10dd81b2c31da749aa03a4b04d75bf3875b65f729af2d80ad25108249e', '2026-09-05 23:47:24', '127.0.0.1', 'Codex supplier eligibility test', 0, NULL, NULL, 1, 0, 0, '2026-09-05 13:47:24', NULL),
('54edf1ee-743b-11f1-a369-0a002700000b', '3hpc2mu4l3o4disq671fi81d80', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7484725e875513c27b9093a8da98ea064a0cf01c850919e2061436eccb4be9a9', '2026-07-01 04:22:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 04:22:40', NULL),
('54fb77e4-84ce-11f1-b39b-0a002700000b', 'b4706ktfu45v659pbhir4futma', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd0cff1a78a9441dedcdc5625c5763cf9f047f4d99af3d616de42166fa945093c', '2026-07-22 06:35:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:35:14', NULL),
('5550c499-7a0e-11f1-97ee-0a002700000b', 'djkk7t0t6ab7ostrbvjtn875dj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '635f0828a6ba371eb15e1dbbadf38d36f24c818cbe6f20c8b71b6dca625d2893', '2026-07-08 14:15:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:15:40', NULL),
('55952a87-84c1-11f1-b39b-0a002700000b', '3hg6aoci6tp639i3470m67s5j1', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'c962e87c51b64e0d2e2347afeda306a0660af474514115fec8a22026ccf192ec', '2026-07-22 05:02:12', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:02:12', NULL),
('55d69794-72d3-11f1-9cf4-0a002700000b', 'gfih81ba94as80fn0o5r5ra8a7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6458121e6ab4c022b4105849e21b12f48fac8a62a24c23408b9a1390c98a569d', '2026-06-29 09:25:42', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-28 09:25:42', NULL),
('55f0d89c-762e-11f1-b27c-0a002700000b', 'go8f2a4hpkfe7190l0npjbnm2b', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f1146c846ad25111f4300a774b47c943575e23fa8cc3a5dbaf0ee7dad235adf6', '2026-07-03 15:54:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 15:54:40', NULL),
('570d891e-7868-11f1-9aa3-0a002700000b', '1nuvseqe9v25b4fu0v0a8tinvs', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5c8e93a2428e356e82223c48cd765f6cb907681e7679d55aad00741073c02a64', '2026-07-06 11:54:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-05 11:54:55', NULL),
('572c8ca8-7445-11f1-a369-0a002700000b', 'ugqbsg765hv4pk81uj69bkhlr0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '53127282550eec456bdd4b5deb231f5f966e813fcf0c6a048bc203888445648a', '2026-07-01 05:34:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:34:18', NULL),
('5806f8b5-79cc-11f1-a60b-0a002700000b', 'odd0hd0a8f9s0275do3kg2h23g', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '116d3b75d9176ceec5484fe3393c0fb317b0dcdbf4204ddd4388e32da8ab8f6e', '2026-07-08 06:23:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 06:23:18', NULL),
('58c28567-9618-11f1-8c9f-706871ff20d7', 'codexlivebd68747cee439614a239', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'd6e4fad70ee8ed82e7f75276d721e849a029cb937d08cd07a3670520928a0d05', '2026-08-12 07:37:53', '127.0.0.1', 'Codex live PO workflow verification', 0, NULL, NULL, 1, 0, 0, '2026-08-12 06:37:53', NULL),
('58c52c0f-9618-11f1-8c9f-706871ff20d7', 'codexlivecc2dc575216200ede82b', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '224b8a714601a89916af5b5c203c1e6bf4de315cb94bf809c70b6fec0f0e7187', '2026-08-12 07:37:53', '127.0.0.1', 'Codex live PO workflow verification', 0, NULL, NULL, 1, 0, 0, '2026-08-12 06:37:53', NULL),
('5934080b-76b9-11f1-9891-0a002700000b', 'aimolhpun8a826evhgfphfcall', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '318b8a2f8aecc87e551069105ee525416b42567b8116ed6328b317ec63a76449', '2026-07-03 09:38:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-03 09:38:08', 'logout', 0, 0, 0, '2026-07-03 08:29:46', '2026-07-03 09:38:08'),
('59cd866e-9714-11f1-9fb5-706871ff20d7', 'ti818l77rqhhjml304v9rp9gvl', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b0798ec5eb06a7796581fb5ceb65c220d29661da3f347356309fbaf7d83271b9', '2026-08-13 13:16:12', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-13 13:16:12', 'logout', 0, 0, 0, '2026-08-13 12:41:48', '2026-08-13 13:16:12'),
('5a158d42-8e52-11f1-81db-706871ff20d7', 'jvkmp5egime5cb1s3g0pbgv7cj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6be16fff39f0916c31840dc9c4375665859f172da9fc4e3f101a9769d8112bc2', '2026-08-03 09:12:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-02 09:12:57', NULL),
('5a6ebc2e-8f4d-11f1-b044-706871ff20d7', '3ode0h7a5chhpr1hpbdi3ehqh6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2ea59904cb4313c83f907c9570f2cc8e927da9bc4f2fea20230059fe753bd51a', '2026-08-04 15:09:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:09:39', NULL),
('5acd497a-7ad7-11f1-a017-0a002700000b', 'r0kpo61bekqnal9dd6pqmmihjp', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '7acba37850e7e15c9460a7f5b75a768776d20a2a6234bc2c09a00f38b45bab84', '2026-07-09 14:14:38', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 14:14:38', NULL),
('5adc0926-9f7e-11f1-b4e1-706871ff20d7', 'cb3vh5lkdgs0a5tu00dsmbtkk3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e43b9ce862b3f62b9ae25384b586ab758679cce5eb662d0342af2f9c096ef031', '2026-08-24 09:18:12', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-24 09:18:12', 'logout', 0, 0, 0, '2026-08-24 05:40:46', '2026-08-24 09:18:12'),
('5c48d78a-923b-11f1-a711-706871ff20d7', '727c1bpb15cgf7g1ih7fvba22s', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '75664d5fa85440b7900ad780d57f7752a17ad8c9d048282427bffb4e59b88623', '2026-08-08 08:38:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:38:27', NULL),
('5c5832f7-8a33-11f1-85ca-706871ff20d7', 'sd3dq4j4agh13q674piubh99qb', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, '2702006963d910f6552d1a3d0ee76b6935a1206e25cf63b6485dbea92cc03ad8', '2026-07-29 03:21:02', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 03:21:02', NULL),
('5dc59513-7e79-11f1-97e2-0a002700000b', 'vjfnkr5fp0spmp8u1krdpp242j', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ccc65a4971d446840cc0268b98cfe49d2e1d8c3bac24984f8820c47d757d994c', '2026-07-14 05:11:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-13 05:11:55', NULL),
('5dcd9b94-743b-11f1-a369-0a002700000b', 'clsv7rlnr4ipso02l2guhjd8jp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bf7e09c46b24ab6881bd87f119b39090bea371a31b92cd89ce2babad68a5bc04', '2026-06-30 04:22:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, '2026-06-30 04:22:55', 'logout', 0, 0, 0, '2026-06-30 04:22:55', '2026-06-30 04:22:55'),
('5de70c5e-8f15-11f1-b8d1-706871ff20d7', '9ot54qbo22c3o94nt7264d36un', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ed735876dcdea86adf4f4392f637e2a6dd18324e070ba65311fee5a1e52ec0c8', '2026-08-04 08:28:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 08:28:55', NULL),
('5e2a565f-7443-11f1-a369-0a002700000b', 'qrsnaonihhh3hcfrtv6d6iuuct', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'dc8c60611f6e051918cdc1c0ab31f99b7a6be47b3c63c75b2c75d0ca82275552', '2026-07-01 05:20:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:20:11', NULL),
('5f73b912-8fa5-11f1-91e4-706871ff20d7', 'vtat4h4i20l1he7h7bm6dgso0v', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, '16e1f74a89b1ee015a2a1bcd5420c39d79ccdfc7687de9e271f905f461320b59', '2026-08-04 02:49:20', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-04 02:49:20', 'logout', 0, 0, 0, '2026-08-04 01:39:45', '2026-08-04 02:49:20'),
('5ffc9d8f-762e-11f1-b27c-0a002700000b', 'djjlaft2hnd6op7m4ua294mr05', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'fc0b8a13b40ca18a21f01a1e7a618f5c98d91c45ba26e2b7af246faed637ea52', '2026-07-03 15:54:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 15:54:57', NULL),
('60172370-7eae-11f1-b8a1-0a002700000b', 'dnitfnh3fe0l43ee7dr05a1vjh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3166c70e7affe65605b6a41e45d9d516e037a157b3d4d645b3314ec30891b5ed', '2026-07-13 13:05:54', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-13 13:05:54', 'logout', 0, 0, 0, '2026-07-13 11:31:22', '2026-07-13 13:05:54'),
('6043d1e3-94be-11f1-958b-706871ff20d7', 'u924g182f53lfbod5c1ailpjcu', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'c5eb71d13ba8bc898975e747184cc4ab54b2547c058bf43ca9775c18fd2c9370', '2026-08-10 14:15:36', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-10 14:15:36', 'logout', 0, 0, 0, '2026-08-10 13:21:20', '2026-08-10 14:15:36'),
('60c9393e-8b23-11f1-b840-706871ff20d7', '4375h21gi2sm445v6ld089fq2s', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9aa1a0b785325bd3a1c8503830be180b176147729b6632826d2216503835ed14', '2026-07-30 07:59:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-29 07:59:08', NULL),
('61f329fa-93ec-11f1-977a-706871ff20d7', 'dcugi96bgtllmidq9r7pvl7h4k', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0a9cf969c89ebf0c4879bd3ab07525637d55f811f2e9e6d764e60752157b379f', '2026-08-09 12:18:09', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, '2026-08-09 12:18:09', 'logout', 0, 0, 0, '2026-08-09 12:18:09', '2026-08-09 12:18:09'),
('6343c934-9226-11f1-a711-706871ff20d7', 'g0uv6tq4c4o2nfgu7a4nqttgn8', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6dce1c55f2299a3a338aa2a42ec8325427a68123ef6e730944561c06c5f112f0', '2026-08-08 06:08:19', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:08:19', NULL),
('638c2e07-a3a9-11f1-a9f8-706871ff20d7', 'njdc2mn2q7lfs6k2hnn9dl1mtq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1eaa3cea52e514bca8fa2a472436da9a9c17b7fddbdaa4018f8ed1d2d9950bd2', '2026-08-29 14:10:21', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-29 14:10:21', 'logout', 0, 0, 0, '2026-08-29 12:58:54', '2026-08-29 14:10:21'),
('63fc6a11-a9c2-11f1-a501-0a002700000b', 'm2li3lv4ffkv8upoin3s881agb', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '25681145a541cd604fb869230de37feafc9ea6e20ccce852a0b23552e2c1969b', '2026-09-06 11:06:38', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, '2026-09-06 11:06:38', 'logout', 0, 0, 0, '2026-09-06 07:12:59', '2026-09-06 11:06:38'),
('64a6abe5-7e03-11f1-a5b1-0a002700000b', '53m8v5m0k61imktifcmpamkdn5', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b3d125c5925c900d5b520ebc156fe3a064d8cf6bda2044a7e76c34aff734c2dd', '2026-07-13 15:07:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 15:07:26', NULL),
('650e2d1c-7a1b-11f1-97ee-0a002700000b', 'ndjsd7afpm3hj5855an1vm19jr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bf58e946ba69a5f6a413f03c2347affb1f3e8990a24be3980387842c6cbd7c5c', '2026-07-08 15:49:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 15:49:10', NULL),
('65c893da-7dd5-11f1-a5b1-0a002700000b', 'hc9461nkc5t3d4ooi6iqhh0987', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '02126f0c4726557636b9a9394f36d9c341c2b17205a60aea296d2b4f2e451978', '2026-07-13 09:38:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:38:11', NULL),
('65d18065-9210-11f1-8d55-706871ff20d7', 'n2fk91oqedee9n8gb0uup8ncn0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c361ec0ceb534272ab31b05274f3163ff13a5946be7b0da8dc301cc7b9c7590c', '2026-08-08 03:30:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 03:30:55', NULL),
('6627c3b2-96ed-11f1-910b-706871ff20d7', 't69elel5keku21e889l89eqar7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '44963fdfd546e04fb9ba3d4908dead56e36e325d6a40057202de93092ee8e864', '2026-08-13 10:50:25', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-13 10:50:25', 'logout', 0, 0, 0, '2026-08-13 08:02:59', '2026-08-13 10:50:25');
INSERT INTO `auth_sessions` (`auth_session_id`, `php_session_id`, `user_id`, `account_id`, `tenant_id`, `session_token_hash`, `expires_at`, `ip_address`, `user_agent`, `is_revoked`, `revoked_at`, `revoked_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('67af3b6e-9640-11f1-8c9f-706871ff20d7', 'r93o1gknnq82rdlk9gnuemtffc', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'dd103c74d00e59ce71ca49992f81c04f6d3d10d5cd488c9937fb09c897748d06', '2026-08-12 13:02:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 13:02:16', 'logout', 0, 0, 0, '2026-08-12 11:24:38', '2026-08-12 13:02:16'),
('6878a6fc-8f4c-11f1-b044-706871ff20d7', 'dk73kd82n8ota5nflr9galki7s', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'aab6b5308122e43337c966b6238822c4478f6e23ea993afa624d1bd95c437570', '2026-08-04 15:02:53', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:02:53', NULL),
('68b38cca-a5b3-11f1-a82a-706871ff20d7', '0ako87p9up85c9ar3m19b8pnpo', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '9d2e2ca9b1fbf15030cefb4b676b7044f60e31eef4909a984d504b3fcac5e11b', '2026-09-02 03:15:39', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-01 03:15:39', NULL),
('68b962ff-89c9-11f1-ad23-706871ff20d7', 'gigg5qrhk14huu433obqrpoiaq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c2b736d4bfefc3379598712df0d1b95afdb1100b6f45ceec3f0d387bd5a955d5', '2026-07-28 14:42:36', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:42:36', NULL),
('68ed693a-7783-11f1-ae3b-0a002700000b', '0snaidqlt6nt4j18r45b1uhq74', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '633f08fb2313ec510ba8fc9d217a1d830dd130c13a530ef65409a5656353b15a', '2026-07-05 08:36:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:36:11', NULL),
('693249c3-7503-11f1-9d3c-0a002700000b', 'k06enordp0c7dvdeutb01qoaok', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f78a2f56841eab4ae9dee849ff8b73ff1f9b0f5ce9a84903a1946879b5639f99', '2026-07-02 04:14:53', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-01 04:14:53', NULL),
('695c1c3f-8809-11f1-8a20-706871ff20d7', 'j0572hdnms41i4vut14i7prhem', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '4a5b1f250b38348ecb7497d60646eaab4f70b40c21d00b0c722d72889a961a79', '2026-07-25 10:01:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-25 10:01:52', 'logout', 0, 0, 0, '2026-07-25 09:15:42', '2026-07-25 10:01:52'),
('6b4b2358-89cc-11f1-ad23-706871ff20d7', 'ejj3nhu1g8lufipoc0o8ubqs59', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b2362a44d8816164efa7887cf9405eb8f2f76496c6e72843a3f0e615c51c6ecc', '2026-07-28 15:04:09', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:04:09', NULL),
('6b591a55-8053-11f1-9f4a-0a002700000b', 'c7aduk77mb60qpcq0nlb79kkq7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c720c2516580073730d00b3acd5132cbec5494638d0fee6f09cb05740137dfd5', '2026-07-15 16:02:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-15 16:02:35', 'logout', 0, 0, 0, '2026-07-15 13:45:19', '2026-07-15 16:02:35'),
('6bdf6fc5-743d-11f1-a369-0a002700000b', 'g2ve4emgsjsrpqh16qgk2clej2', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '213e722f7f760d8e66e41d588da4a14aa22e99e44093311f9b924e7c15530b04', '2026-07-01 04:37:37', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 04:37:37', NULL),
('6c6b9344-787b-11f1-9aa3-0a002700000b', 'em6gjrit3qts38h3o4ui5e5ki2', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '1de525f8e2d3fbd26a1b99ad1e0be0ca7b59907e7961b1f4ea5e6aaed47461eb', '2026-07-06 14:11:32', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-05 14:11:32', NULL),
('6d50a2fe-835b-11f1-8a2f-0a002700000b', '0mcp2h7el67mjp6apaud73milk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '97aea6aa11554da096e451e3ac2f7029013ce97a8a939482ac1dfad547c40519', '2026-07-19 12:52:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-19 12:52:33', 'logout', 0, 0, 0, '2026-07-19 10:20:08', '2026-07-19 12:52:33'),
('6d686b82-6b95-11f1-9859-0a002700000b', 'b6djkb8agdmj7gp717pf8sp8qv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e8286a7c24b7eaa359714180ea1722fa12d649432251a40592c19fa5855f2d20', '2026-06-20 04:14:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-19 04:14:55', NULL),
('6d877584-993c-11f1-bd62-706871ff20d7', 'j27845069lpuo0qltdia801fqh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '72b63236b68c40d82150b8611fdbed45ea6f6d1161cf6cc9dfa0977d1cd6a3f7', '2026-08-16 10:29:25', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-16 10:29:25', 'logout', 0, 0, 0, '2026-08-16 06:33:44', '2026-08-16 10:29:25'),
('6e441817-805e-11f1-9f4a-0a002700000b', 'fd1qdj1r5frbe8k8jvs2ffi1ma', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e8a8e4e10a608557b881caf16bb3f8c7985add035cc90763282f42fce92d0073', '2026-07-16 15:04:09', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-15 15:04:09', NULL),
('6e7a5be6-7ea8-11f1-b8a1-0a002700000b', 'e8tc3tgktmj5bgga0fp9qjl1c0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '40f246b58e2a0d5ee26bc32e36fcc512341a4b3520ba1540e0fa39744bbf08e7', '2026-07-14 10:48:49', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-13 10:48:49', NULL),
('6eaf3e2d-8a33-11f1-85ca-706871ff20d7', 'r09c97bahktco58p4rs88ghage', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5d4fbd8457af278bb641d74726958db18929eb86fbfff0987e398e24e90c83ef', '2026-07-29 03:21:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 03:21:33', NULL),
('6ed9b349-8f43-11f1-b044-706871ff20d7', '4doq4mhkd7vhtf4cr7kl1rltv6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '656d4faec20b518dcee942ce252f2c1e0c3a7008caf464c68552196cee5313e2', '2026-08-04 13:58:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-03 13:58:41', NULL),
('6edfa0ce-7628-11f1-b27c-0a002700000b', 'pt81iigmolb7tu1700oh8f7qfv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'eb33ddb1821f9199f920cb35da9af035250720f23d7ee2f66f72ea340b4dc280', '2026-07-03 15:12:25', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 15:12:25', NULL),
('6f15d7a7-8f4d-11f1-b044-706871ff20d7', 'd4gu8sidkmbeom3ppcmmrckuoh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '44585b89293ac5e3cabc0d1349f3290f4408fc99703fc31e0daa443ae8759702', '2026-08-04 15:10:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:10:14', NULL),
('6f527a2e-9aa9-11f1-931b-706871ff20d7', 'codexreceive13e2a9c36ef74ad8', '09632669-6a16-11f1-895a-0a002700000b', NULL, NULL, '02c950cc7ac63a1cb42717fc3ca2975a089df9ab9e576e4bdf4939b0f927c7eb', '2026-08-18 02:16:33', '127.0.0.1', 'Codex receiving test', 0, NULL, NULL, 1, 0, 0, '2026-08-18 02:06:33', NULL),
('6f61884a-89c9-11f1-ad23-706871ff20d7', '0iatdgfs0knscbsa4b8b78bs7v', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1e5961d7975d04de6307c19b09657e21c5c19b12198dcea3338ac4a41f3f4be6', '2026-07-28 14:42:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:42:47', NULL),
('6ff3f9f7-923b-11f1-a711-706871ff20d7', '2n023rpm7buo3rq12b00v3li84', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '5759a3e0b98e772dd77ad3347256c39dbc7095b27831a595b67ad63d56f10e2b', '2026-08-08 08:39:00', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:39:00', NULL),
('70532321-88e2-11f1-8e9d-706871ff20d7', 'gokpf6j3he12n5g20lqo170coi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0cf19a583a663d6c73f877809a406d76832e0b9f692b18f05447d7e5338bad69', '2026-07-27 11:09:15', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-26 11:09:15', NULL),
('706aacef-7ad6-11f1-a017-0a002700000b', 'dnnog08o46ppemhroeue84ka11', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '60faaae74d7030b8965ad90c10e37c06d437069530d55b6018e13e7b8f0020ca', '2026-07-09 14:08:05', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 14:08:05', NULL),
('70acb908-89b7-11f1-ad23-706871ff20d7', '93knmku3lgnivtfh4e1sg159s0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '90c629470584dc12c64d3854bd46b745242f95e70bb04d380ee6a5ffa1f36493', '2026-07-28 12:33:58', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:33:58', NULL),
('71eb7e68-835c-11f1-8a2f-0a002700000b', '80mg8la1fncto9fh14fkk7rd6r', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7560e572837f55e6d4daec42329f757792323edc866edd7da4f30f7a59b3aa52', '2026-07-20 10:27:25', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-19 10:27:25', NULL),
('728c8699-7782-11f1-ae3b-0a002700000b', 'ogqtkshirlip2tjcap8rpg2d3v', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'bf95034d503329776120cdea5b3e10d4dbce6a71ec024384d216805095275b5b', '2026-07-05 08:29:17', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:29:17', NULL),
('73484600-75db-11f1-ba9e-0a002700000b', 'mo97p996jcfrv7g0m577roli11', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd004dcb7a62b0dc79d0386754a4d3312bc041fcc7a29e6b6e740e392dc1a27be', '2026-07-03 06:01:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 06:01:21', NULL),
('74792180-8f17-11f1-b044-706871ff20d7', 'hdjqemljpphv4mbc4h583t27g4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1757070e6e5d3a5d4d2246d38c55b16ad5c8ff8531209e296cb58a2f17e8012f', '2026-08-03 08:51:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-08-03 08:51:29', 'logout', 0, 0, 0, '2026-08-03 08:43:52', '2026-08-03 08:51:29'),
('74b2d051-9f8f-11f1-b4e1-706871ff20d7', 'c9fk9k4i851kam41bg12lceovb', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '707dd8cb878d22550cb0201f4946877da8ac43f4d3c586b35e50b0705752c686', '2026-08-25 07:43:11', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 07:43:11', NULL),
('74d5ec43-a938-11f1-9f59-0a002700000b', 'l9bi361o14kpe8t3fr2d77p53u', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '7de89409877224c8064a4d25585c29ea570bad4a450ac292e110ad98ab1af78c', '2026-09-06 14:45:35', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-05 14:45:35', NULL),
('75055a78-9f96-11f1-b4e1-706871ff20d7', 'h8casu9u00vtm2f29ofmlm8o0e', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '90d58449cc713b7ef4cb9fb49be08e25d2b56bf7c4910fc13dc7d3cc9ede4403', '2026-08-25 08:33:18', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-24 08:33:18', NULL),
('761dc8fa-8a33-11f1-85ca-706871ff20d7', 's8utm9rt3e2d55jb236nec4qr6', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, '77e034d7de0a7b114f82f3792dbf152a331bdb0e635a529ade9cf90fc49a41d1', '2026-07-29 03:21:45', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 03:21:45', NULL),
('7656070b-89d4-11f1-ad23-706871ff20d7', 'ad5ic16ts9trmifih8b7q49q3g', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ab35a63ab714a95d7babbfb3ff2cb8135e21b11d588d1b79391b6720f3331856', '2026-07-28 16:01:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-27 16:01:43', NULL),
('76b0c710-7442-11f1-a369-0a002700000b', 'k03cu9t6v2ufrhnmd56in42m6t', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '107976f408002c0f15c3e63663365028ff241e1f84d1a6a7b887965c42ab48da', '2026-07-01 05:13:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:13:43', NULL),
('76bf8de5-7ea8-11f1-b8a1-0a002700000b', 'oi5ss3bcchsdo5jaajuicmtutl', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ad2c08c6b35ad27e6bd7dd95a14a8d81b35f5a3c01e08f2547961a87324f0df9', '2026-07-14 10:49:03', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-13 10:49:03', NULL),
('76c7c4ed-72c8-11f1-88b7-0a002700000b', 't5hk7v21q1sdpu1sgjus41f7sg', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '94a5273438d7473f8252d4ce3c221211e72783054983e16f95272f792e141649', '2026-06-29 08:07:53', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-28 08:07:53', NULL),
('778304fc-89d3-11f1-ad23-706871ff20d7', '7rrq92i70pepsfb9b27nmaq8n3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '84db7000218248a4f01859d285b067412400405ecc2efd84dd0767d2aa5efc92', '2026-07-27 15:54:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-27 15:54:39', 'logout', 0, 0, 0, '2026-07-27 15:54:36', '2026-07-27 15:54:39'),
('77fc776e-7782-11f1-ae3b-0a002700000b', 'su699mf3lkenuq16npbmcul4ab', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b117bf650f81ee2411e1d09a6951d7c6168f14a09db11c5e0c7786d885e24692', '2026-07-05 08:29:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:29:26', NULL),
('79955b63-7442-11f1-a369-0a002700000b', 'ns2pqc96grnb25oevjnd262el5', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '87745d722e1771da15a7018cff6ffae30e89f8a67cebb2d2f25a265ed22088c2', '2026-07-01 05:13:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:13:48', NULL),
('7a3ae01e-a6b8-11f1-b4bd-706871ff20d7', 'uksnov5ec2qtmr0fkm56t21q3d', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1fb1ca20abf0afe087d437f4ce5f38a2b27189902d5a181e6dfea8f6222f3049', '2026-09-03 10:24:28', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 10:24:28', NULL),
('7aa77ff5-7ae2-11f1-a017-0a002700000b', 'forpe7s5oo88cjf7u6i47jg8pg', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'd90fc78c31c21c1c783fb448da4c0529ee4dfcfa182fb66e252e4c78cfd31be5', '2026-07-09 15:34:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:34:16', NULL),
('7aa90ad7-7aec-11f1-a017-0a002700000b', '5d3893e0heg8felcn2p4learpt', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '41d7c9fcdac51b89ef5d01587ec25b505ea32e7bd61a939e4bf1379a11dd932c', '2026-07-09 16:45:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 16:45:51', NULL),
('7af63029-89b7-11f1-ad23-706871ff20d7', 'o6bteld4nrjsrsobu2qa29c1vq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c70035a35df2c7335b044d8d0ddedac3f22eaed047db3dda39a622ab72d8cc19', '2026-07-28 12:34:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:34:16', NULL),
('7bbe1f5a-711d-11f1-a888-0a002700000b', 'cglp7li7du61ekj57dia1albqn', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a883ffa09c62e03dec9f51ddc4b3034189f92ea8c696d7f5e2f38af09dc0d541', '2026-06-27 05:11:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-26 05:11:26', NULL),
('7c88ba14-762e-11f1-b27c-0a002700000b', 'e8li62bdjh63a9snvi3c2led00', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a6a46c152e31faee22b77d4185f7003c2311d55e2e3a4dee3b2c37385aea8fea', '2026-07-03 15:55:45', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 15:55:45', NULL),
('7daefa6a-9fb8-11f1-b4e1-706871ff20d7', 'aj715ogkimoteb94magnpmegrc', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bd34841ef233810a054c79a337be084052b5391e44aded8f2f76b1e4a9a49f04', '2026-08-25 12:36:55', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 12:36:55', NULL),
('7dbed312-75fa-11f1-b27c-0a002700000b', 'v2gfp4b9lluiq1g9ghaf5i9pd3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0099741df2e0c732b5553e087d2fca870c1f7ef75a5838eac2d996286d6c5197', '2026-07-02 12:52:09', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-02 12:52:09', 'logout', 0, 0, 0, '2026-07-02 09:43:33', '2026-07-02 12:52:09'),
('7df3f5bd-7dc7-11f1-a5b1-0a002700000b', '3qb8imfihg3mc5m7hrdbtjfpea', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'ce1cd3b64f3d69bf928b98fa9c3e914da74a02ddbd4e26ae41de95b1487824ed', '2026-07-13 07:58:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 07:58:39', NULL),
('7eb1b102-761b-11f1-b27c-0a002700000b', '40tlqhqqlbrrv1virh05b81c91', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '905f7416288eefa9f85c71dc5c520cefcd3af5672e7032f783971cfebff605f2', '2026-07-03 13:39:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-02 13:39:48', NULL),
('7efcf817-84c1-11f1-b39b-0a002700000b', 'b5t2rr3g6q858lbh39p6ujvkpa', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e40f421b1123e72ab2de435985367da080a67aaeb37c52ebe47e9c045d3d7e0f', '2026-07-22 05:03:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:03:21', NULL),
('7f023d63-923a-11f1-a711-706871ff20d7', '1b1ci8phn4ob8qlp4qg7dcm35h', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '1b5a97cb022377b9d5ce0ab9be97d79717469a3e5be59c8c1ccada0728972289', '2026-08-08 08:32:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:32:16', NULL),
('7f503986-7aec-11f1-a017-0a002700000b', '2fd2mevgkt5088a7i8cse4g6gv', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'eb45ecae9b87f525e14b41bcd4a1d440d8f54a9dc5743a8f3c657e066da42770', '2026-07-09 16:45:59', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 16:45:59', NULL),
('7f9950e8-8f15-11f1-9259-706871ff20d7', '196ekhg6e1ntlsnlb93do3fks4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6cd2620fb1fe88e2489cf0886d9a1022bd343eeaf7af3acb92de1a75363e1df6', '2026-08-04 08:29:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 08:29:52', NULL),
('7fbda497-88e2-11f1-8e9d-706871ff20d7', 'teaoskqqkgjh53ulk0eh7rb99m', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6f859ca5ccacaf90d0e5b9e28e2b0b3794bcacccf6485113e2c464917ee7f5b4', '2026-07-27 11:09:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-26 11:09:41', NULL),
('7fe21d1e-84c1-11f1-b39b-0a002700000b', 'psrogkaqhrctfacervplbc5cj7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5e90a7b8f98ab8b168ae365ef4f71a26e77906063f53a11c549c12fb46917071', '2026-07-22 05:03:23', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:03:23', NULL),
('7fef3b96-752f-11f1-ba65-0a002700000b', 'o84otaapmou321aak7e8i1i1q2', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b73c62a3d07ab6948bd6685114deee30f871ef10c0b0e609222a42e2a1f67aa7', '2026-07-02 09:30:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-01 09:30:29', NULL),
('815f6a37-93e7-11f1-977a-706871ff20d7', 'pikl663lmaqcij87m9hnp1nd6a', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ddfa81e8131608d8335af8f6b4ff6cc255df0b000cee777504912317a2b7aea8', '2026-08-09 12:41:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-09 12:41:57', 'logout', 0, 0, 0, '2026-08-09 11:43:14', '2026-08-09 12:41:57'),
('816217bd-743b-11f1-a369-0a002700000b', '3r050epv4m6j3hut8j4ol8k02n', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd5b36c97cd5b97103d43e340bb8250b388b94aee96e1fbeac3110db1e00f991c', '2026-07-01 04:23:54', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-06-30 04:23:54', NULL),
('828dd030-93e7-11f1-977a-706871ff20d7', '50d0u2kji2j6f9hg7encc5pv26', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '49112a69f37061ac34e35b44b311da6f22b314174e73f93700d1160d71a408a5', '2026-08-09 12:13:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-09 12:13:16', 'logout', 0, 0, 0, '2026-08-09 11:43:16', '2026-08-09 12:13:16'),
('82926513-8f2b-11f1-b044-706871ff20d7', 'sijnkdtds67iosargj8ff7vu2t', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9a75e94ea2819f62c08339eda6aa6f66d2f9e5ab82ff17790c05efe12bc3a0fa', '2026-08-04 11:07:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-03 11:07:26', NULL),
('8303c289-8f4c-11f1-b044-706871ff20d7', 'lphtbv58208vlm4t5j8g31446j', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a1ea6f9e297654c343668bd960b5c494120e5f53b2a2cc1066d6988f83069b6f', '2026-08-04 15:03:38', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:03:38', NULL),
('84b040d5-7456-11f1-a369-0a002700000b', 'seevnqg6klp5t0fb0b7b09osja', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0f0acb75cd8846a109139e8274b460d49e0de1f78c25becf94d918565c720975', '2026-07-01 07:37:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 07:37:16', NULL),
('8565d7cd-9cad-11f1-9340-706871ff20d7', 'egikjus88nv6rkchps5t329lvq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c27f3dc983ed0a0e1cc4e5e46e5b290e113a6022890fb6b16c9905bbae457b2b', '2026-08-21 15:40:50', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-20 15:40:50', NULL),
('85935de9-93dd-11f1-977a-706871ff20d7', '5qfgcsvkkt2536sd2m7rt5u8qv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'be3dd0d31c11b61a1021ccfef1cd093faa0439e9c672853c0fd0a1d664f2328a', '2026-08-09 11:32:56', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-09 11:32:56', 'logout', 0, 0, 0, '2026-08-09 10:31:46', '2026-08-09 11:32:56'),
('85aca7bf-8b2b-11f1-b840-706871ff20d7', 'bocckkmlqcfv2kqeruuspev6oo', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c8c783b7dbeee0fc1ad5144f02c83bfc875c40057a1a95c940564c8c2e110b1d', '2026-07-30 08:57:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-29 08:57:26', NULL),
('866f7fbc-7ae8-11f1-a017-0a002700000b', 'suvhk16lvti6gtoj04edvv56mr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '12f6c17c82586696a76ea4145d049687387831b9ed2ce06517ac03d2cba60cec', '2026-07-09 16:17:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 16:17:33', NULL),
('869fffb2-7ad5-11f1-a017-0a002700000b', 'ue2e0hhisogdj0scpe5b71vdoo', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'd033017745c77fc7e340f3569721ed0c02f4700e1009f641d9d6fcc07a0ded5a', '2026-07-09 14:01:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 14:01:33', NULL),
('86b2d4b9-a92f-11f1-9f59-0a002700000b', '9o7nb012n01n6tdiq8goiiv6od', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '16940dfe59cd9f13ca9144308985d6e01f039ed4346f0a15953a95fdf4fcd3c2', '2026-09-05 15:33:59', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, '2026-09-05 15:33:59', 'logout', 0, 0, 0, '2026-09-05 13:41:40', '2026-09-05 15:33:59'),
('8721e464-84c1-11f1-b39b-0a002700000b', '1sn1v25cvm6qpo8pa1oj6vhkbv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'afaf2e0d670d049a1282e13e6cf4e7abca08aa36f1967502c92854a1c24da045', '2026-07-22 05:03:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:03:35', NULL),
('872668b8-96ee-11f1-ad98-706871ff20d7', 'odkcdchmgdtam4c53d4mc3j9qi', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '399b17eb2d3a92bbd4ed4d54e447813b5227fb6e2d0bc5525df83ac7c4507fe7', '2026-08-13 11:12:50', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-13 11:12:50', 'logout', 0, 0, 0, '2026-08-13 08:11:03', '2026-08-13 11:12:50'),
('87830398-7444-11f1-a369-0a002700000b', 'r0nrmas7h5b90gk75uekk2f5k1', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'db0ea61692b51d8dcbcc49bfcfd414562a8096ec3cb88db6f255728b8cebef18', '2026-07-01 05:28:30', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:28:30', NULL),
('87b5c0d7-a6bf-11f1-b4bd-706871ff20d7', 'gts98chdffirh5mr8gjhm24evo', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0441908d40993117dfe00df1e4bc5c8a949fb759d9c811c83ebc8e701ef742c2', '2026-09-03 11:14:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 11:14:57', NULL),
('88504b21-8f18-11f1-b044-706871ff20d7', 'qv6jsqvcslo6aiq3f6m9tdl6oe', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '8d6c78652ee2812034eb742c3e5494744802329f714b6527658a45833fc6b4e4', '2026-08-04 08:51:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-03 08:51:35', NULL),
('8863ff9d-93eb-11f1-977a-706871ff20d7', 'd4hh89plpuq3tsjktn9hosdmno', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5978e4e97ea9743067ea27bf38d3fba03f499f5a397e4de1f55bc8b8f08228b6', '2026-08-10 12:12:04', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-09 12:12:04', NULL),
('88cbf38e-8f3a-11f1-b044-706871ff20d7', 'r755f4msde847ciout3d7uuqkn', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5f35eb19c1626e3b9913af602e562134a84b5a1df3a7ebe2615cda8c7d86261c', '2026-08-03 13:26:28', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-08-03 13:26:28', 'logout', 0, 0, 0, '2026-08-03 12:54:59', '2026-08-03 13:26:28'),
('8b195071-963f-11f1-8c9f-706871ff20d7', 'pcpenm5ed05nm6hidscv1lghoi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'fd2c1c50ecf5702ae86a58f820ea1433ed55eb4fcae24284e6e07be11d91a25e', '2026-08-12 13:01:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 13:01:51', 'logout', 0, 0, 0, '2026-08-12 11:18:28', '2026-08-12 13:01:51'),
('8b9c7f73-7dcf-11f1-a5b1-0a002700000b', '1auomljljo3fr4sduvu611be8i', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '65356b202b1412181da465915e94f2e378e8a80fa31546bec48d2a0925257f57', '2026-07-13 08:56:17', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:56:17', NULL),
('8ba9e98d-7ddb-11f1-a5b1-0a002700000b', 'e0mm4u58u9lgrhklapnv101uva', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '996934ffdc49fec6835fe2783f98c4152f5ad172e11ffb266a0c9b800b61ac23', '2026-07-12 10:52:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-07-12 10:52:14', 'logout', 0, 0, 0, '2026-07-12 10:22:11', '2026-07-12 10:52:14'),
('8bac4d2e-7dcf-11f1-a5b1-0a002700000b', '2olg0cdkm8bkqo3b083ogv5e9k', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'cf4f68dcf745b3573ef8995bc4977c0252dcc217b8e15aa22525c4ebe723dc21', '2026-07-13 08:56:18', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:56:18', NULL),
('8be76c57-7dcf-11f1-a5b1-0a002700000b', 'ikjg81bjv0v93cs8e1ksabn86b', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '78e6c7a90e44d39003557c88582dc55b51d9a60fb2bd4b6bb2f29ce8b95491d7', '2026-07-13 08:56:18', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:56:18', NULL),
('8cb71779-9ac9-11f1-b0e5-706871ff20d7', '8na1p8iacf2i5vclvtv1svpspr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c3a441eb0b193cdc12177335849fe2adb0213414accb20f31e008c4a3a5c7b6e', '2026-08-18 07:55:08', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-18 07:55:08', 'logout', 0, 0, 0, '2026-08-18 05:56:26', '2026-08-18 07:55:08'),
('8de8562c-a9c4-11f1-a501-0a002700000b', 'tk4q12a9t8qq4ral16c9uv4h06', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'c256a25161e55fd6f38a8cc40ccf9a2f77d26e6f23ef756665d5e3c3b06c5ad1', '2026-09-07 07:28:28', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-06 07:28:28', NULL),
('8e03e0c2-88e1-11f1-8e9d-706871ff20d7', 'tp0vi8a2og4dkiv7u9rklp6p5m', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '91b8dab7f2d48af7e911856dfaeb55404a27aa2e4581180c015fa3276388a321', '2026-07-27 11:02:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-26 11:02:55', NULL),
('8eb42736-7444-11f1-a369-0a002700000b', 'm4np8q9t5s75d2io8crq270ats', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ab5445a71fb2f6b0a376f572c0419acbb1221e47939dfb47c5836dfd16f42b38', '2026-07-01 05:28:42', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:28:42', NULL),
('8f3726be-89b7-11f1-ad23-706871ff20d7', 'pe0pqd10b9uhjk589qts0v47ls', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '68f2626eea4e4882a23f52a192f2d352050e48f6eb51185ea1d43b2e7591997e', '2026-07-28 12:34:49', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:34:49', NULL),
('8ff2b0c5-a8ee-11f1-8c79-0a002700000b', 'ugq6thm7o71u1e2unc3kd7ekum', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5bc11a0d2a1df33ddc507bea4154c81bb20bee1a1de810d13ef0d2774e95abf3', '2026-09-06 05:56:39', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-05 05:56:39', NULL),
('9132e579-7783-11f1-ae3b-0a002700000b', 'mdmv040pdfgqqkopsinqfqaru7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'cf756f15048090268ef1e3731a8a4cd7e9c0f08f84a69c33977d3c1f179e21eb', '2026-07-05 08:37:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:37:18', NULL),
('92552a2c-a5b3-11f1-a82a-706871ff20d7', 'qq11vl25ols8o0jupgi1rsnr86', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '3f55b230c23b6dc2828f0d87a24578bff31fc7f90b286bbd2e4a04a4fdc941b8', '2026-09-02 03:16:49', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-01 03:16:49', NULL),
('930aebbe-9225-11f1-a711-706871ff20d7', '750pthtm4icktbqo1jhoip5e5q', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '066970dd278064771447c49d5208697c329fac07c157713fe4349106b96c6e68', '2026-08-08 06:02:30', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:02:30', NULL),
('9457405b-7788-11f1-ae3b-0a002700000b', 'tv0hj81d9eucbt712qbtfam0ba', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '052c94c4af2504c754ccbf30998fad354561180e8540955a72a2182f78e91d24', '2026-07-05 09:13:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:13:11', NULL),
('94be1d3c-835c-11f1-8a2f-0a002700000b', 'd613112to8eniip5siofdidg17', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2287b37c5c02b6346fdb37a0bd7d06bdc2e42d2123d0c61e509d1c8f01ed5b9e', '2026-07-20 10:28:24', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-19 10:28:24', NULL),
('95550d5b-9fac-11f1-b4e1-706871ff20d7', 'mriojtbauidfu8vsej5apaqd15', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '15f164bd4b5502890979ef84bfcdf29e941176df2494c5182024a6970d6f7b4b', '2026-08-25 11:11:41', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 11:11:41', NULL),
('956c7d93-8f4c-11f1-b044-706871ff20d7', 'v5r10qqneot373l0me3h9e92r8', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '449b821d3af985cb9cdeb61d41622edfd581b9ad327a37977cd6b99bf57a466d', '2026-08-04 15:04:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:04:08', NULL),
('964a8780-8e53-11f1-9228-706871ff20d7', '9bc5eijsbar64o9ck3n3f44foq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b7eadbd95620f4bcc762c9170b512a07caa8946427f46d912e200ee626f9323c', '2026-08-03 09:21:48', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-02 09:21:48', NULL),
('968a69cf-7ea7-11f1-b8a1-0a002700000b', '4m97m5le3mikfahf681s0fepgl', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'cb9179cf047577a53047870d5024c6ed78eeded4103e51f0ee552606a152a4fd', '2026-07-14 10:42:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-13 10:42:47', NULL),
('9858d87e-81a6-11f1-a1c9-0a002700000b', 'mqekjcmsg1cl8eb2sjgprmv7ac', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bd48c0db0462528697a285b44e57fe766efcd39d39e4057b981b0d38fc64d6a3', '2026-07-18 06:13:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-17 06:13:14', NULL),
('98d24e64-9535-11f1-a1ed-706871ff20d7', '1dac1i35nml9jovulgkske5nsk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e06b79ce36b071c822e1622ae906323302666e9466fc314964f80451bc59afbc', '2026-08-12 03:34:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-11 03:34:41', NULL),
('998b0d11-7a19-11f1-97ee-0a002700000b', 'bj0s62jgvc2ktcmkavo84ur2tr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'eddd262c6b58a1c3d2a06875d623cf4001cc8a7185250e3ea483aceb2c8f9768', '2026-07-08 15:36:19', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 15:36:19', NULL),
('9a261df5-9237-11f1-a711-706871ff20d7', 'ebbfgssnp8u01p22ecnfs62vqr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '4462d44f488a599d4956f04ba4be49abed82203f81ce70cfbfcb2c738873bd09', '2026-08-07 08:27:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-08-07 08:27:57', 'logout', 0, 0, 0, '2026-08-07 08:11:33', '2026-08-07 08:27:57'),
('9bc6a017-8b1a-11f1-b840-706871ff20d7', '1pf27eokpeu3negl0s30ii7b83', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '781c120c9a3f0984496cc8129821b2aa319c5918137cf90cadeede1af32eb210', '2026-07-29 08:16:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-29 08:16:47', 'logout', 0, 0, 0, '2026-07-29 06:56:22', '2026-07-29 08:16:47'),
('9c23bf5a-762e-11f1-b27c-0a002700000b', 'k0e9btnouft9r44f84qf5doqb0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6bf710e31ccbfe116bc5506fa786ea6c10d65d63df25444dbc21d07a98e57a4e', '2026-07-03 15:56:38', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 15:56:38', NULL),
('9c2d1b7e-9634-11f1-8c9f-706871ff20d7', 'v9sa2v47etupgeongcosqqdqi0', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'dab75388328679d3e830b123e8d1c5b237bb636f6efd1f1d8d88a84926212d2a', '2026-08-12 11:18:22', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 11:18:22', 'logout', 0, 0, 0, '2026-08-12 10:00:12', '2026-08-12 11:18:22'),
('9d8c9a32-7788-11f1-ae3b-0a002700000b', 'th76mqistfsk340s4mi0eu5mm7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b549dfeb29f19d948094938a66903388d8f450d13b091640f4d9ea9e03385ae9', '2026-07-05 09:13:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:13:26', NULL),
('9dd906a9-8a33-11f1-85ca-706871ff20d7', 'pdnpdckh80re2k9d3i177e27ha', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'fe42160ad677b8c7a7f72634c6d006ab8e6b819d706033a05f6cc908e05db4ae', '2026-07-28 04:02:07', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-28 04:02:07', 'logout', 0, 0, 0, '2026-07-28 03:22:52', '2026-07-28 04:02:07'),
('9f117a7c-7add-11f1-a017-0a002700000b', '75v38kvouc571qh41r3mut5vcd', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '727f5d521fd41f9d01c33d7502ea0a82f73195545540fa4fb8c2bee9476395b7', '2026-07-09 14:59:30', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 14:59:30', NULL),
('9f60c568-957a-11f1-92a6-706871ff20d7', '6a1dn7dlgjjm3167p5q1pd97uh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '34562047017095cc6a8e27c0925474f1008a9c60170b0c4b30fdc7cd0cfc77f5', '2026-08-11 16:31:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-11 16:31:57', 'logout', 0, 0, 0, '2026-08-11 11:48:51', '2026-08-11 16:31:57'),
('9fc898ab-961c-11f1-8c9f-706871ff20d7', 'pn51cu49ldpm8g9orfd9frupg4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd9dae69bc499d218775973d31bf831e250f34be108286a6927a45846d74dee03', '2026-08-12 07:56:01', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, '2026-08-12 07:56:01', 'logout', 0, 0, 0, '2026-08-12 07:08:30', '2026-08-12 07:56:01');
INSERT INTO `auth_sessions` (`auth_session_id`, `php_session_id`, `user_id`, `account_id`, `tenant_id`, `session_token_hash`, `expires_at`, `ip_address`, `user_agent`, `is_revoked`, `revoked_at`, `revoked_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('9ffc420f-93ec-11f1-977a-706871ff20d7', 'k6a4s8tscspd55l2v42gm1us47', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '09fcc70089f447399298f40c477499959ab9f6629a64272399ffd0e0318e6a04', '2026-08-10 12:19:53', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-09 12:19:53', NULL),
('a07a82b9-9fc2-11f1-b4e1-706871ff20d7', '77c29ppi9cl16g0k6au5hk48ai', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'b2f92da427eda96cdf708dbf4e7fa3f5422ae423bd29b1ebe3e6151d6bd988a9', '2026-08-25 13:49:29', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-24 13:49:29', NULL),
('a0955f90-738d-11f1-a2fe-0a002700000b', 'ho3c1ul8ut9q5co12mt9ltgf7p', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd8bca543a083da741dbed1c7f71ac70699ffaac37a72fd57e412509d03ddd95f', '2026-06-30 07:39:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-29 07:39:14', NULL),
('a0bf1bee-89cc-11f1-ad23-706871ff20d7', 'c7h29ugbv3ke6494cr2coi1d5j', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, '0551aa5a5f54efbe3a243e0df465a44d8dc96f2474129ced50be8b2d95a72bde', '2026-07-27 15:06:03', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, '2026-07-27 15:06:03', 'logout', 0, 0, 0, '2026-07-27 15:05:38', '2026-07-27 15:06:03'),
('a113d72a-6ec9-11f1-84cf-0a002700000b', 'qsqob0h460p7hdt38qqgiar4tc', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '30bd31e673a093274692159351dbc3ddcd568e20112b85ba43ff035cdf95232b', '2026-06-24 06:06:09', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-06-23 06:06:09', NULL),
('a13839da-84c2-11f1-b39b-0a002700000b', 'q8tt6ih7j42f5vv1ue3pf9hnpi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '98276c7e7f77aac851f02c82387343ce86989960487b554731ed83c2a92d7596', '2026-07-21 05:41:31', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-21 05:41:31', 'logout', 0, 0, 0, '2026-07-21 05:11:28', '2026-07-21 05:41:31'),
('a1c26fb8-7e9c-11f1-b8a1-0a002700000b', 's1qhf1hspn7um0jrb6q9n38ug6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '91198f15b8c46fc47724e98f9a47becbe65c2b944e9bf3bb83123cd69842bea8', '2026-07-13 11:29:09', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-13 11:29:09', 'logout', 0, 0, 0, '2026-07-13 09:24:21', '2026-07-13 11:29:09'),
('a1e99aa6-7adf-11f1-a017-0a002700000b', '58a2hdep92da5q3fifq1uink95', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '85834ddc2867713bd64664bb282f70da84ff38835e68e4dc09b764214c11f3de', '2026-07-09 15:13:53', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:13:53', NULL),
('a2550db5-94cd-11f1-958b-706871ff20d7', '304nnv3r68624ipfqqkdhindqg', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7e534a4a8a6e5351422b83d4c4094c9380723486dc63d0c2cbb679cff9ab2167', '2026-08-11 15:10:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-10 15:10:33', NULL),
('a330534b-6ba2-11f1-9859-0a002700000b', 'vsfrmg6cbjdi8pju7pv2ad7ood', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '681243abcb61f8c5fad6dc625e9894ac7c2b0ff9b491ef64b30b1a757499ad6c', '2026-06-20 05:49:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-19 05:49:29', NULL),
('a378700d-6ba2-11f1-9859-0a002700000b', 'togtpvlmoh63ec87fhp38iibq4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '65ac7e0ee88dcf00583f0dcfdbbf9bc8a722de9fc296b10224e1104dc62d729e', '2026-06-20 05:49:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-19 05:49:29', NULL),
('a418b10b-9ecd-11f1-b6d5-706871ff20d7', '1gd7nrto793ao1f5japqljjrhs', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '6e22d17b66cfef2133bd59d32194f418d0ed874e8862e40f8fc426b5af979c62', '2026-08-23 09:05:51', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-23 09:05:51', 'logout', 0, 0, 0, '2026-08-23 08:35:48', '2026-08-23 09:05:51'),
('a433f372-8a3d-11f1-85ca-706871ff20d7', '9snnldk992oiqd1shrq7kiutqt', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '38ab0a25da75c13956cd5e357bc706da66209f9ab2f0d2fabfb0879d1bc712d8', '2026-07-28 04:34:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-28 04:34:55', 'logout', 0, 0, 0, '2026-07-28 04:34:37', '2026-07-28 04:34:55'),
('a55048b4-708f-11f1-9ad7-0a002700000b', '6nd7bne2t9d4r43r7k87feeh6j', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '04087ff0b1f37e1e36738eab355f4842bc8f447dfbb4daee69fd68aec17a44c7', '2026-06-26 12:16:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-25 12:16:08', NULL),
('a556a1fc-88d6-11f1-8e9d-706871ff20d7', 'm1fk4641tk0fn95bom0mr7e5o4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0f2dd5563b1d754512528122ae73992f7c579a3b96d35c261fc6e12ff3f59eaf', '2026-07-27 09:44:50', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-26 09:44:50', NULL),
('a55f898f-743e-11f1-a369-0a002700000b', 'uhk7a5oqr79108sovslmn92a30', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '28fd0ae3ab815b9cb5c39a072f989562df0600e373600e90f7b3e5064884d3a0', '2026-07-01 04:46:23', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 04:46:23', NULL),
('a58f9049-a91f-11f1-9f59-0a002700000b', 'la7mm2vts0qrsts5hapf3qlq4s', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f77785b6e8581d48acc9961f7fadcd430e47da4e75357b7236b8092fb11bc415', '2026-09-05 13:15:57', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, '2026-09-05 13:15:57', 'logout', 0, 0, 0, '2026-09-05 11:48:01', '2026-09-05 13:15:57'),
('a60a6ac3-8fb5-11f1-91e4-706871ff20d7', 'l6437hngusckev2oekg4ij4hbn', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a539d73cc42ac2dfac9f9e0aad1ba59c50f58439869938d8d0232cea78d55e83', '2026-08-05 03:36:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-04 03:36:14', NULL),
('a6826141-7788-11f1-ae3b-0a002700000b', 'f8c2tis1palvo5bo7krss5rhqj', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '06f0d9a7fd462ee73df00aa6eb37f8af09d6fa0a944b9bdcef5e172e913ecc38', '2026-07-05 09:13:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:13:41', NULL),
('a76d9f2b-8f15-11f1-b044-706871ff20d7', 'd41b03ejmr3cv0t8gffl9epthe', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '67b201556fe847d98dcade52dc4dd3efc3010f5aec8643b7a29f2b08501e9a4a', '2026-08-04 08:30:59', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-03 08:30:59', NULL),
('a795916c-769c-11f1-9891-0a002700000b', 'ig0clk3qoiac81c4sc9j7faf8i', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2cad64c8f1d0890930868524f7fd1616e1461a83e16d5b9f01fe507973cfd362', '2026-07-03 06:32:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-03 06:32:08', 'logout', 0, 0, 0, '2026-07-03 05:04:22', '2026-07-03 06:32:08'),
('a8203f17-9625-11f1-8c9f-706871ff20d7', 'gnqimtrt6l81vuupq4703ltkgc', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2cf74d0bd2e50a965d740a02ba59e312acf6c3cd525885d48cb9c83854ba5347', '2026-08-12 09:56:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 09:56:55', 'logout', 0, 0, 0, '2026-08-12 08:13:10', '2026-08-12 09:56:55'),
('a908fd8b-93ec-11f1-977a-706871ff20d7', 'b41gt932u3b7pk6j3d0rm5r34g', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c0fefa28d904214fb05b943a57a75237f62ca52120408988bb33e039847a8759', '2026-08-10 12:20:08', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-09 12:20:08', NULL),
('a9a0dbef-78f9-11f1-ba06-0a002700000b', 'oq6kb7v5rmjsoj97urv085dfde', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5b01714bdba0f6e8f580a07539dda58d9d034ae913954afc4f27671c4495e7db', '2026-07-07 05:15:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-06 05:15:11', NULL),
('aa013ab4-a6b6-11f1-b4bd-706871ff20d7', 'nstma0tt8guriq96undtkoitou', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f380aaab9eead87c72402421e2912aef57b9e6eb9410b2e9eca5e8d97322a0ca', '2026-09-03 10:11:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 10:11:29', NULL),
('aa5a403e-75de-11f1-b27c-0a002700000b', 'fs0ju8tt417fv00ui8ccqs9shj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5087bc47ea0de0388f5446a359cc88ee5075a99c21d366e7936dc2c4e7592506', '2026-07-03 06:24:22', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 06:24:22', NULL),
('aa8274e7-a10c-11f1-b8f7-706871ff20d7', 'm2gd3fmjipma0k5imq22qv8pvl', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '214552700b9201b0365ca6488e3a66aaabfce80a3dda3bac347661693671d0d8', '2026-08-26 10:27:05', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-26 10:27:05', 'logout', 0, 0, 0, '2026-08-26 05:11:59', '2026-08-26 10:27:05'),
('ab81c9a4-8a2e-11f1-85ca-706871ff20d7', '289atlvqh9fj4g7ami927jriiq', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'a4a16a8066c5bed78e13ccea75049f279a81aab80d579f5c3b9198c6935403f7', '2026-07-29 02:47:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 02:47:27', NULL),
('ab8312b8-7f73-11f1-aa19-0a002700000b', '1bro5f6tfo56dqfkaa70p7p6f5', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'd88831345f8b3024c22a68fdceb9f04a43aa253e64b21e38de510306d6a28a53', '2026-07-15 11:03:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:03:40', NULL),
('ab8508e5-8b5c-11f1-b840-706871ff20d7', '4snrmi5rjn7aacqs72g4klq1rh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '666e53f36a3e8a9658a6385f891fe03e9a4e489e7c3f2d1648c242edef6affe7', '2026-07-30 14:49:15', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-29 14:49:15', NULL),
('aba525f8-7455-11f1-a369-0a002700000b', 'nso0g6r7d42d9bncjg073dk6nu', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '77bea0c52da9dd04941b12ca8cfd78a5f39b7b8245c79c6282e893dc6989973d', '2026-07-01 07:31:12', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 07:31:12', NULL),
('abc562b6-8f18-11f1-b044-706871ff20d7', '56p9n9c8mq8t8rji20vrvir62k', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b18ff7dc6ef8861f453b4dea896b26a96348a6380da3c3499c20b2fc09c09969', '2026-08-03 10:41:33', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-08-03 10:41:33', 'logout', 0, 0, 0, '2026-08-03 08:52:34', '2026-08-03 10:41:33'),
('ac072e0b-a141-11f1-96e8-706871ff20d7', 's8rqutv9hs657j4g6pecikp54k', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6d4c2b95bc03c5b1845f0eedc01773d70babee3ec093b5dc49a91a9052dd232e', '2026-08-26 12:15:03', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-26 12:15:03', 'logout', 0, 0, 0, '2026-08-26 11:31:25', '2026-08-26 12:15:03'),
('ae76b8c5-9ecd-11f1-b6d5-706871ff20d7', 'cap70j08343ofi7cnos83nl05g', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'c9c6d22fc6a5fe586a6f4b4df0e6528d568058892e7d234acfa62aaf4ec0e2a4', '2026-08-24 08:36:05', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-23 08:36:05', NULL),
('af22b0ab-9f92-11f1-b4e1-706871ff20d7', 'efeaqic0c95cbm9u5js7f6gr6p', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2ffdfcd3452890daa787694e437d9162f2e788c2cef6187c9a3cc862f1999cc3', '2026-08-25 08:06:17', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 08:06:17', NULL),
('af546ba3-8a3d-11f1-85ca-706871ff20d7', '9ob2kk259jq00euqm3a3dbd7ca', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7410cfe97a23c6b5b04cedae5ba6a19bfcfebf574e99454811c9ae6f0d451e8c', '2026-07-29 04:34:56', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 04:34:56', NULL),
('aff09249-9304-11f1-90e7-706871ff20d7', '2ppfdsukus6ik5vumcvpjoiqbe', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ff7ba3b0d6f4637228d03e3045c6b396dab5f92bcfd925aaf92e00fcbda9053f', '2026-08-09 08:39:36', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-08 08:39:36', NULL),
('b0fc91fd-8057-11f1-9f4a-0a002700000b', 'oacq6s2i5lmgeg0q2ibapnbq6v', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '4a2bed98806e9431e46f03b1388907f01ad52f429dbe1eed174aa261eaf239d4', '2026-07-16 14:15:54', '127.0.0.1', '', 0, NULL, NULL, 1, 0, 0, '2026-07-15 14:15:54', NULL),
('b1641c34-7ae4-11f1-a017-0a002700000b', 'vbaau2e8md2sbs1beaibm0l7dk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2958e991b7e3e30de2fabd261362df1904b86a776800a0f29d46c7f9bf411820', '2026-07-09 15:50:07', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:50:07', NULL),
('b20389d2-8f4c-11f1-b044-706871ff20d7', 'up0uprk1i72oj0235rbstsq865', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '18ceecfa484eea181d3dcc76245fa67c81fea1b57708485914ffbd3db54b9971', '2026-08-04 15:04:56', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-03 15:04:56', NULL),
('b40277f3-8f15-11f1-b044-706871ff20d7', 'bp7sc7bvmouiv37bdqhnmpf5ns', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '519fda9d32fd0069ee483f17c823c478f818c2f8e65d586b8b4de5d03154df9a', '2026-08-04 08:31:20', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-03 08:31:20', NULL),
('b487171e-89cc-11f1-ad23-706871ff20d7', 'ogpjij3eg5c4t7289onu3173dp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f9cbfbcc15f1de562ee2abe118bd303f186a1ee947fdcf94842f1dc09eb028d7', '2026-07-28 15:06:12', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:06:12', NULL),
('b49e9686-923a-11f1-a711-706871ff20d7', 'gt5p8tmvual05fpuuuktmpfpce', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '296e956a8949a5c9048b25c542fe4c0dae1a88c25f52723e01b7e31ac1e49a8d', '2026-08-08 08:33:46', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:33:46', NULL),
('b4f7306d-7dca-11f1-a5b1-0a002700000b', '338312592c9gkpv70n15l0eov1', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'bd7be2e1b7c7fccc7bd77e3f439295b53181e50d7b4d30bc6d2a4a001fcf5c21', '2026-07-13 08:21:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:21:39', NULL),
('b50d681c-7ea0-11f1-b8a1-0a002700000b', 'rg1douedj2dj3qvn3fv9nuk9q3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'bcc76d7602470e3a4e865a60c496116086973fbb922723e1c523d9ee554a123a', '2026-07-14 09:53:32', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-13 09:53:32', NULL),
('b5b00321-7515-11f1-9d3c-0a002700000b', 'u07hhvcjbcbeemvouk303jdibf', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a3a4d9978a973303bdda6f663a4148397efa870de64dd04b10fb4a2d15fe4ec0', '2026-07-02 06:25:52', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-01 06:25:52', NULL),
('b604776c-8a39-11f1-85ca-706871ff20d7', 'h80p1vliaqauovdscfs6avbig2', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'af49d6287684cbd57bb877bb605143da93e1d7043fc31bd115f45e7ef7a9603d', '2026-07-29 04:06:29', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 04:06:29', NULL),
('b6522076-7dcb-11f1-a5b1-0a002700000b', '3eaf0jf5ig42jbi9k9pqveqvkr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ddad2bb9b4faa0533203bf661a45a4a1dd4669fb9a55b64162388360609e123f', '2026-07-13 08:28:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:28:51', NULL),
('b67a676c-7dda-11f1-a5b1-0a002700000b', 'b1tggnfm42ftmocldno55pgqir', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f58c55679cd3a90b5e6c06acc86ee175c50d5c5d1d23d6bf862f2ede21824893', '2026-07-13 10:16:14', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 10:16:14', NULL),
('b6ad40ef-7dda-11f1-a5b1-0a002700000b', 'rfn7g7oamepnu1g0apljn0rlac', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '82fd90a796f2c9ca289502818cadad7bd5a669d113672267004a695c84801ea8', '2026-07-13 10:16:14', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 10:16:14', NULL),
('b7ad97dd-9fbe-11f1-b4e1-706871ff20d7', '4d76m5ml479tc00933878pbasc', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c47e960e5d00665473b877f55c957efedba1b422d9560d5e210161d44c0bdbc4', '2026-08-25 13:21:29', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 13:21:29', NULL),
('b7f99979-7514-11f1-9d3c-0a002700000b', 'jmne0nvg5la1n2tbf15vpv6ddk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '22e8a9a11c9c41e0e2023375dce24e042c83ced90958beda1b27af9c8ac591c3', '2026-07-02 06:18:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-01 06:18:47', NULL),
('b8381dd1-93f6-11f1-977a-706871ff20d7', '3uffa7v5pv6dupqqhfinbse1qa', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '8f1fe1fca76d9561651527aec78ed1608e21f7b7db2139c380e761ce1da1d34b', '2026-08-10 13:32:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-09 13:32:08', NULL),
('b88f5481-79e0-11f1-a60b-0a002700000b', 'eh2vi8ncle0bous9lu8gqkd522', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '126ad27c515b88676b10b0faa15e76ca6771dd092624bc18336248c4279380fb', '2026-07-08 08:49:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 08:49:10', NULL),
('b8924ff3-8b22-11f1-b840-706871ff20d7', 'jdpauja894a98s23o56ine8qah', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a77ac0661e40a3db9352e8c7d288caa629f3cc01e3cb377a599f065f5664a88b', '2026-07-30 07:54:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-29 07:54:26', NULL),
('b9177a51-7f76-11f1-aa19-0a002700000b', 'lm8fhm6cgogvoh6ovcpl21lcj7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '8c24641374ca41cce47c6defdba1d0994168bce05b5b17c39accaf705799aeae', '2026-07-15 11:25:31', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:25:31', NULL),
('b93b655e-a36c-11f1-a9f8-706871ff20d7', 'mqhb43a4093tnvvv17bdh96sdn', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9fcda24db3f2ab7a46cbc1a7a8a5e2278d943e8d2b58b3a2a33ac15ef1b5d570', '2026-08-29 07:19:23', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-29 07:19:23', 'logout', 0, 0, 0, '2026-08-29 05:44:38', '2026-08-29 07:19:23'),
('bb509a31-96d4-11f1-910b-706871ff20d7', 'mt8e3amfqtgrn151ad68akp0bo', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6fb589effe061a358b9695c9a1ff846a8d8b47a346a8f2595ca678a6c9ceec98', '2026-08-13 06:34:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-13 06:34:40', 'logout', 0, 0, 0, '2026-08-13 05:06:24', '2026-08-13 06:34:40'),
('bbcc5fc2-84cd-11f1-b39b-0a002700000b', 'dv9o236qdjvqc0a4jq085s5sne', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2c9980733e58a3618e72cc0573268cc7ecf0188e79c7966fe521b7fa2e6e9a8a', '2026-07-22 06:30:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:30:57', NULL),
('bc582001-7dd4-11f1-a5b1-0a002700000b', '72fp3o3dq9euga6ku1990f4fs6', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'a6a4f49347d07aa885622f9fd5049a738b4d3cbbdddb1dad32af61b57a697de8', '2026-07-13 09:33:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:33:27', NULL),
('bd0df0ca-743b-11f1-a369-0a002700000b', 'jrmgpiru57sb8651engd505f48', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '022dbc9ab5bf9211eb787e8a2e75a3f7614b354f7bec4b5fef3f4d9d4837d6e6', '2026-07-01 04:25:34', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-06-30 04:25:34', NULL),
('be007935-9f9c-11f1-b4e1-706871ff20d7', 'oi233c9s8mo8ammulj2v4hvka7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6e29f8046ae9a2c049152cf0e78216e2824fced459fa9075d0f71c2f7a3d573d', '2026-08-24 10:44:45', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-24 10:44:45', 'logout', 0, 0, 0, '2026-08-24 09:18:17', '2026-08-24 10:44:45'),
('be1130ac-8b27-11f1-b840-706871ff20d7', '0f4gda3b77she2h7ke9vdtn23s', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '40c2d8f244260463ce7f10f40b02fb4d87a6fc838cf03f4fe6dd2c2b9270f480', '2026-07-30 08:30:23', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-29 08:30:23', NULL),
('bf9c9712-7dc6-11f1-a5b1-0a002700000b', '0v4plqmqno43j5bqf0789g88f0', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '95b22734ca0ce148ed7e3f10bd4620196bb2b4d7cfecd39dfdf93612617d3c39', '2026-07-13 07:53:19', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 07:53:19', NULL),
('c06603ad-9796-11f1-9306-706871ff20d7', 'sa787dbe68g6rnag7megu1b8lt', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '3b17b0c4343bb0d8f1bb0dc9340502ab4d273888c55fbdfde787ff814bf13edf', '2026-08-14 05:39:17', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-14 05:39:17', 'logout', 0, 0, 0, '2026-08-14 04:15:15', '2026-08-14 05:39:17'),
('c1af3fb1-7ade-11f1-a017-0a002700000b', 'd02g5fg7vdm7pf8fi32s5464j2', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '8efa0354d984edf252d55ef0a39018a6753b21d4402fe3cfa0a102b4e2412f2a', '2026-07-09 15:07:37', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 15:07:37', NULL),
('c1c1698f-9f95-11f1-b4e1-706871ff20d7', '4jeuoliib3mmbvqvi8t260hal7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7d68bd820a23512f97cafb999496d64937de912fb4bea3469bf26b06d51f8a97', '2026-08-25 08:28:17', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 08:28:17', NULL),
('c2c4143e-9988-11f1-bd62-706871ff20d7', '37srgs669ketusalkkljkv2b9i', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6a997c44297b2cb57eb1e2e316de7b680e54b98443099887952675c5ed18c53b', '2026-08-17 15:40:06', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-16 15:40:06', NULL),
('c3673ea1-7f73-11f1-aa19-0a002700000b', '606t7ohjr7irqn81k27k7nkj21', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '05dedfe3466368271ae33045c31369b502c49b739d7763513cb0aea44d96df5f', '2026-07-15 11:04:20', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:04:20', NULL),
('c416e114-7aea-11f1-a017-0a002700000b', 'r3livf53smaa0r1luls002248g', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0858d53b84789fc19fc89b362ded567f4dc2da85f6939e33189937057cf6427b', '2026-07-09 16:33:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 16:33:35', NULL),
('c447dda9-89cd-11f1-ad23-706871ff20d7', 't5fu7r0notbve8pmcvjboa2vs2', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7ff86fde7dce5366a55fbbb2e2ce811b54cc6af442db104771d5dbf04d834378', '2026-07-28 15:13:47', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:13:47', NULL),
('c489edeb-84cd-11f1-b39b-0a002700000b', 'l77h9nvh2tg6oh98bb1vsqs5jl', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9442ce40a96314168910bde1016099a74a63ac2645bb3c6f4f75a8f6ccb68fae', '2026-07-22 06:31:12', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:31:12', NULL),
('c545cad8-7f76-11f1-aa19-0a002700000b', '5eov7a46d163074mou2buquhgj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0428c821c5910b9d4f15d05ac5ad0e3f78065445273dd657c46f1d3bd6696539', '2026-07-15 11:25:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-14 11:25:51', NULL),
('c57ecc61-775d-11f1-ae3b-0a002700000b', 'f5adfuchjaap9qvpjfum23m1l8', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0faa8af9b2c6d150a4df3c9cea3776bd196e799ba1b7b26412dfb294a182d039', '2026-07-04 06:17:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-04 06:17:27', 'logout', 0, 0, 0, '2026-07-04 04:06:45', '2026-07-04 06:17:27'),
('c69c9343-a6a1-11f1-b4bd-706871ff20d7', 'deqb7341ellmqe0mkhupkilq81', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '52856ff798ffdc09b2c087a72d35a15469dc866aefe4a4f613163bd627e5b401', '2026-09-03 07:41:57', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-02 07:41:57', NULL),
('c75dee30-89d3-11f1-ad23-706871ff20d7', '14hjrv8kemdoieeo4i0m1399g7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'af40d063c7c547fd36537b9105649de71534280dc917279e177fa1834f6984b0', '2026-07-28 15:56:50', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:56:50', NULL),
('c7c1f430-9a3a-11f1-b509-706871ff20d7', 'tv9mel8do813pecjvt26rh9v9d', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0ae183e8a2fa38fd12d004b9d13e5bc0b56f7b44d4c116c20d9709f90467d6fb', '2026-08-18 12:54:27', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-17 12:54:27', NULL),
('c7c611ca-89cb-11f1-ad23-706871ff20d7', 'qeonsq39brfmo2rot6mflc8424', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'fb5f32910b78b8303e1e7bc5a1797e4ddf37758c2e32fbd6703cb5d94a1a5c67', '2026-07-28 14:59:34', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:59:34', NULL),
('c8765e1f-78f9-11f1-ba06-0a002700000b', 'flt5jiqrq8s0iavi95kpmqk8f1', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '51fc1b810fb6c49d36a9abd779ace0b47e181e0c112bee4619855b93cccc73d2', '2026-07-06 05:45:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-06 05:45:41', 'logout', 0, 0, 0, '2026-07-06 05:16:03', '2026-07-06 05:45:41'),
('c8c9d83c-99d9-11f1-8ad4-706871ff20d7', '2daka4jc01v0q71k8vo44csjib', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '59a3c7b8f2c00d9b8de29a7f029e225b64d5608037c92eabd5dac49a37c45a34', '2026-08-18 01:20:08', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-17 01:20:08', NULL),
('c9e80c83-9625-11f1-8c9f-706871ff20d7', 'c21rdo8n4lbdaf11quoumtgmli', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '93a4e65a757005a0a04b670dedae298f93fccdb205b1d9a99edf8b90ae6cc2b3', '2026-08-12 10:00:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-12 10:00:08', 'logout', 0, 0, 0, '2026-08-12 08:14:07', '2026-08-12 10:00:08'),
('c9eeb43a-930e-11f1-90e7-706871ff20d7', 'v8onc0kea8j4bdfv3ktdn688j1', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '74287f481cfe298ade7a3954facdf1f814b402bb6cb1f939c8b5116c97d1d155', '2026-08-09 09:51:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-08 09:51:55', NULL),
('ca8a7cf8-a6b2-11f1-b4bd-706871ff20d7', 'rud4ftm2qmrunl40rg3hv8u97e', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'dde5983c5a419e5b9876c6e9d7df0caf93eac907623d8d47511796029223dff1', '2026-09-03 09:43:45', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 09:43:45', NULL),
('cb8266db-7456-11f1-a369-0a002700000b', '3tnk8up96852lln0g8bi1rku90', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a3e2c338c590c3ef3ad0ff45cf0b66e65f44e764b0d84642120de8e95924ffde', '2026-07-01 07:39:15', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 07:39:15', NULL),
('cc15c540-89b6-11f1-ad23-706871ff20d7', 'jvrnoeipkhemkng4ld17c7jebp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f3c951baf46d83b8edd2933811ded0fe903f3900eddfaabb90cc277cc2abb16c', '2026-07-28 12:29:22', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:29:22', NULL),
('cca8cc63-9704-11f1-9fb5-706871ff20d7', '2l5sd5js9l1dfcsqsvshmnka79', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5326d053acfa84ca74cca8be26c0ee427c52233f944dd8d3b4faf359a5fd7923', '2026-08-13 12:41:45', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-13 12:41:45', 'logout', 0, 0, 0, '2026-08-13 10:50:29', '2026-08-13 12:41:45'),
('cdddea00-7dcf-11f1-a5b1-0a002700000b', 'bt7br5ph8hg60hjlus249mol1a', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'da46e2fb5000c984639a513e0eb30fad218cfaab8e74c52ae520fa1f30136f83', '2026-07-13 08:58:09', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:58:09', NULL),
('ce86adf9-a6a1-11f1-b4bd-706871ff20d7', 'uu4e75ggr2nr05llue3luh9hh3', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e91791d46094ff7f2770ea57e9f5e170a803de283d776b998418a3f88b01b225', '2026-09-03 07:42:11', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-02 07:42:11', NULL),
('cfa974f0-7ea8-11f1-b8a1-0a002700000b', 'behmn4kmcfaglgv64kgrqqcflp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f63778eac68eeb0e59040f0394b425136492d0c6359c32900e224cb4dec67d9f', '2026-07-14 10:51:32', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-13 10:51:32', NULL),
('d05e7b58-7dda-11f1-a5b1-0a002700000b', '6fjthn5q73mucl0stungqlqnbs', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '60934ed6ba0c26d61fb6832d8c926e1690fafbc38fd08bfe64983b8db8c71c0d', '2026-07-13 10:16:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-12 10:16:57', NULL),
('d07c21de-7dd6-11f1-a5b1-0a002700000b', 'cr9snfs27vmkle0rolr27cj46f', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'ff40b549ea19632e7efeb3a550a63a45000353490974c8ee4a96049a414c15fe', '2026-07-13 09:48:19', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 09:48:19', NULL),
('d21b1b3a-8a42-11f1-850f-706871ff20d7', 'oqqhn2ina3fj646jh4b5bdv66r', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c40e327fedfa7f4de76287e9990be12a288ee7113d53e053427e4a39ab9f7cf5', '2026-07-29 05:11:42', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 05:11:42', NULL),
('d2d09423-923a-11f1-a711-706871ff20d7', 'h2471njdhsn9022lcrt0t8tk0c', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '34e32d54b438300b640d8270f35a0877f836d7f0f3219f2adceb4397858fcb15', '2026-08-08 08:34:36', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:34:36', NULL),
('d3dde159-89cb-11f1-ad23-706871ff20d7', 'j4ms9oqnbeeksp97g7tejop3bb', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, '4aacc0fe71aafd93da97d6ea6205108a1a08709923dcd71d19970727c569d142', '2026-07-28 14:59:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:59:55', NULL),
('d3ec49e2-9612-11f1-8c9f-706871ff20d7', 'po0b3kp4omlrtvbq3828lle0q9', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0e8dc1f7a6e67ef303f74638eb8a14c84f74af955a461f7c3455e4e5998ef2f8', '2026-08-13 05:58:23', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-12 05:58:23', NULL),
('d401a914-9f90-11f1-b4e1-706871ff20d7', '2vmvtdih4ssedcnhos1rcik3vv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '71ccef8cefa04e02ca5e7172f726e7cd265acd43e3519c99441b78c5fa423bcf', '2026-08-25 07:53:00', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 07:53:00', NULL),
('d41edcf5-9ad1-11f1-b0e5-706871ff20d7', '44ge2jjrq8o0jur7ut03dnnerb', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'c645a75dc90a11d4f8dccd839b868151719560061f3f246f04d76ad64f09c06a', '2026-08-19 06:55:42', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-18 06:55:42', NULL),
('d4946224-7dcf-11f1-a5b1-0a002700000b', '5fhbaoclf8u9nngf5mab3g1k73', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f7e06be8d17d6f6f46a83d4d28308966407163e68d79be825b3c59ea328d1c86', '2026-07-13 08:58:20', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:58:20', NULL),
('d5fe319c-84cd-11f1-b39b-0a002700000b', 'l7el8n1s0qp993o5n3oma5blqe', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '947783880b14633610301cfade2fc0ecef64dc6a5d995a9ba50bd3a7172cf073', '2026-07-22 06:31:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:31:41', NULL),
('d602fb18-8f2b-11f1-b044-706871ff20d7', 'isc5jnaa99snj3l1vdl6f5f3rg', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'e5adba075114398918caa1aa2c2664f9e1d6170780b371c2e6ac1056a2406219', '2026-08-04 11:09:46', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-03 11:09:46', NULL),
('d6560daf-9b05-11f1-adeb-706871ff20d7', 'fh8kmrg044u79nh0f6mil558kr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1b858427a865b0ceb87cec0bb32ff4fad1f25a3652f427255428ff4b3c1afb1c', '2026-08-19 13:08:00', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-18 13:08:00', NULL),
('d6f0663a-85c1-11f1-b551-0a002700000b', '54e85paearisch528r5fn8or64', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1b5071d2e6e41351e433a65961c8f3655a4b297899c95134b3c52cab9f2e1227', '2026-07-22 12:21:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-22 12:21:27', 'logout', 0, 0, 0, '2026-07-22 11:38:20', '2026-07-22 12:21:27'),
('d7252d05-7dca-11f1-a5b1-0a002700000b', '85oomc0dv5k35ru3ncbgmirieq', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '344b14b792f8c6b452919e47475dd8ff18114d5292302ac8eea7e6ccc097ba37', '2026-07-13 08:22:37', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:22:37', NULL),
('d74acbf8-89b6-11f1-ad23-706871ff20d7', 'nobpasutu349p68d7jbl01ub54', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5ae0bc150d8b6056f122cb4fec0e15623772f944803b209cf58046c52996f67e', '2026-07-28 12:29:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:29:41', NULL),
('d7575510-8a2e-11f1-85ca-706871ff20d7', '9d7g85bp07qjfhaemjvibiv2sq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0fe404709ca7eab102f1fb9b86e92dfbde9260dea4bce3b486de63c46117847d', '2026-07-29 02:48:41', '127.0.0.1', 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-28 02:48:41', NULL),
('d7cfe6d6-a5b6-11f1-a82a-706871ff20d7', '4j5q2jo9ggpa244icbf3ji6teu', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'f88772968a3c10c55640b43a24a8a7d9715573db114a4a964f93a14b10f0c64e', '2026-09-02 03:40:14', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-01 03:40:14', NULL),
('d7ef96c3-75d9-11f1-aab9-0a002700000b', 'b0j3aifa9j0h4e8dofof04ho9i', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a174be759117534833f92ee4f99f0740a9fc69f7b6c93d1eb0c7d3f642d853c4', '2026-07-03 05:49:51', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 05:49:51', NULL),
('d7f5b77c-9225-11f1-a711-706871ff20d7', 'hr05dvtakvf63mu6csomtgifpt', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '068347ed2d9fbbaf2a85a8c6be5c23971b972b161a2666dfe2a2c91e7394e2f6', '2026-08-08 06:04:25', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-07 06:04:25', NULL),
('d817eb19-a6c1-11f1-b4bd-706871ff20d7', 'lh4493gp1s18a80kkt9b3ugmgj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f92c0dc1e70a8ff02ff36d9be1b2ca0ea2102c002fcc13beba6bd95edef78a7a', '2026-09-03 11:31:30', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 11:31:30', NULL),
('d9193c83-89ca-11f1-ad23-706871ff20d7', '6f0ncf7hk973r2a7kbe8jui7vq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f0db17fbb6ab086411ec5ed6c54f5e851e2453790fdc6524f78cb6209b0c8afb', '2026-07-28 14:52:54', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:52:54', NULL);
INSERT INTO `auth_sessions` (`auth_session_id`, `php_session_id`, `user_id`, `account_id`, `tenant_id`, `session_token_hash`, `expires_at`, `ip_address`, `user_agent`, `is_revoked`, `revoked_at`, `revoked_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('d920a569-8b25-11f1-b840-706871ff20d7', 'povlefl4orp1kegvmtjmjevdeo', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c1b01931b1002c5d873d2882d6c8aec3b092ccdb778823ff5b67164336e50040', '2026-07-29 14:09:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-29 14:09:10', 'logout', 0, 0, 0, '2026-07-29 08:16:49', '2026-07-29 14:09:10'),
('d95d58bd-785a-11f1-9aa3-0a002700000b', 'la85ij91684lsreu73pj9b4cmm', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'c693d04d795c4cfe3fa0052906d4c66f4c6263c418e2318473a8304ebcd06293', '2026-07-06 10:18:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-05 10:18:21', NULL),
('d9c70553-84d4-11f1-b39b-0a002700000b', '8jd12gjddojlmlpm3p6j0jglio', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6cc266f7705302b5ebb11e85bce6830b70e1da2dfd37c25f5750acf499d383c0', '2026-07-22 07:21:54', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-21 07:21:54', NULL),
('da317bf0-a6c3-11f1-b4bd-706871ff20d7', 'h2pb0n8qfksarlgncnnbi9uvdb', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b9b3c8d850f7e1f688ff5c7c6e9f158c16dd092c18cdb1b55422a7bc633accac', '2026-09-03 11:45:53', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-09-02 11:45:53', NULL),
('daaac9f5-9f9f-11f1-b4e1-706871ff20d7', 'ner5ifl9fbvq5772c2pofg0d7q', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '56bf5eb3ac4cfef3a7bf6e7651fad0a493f58416e1b4336bb9fc18c9f81257e1', '2026-08-25 09:40:34', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 09:40:34', NULL),
('db727325-7788-11f1-ae3b-0a002700000b', 'rbdnmii6o3c2r29d3o7jk6de62', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '5544a17c350c0569d1fc61888deac35ecd9ce010a716946f2a76b3faad603061', '2026-07-05 09:15:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:15:10', NULL),
('db9b0982-9ad1-11f1-b0e5-706871ff20d7', 'f9aik635d95p6gqj6ujonbit1n', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '9cb0409e6a0a02d39c33e2b54d43e433ee85a4478704cebcb5b93cf855e5ca69', '2026-08-19 06:55:54', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-18 06:55:54', NULL),
('dbca8e78-7788-11f1-ae3b-0a002700000b', 'sgm8fbn70nkc1fkdmfva93t4o2', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f3232430a11e16ffad78185ed0b1a4905b7d6aa332afa3cd17936d5fc5339ab1', '2026-07-05 09:15:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:15:11', NULL),
('dcab3956-93eb-11f1-977a-706871ff20d7', '637fhj8tfrbt0bh586lm5kkn6s', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '03d86c04c2fe03c7c41b7fc5b41254e9ea0a011cf7f3d3d438a0b5a6cb70efe8', '2026-08-09 12:14:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, '2026-08-09 12:14:27', 'logout', 0, 0, 0, '2026-08-09 12:14:25', '2026-08-09 12:14:27'),
('dd4a4dc5-8a2d-11f1-85ca-706871ff20d7', 'm6j8iarsb7a9svpfuve7gb19dg', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, '618e36f7313cb50286d6ee0f9bf4d804fbd0e8af01785bb00ed65cd6af596c29', '2026-07-29 02:41:41', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 02:41:41', NULL),
('dd4e4640-84c0-11f1-b39b-0a002700000b', 'vqnj5ou0ferhj1ph58v10qrjbd', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e4f33435dfc344b779cdd8eebb2b60152714529c4c47911af399da136fd48aa3', '2026-07-22 04:58:50', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 04:58:50', NULL),
('dd97ac1d-786a-11f1-9aa3-0a002700000b', '7mu9g3hd70356g8lq03u92a47c', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '4545a970c738ce328044270401d35e6c2e07792714d971eb1ceebc0a3e99ba41', '2026-07-05 14:11:26', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-05 14:11:26', 'logout', 0, 0, 0, '2026-07-05 12:13:00', '2026-07-05 14:11:26'),
('de2d0ea2-880f-11f1-8a20-706871ff20d7', 'ir0tsks77h19qodtgj7bagtq5k', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'eb6fa35691901a6ff170df7b985f6d4cea45b4f60f634f533666f568a2656e57', '2026-07-25 10:55:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-25 10:55:57', 'logout', 0, 0, 0, '2026-07-25 10:01:55', '2026-07-25 10:55:57'),
('de382b95-a5ad-11f1-a82a-706871ff20d7', '7veou89abvc8hnt3v8sfqmi6mg', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '92c05a345f523d5ca5e27c8faa6474d772e9e72f0b5f259325fe48129b20d1fa', '2026-09-02 02:36:00', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-01 02:36:00', NULL),
('de8ce8c7-978d-11f1-ac0b-706871ff20d7', 'rlvaloibn8ek1ptsf9jlaid3ca', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '01f4630c3471ecc27549c3db7d2f6d72224cbc2189f656813b1806592d798e1a', '2026-08-15 03:11:40', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-14 03:11:40', NULL),
('defb2e17-7dcf-11f1-a5b1-0a002700000b', 'dl95ffg4ii6ask98khj4skm6mg', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'adbcb5451527017f4c9674737d1a17a9eddf228f51c508725ffc9cee4e0559ce', '2026-07-13 08:58:37', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:58:37', NULL),
('deff11a6-a6c1-11f1-b4bd-706871ff20d7', 'gifoss864c9liolnn46cg98nd0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9eb9e9370198c5c055efbad8aa7e12782c9d28c7acb5378c49e4d8e0c493e9e2', '2026-09-03 11:31:42', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-02 11:31:42', NULL),
('df6ec164-7ad9-11f1-a017-0a002700000b', 'lrihvo62ugdkgkr6n5jcp376cb', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ed8d1180693ad8ec45f2c100093fefe3dcad489d5efb51a9eb305d0935f0450b', '2026-07-09 14:32:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-08 14:32:40', NULL),
('e04bf4c5-7dd6-11f1-a5b1-0a002700000b', '3ea7v33qcvi554oakncuubqp65', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'eb8a852eb70b67f9da4913218c14310cd1aa2ab9f23f312163c9246e7de0b878', '2026-07-12 10:25:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-12 10:25:18', 'logout', 0, 0, 0, '2026-07-12 09:48:46', '2026-07-12 10:25:18'),
('e3f3da56-9fab-11f1-b4e1-706871ff20d7', 'md2766kj0vju24kt2vu8pkgon9', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c83c2b6ee9fcb11f0be9b58571a9a75649458ae5302e186662ec9ea337d6db3e', '2026-08-25 11:06:43', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 11:06:43', NULL),
('e40ed5a0-7788-11f1-ae3b-0a002700000b', 'b2o2dl5b92efeopnobkbatm8sm', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b8d0cd87d0a6f3a3b2f20b2cdf27dbad33ac3d1439e427f239095c00d96247cd', '2026-07-05 09:15:25', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:15:25', NULL),
('e56fbe03-84ca-11f1-b39b-0a002700000b', '6h3ej4pk6862s6ml71vk8smbfc', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '21dd2b484b535c97cac0ce5a960b99b262c29d5f4179aefadd577ede95928d15', '2026-07-22 06:10:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-21 06:10:39', NULL),
('e5d3e39a-7781-11f1-ae3b-0a002700000b', 'kmd0bkg9u5dmalo0s06f71as5t', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b1eeefb38fb6831589c8fcde060c91a8a6cf81153099d1a6d79d765e8a750ff9', '2026-07-05 08:25:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:25:21', NULL),
('e66eb804-7781-11f1-ae3b-0a002700000b', '6kh5tgvjg0b3i3q07gk93b5olm', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '9eaf389757251df4c2d0dee974ca7930d71492a5a14fbb40c9fe038147e3383a', '2026-07-05 08:25:22', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:25:22', NULL),
('e68f4668-75d9-11f1-aab9-0a002700000b', 'eacfk0op9o2a4veaokee5iggd5', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3687053331c0efa14ff82bea1f121622a4301c5df50f01f7d5821245a3b9bfcf', '2026-07-03 05:50:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-02 05:50:16', NULL),
('e6a1d23f-7dcf-11f1-a5b1-0a002700000b', 'd9lo7lbouh097spmi4snv5io2n', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5d6c5e1fbb992ea83b97009bcf551d7d47804a9c23ecc3c843cee20a5af9dfbf', '2026-07-13 08:58:50', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:58:50', NULL),
('e6abbd21-89cc-11f1-ad23-706871ff20d7', 's7rcioi56706p1hsa77pcdtl9l', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '933b12574effb6efd4ef3d061b825a1d3852cc24ab022a8a262f49816f5c2f43', '2026-07-28 15:07:36', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-27 15:07:36', NULL),
('e7206246-8f27-11f1-b044-706871ff20d7', 'cpf2j7svv7amdmj0n25tsbaqb8', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b4279d1d2288766dd6a217f6feb0795148b2ae3265e4311d7b47d1624c4ef78b', '2026-08-03 12:53:53', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-08-03 12:53:53', 'logout', 0, 0, 0, '2026-08-03 10:41:36', '2026-08-03 12:53:53'),
('e7436341-84da-11f1-b39b-0a002700000b', '2vfmdk8lfrd79o5l0qh7l9uj1h', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '1f62151ace6cc494d779812802f3e272817d8505aff6da7df7d21d742e185c9b', '2026-07-22 08:05:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 08:05:14', NULL),
('e81e4c54-9535-11f1-a1ed-706871ff20d7', 'lcfgu12clu7b9j5j2iu6vf62ig', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '6638aa79f17b5f4f5beabd7fde547f3b8be4427940bd20039a7550e64b71b936', '2026-08-12 03:36:54', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-11 03:36:54', NULL),
('e8759767-7500-11f1-9d3c-0a002700000b', 'qh5df807006crbkp7faq92ndjf', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '455e120275715c92aec82448dc2a10ba2c530727b22f606987c7cb8094200be9', '2026-07-02 03:56:58', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-01 03:56:58', NULL),
('e926e419-9f9e-11f1-b4e1-706871ff20d7', 'hnt2ejusmjvt39po66sbrkq41v', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f21f0aee002f0ff16c1f75ed6fbf48fba0a5bee0a03aba315ad796d247fbaaad', '2026-08-25 09:33:49', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 09:33:49', NULL),
('e9e192a6-a6d0-11f1-b4bd-706871ff20d7', '4cmhdoj05dqe671t2ajtm57j10', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '9e371318ffdc5a71a81e5f2d7f66ee16f27f28405c2d790f6a3581723de8ee3d', '2026-09-03 13:19:23', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-02 13:19:23', NULL),
('e9eb82c1-76b7-11f1-9891-0a002700000b', 'k954smaf3eeld4plfernbsc4a6', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c35920370c23fa63cd2c4093066e5588a1e807ab2e81bf224b36bbcddb03b6b9', '2026-07-04 08:19:30', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-03 08:19:30', NULL),
('eaf5f2bf-7621-11f1-b27c-0a002700000b', 's633vhnl80l9qe3qbr2qv789rt', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '051215b308b77465ae985c006263a99e4ac70041aa34205ba325d31c737c7acc', '2026-07-02 14:56:14', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, '2026-07-02 14:56:14', 'logout', 0, 0, 0, '2026-07-02 14:25:47', '2026-07-02 14:56:14'),
('eb3e66e4-8b3c-11f1-b840-706871ff20d7', '4vvoffeoa730uk10iig59sd3mj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7acdd9238b27c8dcd4d4d6f0a59d8cba147ffc5bab732d02004880b563656432', '2026-07-30 11:01:58', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-29 11:01:58', NULL),
('eb4dc805-7445-11f1-a369-0a002700000b', '5fu3ab9vo4q1ri2n1dvpqrf822', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5ea70dc284e6887b99be70db1b313526a3ab001572cd09f82ede84dd4e90491b', '2026-07-01 05:38:27', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:38:27', NULL),
('ebda0053-79c4-11f1-a60b-0a002700000b', 'el37qb9717a8bntl9c6qj2vk0j', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'aaa5d29ef82d20cd6dfb8384737f7dfd909fb1bae51d75e9322a301aad5ed18c', '2026-07-08 05:30:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 05:30:10', NULL),
('ec1f4314-9f8a-11f1-b4e1-706871ff20d7', 'bq73hrghlstk1jv2pe4l8qbpli', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '063ac3589dc074d6e53cd800a1c14680ee7701bc7481bf1342c809a0fa80d0b1', '2026-08-25 07:10:44', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 07:10:44', NULL),
('ec9f108f-a3b3-11f1-a9f8-706871ff20d7', 'u1ibvbhbobr5sqnvaetm3rcps2', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e25e49a20804804394d9355cabda84ecab0e94ceb7f2a7e0f611cc020cc97b2b', '2026-08-30 14:14:18', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-29 14:14:18', NULL),
('ed0de3ac-75de-11f1-b27c-0a002700000b', 'oo5p8irbqg4vodbmh8cjeimoph', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1b6f0ac72f8190f0dd1d00341337b59144a044cc1b9264a710a9dac8c9a2a4b3', '2026-07-02 09:08:28', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, '2026-07-02 09:08:28', 'logout', 0, 0, 0, '2026-07-02 06:26:14', '2026-07-02 09:08:28'),
('ed17a55e-923a-11f1-a711-706871ff20d7', 'p9945r0sig5t2qt20ef7bgv4io', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'c9ca6fb8049f95f65cdc0089f2d9faf20e3b5e47604320c3282200cd7d2e4426', '2026-08-08 08:35:20', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:35:20', NULL),
('ed6f27c0-9239-11f1-a711-706871ff20d7', 'stiqeqcm2d2unus2v7je7tm73u', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '8731c741c8ea394b918bdab527feb386a55d8ae71aed2b893b2b6c309b0bad82', '2026-08-08 08:28:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-07 08:28:11', NULL),
('ede5fb9a-9337-11f1-90e7-706871ff20d7', '7129cv433uvbrs9bbnr6ap13tp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ff6cf7d46a137a5be94846b87008e0b2d7c683a31770abac61dc2c5b2939cca6', '2026-08-08 15:19:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-08 15:19:16', 'logout', 0, 0, 0, '2026-08-08 14:46:23', '2026-08-08 15:19:16'),
('ee444bc2-9fa8-11f1-b4e1-706871ff20d7', 'c4siqbfciohkvsfvtrteshgjuk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0a1690eaf5ce9136a2111680a49f2ce834dea09a990560461418c75e619b2924', '2026-08-24 13:02:59', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-24 13:02:59', 'logout', 0, 0, 0, '2026-08-24 10:45:32', '2026-08-24 13:02:59'),
('ee9477f5-9306-11f1-90e7-706871ff20d7', '21mh6ip1o6slnf7jp14890tnhr', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'feaeaa1cdd8496b5fb8daf8844cfe8291200dc3e15c9071222f965d0bf0cd119', '2026-08-09 08:55:40', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-08 08:55:40', NULL),
('ef4c4182-99e9-11f1-b09a-706871ff20d7', 'v7o57l2m5vc3ffnsqbedgficoi', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'ff79e06e7b86eba165017d33ae2276322418d9c377fa4563a5b36fe43991ed49', '2026-08-18 03:15:44', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-17 03:15:44', NULL),
('f055ab39-9f93-11f1-b4e1-706871ff20d7', '85sa3tqmkt6mjuo6ea74r7s3ev', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7bbf310a2e91234e94e5dd4c6d8b0614056fa4997fa6075a7d4c34a85ee1cf41', '2026-08-25 08:15:16', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 08:15:16', NULL),
('f0ab4db8-7dcf-11f1-a5b1-0a002700000b', 'ujeiebbuniq9tt1mbjajdgeujq', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '13a7912a2211721e19916512b80c95d9057012400c4167acdefa58a6202eb522', '2026-07-13 08:59:07', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:59:07', NULL),
('f0da3882-8370-11f1-8a2f-0a002700000b', 'esl8t0k9p39p0p7s3ja78c3d4n', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e412eea6721926008bafc549cf918b45647936785f8b21aa4b08db6f53703a81', '2026-07-20 12:54:08', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-19 12:54:08', NULL),
('f16913a5-7a0e-11f1-97ee-0a002700000b', 'durmtgf2sfj7n46o0qiigjhkgv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '49625d3d56ae787de5497177f4a96e8338adcc4e73ad3dd00d64f4aad1f0d718', '2026-07-08 14:20:02', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:20:02', NULL),
('f17c592a-7a10-11f1-97ee-0a002700000b', '5kb5oqhhmj08dn6b93nnf9lcmf', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f5c8c1380152065b901c9ee3db8c7448a963710d0048247e8d8edbb793d59384', '2026-07-08 14:34:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 14:34:21', NULL),
('f1e0934d-9ecb-11f1-b6d5-706871ff20d7', 'b4ev4i2nc2rhjcsvcdjpc2k3j1', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a43aec2cf22fc4aa0efb417041bee9cb6ea95a8b94aa00355267c9245cef76d1', '2026-08-24 08:23:40', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-23 08:23:40', NULL),
('f1e52f51-9f83-11f1-b4e1-706871ff20d7', 'ei3joa79nad99eqfhedf99cinn', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'b740866c9def2ec28ff73a7690e2dcd007be1619b84661346a10ce48e1e29c85', '2026-08-24 07:11:06', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-24 07:11:06', 'logout', 0, 0, 0, '2026-08-24 06:20:47', '2026-08-24 07:11:06'),
('f2334598-8343-11f1-8a2f-0a002700000b', '3e9i52egta32lohp15bbhkckek', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '467b6cedd24ea5f1fc3f1f7444518d7ac17b33e885b6e78a1df9a29b7ec33531', '2026-07-20 07:32:07', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-19 07:32:07', NULL),
('f24bec53-a1d5-11f1-b8b1-706871ff20d7', '4shc92ejbsqfjuanr820qgu2hj', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'f987d9ceef63e0024afdcb9109da0506ab35efecdb17a358da4ef23042dd79eb', '2026-08-28 05:12:49', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-27 05:12:49', NULL),
('f25b1b8b-75d9-11f1-aab9-0a002700000b', 'l7tburnrjdklhnes1prqf49g6e', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b7e3392b32ca3a346043dbcdfab00a14fbed1c3afd1ec67f833afa8da5a4921c', '2026-07-03 05:50:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-02 05:50:35', NULL),
('f27d743b-79c4-11f1-a60b-0a002700000b', 'sn8q7fqj2jssvc5d9lkikfdf4l', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'd1fb665ba211ee2a1640ce0648b1c8d65b476a4c52c2c291457e58eb079fcf97', '2026-07-08 05:30:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 05:30:21', NULL),
('f2e209ac-7781-11f1-ae3b-0a002700000b', 'sotm2e1sl3om6j3ve1kt2dhq6m', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '4058619d88218554399eb50f3475f1eb40c367fe9f507d6d903bf960f2a47e67', '2026-07-05 08:25:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:25:43', NULL),
('f2fd768f-7a20-11f1-97ee-0a002700000b', 'eem923rd58q2561jno43lge6n0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3799a4b2ab82cdf3d40663d6b667d55c58ca3f2f3cbb7b2ec5eda4b454d34e88', '2026-07-08 16:28:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-07 16:28:55', NULL),
('f3612229-8a2d-11f1-85ca-706871ff20d7', 'aovvtgp5pqug1q9a8b2n7r76k9', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '427576cc7de7416afea3ab10c5982a5eaac3876851c56efb5559d30dadeb03d0', '2026-07-29 02:42:18', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-28 02:42:18', NULL),
('f36fb924-7781-11f1-ae3b-0a002700000b', 'js58dgq45apb4dujko5qhs7mgd', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '891dc48438292a7012b063f5ce3d9c8868f3c65d1679046b6752c400104c9b0e', '2026-07-05 08:25:44', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-04 08:25:44', NULL),
('f420b7d0-8b5c-11f1-b840-706871ff20d7', 'm9gvb5ivcjjqfkn999snj1k5ph', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c468ca54846a64992ed57a1deaf42abf67f6d9bd946c0a7c324ae329a288c42e', '2026-07-30 14:51:17', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-29 14:51:17', NULL),
('f451158d-92fa-11f1-90e7-706871ff20d7', '63ufhl61cj76e6tchg5esihgal', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '2b75d0db83f9c7e3a7ab4bd1dc876707ecec17699c6c55fd4677257bd6bae45c', '2026-08-08 10:43:50', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-08 10:43:50', 'logout', 0, 0, 0, '2026-08-08 07:29:56', '2026-08-08 10:43:50'),
('f472801c-6f86-11f1-8f3c-0a002700000b', 'd1l4bhl6667b6fj2s6lpk3o7l5', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '13160f8e49a0897575c1d19104f24bc61965781cc4a628ef9478908ed5b033a0', '2026-06-25 04:41:24', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-24 04:41:24', NULL),
('f4bf00a7-9f8a-11f1-b4e1-706871ff20d7', '2tjprb6nm1eo1fuehsm9b1gb1v', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '508d5ae77bdf26d2900ea95b67808d426656a5e82c7480fc99031cc0701de368', '2026-08-25 07:10:58', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-08-24 07:10:58', NULL),
('f5184397-7788-11f1-ae3b-0a002700000b', '6fnak5cev2f0m1iv6j68nr4gda', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'fd209af6f4a878a9cde9fb6106078c44624f91dd0d6f0383485517350e904227', '2026-07-05 09:15:53', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:15:53', NULL),
('f55c7fe3-7ac2-11f1-a017-0a002700000b', 'ngtns7m9eidsvdd3uecpmapbom', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'e337bbd1a89b2e22ce15129bd27e265fe134062e5a9b86e4e14335003208ed99', '2026-07-08 13:58:10', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-08 13:58:10', 'logout', 0, 0, 0, '2026-07-08 11:48:38', '2026-07-08 13:58:10'),
('f5baefa3-a9c2-11f1-a501-0a002700000b', '5f2lqbe3jc3g3j5874i1jqkmp4', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, 'c20653549d0187eb199a830f4a96b2a9aa3490208f707b44e1a16a183e8abfaa', '2026-09-07 07:17:03', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-06 07:17:03', NULL),
('f69d9d1c-8b5c-11f1-b840-706871ff20d7', 'p4ql2rbnt5h2vte4mt0q34m78d', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'e20cf8ca07675b91fa5836075dc097e3ac7c005a6a999fc9557e1d92a7a47ffb', '2026-07-30 14:51:21', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-29 14:51:21', NULL),
('f6c20b50-89b6-11f1-ad23-706871ff20d7', 'uip38jo66k6no9bhvj5973gdkh', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0a003f83e48e832f0bad8b27b3dce400bafb8c5623a12e6157d1e53dbe60c900', '2026-07-28 12:30:34', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 12:30:34', NULL),
('f6cbfb2d-7a0e-11f1-97ee-0a002700000b', 'lvn1879pjhnb4eo8kuodde8bmo', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '76a285896524e0e3d9386ac47cd756b05d4ffde1d830ffa1baf69c9cf72f3de3', '2026-07-07 14:22:16', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-07 14:22:16', 'logout', 0, 0, 0, '2026-07-07 14:20:11', '2026-07-07 14:22:16'),
('f7484799-84c1-11f1-b39b-0a002700000b', '3ag9tba2khjkl2adv0rsdp57c5', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, 'f95d3e9b076eb2a65a7a12027347d722740e3bd29d4240ec988c05d493009c26', '2026-07-22 05:06:43', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:06:43', NULL),
('f79e0f53-8b22-11f1-b840-706871ff20d7', 'ek71b0i6nacnqh3938b4jppktp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'c8d4ced00ec0d6f86e81bde4a30569b29934120e186ec3fc679ddb8ff2f90dd4', '2026-07-30 07:56:12', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-29 07:56:12', NULL),
('f7ca485a-743b-11f1-a369-0a002700000b', '8m511tem8qcvppqis9imefflhp', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '276b6464e408ab1a878a81ae4259aba7d19838a6cc9240db969467b5447ebd32', '2026-07-01 04:27:13', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-06-30 04:27:13', NULL),
('f84a4423-7788-11f1-ae3b-0a002700000b', '39rgq6pbd7ed1glc29kg3gl8do', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '7c673a3a1b3413b13d0940908da1b3f2cce6d7f4e7b3f55bee46768120e95548', '2026-07-05 09:15:59', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-04 09:15:59', NULL),
('f8bba4eb-a393-11f1-a9f8-706871ff20d7', 'tpljgfe2u0pba05ma8l69ulafl', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7c8fe6667026575fbe936dc7eeb0762ac1c973caad7b9e377a4b2bd11dacd688', '2026-08-29 12:58:51', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-29 12:58:51', 'logout', 0, 0, 0, '2026-08-29 10:25:35', '2026-08-29 12:58:51'),
('f8d602a6-9227-11f1-a711-706871ff20d7', 'vqmvpnm31l7c3cnhiemflpu1ln', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '3e9bd643ce9df6568acc2a8c607b5c7b53c30ef4161d1d2b764f905fc29e3cbc', '2026-08-07 09:10:02', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-07 09:10:02', 'logout', 0, 0, 0, '2026-08-07 06:19:40', '2026-08-07 09:10:02'),
('fa2c8e04-a056-11f1-b4b0-706871ff20d7', 'sakagcoaj7j4jaamru47012o6n', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '36616e900e22ace084ad5dba5418742a6f0623598206d1d345ad29d980adf6cf', '2026-08-25 08:37:16', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-25 08:37:16', 'logout', 0, 0, 0, '2026-08-25 07:31:25', '2026-08-25 08:37:16'),
('faa7493f-89c5-11f1-ad23-706871ff20d7', '6v5mred35hmcsjffmfboqaf2sl', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '1f4f927065ae7742296fc031b29fe6c2128b53c3edf4e1788dd235904dcd5451', '2026-07-28 14:18:03', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:18:03', NULL),
('fae4fa8f-8b5c-11f1-b840-706871ff20d7', 'e0djeje4fqb53cigiq88fvmch9', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '34567b0ff0e35639b390aee84cf1e0e8c2685b5a817940dd6fee971a5b8b952a', '2026-07-30 14:51:28', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-29 14:51:28', NULL),
('fae6b0c3-a379-11f1-a9f8-706871ff20d7', '4jt46te2s1c25pm5n3snpg3als', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '98f22ab300f4731c5c48a43431d572ff91e36db4547b4b09daa625932c7a0ec7', '2026-08-29 10:05:29', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-29 10:05:29', 'logout', 0, 0, 0, '2026-08-29 07:19:32', '2026-08-29 10:05:29'),
('faee42be-7dca-11f1-a5b1-0a002700000b', '6mh1kpg2bnb69berr6a18otk1r', '9db5292a-7788-11f1-ae3b-0a002700000b', NULL, NULL, '0b1d564889fd1aef3335f09747c9be086a5aacfbd3624266de4dd9cb3e503d96', '2026-07-13 08:23:37', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:23:37', NULL),
('fbddd5c4-9f8a-11f1-b4e1-706871ff20d7', 'tm5hqjjv0dmnmutmjj47sfjd9b', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, 'a28f132f25dbebadf0d43029398d9fd95cbf9ef877de718bebd9f5ec468c8958', '2026-08-24 08:33:15', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-24 08:33:15', 'logout', 0, 0, 0, '2026-08-24 07:11:10', '2026-08-24 08:33:15'),
('fc0120d1-a935-11f1-9f59-0a002700000b', 'voq9fqlg85r2tm8fss3p5qv5o0', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '41fd25988d8e715b8998ec508afcbd3d80cea3a835b1b30eed2afba38a51c16d', '2026-09-06 14:27:53', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-09-05 14:27:53', NULL),
('fc24c6b0-94c7-11f1-958b-706871ff20d7', 'vqgpdon4aqh3jl01iev4lci8cv', 'a1f91cde-9238-11f1-a711-706871ff20d7', NULL, NULL, '42cec69dd0ad2e4f138d162c127bb791773ee86db83ba820834b380162103a93', '2026-08-11 14:30:07', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-10 14:30:07', NULL),
('fc8dc83c-6ec7-11f1-84cf-0a002700000b', '195u1jbuvp8hbj3o0pnf4dr7c4', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '60ad0ec93ec659f061595d01914d7fa4d3b0d18c3d706e1232b627b4eecaee84', '2026-06-24 05:54:23', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-23 05:54:23', NULL),
('fcd0ff15-859b-11f1-b551-0a002700000b', 'nkj79m2709atm1n9ka7jftgbpk', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '34160ce8f6a42550200c061819fc9cfa20d61d5af88ecde643606d6a078e2788', '2026-07-22 07:52:11', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, '2026-07-22 07:52:11', 'logout', 0, 0, 0, '2026-07-22 07:07:23', '2026-07-22 07:52:11'),
('fcf5f8fb-7ddb-11f1-a5b1-0a002700000b', '01l9qnjlm5aoni2h9m0jtnct8l', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '5e91821fd7bc43472043f968348629918e997d5dff1f6e6f91cae9be3427dc83', '2026-07-13 10:25:22', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-12 10:25:22', NULL),
('fd2e6013-89c8-11f1-ad23-706871ff20d7', 'ngnsbuthclg3d1ra477366ped8', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'a3c3c8a2ddc78723d35bda9cf06a689bc1b2cbf43ca24ea28dfba3da12ad16e6', '2026-07-28 14:39:35', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:39:35', NULL),
('fd327084-6adf-11f1-b9ca-0a002700000b', 'qdbgsbcjvc0e3cthfrrcsq80ei', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '0ac3e1a55dd9ee725b3257ab219a8257909eded782f1493626d4d2b3688a6827', '2026-06-18 06:36:39', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, '2026-06-18 06:36:39', 'verification_cleanup', 0, 0, 0, '2026-06-18 06:36:08', '2026-06-18 06:36:39'),
('fd53f412-713a-11f1-a888-0a002700000b', 'mul9uo0f5pirn9c3p9eskcmq0o', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '6080c04057f4f2c4ae27b859217566e807ce22d0ae5f4768ee78a751786972ad', '2026-06-27 08:42:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-06-26 08:42:39', NULL),
('fd9e54c3-951e-11f1-a263-706871ff20d7', '8g8ahu70u378dm1680ktje9tv7', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'b2c1b71f02caf90987b62c723a3395d87a9568c3f741a9687415109b8b24321c', '2026-08-11 03:34:31', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, '2026-08-11 03:34:31', 'logout', 0, 0, 0, '2026-08-11 00:52:56', '2026-08-11 03:34:31'),
('fda8d80c-7443-11f1-a369-0a002700000b', '39fgm4hng1gecf4duatgkgjpu5', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7e1b9f9f96e50ba84a1a20f4983dcf2d8b876920e11aa77f57fbe40d3476d7d3', '2026-07-01 05:24:39', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-06-30 05:24:39', NULL),
('fe00487e-7dcf-11f1-a5b1-0a002700000b', 'uu9po880hnckskl9s4csnmp0qb', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', '7144b37a69f8ed5707cad44236e807dadc4992c7d396920f65dbb69416670832', '2026-07-13 08:59:29', '127.0.0.1', 'node', 0, NULL, NULL, 1, 0, 0, '2026-07-12 08:59:29', NULL),
('fe66db7d-84c1-11f1-b39b-0a002700000b', 'inueed1bb9ciccvhnetlgkd57d', 'e61815fe-7781-11f1-ae3b-0a002700000b', NULL, NULL, '0a3971f8069d0a6eb1b51b0f4fee400d5830fd00c61d40922008a526ac9dfc69', '2026-07-22 05:06:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-07-21 05:06:55', NULL),
('fed55f84-89ca-11f1-ad23-706871ff20d7', '4dqc1bbgvn65hj988ksmi5v33u', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', NULL, NULL, 'e26395f2ebeb3f42d7b085e38f1ccd19a7378a9455079766d6872b94c88ecf96', '2026-07-28 14:53:57', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, NULL, NULL, 1, 0, 0, '2026-07-27 14:53:57', NULL),
('fefa77a5-964d-11f1-8c9f-706871ff20d7', 'uvplknf6lk8guraimsq8gvn8lv', '09632669-6a16-11f1-895a-0a002700000b', 'c97e079a-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'cca801b3bea2629d67158a2316347eb32134f0e01a6a6460ff61228ccf608bdf', '2026-08-13 13:01:55', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, NULL, NULL, 1, 0, 0, '2026-08-12 13:01:55', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `business_hours`
--

CREATE TABLE `business_hours` (
  `business_hour_id` int(11) NOT NULL,
  `day_of_week` enum('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') NOT NULL,
  `is_open` tinyint(1) NOT NULL DEFAULT 1,
  `opening_time` time DEFAULT NULL,
  `closing_time` time DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `business_hours`
--

INSERT INTO `business_hours` (`business_hour_id`, `day_of_week`, `is_open`, `opening_time`, `closing_time`, `created_at`, `updated_at`) VALUES
(1, 'Sunday', 1, '08:00:00', '21:00:00', '2026-07-02 07:05:40', '2026-07-02 08:01:34'),
(2, 'Monday', 1, '08:00:00', '21:00:00', '2026-07-02 07:05:40', '2026-07-02 08:01:34'),
(3, 'Tuesday', 1, '08:00:00', '21:00:00', '2026-07-02 07:05:40', '2026-07-02 08:01:34'),
(4, 'Wednesday', 1, '08:00:00', '21:00:00', '2026-07-02 07:05:40', '2026-07-02 08:01:34'),
(5, 'Thursday', 1, '08:00:00', '21:00:00', '2026-07-02 07:05:40', '2026-07-02 08:01:34'),
(6, 'Friday', 1, '08:00:00', '21:00:00', '2026-07-02 07:05:40', '2026-07-02 08:01:34'),
(7, 'Saturday', 1, '08:00:00', '21:00:00', '2026-07-02 07:05:40', '2026-07-02 08:01:34');

-- --------------------------------------------------------

--
-- Table structure for table `business_hour_exceptions`
--

CREATE TABLE `business_hour_exceptions` (
  `exception_id` int(11) NOT NULL,
  `exception_date` date NOT NULL,
  `is_open` tinyint(1) NOT NULL DEFAULT 0,
  `opening_time` time DEFAULT NULL,
  `closing_time` time DEFAULT NULL,
  `reason` varchar(80) NOT NULL DEFAULT 'Custom Hours',
  `custom_reason` varchar(255) DEFAULT NULL,
  `created_by` varchar(150) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `business_hour_exceptions`
--

INSERT INTO `business_hour_exceptions` (`exception_id`, `exception_date`, `is_open`, `opening_time`, `closing_time`, `reason`, `custom_reason`, `created_by`, `created_at`, `updated_at`) VALUES
(2, '2026-07-15', 1, '08:00:00', '21:00:00', 'Holiday', NULL, 'admin', '2026-07-02 09:44:54', '2026-07-02 09:44:54'),
(3, '2026-07-01', 1, '08:00:00', '21:00:00', 'Emergency Closure', NULL, 'admin', '2026-07-02 10:18:19', '2026-07-02 11:51:24');

-- --------------------------------------------------------

--
-- Table structure for table `cashier_queue`
--

CREATE TABLE `cashier_queue` (
  `queue_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `cashier_id` char(36) DEFAULT NULL,
  `queue_status` enum('waiting','accepted','processing','completed','cancelled','rejected') NOT NULL DEFAULT 'waiting',
  `queued_at` datetime NOT NULL DEFAULT current_timestamp(),
  `accepted_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cashier_queue`
--

INSERT INTO `cashier_queue` (`queue_id`, `order_id`, `cashier_id`, `queue_status`, `queued_at`, `accepted_at`, `completed_at`) VALUES
(50, 63, '9db5292a-7788-11f1-ae3b-0a002700000b', 'completed', '2026-08-17 23:57:31', '2026-08-17 23:57:44', '2026-08-17 23:58:49'),
(52, 64, '9db5292a-7788-11f1-ae3b-0a002700000b', 'completed', '2026-08-17 23:59:47', '2026-08-17 23:59:56', '2026-08-18 00:00:09'),
(54, 65, '09632669-6a16-11f1-895a-0a002700000b', 'accepted', '2026-08-18 06:09:00', '2026-08-20 09:42:49', NULL),
(55, 66, '09632669-6a16-11f1-895a-0a002700000b', 'accepted', '2026-08-18 06:09:51', '2026-08-20 06:47:14', NULL),
(58, 73, '09632669-6a16-11f1-895a-0a002700000b', 'completed', '2026-08-27 01:41:24', '2026-08-27 01:41:31', '2026-08-27 09:36:12');

-- --------------------------------------------------------

--
-- Table structure for table `entity_dimensions`
--

CREATE TABLE `entity_dimensions` (
  `dimension_id` char(36) NOT NULL DEFAULT uuid(),
  `entity_type` varchar(80) NOT NULL,
  `entity_id` char(36) NOT NULL,
  `dimension_type` varchar(80) NOT NULL,
  `numeric_value` decimal(12,4) DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `text_value` varchar(150) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `grocery_details`
--

CREATE TABLE `grocery_details` (
  `grocery_detail_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL,
  `variant` varchar(150) DEFAULT NULL,
  `size` varchar(50) DEFAULT NULL,
  `net_weight` varchar(50) DEFAULT NULL,
  `unit` varchar(20) DEFAULT NULL,
  `package_type` varchar(100) DEFAULT NULL,
  `pack_content` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventory_batches`
--

CREATE TABLE `inventory_batches` (
  `batch_id` char(36) NOT NULL DEFAULT uuid(),
  `legacy_inventory_id` char(36) DEFAULT NULL,
  `po_id` char(36) DEFAULT NULL,
  `po_item_id` char(36) DEFAULT NULL,
  `product_id` char(36) NOT NULL,
  `supplier_id` char(36) DEFAULT NULL,
  `received_date` datetime NOT NULL DEFAULT current_timestamp(),
  `expiry_date` date DEFAULT NULL,
  `received_qty` int(11) NOT NULL DEFAULT 0,
  `storage_qty` int(11) NOT NULL DEFAULT 0,
  `shelf_qty` int(11) NOT NULL DEFAULT 0,
  `damaged_qty` int(11) NOT NULL DEFAULT 0,
  `returned_qty` int(11) NOT NULL DEFAULT 0,
  `unit_cost` decimal(12,4) NOT NULL DEFAULT 0.0000,
  `batch_status` varchar(40) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `inventory_receiving_transactions`
--

CREATE TABLE `inventory_receiving_transactions` (
  `transaction_id` char(36) NOT NULL DEFAULT uuid(),
  `transaction_request_key` varchar(100) NOT NULL,
  `transaction_type` varchar(40) NOT NULL,
  `receiving_id` char(36) NOT NULL,
  `receiving_item_id` char(36) NOT NULL,
  `claim_id` char(36) DEFAULT NULL,
  `po_id` char(36) NOT NULL,
  `po_item_id` char(36) NOT NULL,
  `inventory_batch_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `supplier_id` char(36) NOT NULL,
  `quantity` int(11) NOT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Table structure for table `inventory_transfers`
--

CREATE TABLE `inventory_transfers` (
  `transfer_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL,
  `movement_type` enum('STORAGE_TO_SHELF','SHELF_TO_STORAGE') NOT NULL,
  `selected_quantity` int(11) NOT NULL,
  `selected_unit` varchar(50) NOT NULL,
  `base_quantity` int(11) NOT NULL,
  `base_unit` varchar(50) NOT NULL,
  `source_location` varchar(30) NOT NULL,
  `destination_location` varchar(30) NOT NULL,
  `transferred_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Table structure for table `inventory_transfer_allocations`
--

CREATE TABLE `inventory_transfer_allocations` (
  `allocation_id` char(36) NOT NULL DEFAULT uuid(),
  `transfer_id` char(36) NOT NULL,
  `source_batch_id` char(36) NOT NULL,
  `selling_stock_id` char(36) DEFAULT NULL,
  `batch_number` varchar(80) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `base_quantity` int(11) NOT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `login_attempts`
--

CREATE TABLE `login_attempts` (
  `attempt_id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) DEFAULT NULL,
  `username` varchar(255) NOT NULL,
  `ip_address` varchar(45) NOT NULL DEFAULT '',
  `user_agent` text DEFAULT NULL,
  `is_successful` tinyint(1) NOT NULL DEFAULT 0,
  `failure_reason` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `login_attempts`
--

INSERT INTO `login_attempts` (`attempt_id`, `user_id`, `username`, `ip_address`, `user_agent`, `is_successful`, `failure_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('0023e804-7444-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:24:43', NULL),
('0077d5aa-a35b-11f1-a13c-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-29 03:37:47', NULL),
('017b75bb-8a2e-11f1-85ca-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 02:42:42', NULL),
('01cff47f-89c9-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:39:43', NULL),
('039728e9-9585-11f1-92a6-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 13:03:14', NULL),
('03c0e00e-a08a-11f1-b4b0-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-25 13:36:43', NULL),
('04678544-9fc2-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 13:45:07', NULL),
('04c3c809-8b5d-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 14:51:45', NULL),
('050d6d9a-89b7-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 12:30:58', NULL),
('0534455f-8f16-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 08:33:36', NULL),
('05b5b33e-6ae0-11f1-b9ca-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-18 06:36:22', NULL),
('060a241f-7783-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-04 08:33:25', NULL),
('063037a4-7f71-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-14 10:44:43', NULL),
('068da077-8817-11f1-8a20-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-25 10:53:10', NULL),
('06937b08-881c-11f1-8a20-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-25 11:28:57', NULL),
('06ed83cf-89c9-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:39:52', NULL),
('071ef6f0-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 11:32:49', NULL),
('07ae4997-89cd-11f1-ad23-706871ff20d7', NULL, 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-27 15:08:31', '2026-07-28 02:41:41'),
('07c9f549-7dd0-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 08:59:46', NULL),
('07ded0f8-8b5d-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 14:51:50', NULL),
('0810118e-7dd0-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 08:59:46', NULL),
('08238d89-84c2-11f1-b39b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:07:12', NULL),
('08f6d262-7445-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 05:32:07', NULL),
('09023015-743b-11f1-a369-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, 'invalid_credentials', 0, 0, 0, '2026-06-30 04:20:32', '2026-07-02 05:50:16'),
('0a2c06e4-99db-11f1-9971-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-17 01:29:07', NULL),
('0ae1f509-9fb2-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 11:50:46', NULL),
('0b8b55c5-99ec-11f1-b09a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-17 03:30:51', NULL),
('0c198062-9f9e-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 09:27:38', NULL),
('0d49b540-84cb-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-21 06:11:46', NULL),
('0e348b49-89d4-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-27 15:58:48', NULL),
('0fd047fd-7dcb-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:24:12', NULL),
('10804b70-964e-11f1-8c9f-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 13:02:25', NULL),
('10f7c187-743c-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-06-30 04:27:55', NULL),
('114dea28-79c5-11f1-a60b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 05:31:13', NULL),
('11522750-996c-11f1-bd62-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-16 12:14:45', NULL),
('11965807-7ad5-11f1-a017-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 13:58:16', NULL),
('11f8a1ec-7f7b-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-14 11:56:38', NULL),
('1265a7f7-7a16-11f1-97ee-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 15:11:04', NULL),
('126f9dd7-7a16-11f1-97ee-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 15:11:04', NULL),
('1296e38a-96e1-11f1-910b-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 06:34:44', NULL),
('12e694b6-84db-11f1-b39b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 08:06:27', NULL),
('13883968-9cb5-11f1-9340-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-20 16:34:55', NULL),
('146b5dda-72d3-11f1-a072-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, 'invalid_credentials', 0, 0, 0, '2026-06-28 09:23:53', '2026-06-30 04:22:40'),
('150c8806-96d8-11f1-910b-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 05:30:23', NULL),
('16a2bd8c-79c5-11f1-a60b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 05:31:22', NULL),
('17ff6374-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 10:43:11', NULL),
('18653c3f-960e-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-12 05:24:30', NULL),
('18744b54-7a0f-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-07 14:21:07', NULL),
('1939f78c-9f81-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 06:00:24', NULL),
('1981a3b4-8faf-11f1-91e4-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-04 02:49:23', NULL),
('1a102bbc-89ce-11f1-ad23-706871ff20d7', NULL, 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-27 15:16:11', '2026-07-28 02:41:41'),
('1ab6ee4c-75da-11f1-aaef-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-02 05:51:43', NULL),
('1ac7c812-8019-11f1-9f4a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-15 06:47:53', NULL),
('1b79c585-a6bb-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 10:43:17', NULL),
('1bb279a1-84c2-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:07:44', NULL),
('1c0e56aa-9c8e-11f1-9340-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-20 11:55:59', NULL),
('1c5f1923-785d-11f1-9aa3-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 10:34:32', NULL),
('1c5f3a67-8fa1-11f1-91e4-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-04 01:09:15', NULL),
('1c684524-7dcb-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:24:33', NULL),
('1ccd9dfb-9304-11f1-90e7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-08 08:35:29', NULL),
('1e29b8d7-8faf-11f1-91e4-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-04 02:49:31', NULL),
('1e81bdde-9cab-11f1-9340-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-20 15:23:39', NULL),
('1fcd8610-9226-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:06:26', NULL),
('21e3cbcf-7dc7-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 07:56:04', NULL),
('222e3945-7dd0-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 09:00:30', NULL),
('22337662-9520-11f1-a1ed-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 01:01:07', NULL),
('224a8237-7ad5-11f1-a017-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 13:58:44', NULL),
('22669f4f-a9c5-11f1-a501-0a002700000b', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-06 07:32:37', NULL),
('226afc1f-89d3-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:52:13', NULL),
('22f0b18f-785d-11f1-9aa3-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 10:34:43', NULL),
('2316073c-9fbc-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 13:03:01', NULL),
('2347fcaa-9f83-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 06:15:00', NULL),
('23eadbd8-785c-11f1-9aa3-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 10:27:36', NULL),
('24220e6a-7ac1-11f1-a017-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 11:35:37', NULL),
('2486a31e-9226-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:06:34', NULL),
('24cae72a-89cd-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, 'inactive_account', 0, 0, 0, '2026-07-27 15:09:20', '2026-07-27 15:09:48'),
('253c8ef6-84c7-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:43:48', NULL),
('267f6a08-a5b3-11f1-a82a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-01 03:13:48', NULL),
('26ac4bf1-7a12-11f1-97ee-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 14:43:00', NULL),
('26e6d37d-7a12-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 14:43:00', NULL),
('271dce5b-a6bc-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 10:50:46', NULL),
('274a031c-99db-11f1-9971-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-17 01:29:56', NULL),
('274b7855-9614-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-12 06:07:52', NULL),
('27730512-805e-11f1-9f4a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-15 15:02:10', NULL),
('278a17b0-7444-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 05:25:49', NULL),
('278c8723-9226-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:06:39', NULL),
('27e826cb-7dd4-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 09:29:18', NULL),
('28360748-7dd4-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 09:29:18', NULL),
('28951019-94be-11f1-958b-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-10 13:19:47', NULL),
('28cde5d4-9ecd-11f1-b6d5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-23 08:32:21', NULL),
('290713cc-8f4d-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:08:16', NULL),
('297038fb-89cc-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 15:02:18', NULL),
('29dcf9ae-9719-11f1-9fb5-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 13:16:15', NULL),
('2a36d957-9634-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 09:57:01', NULL),
('2a8c1df6-9226-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:06:44', NULL),
('2aaf03d0-8b4a-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-29 12:36:48', NULL),
('2b43a00b-8f16-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 08:34:40', NULL),
('2c41d945-785c-11f1-9aa3-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 10:27:50', NULL),
('2c43796f-89c8-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 14:33:45', NULL),
('2c74d496-9615-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-12 06:15:10', NULL),
('2cebe364-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 10:22:18', NULL),
('2dcdfc63-7770-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 06:18:31', NULL),
('2e02acac-95a2-11f1-92a6-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 16:32:01', NULL),
('2e0521c5-7443-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 05:18:50', NULL),
('2ea17621-89c9-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 14:40:58', NULL),
('2eb9fb47-8a2d-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 02:36:48', NULL),
('2f2c108f-8a2e-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 02:43:58', NULL),
('2ff9f179-7045-11f1-9e75-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-25 03:23:08', NULL),
('304ab8bd-8819-11f1-8a20-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-25 11:08:39', NULL),
('30db78ea-89b4-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-27 12:10:43', NULL),
('313b07af-6e17-11f1-bbba-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-22 08:48:51', NULL),
('3163ce56-7dc0-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 07:06:24', NULL),
('317d386d-9f98-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 08:45:43', NULL),
('327a7c7c-a03a-11f1-b4b0-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-25 04:05:24', NULL),
('32a28341-7dcb-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 08:25:10', NULL),
('3522cf47-9ace-11f1-b0e5-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-18 06:29:47', NULL),
('35ac630c-958c-11f1-92a6-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 13:54:45', NULL),
('35ae421d-89cd-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:09:48', NULL),
('3798d5df-a6c2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-02 11:34:11', NULL),
('37a4d2a9-7ac1-11f1-a017-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 11:36:10', NULL),
('381c0f0d-7f7a-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-14 11:50:32', NULL),
('38663df9-9608-11f1-932e-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 04:42:27', NULL),
('390addfe-89c0-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-27 13:36:50', NULL),
('3919439d-8f4c-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:01:34', NULL),
('3a34b4f4-7f74-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-14 11:07:39', NULL),
('3a536759-89cc-11f1-ad23-706871ff20d7', 'eb546a74-89cb-11f1-ad23-706871ff20d7', 'cashier_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:02:47', NULL),
('3ae705d8-7ae2-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:32:29', NULL),
('3b49bd09-7dcb-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 08:25:25', NULL),
('3c68bcec-9536-11f1-a1ed-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 03:39:16', NULL),
('3d423ffb-7ae2-11f1-a017-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:32:33', NULL),
('3ddff803-957e-11f1-92a6-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 12:14:46', NULL),
('3e90d244-9226-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:07:18', NULL),
('3ee99436-89c7-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:27:07', NULL),
('3fb50d42-7f74-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-14 11:07:48', NULL),
('40fb50d1-923b-11f1-a711-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, 'invalid_credentials', 1, 0, 0, '2026-08-07 08:37:41', NULL),
('4145b824-7a0f-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 14:22:16', NULL),
('417e8816-9faf-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 11:30:49', NULL),
('41b8b369-7aeb-11f1-a017-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 16:37:06', NULL),
('41f5795f-94be-11f1-958b-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-08-10 13:20:29', '2026-08-10 13:21:20'),
('420ff9e0-7ae2-11f1-a017-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:32:41', NULL),
('428cb5be-89c7-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:27:13', NULL),
('431047d9-7a0f-11f1-97ee-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 14:22:19', NULL),
('43383445-84cd-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-21 06:27:35', NULL),
('4376f613-99ea-11f1-b09a-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-17 03:18:05', NULL),
('44d5fad2-9f8d-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 07:27:31', NULL),
('44df8272-6f96-11f1-8f3c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-06-24 06:31:01', NULL),
('4502b161-79cc-11f1-a60b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 06:22:46', NULL),
('45296d71-8810-11f1-8a20-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-25 10:04:48', NULL),
('4539b989-8f4c-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:01:54', NULL),
('45474191-88df-11f1-8e9d-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-26 10:46:34', NULL),
('45a55926-8f4d-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:09:04', NULL),
('4693e207-89cd-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:10:17', NULL),
('46eb3551-7f74-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-14 11:08:00', NULL),
('470db862-7dc8-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 08:04:16', NULL),
('472183c4-7ae2-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:32:49', NULL),
('47292294-923b-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-07 08:37:51', NULL),
('476d082d-7ae8-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 16:15:47', NULL),
('477cbf4f-923b-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-07 08:37:52', NULL),
('47bdf874-923b-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-07 08:37:52', NULL),
('481ab4ed-9309-11f1-90e7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-08 09:12:29', NULL),
('481bc03e-8f1b-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 09:11:16', NULL),
('4862f6ec-89c7-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:27:23', NULL),
('48e2fcab-7adf-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:11:24', NULL),
('48f1b0db-79cc-11f1-a60b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 06:22:52', NULL),
('4903452c-7442-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 05:12:26', NULL),
('49c45b4d-960e-11f1-8c9f-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 0, 'invalid_credentials', 0, 0, 0, '2026-08-12 05:25:53', '2026-08-12 08:14:07'),
('49dc7166-7a0e-11f1-97ee-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 14:15:21', NULL),
('4b0468fc-9fab-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 11:02:27', NULL),
('4b2e8463-7a11-11f1-97ee-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 14:36:51', NULL),
('4b655eb9-7a11-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 14:36:52', NULL),
('4b8c472d-7a11-11f1-97ee-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 14:36:52', NULL),
('4bc004c6-8057-11f1-9f4a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-15 14:13:04', NULL),
('4cf58001-72d3-11f1-9cf4-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-28 09:25:28', NULL),
('4cff5532-806b-11f1-9f4a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-15 16:36:16', NULL),
('4d2c449d-7dd4-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 09:30:20', NULL),
('4d6ba6c1-7dd4-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 09:30:21', NULL),
('4e8d80b2-7782-11f1-ae3b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-04 08:28:17', '2026-07-04 08:29:17'),
('4f64396d-7628-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 15:11:32', NULL),
('4f7091dd-84c1-11f1-b39b-0a002700000b', NULL, '__codex_probe__', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, 'invalid_credentials', 1, 0, 0, '2026-07-21 05:02:02', NULL),
('502d85e2-93e6-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-09 11:34:42', NULL),
('50b2d7b2-9608-11f1-932e-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 04:43:08', NULL),
('50c015db-762e-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 15:54:32', NULL),
('50f21a09-8f4c-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:02:14', NULL),
('52e72858-7f7f-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-14 12:27:05', NULL),
('52ebaefc-89b6-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 12:25:59', NULL),
('533e50de-7505-11f1-9d3c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-01 04:28:35', NULL),
('53560d70-7f87-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-14 13:24:22', NULL),
('536bde73-9aa2-11f1-931b-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-18 01:15:40', NULL),
('541bdced-89cc-11f1-ad23-706871ff20d7', 'f6114576-89cb-11f1-ad23-706871ff20d7', 'salesclerk_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:03:30', NULL),
('541f9c13-84ca-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-21 06:06:35', NULL);
INSERT INTO `login_attempts` (`attempt_id`, `user_id`, `username`, `ip_address`, `user_agent`, `is_successful`, `failure_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('54f18490-743b-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 04:22:40', NULL),
('54fcfd35-84ce-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-21 06:35:14', NULL),
('5551f33a-7a0e-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 14:15:40', NULL),
('55a073ee-84c1-11f1-b39b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:02:12', NULL),
('55e335fd-72d3-11f1-9cf4-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-28 09:25:42', NULL),
('55f22206-762e-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 15:54:40', NULL),
('570e40a5-7868-11f1-9aa3-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 11:54:55', NULL),
('572e50d2-7445-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:34:18', NULL),
('580823ec-79cc-11f1-a60b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 06:23:18', NULL),
('5935bd55-76b9-11f1-9891-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-03 08:29:46', NULL),
('59d040ea-9714-11f1-9fb5-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 12:41:48', NULL),
('5a184049-8e52-11f1-81db-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-08-02 09:12:57', NULL),
('5a738b5e-8f4d-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:09:39', NULL),
('5ad07ea1-7ad7-11f1-a017-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 14:14:38', NULL),
('5ae1bfe0-9f7e-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 05:40:46', NULL),
('5c4aa7c9-923b-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-07 08:38:27', NULL),
('5c5a201d-8a33-11f1-85ca-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 03:21:02', NULL),
('5dc921c3-7e79-11f1-97e2-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-13 05:11:55', NULL),
('5dcf082b-743b-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 04:22:55', NULL),
('5debca5b-8f15-11f1-b8d1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 08:28:55', NULL),
('5e2bdbe8-7443-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:20:11', NULL),
('5f7956dd-8fa5-11f1-91e4-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-04 01:39:45', NULL),
('5ffe012c-762e-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 15:54:57', NULL),
('60184e3e-7eae-11f1-b8a1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-13 11:31:22', NULL),
('60476ff9-94be-11f1-958b-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-10 13:21:20', NULL),
('60cd5598-8b23-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-29 07:59:08', NULL),
('61f501f7-93ec-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-09 12:18:09', NULL),
('6348adfc-9226-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:08:19', NULL),
('638df105-a3a9-11f1-a9f8-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-29 12:58:54', NULL),
('640a5e63-a9c2-11f1-a501-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-06 07:12:59', NULL),
('64a8a716-7e03-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 15:07:26', NULL),
('6514c04a-7a1b-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 15:49:10', NULL),
('65a0434f-7783-11f1-ae3b-0a002700000b', NULL, 'salesclerk1', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, 'invalid_credentials', 1, 0, 0, '2026-07-04 08:36:05', NULL),
('65ca3547-7dd5-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-12 09:38:11', NULL),
('65db7afe-9210-11f1-8d55-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 03:30:55', NULL),
('662c9fd1-96ed-11f1-910b-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 08:02:59', NULL),
('67b0c209-9640-11f1-8c9f-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 11:24:38', NULL),
('6879d422-8f4c-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:02:53', NULL),
('68b8bbac-a5b3-11f1-a82a-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-01 03:15:39', NULL),
('68bac686-89c9-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:42:36', NULL),
('68ef1034-7783-11f1-ae3b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 08:36:11', NULL),
('693431eb-7503-11f1-9d3c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-01 04:14:53', NULL),
('6960abe1-8809-11f1-8a20-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-25 09:15:42', NULL),
('6b2a21ac-835b-11f1-8a2f-0a002700000b', NULL, 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 1, 0, 0, '2026-07-19 10:20:04', NULL),
('6b4c079c-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:04:09', NULL),
('6b5b37fe-8053-11f1-9f4a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-15 13:45:19', NULL),
('6be0e342-743d-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 04:37:37', NULL),
('6c71524c-787b-11f1-9aa3-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 14:11:32', NULL),
('6d52face-835b-11f1-8a2f-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-19 10:20:08', NULL),
('6d6c0dda-6b95-11f1-9859-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-19 04:14:55', NULL),
('6db1cb33-993c-11f1-bd62-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-16 06:33:44', NULL),
('6e4563af-805e-11f1-9f4a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-15 15:04:09', NULL),
('6e7b749c-7ea8-11f1-b8a1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-13 10:48:49', NULL),
('6eb0eac7-8a33-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 03:21:33', NULL),
('6edcf823-8f43-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-08-03 13:58:41', NULL),
('6ee1b8fb-7628-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 15:12:25', NULL),
('6f173928-8f4d-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:10:14', NULL),
('6f62e7fb-89c9-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:42:47', NULL),
('6ff58845-923b-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-07 08:39:00', NULL),
('7055dbd1-88e2-11f1-8e9d-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-26 11:09:15', NULL),
('706bf43e-7ad6-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 14:08:05', NULL),
('70ae3b28-89b7-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 12:33:58', NULL),
('71ebb11d-835c-11f1-8a2f-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, 'invalid_credentials', 0, 0, 0, '2026-07-19 10:27:25', '2026-07-19 10:27:25'),
('71f9e8ad-835c-11f1-8a2f-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-19 10:27:25', NULL),
('728e6e2b-7782-11f1-ae3b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 08:29:17', NULL),
('734b1547-75db-11f1-ba9e-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 06:01:21', NULL),
('7367713a-7456-11f1-a369-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, 'invalid_credentials', 0, 0, 0, '2026-06-30 07:36:47', '2026-07-02 05:50:16'),
('747b6478-8f17-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 08:43:52', NULL),
('74b61568-9f8f-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 07:43:11', NULL),
('74d79820-a938-11f1-9f59-0a002700000b', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-05 14:45:35', NULL),
('7507befb-9f96-11f1-b4e1-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 08:33:18', NULL),
('7605a4c8-89d3-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-27 15:54:33', '2026-07-28 02:41:41'),
('761f0631-8a33-11f1-85ca-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 03:21:45', NULL),
('765812f9-89d4-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-27 16:01:43', NULL),
('76b28081-7442-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:13:43', NULL),
('76c0d363-7ea8-11f1-b8a1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-13 10:49:03', NULL),
('76ca3b01-72c8-11f1-88b7-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-28 08:07:53', NULL),
('7785aa24-89d3-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-27 15:54:36', NULL),
('77fe1b1a-7782-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 08:29:26', NULL),
('7996ec35-7442-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:13:48', NULL),
('7a405402-a6b8-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 10:24:28', NULL),
('7aa8c040-7ae2-11f1-a017-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:34:16', NULL),
('7aab11d7-7aec-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 16:45:51', NULL),
('7af74bfc-89b7-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 12:34:16', NULL),
('7bc13819-711d-11f1-a888-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-26 05:11:26', NULL),
('7c8a33c6-762e-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 15:55:45', NULL),
('7db085f3-9fb8-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 12:36:55', NULL),
('7dc18fc5-75fa-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-02 09:43:33', NULL),
('7df67549-7dc7-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 07:58:39', NULL),
('7eb3c96e-761b-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-02 13:39:48', NULL),
('7f000dd7-84c1-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:03:21', NULL),
('7f038548-923a-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-07 08:32:16', NULL),
('7f517946-7aec-11f1-a017-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 16:45:59', NULL),
('7f5a5db9-89d3-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-27 15:54:49', '2026-07-28 02:41:41'),
('7f9b354f-8f15-11f1-9259-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 08:29:52', NULL),
('7fbf28ae-88e2-11f1-8e9d-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-26 11:09:41', NULL),
('7fe717dc-84c1-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-21 05:03:23', NULL),
('7ff24ceb-752f-11f1-ba65-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-01 09:30:29', NULL),
('80eeda07-7090-11f1-9ad7-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, 'invalid_credentials', 0, 0, 0, '2026-06-25 12:22:16', '2026-07-02 05:50:16'),
('81618c89-93e7-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-09 11:43:14', NULL),
('8163788a-743b-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-06-30 04:23:54', NULL),
('8292dd55-93e7-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-09 11:43:16', NULL),
('8298128f-8f2b-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 11:07:26', NULL),
('83052fe7-8f4c-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:03:38', NULL),
('84b1ce5d-7456-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 07:37:16', NULL),
('856b2c4c-9cad-11f1-9340-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-20 15:40:50', NULL),
('85972ec0-93dd-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-09 10:31:46', NULL),
('85b01e13-8b2b-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-29 08:57:26', NULL),
('8671d57b-7ae8-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 16:17:33', NULL),
('86a1346a-7ad5-11f1-a017-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 14:01:33', NULL),
('86b4296a-a92f-11f1-9f59-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-05 13:41:40', NULL),
('87257396-84c1-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:03:35', NULL),
('8729b6a1-96ee-11f1-ad98-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 08:11:03', NULL),
('87845e35-7444-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:28:30', NULL),
('87b812be-a6bf-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 11:14:57', NULL),
('88522558-8f18-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 08:51:35', NULL),
('88660efb-93eb-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-09 12:12:04', NULL),
('88cedf36-8f3a-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-08-03 12:54:59', NULL),
('8956ac81-7ea7-11f1-b8a1-0a002700000b', NULL, 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 0, 'invalid_credentials', 1, 0, 0, '2026-07-13 10:42:25', NULL),
('8abbbe80-89cc-11f1-ad23-706871ff20d7', NULL, 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, 'invalid_credentials', 0, 0, 0, '2026-07-27 15:05:01', '2026-07-27 15:05:38'),
('8b1ac54f-963f-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 11:18:28', NULL),
('8b9f4cff-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:56:17', NULL),
('8bac74a1-7ddb-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-12 10:22:11', NULL),
('8bae760e-7dcf-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:56:18', NULL),
('8be94546-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:56:18', NULL),
('8cbbe605-9ac9-11f1-b0e5-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-18 05:56:26', NULL),
('8dedf780-a9c4-11f1-a501-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-06 07:28:28', NULL),
('8dfc068e-79d8-11f1-a60b-0a002700000b', NULL, 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 07:50:42', '2026-07-07 08:49:10'),
('8e0a4905-88e1-11f1-8e9d-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-26 11:02:55', NULL),
('8eb6689e-7444-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:28:42', NULL),
('8f385889-89b7-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 12:34:50', NULL),
('8ff6dcb4-a8ee-11f1-8c79-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-05 05:56:39', NULL),
('91341a87-7783-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 08:37:18', NULL),
('9250f487-6ba2-11f1-9859-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-06-19 05:49:00', '2026-07-02 05:50:16'),
('925a76c9-a5b3-11f1-a82a-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-01 03:16:49', NULL),
('93110fdb-9225-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:02:30', NULL),
('9459789a-7788-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 09:13:11', NULL),
('94c3405b-835c-11f1-8a2f-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-19 10:28:24', NULL),
('9556af7c-9fac-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 11:11:41', NULL),
('956dcd0a-8f4c-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 15:04:08', NULL),
('959dc840-79d8-11f1-a60b-0a002700000b', NULL, 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 07:50:55', '2026-07-07 08:49:10'),
('95e16555-79e0-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 08:48:11', '2026-07-07 08:49:10'),
('964cd9e0-8e53-11f1-9228-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-02 09:21:48', NULL),
('968c74cc-7ea7-11f1-b8a1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-13 10:42:47', NULL),
('985d91e1-81a6-11f1-a1c9-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-17 06:13:14', NULL),
('9977e340-9535-11f1-a1ed-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 03:34:43', NULL),
('998d05d2-7a19-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 15:36:19', NULL),
('9a280928-9237-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-07 08:11:33', NULL),
('9bc9b7a7-8b1a-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 06:56:22', NULL),
('9c255cc0-762e-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 15:56:38', NULL),
('9c328502-9634-11f1-8c9f-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 10:00:12', NULL),
('9d8dbf8c-7788-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 09:13:26', NULL),
('9d9fd307-79e0-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 08:48:24', '2026-07-07 08:49:10'),
('9ddaed7f-8a33-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 03:22:52', NULL),
('9f13bb8c-7add-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 14:59:30', NULL),
('9f642858-957a-11f1-92a6-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 11:48:51', NULL),
('9fcb8fca-961c-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-12 07:08:30', NULL),
('9ffea572-93ec-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-09 12:19:53', NULL),
('a0741447-79e0-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 08:48:29', '2026-07-07 08:49:10'),
('a07c7303-9fc2-11f1-b4e1-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 13:49:29', NULL),
('a0984273-738d-11f1-a2fe-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-29 07:39:14', NULL),
('a0c05dd5-89cc-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:05:38', NULL),
('a115fbc2-6ec9-11f1-84cf-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-06-23 06:06:09', NULL),
('a13a4037-84c2-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:11:28', NULL),
('a1bba048-6ba2-11f1-9859-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-06-19 05:49:26', '2026-07-02 05:50:16'),
('a1c83ac0-7e9c-11f1-b8a1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-13 09:24:21', NULL),
('a1eb18b3-7adf-11f1-a017-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:13:53', NULL),
('a256d39c-94cd-11f1-958b-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-10 15:10:33', NULL),
('a333328d-6ba2-11f1-9859-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-19 05:49:29', NULL),
('a367c90a-79e0-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 08:48:34', '2026-07-07 08:49:10'),
('a3798da6-6ba2-11f1-9859-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-19 05:49:29', NULL),
('a4213f39-9ecd-11f1-b6d5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-23 08:35:48', NULL),
('a439075f-8a3d-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 04:34:37', NULL),
('a5522c82-708f-11f1-9ad7-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-25 12:16:08', NULL),
('a55981b3-88d6-11f1-8e9d-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-26 09:44:50', NULL),
('a560ed50-743e-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 04:46:23', NULL),
('a591ced7-a91f-11f1-9f59-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-05 11:48:01', NULL),
('a60bdf65-8fb5-11f1-91e4-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-04 03:36:14', NULL),
('a68436de-7788-11f1-ae3b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'codex_salesclerk_test', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-04 09:13:41', NULL),
('a744801b-78f9-11f1-ba06-0a002700000b', NULL, 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 1, 0, 0, '2026-07-06 05:15:07', NULL),
('a76f256d-8f15-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-03 08:30:59', NULL),
('a797db93-769c-11f1-9891-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-03 05:04:22', NULL),
('a8221755-9625-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 08:13:10', NULL),
('a8eed150-8a2e-11f1-85ca-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-28 02:47:23', '2026-07-28 02:47:27'),
('a90e591b-93ec-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-09 12:20:08', NULL),
('a9a3e683-78f9-11f1-ba06-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-06 05:15:11', NULL);
INSERT INTO `login_attempts` (`attempt_id`, `user_id`, `username`, `ip_address`, `user_agent`, `is_successful`, `failure_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('aa02d0ed-a6b6-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 10:11:29', NULL),
('aa5b691c-75de-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 06:24:22', NULL),
('aa8621f4-a10c-11f1-b8f7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-26 05:11:59', NULL),
('ab8345bc-8a2e-11f1-85ca-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 02:47:27', NULL),
('ab857b8c-7f73-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-14 11:03:40', NULL),
('ab87df31-8b5c-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 14:49:15', NULL),
('ababac91-7455-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 07:31:12', NULL),
('abc782aa-8f18-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-08-03 08:52:34', NULL),
('ac0cd434-a141-11f1-96e8-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-26 11:31:25', NULL),
('ae797c38-9ecd-11f1-b6d5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-23 08:36:05', NULL),
('af28f9ad-9f92-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 08:06:17', NULL),
('af562618-8a3d-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 04:34:56', NULL),
('aff2504d-9304-11f1-90e7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-08 08:39:36', NULL),
('b0fe48bf-8057-11f1-9f4a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', '', 1, NULL, 1, 0, 0, '2026-07-15 14:15:54', NULL),
('b1654095-7ae4-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:50:07', NULL),
('b20556cf-8f4c-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 15:04:56', NULL),
('b4049543-8f15-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-08-03 08:31:20', NULL),
('b4880fda-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:06:12', NULL),
('b4a08ea5-923a-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-07 08:33:46', NULL),
('b4fa40b4-7dca-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-12 08:21:39', NULL),
('b50fa0c0-7ea0-11f1-b8a1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-13 09:53:32', NULL),
('b5b15941-7515-11f1-9d3c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-01 06:25:52', NULL),
('b606488d-8a39-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 04:06:29', NULL),
('b653f60f-7dcb-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 08:28:51', NULL),
('b680328f-7dda-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 10:16:14', NULL),
('b6ae9a8a-7dda-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 10:16:14', NULL),
('b7af463f-9fbe-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 13:21:29', NULL),
('b7fb711c-7514-11f1-9d3c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-01 06:18:47', NULL),
('b83da2f0-93f6-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-09 13:32:08', NULL),
('b891b442-79e0-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 08:49:10', NULL),
('b8957f2e-8b22-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-29 07:54:26', NULL),
('b91ca654-7f76-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-14 11:25:31', NULL),
('b93e8616-a36c-11f1-a9f8-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-29 05:44:38', NULL),
('bb7afad5-96d4-11f1-910b-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 05:06:24', NULL),
('bbce1412-84cd-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-21 06:30:57', NULL),
('bc596dae-7dd4-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-12 09:33:27', NULL),
('bd0feccc-743b-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-06-30 04:25:34', NULL),
('bd8e4dce-9796-11f1-9306-706871ff20d7', NULL, 'sup', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, 'invalid_credentials', 1, 0, 0, '2026-08-14 04:15:10', NULL),
('be02b058-9f9c-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 09:18:17', NULL),
('be16a8ed-8b27-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-29 08:30:23', NULL),
('bf9f18d6-7dc6-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 07:53:19', NULL),
('c06836c0-9796-11f1-9306-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-14 04:15:15', NULL),
('c166ad68-79d9-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 07:59:18', '2026-07-07 08:49:10'),
('c1b183a0-7ade-11f1-a017-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 15:07:37', NULL),
('c1c3f896-9f95-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 08:28:17', NULL),
('c2c9aaae-9988-11f1-bd62-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-16 15:40:06', NULL),
('c36b6c2c-7f73-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-14 11:04:20', NULL),
('c418e3f2-7aea-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 16:33:35', NULL),
('c44972d4-89cd-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 15:13:47', NULL),
('c48b1975-84cd-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-21 06:31:12', NULL),
('c54b0532-7f76-11f1-aa19-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-14 11:25:51', NULL),
('c5530f9c-a6a4-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 08:03:24', NULL),
('c582255d-775d-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 04:06:45', NULL),
('c67785d4-75d9-11f1-aab9-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, 'invalid_credentials', 0, 0, 0, '2026-07-02 05:49:22', '2026-07-02 05:50:16'),
('c69f74eb-a6a1-11f1-b4bd-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-02 07:41:57', NULL),
('c761240f-89d3-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-27 15:56:50', NULL),
('c7c70abc-9a3a-11f1-b509-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-17 12:54:27', NULL),
('c7c7dd40-89cb-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:59:34', NULL),
('c878476c-78f9-11f1-ba06-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-06 05:16:03', NULL),
('c8f1fbe0-99d9-11f1-8ad4-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-17 01:20:08', NULL),
('c9ed7bef-9625-11f1-8c9f-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 08:14:07', NULL),
('c9f12970-930e-11f1-90e7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-08 09:51:55', NULL),
('ca8c375b-a6b2-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 09:43:45', NULL),
('cb842fed-7456-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 07:39:15', NULL),
('cc17eea0-89b6-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 12:29:22', NULL),
('cc658b18-79d9-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 07:59:36', '2026-07-07 08:49:10'),
('cc9786b1-9236-11f1-a711-706871ff20d7', NULL, 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-08-07 08:05:48', '2026-08-07 08:28:11'),
('ccab049f-9704-11f1-9fb5-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-13 10:50:29', NULL),
('cddff46e-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:58:09', NULL),
('ce888035-a6a1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-02 07:42:11', NULL),
('cf5e8987-75d9-11f1-aab9-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, 'invalid_credentials', 0, 0, 0, '2026-07-02 05:49:37', '2026-07-02 05:50:16'),
('cfaaec62-7ea8-11f1-b8a1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-13 10:51:32', NULL),
('d0605c32-7dda-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-12 10:16:57', NULL),
('d07db8b1-7dd6-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 09:48:19', NULL),
('d0c1dbaf-8a2d-11f1-85ca-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-28 02:41:20', '2026-07-28 02:41:41'),
('d21ebcc2-8a42-11f1-850f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 05:11:42', NULL),
('d2d1c699-923a-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-07 08:34:36', NULL),
('d3decc7e-89cb-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:59:55', NULL),
('d3f19b9e-9612-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-12 05:58:23', NULL),
('d407c1b0-9f90-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 07:53:00', NULL),
('d4249312-9ad1-11f1-b0e5-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-18 06:55:42', NULL),
('d495b76d-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:58:20', NULL),
('d5ff97db-84cd-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-21 06:31:41', NULL),
('d603409d-79d9-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 07:59:53', '2026-07-07 08:49:10'),
('d604dc06-8f2b-11f1-b044-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-03 11:09:46', NULL),
('d69a3f9b-9b05-11f1-adeb-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-18 13:08:00', NULL),
('d6f281b5-85c1-11f1-b551-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-22 11:38:20', NULL),
('d726ecf0-7dca-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-12 08:22:37', NULL),
('d74c8b5d-89b6-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 12:29:41', NULL),
('d758f199-8a2e-11f1-85ca-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-28 02:48:41', NULL),
('d7d7088b-a5b6-11f1-a82a-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-01 03:40:14', NULL),
('d7f492f2-75d9-11f1-aab9-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 05:49:51', NULL),
('d7f704bb-9225-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:04:25', NULL),
('d81b9136-a6c1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 11:31:30', NULL),
('d91af53e-89ca-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 14:52:54', NULL),
('d9222357-8b25-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 08:16:49', NULL),
('d9625fbc-785a-11f1-9aa3-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 10:18:21', NULL),
('d9cb00f3-84d4-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-21 07:21:54', NULL),
('d9f2e20f-79d9-11f1-a60b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-07 07:59:59', '2026-07-07 08:49:10'),
('da36c486-a6c3-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-09-02 11:45:53', NULL),
('daad68cf-9f9f-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 09:40:34', NULL),
('dac31e43-786a-11f1-9aa3-0a002700000b', NULL, 'salesclerk1', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, 'invalid_credentials', 1, 0, 0, '2026-07-05 12:12:55', NULL),
('db58c6b1-713a-11f1-a888-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, 'invalid_credentials', 0, 0, 0, '2026-06-26 08:41:42', '2026-07-02 05:50:16'),
('db737bd8-7788-11f1-ae3b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'codex_salesclerk_test', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 09:15:10', NULL),
('db9e84d4-7788-11f1-ae3b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'codex_salesclerk_test', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, 'invalid_credentials', 1, 0, 0, '2026-07-04 09:15:10', NULL),
('dba00727-9ad1-11f1-b0e5-706871ff20d7', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-18 06:55:54', NULL),
('dbcbaf4c-7788-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 09:15:11', NULL),
('dcad665c-93eb-11f1-977a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-09 12:14:25', NULL),
('dd0d94b3-835b-11f1-8a2f-0a002700000b', NULL, 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 0, 'invalid_credentials', 1, 0, 0, '2026-07-19 10:23:15', NULL),
('dd4bc910-8a2d-11f1-85ca-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 02:41:41', NULL),
('dd4ffba1-84c0-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 04:58:50', NULL),
('dd990b35-786a-11f1-9aa3-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-05 12:13:00', NULL),
('de2f7b9a-880f-11f1-8a20-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-25 10:01:55', NULL),
('de3ac1da-a5ad-11f1-a82a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-01 02:36:00', NULL),
('de9504be-978d-11f1-ac0b-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-14 03:11:40', NULL),
('defcd65a-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 08:58:37', NULL),
('df0423cf-a6c1-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-02 11:31:42', NULL),
('df706c71-7ad9-11f1-a017-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 14:32:40', NULL),
('e0507cbf-7dd6-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 09:48:46', NULL),
('e2dc1e82-89cc-11f1-ad23-706871ff20d7', NULL, 'manager', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-07-27 15:07:29', '2026-07-28 02:41:41'),
('e3f54d7c-9fab-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 11:06:43', NULL),
('e4101757-7788-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-04 09:15:25', NULL),
('e571596c-84ca-11f1-b39b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-21 06:10:39', NULL),
('e5d60f38-7781-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 08:25:21', NULL),
('e670bd61-7781-11f1-ae3b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'codex_salesclerk_test', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 08:25:22', NULL),
('e69070a8-75d9-11f1-aab9-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-02 05:50:16', NULL),
('e6a3dc72-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 08:58:50', NULL),
('e6b33bf3-89cc-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-27 15:07:36', NULL),
('e6b90f7d-7781-11f1-ae3b-0a002700000b', NULL, 'codex_salesclerk_test', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 0, 'invalid_credentials', 0, 0, 0, '2026-07-04 08:25:23', '2026-07-04 08:25:44'),
('e7232436-8f27-11f1-b044-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-08-03 10:41:36', NULL),
('e745205b-84da-11f1-b39b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 08:05:14', NULL),
('e8237c8e-9535-11f1-a1ed-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 03:36:55', NULL),
('e87b2004-7500-11f1-9d3c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-01 03:56:58', NULL),
('e92d3116-9f9e-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 09:33:49', NULL),
('e9e51e6e-a6d0-11f1-b4bd-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-02 13:19:23', NULL),
('e9ee58d2-76b7-11f1-9891-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-03 08:19:30', NULL),
('eaf81522-7621-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-02 14:25:47', NULL),
('eb41f2af-8b3c-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-29 11:01:58', NULL),
('eb4ef4de-7445-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-30 05:38:27', NULL),
('ebdca4af-79c4-11f1-a60b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 05:30:10', NULL),
('ec2366cd-9f8a-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 07:10:44', NULL),
('eca0b24f-a3b3-11f1-a9f8-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-29 14:14:18', NULL),
('ed0ffe9f-75de-11f1-b27c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-02 06:26:14', NULL),
('ed191afc-923a-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-08-07 08:35:20', NULL),
('ed6484a7-713a-11f1-a888-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 0, 'invalid_credentials', 0, 0, 0, '2026-06-26 08:42:13', '2026-07-02 05:50:16'),
('ed71074f-9239-11f1-a711-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-07 08:28:11', NULL),
('ede83a7e-9337-11f1-90e7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-08 14:46:23', NULL),
('ee46bad6-9fa8-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 10:45:32', NULL),
('ee968a21-9306-11f1-90e7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-08 08:55:40', NULL),
('ef1a99cb-6f86-11f1-8f3c-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-06-24 04:41:15', '2026-07-02 05:50:16'),
('ef53bfaf-99e9-11f1-b09a-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-17 03:15:44', NULL),
('f05c07d4-9f93-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 08:15:16', NULL),
('f0acf895-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 08:59:07', NULL),
('f0dd0a61-8370-11f1-8a2f-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-19 12:54:08', NULL),
('f16af739-7a0e-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-07 14:20:02', NULL),
('f1814f20-7a10-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 14:34:21', NULL),
('f1e6f672-9f83-11f1-b4e1-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 06:20:47', NULL),
('f21323d6-9ecb-11f1-b6d5-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-23 08:23:40', NULL),
('f238c7a8-8343-11f1-8a2f-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-19 07:32:07', NULL),
('f24ff579-a1d5-11f1-b8b1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-27 05:12:49', NULL),
('f25d3e7c-75d9-11f1-aab9-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-02 05:50:35', NULL),
('f27ec102-79c4-11f1-a60b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 05:30:21', NULL),
('f2e478ff-7781-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 08:25:43', NULL),
('f2ff2810-7a20-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 16:28:55', NULL),
('f2ffd6fa-6f86-11f1-8f3c-0a002700000b', NULL, 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 0, 'invalid_credentials', 0, 0, 0, '2026-06-24 04:41:21', '2026-07-02 05:50:16'),
('f3668820-8a2d-11f1-85ca-706871ff20d7', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-28 02:42:18', NULL),
('f371f29f-7781-11f1-ae3b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'codex_salesclerk_test', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-04 08:25:44', NULL),
('f4229c5b-8b5c-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 14:51:17', NULL),
('f454c244-92fa-11f1-90e7-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-08 07:29:56', NULL),
('f4747347-6f86-11f1-8f3c-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-24 04:41:24', NULL),
('f4c5b42e-9f8a-11f1-b4e1-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-08-24 07:10:58', NULL),
('f51a1302-7788-11f1-ae3b-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 09:15:53', NULL),
('f55e5525-7ac2-11f1-a017-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-08 11:48:38', NULL),
('f5bc7d3c-a9c2-11f1-a501-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-06 07:17:03', NULL),
('f6a29245-8b5c-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 14:51:21', NULL),
('f6c3cdf2-89b6-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 12:30:34', NULL),
('f6cd37c1-7a0e-11f1-97ee-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-07 14:20:11', NULL),
('f74a5594-84c1-11f1-b39b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'cashier', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:06:43', NULL),
('f7a08a40-8b22-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-29 07:56:12', NULL),
('f7cc6c2e-743b-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-06-30 04:27:13', NULL),
('f84b49f3-7788-11f1-ae3b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-07-04 09:15:59', NULL),
('f8c16334-a393-11f1-a9f8-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-29 10:25:35', NULL),
('f8d7cc52-9227-11f1-a711-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-07 06:19:40', NULL),
('fa2f661f-a056-11f1-b4b0-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-25 07:31:25', NULL),
('faa8ecac-89c5-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 14:18:03', NULL),
('fae85548-a379-11f1-a9f8-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-29 07:19:32', NULL),
('faea4cae-8b5c-11f1-b840-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-29 14:51:28', NULL),
('faf01072-7dca-11f1-a5b1-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Cashier', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-07-12 08:23:37', NULL);
INSERT INTO `login_attempts` (`attempt_id`, `user_id`, `username`, `ip_address`, `user_agent`, `is_successful`, `failure_reason`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('fbe02567-9f8a-11f1-b4e1-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-24 07:11:10', NULL),
('fc05db3b-a935-11f1-9f59-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0', 1, NULL, 1, 0, 0, '2026-09-05 14:27:53', NULL),
('fc272ab2-94c7-11f1-958b-706871ff20d7', 'a1f91cde-9238-11f1-a711-706871ff20d7', 'supervisor', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-10 14:30:07', NULL),
('fc900788-6ec7-11f1-84cf-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-23 05:54:24', NULL),
('fcd39e8e-859b-11f1-b551-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-22 07:07:23', NULL),
('fcf78cc2-7ddb-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-12 10:25:22', NULL),
('fd2fd2a2-89c8-11f1-ad23-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8875', 1, NULL, 1, 0, 0, '2026-07-27 14:39:35', NULL),
('fd33aced-6adf-11f1-b9ca-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '::1', 'Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655', 1, NULL, 1, 0, 0, '2026-06-18 06:36:08', NULL),
('fd566e65-713a-11f1-a888-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-06-26 08:42:39', NULL),
('fda07d50-951e-11f1-a263-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-11 00:52:56', NULL),
('fdad7b55-7443-11f1-a369-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admins', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0', 1, NULL, 1, 0, 0, '2026-06-30 05:24:39', NULL),
('fe01aa35-7dcf-11f1-a5b1-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'node', 1, NULL, 1, 0, 0, '2026-07-12 08:59:29', NULL),
('fe68734c-84c1-11f1-b39b-0a002700000b', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'salesclerk', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 1, NULL, 1, 0, 0, '2026-07-21 05:06:55', NULL),
('fed74294-89ca-11f1-ad23-706871ff20d7', 'e92f19bf-89ca-11f1-ad23-706871ff20d7', 'manager_rbac_qa', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36', 1, NULL, 1, 0, 0, '2026-07-27 14:53:57', NULL),
('fefc4abd-964d-11f1-8c9f-706871ff20d7', '09632669-6a16-11f1-895a-0a002700000b', 'admin', '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0', 1, NULL, 1, 0, 0, '2026-08-12 13:01:55', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `lookup_values`
--

CREATE TABLE `lookup_values` (
  `lookup_id` char(36) NOT NULL DEFAULT uuid(),
  `lookup_type` varchar(80) NOT NULL,
  `lookup_code` varchar(120) NOT NULL,
  `lookup_label` varchar(150) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `lookup_values`
--

INSERT INTO `lookup_values` (`lookup_id`, `lookup_type`, `lookup_code`, `lookup_label`, `sort_order`, `is_active`, `created_at`) VALUES
('0f2040d3-6a16-11f1-895a-0a002700000b', 'purchase_order_status', 'pending', 'Pending', 1, 1, '2026-06-17 06:30:40'),
('0f207caf-6a16-11f1-895a-0a002700000b', 'purchase_order_status', 'approved_by_the_owner', 'Approved by the owner', 2, 1, '2026-06-17 06:30:40'),
('0f20c304-6a16-11f1-895a-0a002700000b', 'purchase_order_status', 'in_transit', 'In transit', 3, 1, '2026-06-17 06:30:40'),
('0f211597-6a16-11f1-895a-0a002700000b', 'purchase_order_status', 'arrived', 'Arrived', 4, 1, '2026-06-17 06:30:40'),
('0f217527-6a16-11f1-895a-0a002700000b', 'purchase_order_status', 'delivered', 'Delivered', 5, 1, '2026-06-17 06:30:40'),
('0f21d93f-6a16-11f1-895a-0a002700000b', 'purchase_order_status', 'return_damage', 'Return/Damage', 6, 0, '2026-06-17 06:30:40'),
('0f2231d6-6a16-11f1-895a-0a002700000b', 'purchase_order_status', 'cancelled', 'Cancelled', 7, 1, '2026-06-17 06:30:40'),
('0f22766a-6a16-11f1-895a-0a002700000b', 'payment_terms', 'cash', 'Cash', 1, 1, '2026-06-17 06:30:40'),
('0f22b062-6a16-11f1-895a-0a002700000b', 'payment_terms', 'gcash', 'GCash', 2, 1, '2026-06-17 06:30:40'),
('0f22d7db-6a16-11f1-895a-0a002700000b', 'payment_terms', 'bank_transfer', 'Bank Transfer', 3, 1, '2026-06-17 06:30:40'),
('0f230cd8-6a16-11f1-895a-0a002700000b', 'return_reason', 'expired', 'Expired', 1, 1, '2026-06-17 06:30:40'),
('0f23434d-6a16-11f1-895a-0a002700000b', 'return_reason', 'broken_package', 'Broken package', 2, 1, '2026-06-17 06:30:40'),
('0f23710c-6a16-11f1-895a-0a002700000b', 'return_reason', 'wrong_item_delivered', 'Wrong item delivered', 3, 1, '2026-06-17 06:30:40'),
('0f239f79-6a16-11f1-895a-0a002700000b', 'return_reason', 'incorrect_quantity', 'Incorrect quantity', 4, 1, '2026-06-17 06:30:40'),
('0f23d17b-6a16-11f1-895a-0a002700000b', 'return_reason', 'damaged_during_delivery', 'Damaged during delivery', 5, 1, '2026-06-17 06:30:40'),
('0f2401e6-6a16-11f1-895a-0a002700000b', 'return_reason', 'other', 'Other', 6, 1, '2026-06-17 06:30:40'),
('0f24575a-6a16-11f1-895a-0a002700000b', 'stock_status', 'available', 'Available', 1, 1, '2026-06-17 06:30:40'),
('0f24afb3-6a16-11f1-895a-0a002700000b', 'stock_status', 'low_stock', 'Low Stock', 2, 1, '2026-06-17 06:30:40'),
('0f24e7c6-6a16-11f1-895a-0a002700000b', 'stock_status', 'out_of_stock', 'Out of Stock', 3, 1, '2026-06-17 06:30:40'),
('0f252427-6a16-11f1-895a-0a002700000b', 'stock_status', 'expired', 'Expired', 4, 1, '2026-06-17 06:30:40'),
('2345d783-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'ampule', 'Ampule', 1, 1, '2026-08-03 15:00:57'),
('23466e19-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'blister_pack', 'Blister Pack', 2, 1, '2026-08-03 15:00:57'),
('2346dd7c-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'bottle', 'Bottle', 3, 1, '2026-08-03 15:00:57'),
('2347438b-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'box', 'Box', 4, 1, '2026-08-03 15:00:57'),
('2347acac-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'can', 'Can', 5, 1, '2026-08-03 15:00:57'),
('2347fac3-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'carton', 'Carton', 6, 1, '2026-08-03 15:00:57'),
('234867ea-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'jar', 'Jar', 7, 1, '2026-08-03 15:00:57'),
('2348ae65-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'pack', 'Pack', 8, 1, '2026-08-03 15:00:57'),
('23490486-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'plastic_pack', 'Plastic Pack', 9, 1, '2026-08-03 15:00:57'),
('23497b36-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'pouch', 'Pouch', 10, 1, '2026-08-03 15:00:57'),
('2349c942-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'roll', 'Roll', 11, 1, '2026-08-03 15:00:57'),
('234a2f06-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'sachet', 'Sachet', 12, 1, '2026-08-03 15:00:57'),
('234a8b37-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'strip', 'Strip', 13, 1, '2026-08-03 15:00:57'),
('234afbe7-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'tube', 'Tube', 14, 1, '2026-08-03 15:00:57'),
('234b4bf1-8f4c-11f1-b044-706871ff20d7', 'product_package_type', 'vial', 'Vial', 15, 1, '2026-08-03 15:00:57'),
('a8c46353-8f52-11f1-b044-706871ff20d7', 'product_package_type', 'tetra_pack', 'Tetra Pack', 14, 1, '2026-08-03 15:47:38');

-- --------------------------------------------------------

--
-- Table structure for table `medical_supply_details`
--

CREATE TABLE `medical_supply_details` (
  `medical_supply_detail_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `variant` varchar(100) DEFAULT NULL,
  `size` varchar(100) DEFAULT NULL,
  `material` varchar(100) DEFAULT NULL,
  `sterile_status` varchar(50) DEFAULT NULL,
  `package_type` varchar(100) DEFAULT NULL,
  `pack_content` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `medicine_details`
--

CREATE TABLE `medicine_details` (
  `medicine_detail_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL,
  `generic_name` varchar(150) DEFAULT NULL,
  `strength_value` decimal(10,2) DEFAULT NULL,
  `strength_unit` varchar(20) DEFAULT NULL,
  `strength` varchar(50) DEFAULT NULL,
  `dosage_form` varchar(100) DEFAULT NULL,
  `package_type` varchar(100) DEFAULT NULL,
  `net_content_value` decimal(10,2) DEFAULT NULL,
  `net_content_unit` varchar(20) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `medicine_details`
--

INSERT INTO `medicine_details` (`medicine_detail_id`, `product_id`, `generic_name`, `strength_value`, `strength_unit`, `strength`, `dosage_form`, `package_type`, `net_content_value`, `net_content_unit`, `created_at`) VALUES
('4a0d8149-a6e8-11f1-b4bd-706871ff20d7', '4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', 'Amlodipine (as besilate)', 10.00, 'mg', '10 mg', 'Tablet', 'Blister pack', NULL, NULL, '2026-09-02 16:06:38'),
('62b342ec-a6f3-11f1-b4bd-706871ff20d7', '62b2babe-a6f3-11f1-b4bd-706871ff20d7', 'Paracetamol', 500.00, 'mg', '500 mg', 'Tablet', 'Blister pack', NULL, NULL, '2026-09-02 17:26:04'),
('886d3f0d-a6f5-11f1-b4bd-706871ff20d7', '886cc540-a6f5-11f1-b4bd-706871ff20d7', 'Cetirizine Hydrochloride', 10.00, 'mg', '10 mg', 'Tablet', 'Blister pack', NULL, NULL, '2026-09-02 17:41:27'),
('b9bd970d-a6fb-11f1-b4bd-706871ff20d7', 'b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', 'Cetirizine Hydrochloride', 1.00, 'mg', '1 mg', 'Film-Coated Tablet', 'Box', NULL, NULL, '2026-09-02 18:25:46'),
('e6d4809a-a6dd-11f1-b4bd-706871ff20d7', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', 'Amoxicillin', 250.00, 'mg', '250.0000 mg / 5.0000 mL', 'Powder for Suspension', 'Bottle', 60.00, 'mL', '2026-09-02 14:52:17');

-- --------------------------------------------------------

--
-- Table structure for table `product`
--

CREATE TABLE `product` (
  `barcode` varchar(100) NOT NULL,
  `brand_name` varchar(100) NOT NULL,
  `product_name` varchar(150) NOT NULL,
  `product_image` varchar(255) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `pricing_method` varchar(30) NOT NULL DEFAULT 'manual',
  `custom_markup_percentage` decimal(7,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `product_id` char(36) NOT NULL DEFAULT uuid(),
  `category_id` char(36) DEFAULT NULL,
  `type_id` char(36) NOT NULL,
  `inventory_unit_id` char(36) NOT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'Active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product`
--

INSERT INTO `product` (`barcode`, `brand_name`, `product_name`, `product_image`, `price`, `pricing_method`, `custom_markup_percentage`, `created_at`, `product_id`, `category_id`, `type_id`, `inventory_unit_id`, `status`) VALUES
('AUTO-67403F1BEAC8', 'Norvasc', 'Norvasc', NULL, 30.00, 'manual', NULL, '2026-09-02 16:06:38', '4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '096f52fa-6a16-11f1-895a-0a002700000b', '097446e8-6a16-11f1-895a-0a002700000b', '09797bc5-6a16-11f1-895a-0a002700000b', 'Active'),
('AUTO-432F4A134CF1', 'Biogesic', 'Biogesic', NULL, 10.00, 'manual', NULL, '2026-09-02 17:26:04', '62b2babe-a6f3-11f1-b4bd-706871ff20d7', '096f52fa-6a16-11f1-895a-0a002700000b', '097446e8-6a16-11f1-895a-0a002700000b', 'b3b28956-9728-11f1-9fb5-706871ff20d7', 'Active'),
('AUTO-E2D0DAB71F50', 'Cetzy-10', 'Cetzy-10', NULL, 15.00, 'manual', NULL, '2026-09-02 17:41:27', '886cc540-a6f5-11f1-b4bd-706871ff20d7', '096f52fa-6a16-11f1-895a-0a002700000b', '097446e8-6a16-11f1-895a-0a002700000b', '09797f23-6a16-11f1-895a-0a002700000b', 'Active'),
('AUTO-95927A7A6F7B', 'Cetzy-10', 'Cetzy-10', NULL, 30.00, 'manual', NULL, '2026-09-02 18:25:46', 'b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', '096f52fa-6a16-11f1-895a-0a002700000b', 'b0d57bc5-a6f7-11f1-b4bd-706871ff20d7', '09797f23-6a16-11f1-895a-0a002700000b', 'Active'),
('AUTO-B71BAD841CC2', 'Moxylor', 'Moxylor', NULL, 150.00, 'manual', NULL, '2026-09-02 14:52:17', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', '096f52fa-6a16-11f1-895a-0a002700000b', '09744d4e-6a16-11f1-895a-0a002700000b', '5dac5a48-93e8-11f1-977a-706871ff20d7', 'Active');

-- --------------------------------------------------------

--
-- Table structure for table `product_categories`
--

CREATE TABLE `product_categories` (
  `category_name` varchar(50) NOT NULL,
  `default_markup_percentage` decimal(7,2) NOT NULL DEFAULT 0.00,
  `pricing_behavior` varchar(30) NOT NULL DEFAULT 'review_required',
  `category_id` char(36) NOT NULL DEFAULT uuid()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_categories`
--

INSERT INTO `product_categories` (`category_name`, `default_markup_percentage`, `pricing_behavior`, `category_id`) VALUES
('Medicine', 5.00, 'review_required', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Grocery', 15.00, 'review_required', '096f558e-6a16-11f1-895a-0a002700000b'),
('Medical Supplies', 15.00, 'automatic', '1a56c769-7139-11f1-a888-0a002700000b');

-- --------------------------------------------------------

--
-- Table structure for table `product_inventory`
--

CREATE TABLE `product_inventory` (
  `batch_number` varchar(50) NOT NULL,
  `quantity_stocked` int(11) NOT NULL,
  `quantity_remaining` int(11) NOT NULL,
  `expiration_date` date DEFAULT NULL,
  `status` enum('Available','Low Stock','Out of Stock','Expired') DEFAULT 'Available',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `expiry_date` date DEFAULT NULL,
  `expiry_alert_days` int(11) NOT NULL DEFAULT 30,
  `inventory_id` char(36) NOT NULL DEFAULT uuid(),
  `receiving_id` char(36) DEFAULT NULL,
  `product_id` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `product_measurement_units`
--

CREATE TABLE `product_measurement_units` (
  `unit_name` varchar(40) NOT NULL,
  `unit_symbol` varchar(20) DEFAULT NULL,
  `measurement_group` varchar(30) NOT NULL DEFAULT 'General Size',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `measurement_unit_id` char(36) NOT NULL DEFAULT uuid()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_measurement_units`
--

INSERT INTO `product_measurement_units` (`unit_name`, `unit_symbol`, `measurement_group`, `is_active`, `is_system`, `measurement_unit_id`) VALUES
('Microliter', 'µL', 'Volume', 1, 1, '0916741b-9663-11f1-a34f-706871ff20d7'),
('cL', 'cL', 'Volume', 1, 1, '0917ba60-9663-11f1-a34f-706871ff20d7'),
('dL', 'dL', 'Volume', 1, 1, '09188ff8-9663-11f1-a34f-706871ff20d7'),
('fl oz', 'fl oz', 'Volume', 1, 1, '0919afce-9663-11f1-a34f-706871ff20d7'),
('tsp', 'tsp', 'Volume', 1, 1, '091a88b0-9663-11f1-a34f-706871ff20d7'),
('tbsp', 'tbsp', 'Volume', 1, 1, '091b846e-9663-11f1-a34f-706871ff20d7'),
('cup', 'cup', 'Volume', 1, 1, '091c3b93-9663-11f1-a34f-706871ff20d7'),
('pt', 'pt', 'Volume', 1, 1, '091d1a43-9663-11f1-a34f-706871ff20d7'),
('qt', 'qt', 'Volume', 1, 1, '091e1d37-9663-11f1-a34f-706871ff20d7'),
('gal', 'gal', 'Volume', 1, 1, '091ed1e0-9663-11f1-a34f-706871ff20d7'),
('mcg', 'mcg', 'Weight', 1, 1, '091fcfd2-9663-11f1-a34f-706871ff20d7'),
('mg', 'mg', 'Weight', 1, 1, '097963a4-6a16-11f1-895a-0a002700000b'),
('g', 'g', 'Weight', 1, 1, '097976bb-6a16-11f1-895a-0a002700000b'),
('Pouch', 'kg', 'Legacy Archived', 0, 1, '0979780e-6a16-11f1-895a-0a002700000b'),
('mcg', 'mcg', 'Strength', 0, 1, '097978b6-6a16-11f1-895a-0a002700000b'),
('mL', 'mL', 'Volume', 1, 1, '09797925-6a16-11f1-895a-0a002700000b'),
('L', 'L', 'Volume', 1, 1, '09797994-6a16-11f1-895a-0a002700000b'),
('%', '%', 'Strength', 0, 1, '09797a08-6a16-11f1-895a-0a002700000b'),
('IU', 'IU', 'Strength', 0, 1, '09797a7c-6a16-11f1-895a-0a002700000b'),
('mg/mL', 'mg/mL', 'Strength', 0, 1, '09797aed-6a16-11f1-895a-0a002700000b'),
('mg/5mL', 'mg/5mL', 'Strength', 0, 1, '09797b58-6a16-11f1-895a-0a002700000b'),
('pcs', 'pcs', 'Count', 1, 1, '09797bc5-6a16-11f1-895a-0a002700000b'),
('pack', 'pack', 'Packaging', 1, 1, '09797c31-6a16-11f1-895a-0a002700000b'),
('box', 'box', 'Packaging', 1, 1, '09797ca0-6a16-11f1-895a-0a002700000b'),
('bottle', 'bottle', 'Packaging', 1, 1, '09797d0c-6a16-11f1-895a-0a002700000b'),
('sachet', 'sachet', 'Count', 1, 1, '09797d78-6a16-11f1-895a-0a002700000b'),
('can', 'can', 'Packaging', 1, 1, '09797de3-6a16-11f1-895a-0a002700000b'),
('oz', 'oz', 'Weight', 1, 1, '09797eb9-6a16-11f1-895a-0a002700000b'),
('tablet', 'tablet', 'Count', 1, 1, '09797f23-6a16-11f1-895a-0a002700000b'),
('capsule', 'capsule', 'Count', 1, 1, '09797f8e-6a16-11f1-895a-0a002700000b'),
('tube', 'tube', 'Packaging', 1, 1, '09797ffa-6a16-11f1-895a-0a002700000b'),
('cc', 'cc', 'Volume', 1, 1, '09798066-6a16-11f1-895a-0a002700000b'),
('lb', 'lb', 'Weight', 1, 1, '097980d1-6a16-11f1-895a-0a002700000b'),
('vial', 'vial', 'Packaging', 1, 1, '0979813e-6a16-11f1-895a-0a002700000b'),
('ampule', 'ampule', 'Packaging', 1, 1, '097981a7-6a16-11f1-895a-0a002700000b'),
('jar', 'jar', 'Packaging', 1, 1, '09798210-6a16-11f1-895a-0a002700000b'),
('roll', 'roll', 'Packaging', 1, 1, '0979827b-6a16-11f1-895a-0a002700000b'),
('strip', 'strip', 'Count', 1, 1, '097982eb-6a16-11f1-895a-0a002700000b'),
('blister pack', 'blister pack', 'Packaging', 1, 1, '09798354-6a16-11f1-895a-0a002700000b'),
('plastic pack', 'plastic pack', 'Packaging', 1, 1, '097983cd-6a16-11f1-895a-0a002700000b'),
('carton', 'carton', 'Packaging', 1, 1, '09798442-6a16-11f1-895a-0a002700000b'),
('pouch', 'pouch', 'Packaging', 1, 1, '097984bc-6a16-11f1-895a-0a002700000b'),
('Liters', 'L', 'Legacy Archived', 0, 1, '29fb0ba1-93e2-11f1-977a-706871ff20d7'),
('Bottle', 'bottle', 'Count', 1, 1, '5dac5a48-93e8-11f1-977a-706871ff20d7'),
('Box', 'box', 'Count', 1, 1, '5dad47f6-93e8-11f1-977a-706871ff20d7'),
('Can', 'can', 'Count', 1, 1, '5daded35-93e8-11f1-977a-706871ff20d7'),
('Carton', 'carton', 'Count', 1, 1, '5daebc8c-93e8-11f1-977a-706871ff20d7'),
('Jar', 'jar', 'Count', 1, 1, '5daf7355-93e8-11f1-977a-706871ff20d7'),
('Pack', 'pack', 'Count', 1, 1, '5db01427-93e8-11f1-977a-706871ff20d7'),
('Piece', 'piece', 'Count', 1, 1, '5db0e541-93e8-11f1-977a-706871ff20d7'),
('Pouch', 'pouch', 'Count', 1, 1, '5db1b039-93e8-11f1-977a-706871ff20d7'),
('Roll', 'roll', 'Count', 1, 1, '5db26cb6-93e8-11f1-977a-706871ff20d7'),
('Tube', 'tube', 'Count', 1, 1, '5db39ffa-93e8-11f1-977a-706871ff20d7'),
('Vial', 'vial', 'Count', 1, 1, '5db46162-93e8-11f1-977a-706871ff20d7'),
('Ampule', 'ampule', 'Count', 1, 1, '5db5035a-93e8-11f1-977a-706871ff20d7'),
('mL', 'mL', 'Legacy Archived', 0, 0, '67da3b20-9660-11f1-a34f-706871ff20d7'),
('mg', 'mg', 'Strength', 0, 1, '6a22daaa-8f4d-11f1-b044-706871ff20d7'),
('g', 'g', 'Strength', 0, 1, '6a23824b-8f4d-11f1-b044-706871ff20d7'),
('Each', 'each', 'Count', 1, 1, '6a8f1aa4-96f5-11f1-9fb5-706871ff20d7'),
('Bag', 'bag', 'Count', 1, 1, '6af38454-965d-11f1-a34f-706871ff20d7'),
('Bundle', 'bundle', 'Count', 1, 1, '6af54be5-965d-11f1-a34f-706871ff20d7'),
('Case', 'case', 'Count', 1, 1, '6af63cf3-965d-11f1-a34f-706871ff20d7'),
('Pc', 'pc', 'Count', 1, 1, '6af76568-965d-11f1-a34f-706871ff20d7'),
('Stab', 'stab', 'Count', 1, 1, '6af870fd-965d-11f1-a34f-706871ff20d7'),
('Tray', 'tray', 'Count', 1, 1, '6af94936-965d-11f1-a34f-706871ff20d7'),
('kg', 'kg', 'Weight', 1, 1, '71a9c0db-8fc8-11f1-91e4-706871ff20d7'),
('Blister pack', 'Blister pack', 'Count', 1, 0, 'b3b28956-9728-11f1-9fb5-706871ff20d7'),
('%', '%', 'General Size', 1, 1, 'cecaeebb-a9cd-11f1-a501-0a002700000b'),
('IU', 'IU', 'General Size', 1, 1, 'cecbeec9-a9cd-11f1-a501-0a002700000b'),
('mililiter', 'ml', 'Weight', 0, 0, 'df47dc88-96ef-11f1-ad98-706871ff20d7');

-- --------------------------------------------------------

--
-- Table structure for table `product_selling_options`
--

CREATE TABLE `product_selling_options` (
  `selling_option_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL,
  `unit_name` varchar(50) NOT NULL,
  `base_quantity` int(11) NOT NULL,
  `selling_price` decimal(10,2) NOT NULL,
  `pos_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

--
-- Dumping data for table `product_selling_options`
--

INSERT INTO `product_selling_options` (`selling_option_id`, `product_id`, `unit_name`, `base_quantity`, `selling_price`, `pos_enabled`, `is_active`, `is_default`, `created_at`, `updated_at`) VALUES
('4a0fadee-a6e8-11f1-b4bd-706871ff20d7', '4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', 'pcs', 1, 30.00, 1, 1, 1, '2026-09-02 16:06:39', '2026-09-02 16:06:39'),
('62b73368-a6f3-11f1-b4bd-706871ff20d7', '62b2babe-a6f3-11f1-b4bd-706871ff20d7', 'Blister pack', 1, 10.00, 1, 1, 1, '2026-09-02 17:26:04', '2026-09-02 17:26:04'),
('886fc444-a6f5-11f1-b4bd-706871ff20d7', '886cc540-a6f5-11f1-b4bd-706871ff20d7', 'tablet', 1, 15.00, 1, 1, 1, '2026-09-02 17:41:27', '2026-09-02 17:41:27'),
('b9bf972e-a6fb-11f1-b4bd-706871ff20d7', 'b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', 'tablet', 1, 30.00, 1, 1, 1, '2026-09-02 18:25:46', '2026-09-02 18:25:46'),
('e6d6d62b-a6dd-11f1-b4bd-706871ff20d7', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', 'bottle', 1, 150.00, 1, 1, 1, '2026-09-02 14:52:17', '2026-09-02 14:52:17');

-- --------------------------------------------------------

--
-- Table structure for table `product_selling_stock`
--

CREATE TABLE `product_selling_stock` (
  `batch_number` varchar(80) DEFAULT NULL,
  `quantity_stocked` int(11) NOT NULL DEFAULT 0,
  `quantity_remaining` int(11) NOT NULL DEFAULT 0,
  `expiration_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `selling_stock_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL,
  `source_inventory_id` char(36) DEFAULT NULL,
  `source_batch_id` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `product_specifications`
--

CREATE TABLE `product_specifications` (
  `specification_id` char(36) NOT NULL DEFAULT uuid(),
  `specification_name` varchar(80) NOT NULL,
  `field_style` varchar(30) NOT NULL,
  `measurement_group` varchar(30) DEFAULT NULL,
  `allow_custom_value` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_specifications`
--

INSERT INTO `product_specifications` (`specification_id`, `specification_name`, `field_style`, `measurement_group`, `allow_custom_value`, `created_at`) VALUES
('0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package Type', 'Selection List', NULL, 1, '2026-09-02 09:45:35'),
('234c91a5-8f4c-11f1-b044-706871ff20d7', 'Flavor', 'Selection List', NULL, 1, '2026-08-03 15:00:57'),
('234dfa52-8f4c-11f1-b044-706871ff20d7', 'Variant', 'Text Entry', NULL, 1, '2026-08-03 15:00:57'),
('234eed2b-8f4c-11f1-b044-706871ff20d7', 'Volume', 'Number with Unit', 'Volume', 1, '2026-08-03 15:00:57'),
('234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Weight', 'Number with Unit', 'Weight', 1, '2026-08-03 15:00:57'),
('234f9c49-8f4c-11f1-b044-706871ff20d7', 'Strength', 'Number with Unit', 'Weight', 1, '2026-08-03 15:00:57'),
('234fedfd-8f4c-11f1-b044-706871ff20d7', 'Tablet Count', 'Number with Unit', 'Count', 1, '2026-08-03 15:00:57'),
('23503f03-8f4c-11f1-b044-706871ff20d7', 'Pack Content', 'Number with Unit', 'Count', 1, '2026-08-03 15:00:57'),
('23512c2f-8f4c-11f1-b044-706871ff20d7', 'Size', 'Text Entry', NULL, 1, '2026-08-03 15:00:57'),
('2351796e-8f4c-11f1-b044-706871ff20d7', 'Model', 'Text Entry', NULL, 1, '2026-08-03 15:00:57'),
('2351d168-8f4c-11f1-b044-706871ff20d7', 'Material', 'Text Entry', NULL, 1, '2026-08-03 15:00:57'),
('235228b6-8f4c-11f1-b044-706871ff20d7', 'Sterile Status', 'Selection List', NULL, 0, '2026-08-03 15:00:57'),
('5dc16be3-93e8-11f1-977a-706871ff20d7', 'Inventory Unit', 'Selection List', NULL, 1, '2026-08-09 11:49:23'),
('7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'Medicine Classification', 'Selection List', NULL, 0, '2026-09-02 09:41:32'),
('9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', 'Strength Denominator', 'Number with Unit', 'Volume', 0, '2026-09-02 10:39:46'),
('a8c8d008-8f52-11f1-b044-706871ff20d7', 'Sugar Type', 'Selection List', NULL, 1, '2026-08-03 15:47:38'),
('b134459f-a6c8-11f1-b4bd-706871ff20d7', 'Strength Denominator Weight', 'Number with Unit', 'Weight', 0, '2026-09-02 12:20:32');

-- --------------------------------------------------------

--
-- Table structure for table `product_specification_choices`
--

CREATE TABLE `product_specification_choices` (
  `choice_id` char(36) NOT NULL DEFAULT uuid(),
  `specification_id` char(36) NOT NULL,
  `choice_value` varchar(120) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_specification_choices`
--

INSERT INTO `product_specification_choices` (`choice_id`, `specification_id`, `choice_value`, `sort_order`) VALUES
('234cd6e4-8f4c-11f1-b044-706871ff20d7', '234c91a5-8f4c-11f1-b044-706871ff20d7', 'Original', 1),
('234d15fb-8f4c-11f1-b044-706871ff20d7', '234c91a5-8f4c-11f1-b044-706871ff20d7', 'Orange', 2),
('234d53b8-8f4c-11f1-b044-706871ff20d7', '234c91a5-8f4c-11f1-b044-706871ff20d7', 'Lemon', 3),
('234d8ae1-8f4c-11f1-b044-706871ff20d7', '234c91a5-8f4c-11f1-b044-706871ff20d7', 'Grape', 4),
('23526b9a-8f4c-11f1-b044-706871ff20d7', '235228b6-8f4c-11f1-b044-706871ff20d7', 'Sterile', 1),
('2352bb58-8f4c-11f1-b044-706871ff20d7', '235228b6-8f4c-11f1-b044-706871ff20d7', 'Non-sterile', 2),
('5dc1fd91-93e8-11f1-977a-706871ff20d7', '5dc16be3-93e8-11f1-977a-706871ff20d7', 'Bottle', 1),
('5dc29d4f-93e8-11f1-977a-706871ff20d7', '5dc16be3-93e8-11f1-977a-706871ff20d7', 'Can', 2),
('5dc32ab2-93e8-11f1-977a-706871ff20d7', '5dc16be3-93e8-11f1-977a-706871ff20d7', 'Pack', 3),
('5dc3a9a0-93e8-11f1-977a-706871ff20d7', '5dc16be3-93e8-11f1-977a-706871ff20d7', 'Piece', 4),
('5dc4409b-93e8-11f1-977a-706871ff20d7', '5dc16be3-93e8-11f1-977a-706871ff20d7', 'Box', 5),
('5dc4c878-93e8-11f1-977a-706871ff20d7', '5dc16be3-93e8-11f1-977a-706871ff20d7', 'Sachet', 6),
('7b46a549-a6b2-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'Prescription (Rx)', 1),
('7b4723c0-a6b2-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'OTC', 2),
('a8c91304-8f52-11f1-b044-706871ff20d7', 'a8c8d008-8f52-11f1-b044-706871ff20d7', 'Regular', 1),
('a8c951f8-8f52-11f1-b044-706871ff20d7', 'a8c8d008-8f52-11f1-b044-706871ff20d7', 'Low Sugar', 2),
('a8c99362-8f52-11f1-b044-706871ff20d7', 'a8c8d008-8f52-11f1-b044-706871ff20d7', 'Sugar Free', 3);

-- --------------------------------------------------------

--
-- Table structure for table `product_specification_values`
--

CREATE TABLE `product_specification_values` (
  `product_id` char(36) NOT NULL,
  `specification_id` char(36) NOT NULL,
  `value_text` varchar(255) DEFAULT NULL,
  `value_number` decimal(14,4) DEFAULT NULL,
  `measurement_unit_id` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_specification_values`
--

INSERT INTO `product_specification_values` (`product_id`, `specification_id`, `value_text`, `value_number`, `measurement_unit_id`) VALUES
('4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Blister pack', NULL, 'b3b28956-9728-11f1-9fb5-706871ff20d7'),
('4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 10.0000, '097963a4-6a16-11f1-895a-0a002700000b'),
('4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 100.0000, '09797f23-6a16-11f1-895a-0a002700000b'),
('4a0c9be4-a6e8-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'Prescription (Rx)', NULL, NULL),
('62b2babe-a6f3-11f1-b4bd-706871ff20d7', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Blister pack', NULL, 'b3b28956-9728-11f1-9fb5-706871ff20d7'),
('62b2babe-a6f3-11f1-b4bd-706871ff20d7', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 500.0000, '097963a4-6a16-11f1-895a-0a002700000b'),
('62b2babe-a6f3-11f1-b4bd-706871ff20d7', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 10.0000, '09797f23-6a16-11f1-895a-0a002700000b'),
('62b2babe-a6f3-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'OTC', NULL, NULL),
('886cc540-a6f5-11f1-b4bd-706871ff20d7', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Blister pack', NULL, 'b3b28956-9728-11f1-9fb5-706871ff20d7'),
('886cc540-a6f5-11f1-b4bd-706871ff20d7', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 10.0000, '097963a4-6a16-11f1-895a-0a002700000b'),
('886cc540-a6f5-11f1-b4bd-706871ff20d7', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 10.0000, '09797f23-6a16-11f1-895a-0a002700000b'),
('886cc540-a6f5-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'OTC', NULL, NULL),
('b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Box', NULL, '5dad47f6-93e8-11f1-977a-706871ff20d7'),
('b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 1.0000, '097963a4-6a16-11f1-895a-0a002700000b'),
('b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 10.0000, '09797f23-6a16-11f1-895a-0a002700000b'),
('b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'Prescription (Rx)', NULL, NULL),
('e6d43886-a6dd-11f1-b4bd-706871ff20d7', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Bottle', NULL, '5dac5a48-93e8-11f1-977a-706871ff20d7'),
('e6d43886-a6dd-11f1-b4bd-706871ff20d7', '234c91a5-8f4c-11f1-b044-706871ff20d7', 'Strawberry', NULL, NULL),
('e6d43886-a6dd-11f1-b4bd-706871ff20d7', '234eed2b-8f4c-11f1-b044-706871ff20d7', NULL, 60.0000, '09797925-6a16-11f1-895a-0a002700000b'),
('e6d43886-a6dd-11f1-b4bd-706871ff20d7', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 250.0000, '097963a4-6a16-11f1-895a-0a002700000b'),
('e6d43886-a6dd-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'Prescription (Rx)', NULL, NULL),
('e6d43886-a6dd-11f1-b4bd-706871ff20d7', '9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', NULL, 5.0000, '09797925-6a16-11f1-895a-0a002700000b');

-- --------------------------------------------------------

--
-- Table structure for table `product_types`
--

CREATE TABLE `product_types` (
  `type_name` varchar(80) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `type_id` char(36) NOT NULL DEFAULT uuid(),
  `category_id` char(36) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_types`
--

INSERT INTO `product_types` (`type_name`, `is_active`, `type_id`, `category_id`) VALUES
('Powder Drink', 1, '0974461b-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Tablet', 1, '097446e8-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Capsule', 1, '0974475f-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Syrup', 1, '097447ce-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Suspension', 1, '0974483e-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Drops', 1, '097448ab-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Ointment', 1, '09744918-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Cream', 1, '09744983-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Gel', 1, '097449ee-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Lotion', 1, '09744a6d-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Solution', 1, '09744ad7-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Injection', 1, '09744b40-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Nebulizer', 1, '09744c13-6a16-11f1-895a-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Suppository', 1, '09744c7e-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Patch', 1, '09744ce6-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Powder for Suspension', 1, '09744d4e-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Vitamins/Supplements', 1, '09744db8-6a16-11f1-895a-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Medical Supply', 1, '09744e9f-6a16-11f1-895a-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Personal Protective Equipment', 1, '09744f0c-6a16-11f1-895a-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Device/Equipment', 1, '09744f7e-6a16-11f1-895a-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Canned Goods', 1, '09744fea-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Beverage', 1, '09745054-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Snacks', 1, '097450bc-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Biscuits', 1, '09745125-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Noodles', 1, '0974518f-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Condiments', 1, '097451f6-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Dairy', 1, '0974525e-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Bread/Bakery', 1, '097452c9-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Personal Care', 1, '09745332-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Hygiene Product', 1, '097453a1-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Baby Care', 1, '09745410-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Household Item', 1, '0974547b-6a16-11f1-895a-0a002700000b', '096f558e-6a16-11f1-895a-0a002700000b'),
('Face Mask', 1, '1a5daad9-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Gloves', 1, '1a616e7c-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Syringe', 1, '1a65957f-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Bandage', 1, '1a6b3d85-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Cotton', 1, '1a6f313f-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Sanitizer', 1, '1a73d96b-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Thermometer', 1, '1a790ae5-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('First Aid Supply', 1, '1a7d1fae-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Wound Care', 1, '1a80b83f-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Medical Tape', 1, '1a84af10-7139-11f1-a888-0a002700000b', '1a56c769-7139-11f1-a888-0a002700000b'),
('Inhaler', 1, 'a3e5c102-a8f1-11f1-8c79-0a002700000b', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Film-Coated Tablet', 1, 'b0d57bc5-a6f7-11f1-b4bd-706871ff20d7', '096f52fa-6a16-11f1-895a-0a002700000b'),
('Powder', 1, 'fa990517-a6b8-11f1-b4bd-706871ff20d7', '096f52fa-6a16-11f1-895a-0a002700000b');

-- --------------------------------------------------------

--
-- Table structure for table `product_type_specifications`
--

CREATE TABLE `product_type_specifications` (
  `type_id` char(36) NOT NULL,
  `specification_id` char(36) NOT NULL,
  `display_label` varchar(80) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `product_type_specifications`
--

INSERT INTO `product_type_specifications` (`type_id`, `specification_id`, `display_label`, `sort_order`) VALUES
('0974461b-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('0974461b-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('0974461b-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('0974461b-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('097446e8-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('097446e8-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('097446e8-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('097446e8-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('0974475f-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('0974475f-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('0974475f-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('097447ce-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('097447ce-6a16-11f1-895a-0a002700000b', '234eed2b-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('097447ce-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('097447ce-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('097447ce-6a16-11f1-895a-0a002700000b', '9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', NULL, 3),
('0974483e-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('0974483e-6a16-11f1-895a-0a002700000b', '234eed2b-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('0974483e-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('0974483e-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('0974483e-6a16-11f1-895a-0a002700000b', '9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', NULL, 3),
('097448ab-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('097448ab-6a16-11f1-895a-0a002700000b', '234eed2b-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('097448ab-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('097448ab-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('097448ab-6a16-11f1-895a-0a002700000b', '9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', NULL, 3),
('09744918-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('09744918-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('09744918-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744918-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744918-6a16-11f1-895a-0a002700000b', 'b134459f-a6c8-11f1-b4bd-706871ff20d7', NULL, 3),
('09744983-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('09744983-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('09744983-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744983-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744983-6a16-11f1-895a-0a002700000b', 'b134459f-a6c8-11f1-b4bd-706871ff20d7', NULL, 3),
('097449ee-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('097449ee-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('097449ee-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('097449ee-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('097449ee-6a16-11f1-895a-0a002700000b', 'b134459f-a6c8-11f1-b4bd-706871ff20d7', NULL, 3),
('09744a6d-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('09744a6d-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('09744a6d-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744a6d-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744a6d-6a16-11f1-895a-0a002700000b', 'b134459f-a6c8-11f1-b4bd-706871ff20d7', NULL, 3),
('09744ad7-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('09744ad7-6a16-11f1-895a-0a002700000b', '234eed2b-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('09744ad7-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744ad7-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744ad7-6a16-11f1-895a-0a002700000b', '9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', NULL, 3),
('09744b40-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 5),
('09744b40-6a16-11f1-895a-0a002700000b', '234eed2b-8f4c-11f1-b044-706871ff20d7', 'Net Content', 4),
('09744b40-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744b40-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744b40-6a16-11f1-895a-0a002700000b', '9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', NULL, 3),
('09744c13-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('09744c13-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09744c13-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('09744c13-6a16-11f1-895a-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744c13-6a16-11f1-895a-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('09744c13-6a16-11f1-895a-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('09744c7e-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09744c7e-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744c7e-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744ce6-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09744ce6-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744ce6-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744d4e-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 4),
('09744d4e-6a16-11f1-895a-0a002700000b', '234c91a5-8f4c-11f1-b044-706871ff20d7', NULL, 5),
('09744d4e-6a16-11f1-895a-0a002700000b', '234eed2b-8f4c-11f1-b044-706871ff20d7', 'Net Content', 3),
('09744d4e-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744d4e-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744d4e-6a16-11f1-895a-0a002700000b', '9dbcccd5-a6ba-11f1-b4bd-706871ff20d7', NULL, 6),
('09744db8-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09744db8-6a16-11f1-895a-0a002700000b', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744db8-6a16-11f1-895a-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1),
('09744e9f-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('09744e9f-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09744e9f-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('09744e9f-6a16-11f1-895a-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744e9f-6a16-11f1-895a-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('09744e9f-6a16-11f1-895a-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('09744f0c-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('09744f0c-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09744f0c-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('09744f0c-6a16-11f1-895a-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744f0c-6a16-11f1-895a-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('09744f0c-6a16-11f1-895a-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('09744f7e-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 4),
('09744f7e-6a16-11f1-895a-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09744f7e-6a16-11f1-895a-0a002700000b', '2351796e-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09744f7e-6a16-11f1-895a-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('09744fea-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09744fea-6a16-11f1-895a-0a002700000b', '234c91a5-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09744fea-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('09744fea-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('09745054-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09745054-6a16-11f1-895a-0a002700000b', '234c91a5-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09745054-6a16-11f1-895a-0a002700000b', '234eed2b-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('09745054-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('097450bc-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('097450bc-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('097450bc-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('097450bc-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('09745125-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09745125-6a16-11f1-895a-0a002700000b', '234c91a5-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09745125-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('09745125-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('0974518f-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('0974518f-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('0974518f-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('0974518f-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('097451f6-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('097451f6-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('097451f6-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('097451f6-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('0974525e-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('0974525e-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('0974525e-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('0974525e-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('097452c9-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('097452c9-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('097452c9-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('097452c9-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('09745332-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09745332-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09745332-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('09745332-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('097453a1-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('097453a1-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('097453a1-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('097453a1-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('09745410-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('09745410-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('09745410-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('09745410-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('0974547b-6a16-11f1-895a-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('0974547b-6a16-11f1-895a-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('0974547b-6a16-11f1-895a-0a002700000b', '234f4b8f-8f4c-11f1-b044-706871ff20d7', 'Net Content', 2),
('0974547b-6a16-11f1-895a-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a5daad9-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a5daad9-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a5daad9-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a5daad9-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a5daad9-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a5daad9-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a616e7c-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a616e7c-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a616e7c-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a616e7c-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a616e7c-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a616e7c-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a65957f-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a65957f-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a65957f-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a65957f-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a65957f-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a65957f-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a6b3d85-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a6b3d85-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a6b3d85-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a6b3d85-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a6b3d85-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a6b3d85-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a6f313f-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a6f313f-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a6f313f-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a6f313f-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a6f313f-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a6f313f-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a73d96b-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a73d96b-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a73d96b-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a73d96b-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a73d96b-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a73d96b-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a790ae5-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a790ae5-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a790ae5-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a790ae5-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a790ae5-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a790ae5-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a7d1fae-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 4),
('1a7d1fae-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a7d1fae-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 3),
('1a7d1fae-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a80b83f-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a80b83f-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a80b83f-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a80b83f-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a80b83f-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a80b83f-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('1a84af10-7139-11f1-a888-0a002700000b', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 6),
('1a84af10-7139-11f1-a888-0a002700000b', '234dfa52-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('1a84af10-7139-11f1-a888-0a002700000b', '23503f03-8f4c-11f1-b044-706871ff20d7', 'Quantity per Package', 5),
('1a84af10-7139-11f1-a888-0a002700000b', '23512c2f-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('1a84af10-7139-11f1-a888-0a002700000b', '2351d168-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('1a84af10-7139-11f1-a888-0a002700000b', '235228b6-8f4c-11f1-b044-706871ff20d7', NULL, 4),
('a3e5c102-a8f1-11f1-8c79-0a002700000b', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', 'Medicine Classification', 0),
('b0d57bc5-a6f7-11f1-b4bd-706871ff20d7', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 2),
('b0d57bc5-a6f7-11f1-b4bd-706871ff20d7', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 1),
('b0d57bc5-a6f7-11f1-b4bd-706871ff20d7', '23503f03-8f4c-11f1-b044-706871ff20d7', NULL, 3),
('b0d57bc5-a6f7-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 0),
('fa990517-a6b8-11f1-b4bd-706871ff20d7', '0c167ee5-a6b3-11f1-b4bd-706871ff20d7', 'Package / Container', 3),
('fa990517-a6b8-11f1-b4bd-706871ff20d7', '234f9c49-8f4c-11f1-b044-706871ff20d7', NULL, 2),
('fa990517-a6b8-11f1-b4bd-706871ff20d7', '7b4620d9-a6b2-11f1-b4bd-706871ff20d7', NULL, 1);

-- --------------------------------------------------------

--
-- Table structure for table `product_variations_backup`
--

CREATE TABLE `product_variations_backup` (
  `variant_name` varchar(150) DEFAULT NULL,
  `strength_value` varchar(50) DEFAULT NULL,
  `strength_unit` varchar(20) DEFAULT NULL,
  `volume_value` varchar(50) DEFAULT NULL,
  `volume_unit` varchar(20) DEFAULT NULL,
  `size_value` varchar(100) DEFAULT NULL,
  `size_unit` varchar(40) DEFAULT NULL,
  `weight_value` varchar(50) DEFAULT NULL,
  `weight_unit` varchar(20) DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `packaging` varchar(100) DEFAULT NULL,
  `pack_content_qty` int(11) DEFAULT NULL,
  `pack_content_unit` varchar(50) DEFAULT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `barcode` varchar(100) DEFAULT NULL,
  `sku` varchar(100) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `stock` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `variation_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `purchase_orders`
--

CREATE TABLE `purchase_orders` (
  `po_number` varchar(50) NOT NULL,
  `payment_terms` varchar(40) DEFAULT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `final_payment` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(40) NOT NULL DEFAULT 'Draft',
  `approval_status` enum('Pending','Approved','Revision Requested','Rejected') NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `payment_status` varchar(40) NOT NULL DEFAULT 'Unpaid',
  `total_amount` decimal(12,2) DEFAULT NULL,
  `po_id` char(36) NOT NULL DEFAULT uuid(),
  `pr_id` char(36) DEFAULT NULL,
  `supplier_id` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `purchase_orders`
--

INSERT INTO `purchase_orders` (`po_number`, `payment_terms`, `expected_delivery_date`, `final_payment`, `status`, `approval_status`, `created_at`, `payment_status`, `total_amount`, `po_id`, `pr_id`, `supplier_id`) VALUES
('PO-20260905-165900-CF8A89', 'Cash', '2026-09-06', 0.00, 'Arrived', 'Approved', '2026-09-05 14:59:00', 'Paid', NULL, '54d6724e-a93a-11f1-9f59-0a002700000b', '42daf1d0-a938-11f1-9f59-0a002700000b', 'f7e5ad94-8fb0-11f1-91e4-706871ff20d7');

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_approval_audit`
--

CREATE TABLE `purchase_order_approval_audit` (
  `audit_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `previous_approval_status` varchar(40) NOT NULL,
  `new_approval_status` varchar(40) NOT NULL,
  `action` varchar(40) NOT NULL,
  `reason` text DEFAULT NULL,
  `user_id` char(36) DEFAULT NULL,
  `user_name` varchar(160) DEFAULT NULL,
  `user_role` varchar(80) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_invoices`
--

CREATE TABLE `purchase_order_invoices` (
  `invoice_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `invoice_number` varchar(100) NOT NULL,
  `invoice_date` date NOT NULL,
  `discount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `other_charges` decimal(12,2) NOT NULL DEFAULT 0.00,
  `supplier_invoice_total` decimal(12,2) NOT NULL,
  `recorded_by` char(36) DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `purchase_order_invoices`
--

INSERT INTO `purchase_order_invoices` (`invoice_id`, `po_id`, `invoice_number`, `invoice_date`, `discount`, `other_charges`, `supplier_invoice_total`, `recorded_by`, `recorded_at`, `updated_at`) VALUES
('a6ec0e7f-a93e-11f1-9f59-0a002700000b', '54d6724e-a93a-11f1-9f59-0a002700000b', '12345678', '2026-09-05', 0.00, 0.00, 2500.00, '09632669-6a16-11f1-895a-0a002700000b', '2026-09-05 15:29:56', '2026-09-05 15:29:56');

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_invoice_items`
--

CREATE TABLE `purchase_order_invoice_items` (
  `invoice_item_id` char(36) NOT NULL DEFAULT uuid(),
  `invoice_id` char(36) NOT NULL,
  `po_item_id` char(36) NOT NULL,
  `invoice_qty` decimal(12,4) NOT NULL,
  `unit_cost` decimal(12,4) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `purchase_order_invoice_items`
--

INSERT INTO `purchase_order_invoice_items` (`invoice_item_id`, `invoice_id`, `po_item_id`, `invoice_qty`, `unit_cost`) VALUES
('a6edb90a-a93e-11f1-9f59-0a002700000b', 'a6ec0e7f-a93e-11f1-9f59-0a002700000b', '54d6fd9a-a93a-11f1-9f59-0a002700000b', 5.0000, 500.0000);

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_items`
--

CREATE TABLE `purchase_order_items` (
  `quantity` int(11) NOT NULL,
  `purchase_qty` int(11) NOT NULL DEFAULT 1,
  `purchase_unit_snapshot` varchar(50) DEFAULT NULL,
  `units_per_purchase_unit_snapshot` int(11) NOT NULL DEFAULT 1,
  `inventory_qty_ordered` int(11) NOT NULL DEFAULT 0,
  `product_name_snapshot` varchar(150) DEFAULT NULL,
  `brand_name_snapshot` varchar(150) DEFAULT NULL,
  `category_name_snapshot` varchar(100) DEFAULT NULL,
  `type_name_snapshot` varchar(100) DEFAULT NULL,
  `generic_name_snapshot` varchar(150) DEFAULT NULL,
  `variant_flavor_snapshot` varchar(100) DEFAULT NULL,
  `strength_snapshot` varchar(100) DEFAULT NULL,
  `size_value_snapshot` varchar(100) DEFAULT NULL,
  `unit_snapshot` varchar(100) DEFAULT NULL,
  `packaging_snapshot` varchar(100) DEFAULT NULL,
  `unit_price_snapshot` decimal(12,4) DEFAULT NULL,
  `line_total` decimal(10,2) DEFAULT NULL,
  `po_item_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `pr_item_id` char(36) DEFAULT NULL,
  `product_id` char(36) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `purchase_order_items`
--

INSERT INTO `purchase_order_items` (`quantity`, `purchase_qty`, `purchase_unit_snapshot`, `units_per_purchase_unit_snapshot`, `inventory_qty_ordered`, `product_name_snapshot`, `brand_name_snapshot`, `category_name_snapshot`, `type_name_snapshot`, `generic_name_snapshot`, `variant_flavor_snapshot`, `strength_snapshot`, `size_value_snapshot`, `unit_snapshot`, `packaging_snapshot`, `unit_price_snapshot`, `line_total`, `po_item_id`, `po_id`, `pr_item_id`, `product_id`) VALUES
(500, 5, 'box', 100, 500, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'tablet', NULL, NULL, NULL, '54d6fd9a-a93a-11f1-9f59-0a002700000b', '54d6724e-a93a-11f1-9f59-0a002700000b', '42de981b-a938-11f1-9f59-0a002700000b', 'b9bd0e07-a6fb-11f1-b4bd-706871ff20d7');

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_payments`
--

CREATE TABLE `purchase_order_payments` (
  `payment_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` varchar(40) NOT NULL,
  `payment_type` varchar(40) DEFAULT NULL,
  `payment_date` date NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `recorded_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `payment_request_key` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `purchase_order_payments`
--

INSERT INTO `purchase_order_payments` (`payment_id`, `po_id`, `amount`, `payment_method`, `payment_type`, `payment_date`, `reference_number`, `remarks`, `recorded_by`, `created_at`, `payment_request_key`) VALUES
('69e1d15d-a9cd-11f1-a501-0a002700000b', '54d6724e-a93a-11f1-9f59-0a002700000b', 2500.00, 'cash', 'Advance Payment', '2026-09-06', NULL, NULL, '09632669-6a16-11f1-895a-0a002700000b', '2026-09-06 08:31:53', '803a9b4b-4b4a-46ee-8ddd-47114148618b');

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_receiving`
--

CREATE TABLE `purchase_order_receiving` (
  `received_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `remarks` text DEFAULT NULL,
  `inspection_status` varchar(40) NOT NULL DEFAULT 'Awaiting Inspection',
  `inspected_by` char(36) DEFAULT NULL,
  `delivered_by_name` varchar(150) DEFAULT NULL,
  `delivery_receipt_no` varchar(100) DEFAULT NULL,
  `receiving_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `receiving_type` varchar(30) NOT NULL DEFAULT 'Original',
  `parent_receiving_id` char(36) DEFAULT NULL,
  `claim_id` char(36) DEFAULT NULL,
  `receiving_request_key` varchar(100) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_receiving_items`
--

CREATE TABLE `purchase_order_receiving_items` (
  `received_quantity` int(11) NOT NULL DEFAULT 0,
  `accepted_quantity` int(11) NOT NULL DEFAULT 0,
  `damaged_quantity` int(11) NOT NULL DEFAULT 0,
  `missing_quantity` int(11) NOT NULL DEFAULT 0,
  `receiving_item_id` char(36) NOT NULL DEFAULT uuid(),
  `receiving_id` char(36) NOT NULL,
  `po_item_id` char(36) NOT NULL,
  `parent_receiving_item_id` char(36) DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Stand-in structure for view `purchase_order_receiving_item_summary`
-- (See below for the actual view)
--
CREATE TABLE `purchase_order_receiving_item_summary` (
`receiving_item_id` char(36)
,`receiving_id` char(36)
,`po_item_id` char(36)
,`parent_receiving_item_id` char(36)
,`received_quantity` int(11)
,`accepted_quantity` int(11)
,`damaged_quantity` int(11)
,`action_quantity` bigint(12)
);

-- --------------------------------------------------------

--
-- Table structure for table `purchase_order_receiving_revisions`
--

CREATE TABLE `purchase_order_receiving_revisions` (
  `revision_id` char(36) NOT NULL DEFAULT uuid(),
  `receiving_id` char(36) NOT NULL,
  `edited_by` char(36) DEFAULT NULL,
  `edited_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `edit_reason` varchar(500) NOT NULL,
  `before_data` longtext NOT NULL,
  `after_data` longtext NOT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `purchase_requests`
--

CREATE TABLE `purchase_requests` (
  `pr_id` char(36) NOT NULL DEFAULT uuid(),
  `pr_number` varchar(40) NOT NULL,
  `requested_by` char(36) NOT NULL,
  `request_date` date NOT NULL,
  `status` enum('Draft','Pending Supervisor Approval','Approved','Revision Requested','Rejected') NOT NULL DEFAULT 'Draft',
  `supervisor_user_id` char(36) DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `purchase_requests`
--

INSERT INTO `purchase_requests` (`pr_id`, `pr_number`, `requested_by`, `request_date`, `status`, `supervisor_user_id`, `submitted_at`, `decided_at`, `created_at`, `updated_at`) VALUES
('42daf1d0-a938-11f1-9f59-0a002700000b', 'PR-20260905-164411-7D8F', '09632669-6a16-11f1-895a-0a002700000b', '2026-09-05', 'Approved', 'a1f91cde-9238-11f1-a711-706871ff20d7', '2026-09-05 07:44:11', '2026-09-05 07:56:58', '2026-09-05 14:44:11', '2026-09-05 14:56:58');

-- --------------------------------------------------------

--
-- Table structure for table `purchase_request_items`
--

CREATE TABLE `purchase_request_items` (
  `pr_item_id` char(36) NOT NULL DEFAULT uuid(),
  `pr_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `stock_qty_at_request` decimal(12,2) NOT NULL DEFAULT 0.00,
  `requested_qty` decimal(12,2) NOT NULL,
  `approved_qty` decimal(12,2) DEFAULT NULL,
  `unit_label_at_request` varchar(80) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `purchase_request_items`
--

INSERT INTO `purchase_request_items` (`pr_item_id`, `pr_id`, `product_id`, `stock_qty_at_request`, `requested_qty`, `approved_qty`, `unit_label_at_request`, `created_at`) VALUES
('42de981b-a938-11f1-9f59-0a002700000b', '42daf1d0-a938-11f1-9f59-0a002700000b', 'b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', 0.00, 5.00, 5.00, 'box', '2026-09-05 14:44:11');

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `role_id` char(36) NOT NULL DEFAULT uuid(),
  `role_identifier` varchar(50) NOT NULL,
  `name` varchar(80) NOT NULL,
  `description` text DEFAULT NULL,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `roles`
--

INSERT INTO `roles` (`role_id`, `role_identifier`, `name`, `description`, `is_system`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('1d5f879c-9234-11f1-a711-706871ff20d7', 'ro-supervisor', 'Supervisor', 'Reviews purchase requests and monitors inventory, expiry, and reports.', 1, 1, 0, 0, '2026-08-07 07:46:35', NULL),
('c979a660-6adf-11f1-b9ca-0a002700000b', 'ro-admin', 'Admin', 'Full pharmacy administration access.', 1, 1, 0, 0, '2026-06-18 06:34:41', NULL),
('c97a7dbc-6adf-11f1-b9ca-0a002700000b', 'ro-sales-clerk', 'Sales Clerk', 'Sales clerk pharmacy counter access.', 1, 1, 0, 0, '2026-06-18 06:34:41', NULL),
('c97b7932-6adf-11f1-b9ca-0a002700000b', 'ro-cashier', 'Cashier', 'Cashier point-of-sale access.', 1, 1, 0, 0, '2026-06-18 06:34:41', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `sales_orders`
--

CREATE TABLE `sales_orders` (
  `order_id` int(11) NOT NULL,
  `order_no` varchar(50) NOT NULL,
  `customer_name` varchar(150) DEFAULT NULL,
  `sales_clerk_id` char(36) NOT NULL,
  `assigned_cashier_id` char(36) DEFAULT NULL,
  `status` enum('draft','waiting_cashier','accepted_by_cashier','processing_payment','completed','cancelled','rejected') NOT NULL DEFAULT 'draft',
  `subtotal` decimal(10,2) NOT NULL DEFAULT 0.00,
  `discount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `vat` decimal(10,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cash_received` decimal(10,2) NOT NULL DEFAULT 0.00,
  `change_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cancellation_reason` varchar(255) DEFAULT NULL,
  `cancelled_by` char(36) DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  `sent_to_cashier_at` datetime DEFAULT NULL,
  `cashier_accepted_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sales_orders`
--

INSERT INTO `sales_orders` (`order_id`, `order_no`, `customer_name`, `sales_clerk_id`, `assigned_cashier_id`, `status`, `subtotal`, `discount`, `vat`, `total_amount`, `cash_received`, `change_amount`, `cancellation_reason`, `cancelled_by`, `cancelled_at`, `sent_to_cashier_at`, `cashier_accepted_at`, `completed_at`, `created_at`, `updated_at`) VALUES
(63, 'SO-0818-0001', NULL, 'e61815fe-7781-11f1-ae3b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'completed', 250.00, 0.00, 26.79, 250.00, 1000.00, 750.00, NULL, NULL, NULL, '2026-08-17 23:57:30', '2026-08-17 23:57:44', '2026-08-17 23:58:49', '2026-08-17 23:57:30', '2026-08-17 23:58:49'),
(64, 'SO-0818-0002', NULL, 'e61815fe-7781-11f1-ae3b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 'completed', 45.00, 0.00, 4.82, 45.00, 50.00, 5.00, NULL, NULL, NULL, '2026-08-17 23:59:47', '2026-08-17 23:59:56', '2026-08-18 00:00:09', '2026-08-17 23:59:47', '2026-08-18 00:00:09'),
(65, 'SO-0818-0003', NULL, '09632669-6a16-11f1-895a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'accepted_by_cashier', 25.00, 0.00, 2.68, 25.00, 0.00, 0.00, NULL, NULL, NULL, '2026-08-18 06:09:00', '2026-08-20 09:42:49', NULL, '2026-08-18 06:08:59', '2026-08-20 09:42:49'),
(66, 'SO-0818-0004', NULL, '09632669-6a16-11f1-895a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'accepted_by_cashier', 5.00, 0.00, 0.54, 5.00, 0.00, 0.00, NULL, NULL, NULL, '2026-08-18 06:09:51', '2026-08-20 06:47:14', NULL, '2026-08-18 06:09:51', '2026-08-20 06:47:14'),
(73, 'SO-0827-0001', NULL, '09632669-6a16-11f1-895a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 'completed', 10.00, 0.00, 1.07, 10.00, 50.00, 40.00, NULL, NULL, NULL, '2026-08-27 01:41:24', '2026-08-27 01:41:31', '2026-08-27 09:36:12', '2026-08-27 01:41:24', '2026-08-27 09:36:12');

-- --------------------------------------------------------

--
-- Table structure for table `sales_order_items`
--

CREATE TABLE `sales_order_items` (
  `order_item_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `product_id` char(36) NOT NULL,
  `product_name` varchar(150) NOT NULL,
  `brand_name` varchar(150) DEFAULT NULL,
  `specification` varchar(255) DEFAULT NULL,
  `selected_quantity` int(11) DEFAULT NULL,
  `selected_unit` varchar(50) DEFAULT NULL,
  `unit_base_quantity` int(11) NOT NULL DEFAULT 1,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(10,2) NOT NULL,
  `line_total` decimal(10,2) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sales_order_items`
--

INSERT INTO `sales_order_items` (`order_item_id`, `order_id`, `product_id`, `product_name`, `brand_name`, `specification`, `selected_quantity`, `selected_unit`, `unit_base_quantity`, `quantity`, `unit_price`, `line_total`, `created_at`) VALUES
(115, 63, '2b1bf56f-96f6-11f1-9fb5-706871ff20d7', 'Biogesic for Kids', 'Biogesic', 'Paracetamol • 120 mg/5mL • Suspension • 60 mL • Bottle', 2, 'bottle', 1, 2, 115.00, 230.00, '2026-08-17 23:57:30'),
(116, 63, '2b1bff6c-96f6-11f1-9fb5-706871ff20d7', 'AA Batteries 2-Pack', 'Eveready', '', 1, 'pack', 1, 1, 20.00, 20.00, '2026-08-17 23:57:30'),
(119, 64, '2b1bff6c-96f6-11f1-9fb5-706871ff20d7', 'AA Batteries 2-Pack', 'Eveready', '', 2, 'pack', 1, 2, 20.00, 40.00, '2026-08-17 23:59:47'),
(120, 64, '2b1be895-96f6-11f1-9fb5-706871ff20d7', 'Disposable Face Mask 50 pcs Box', 'Indoplas', '3-Ply • Adult • Non-woven polypropylene • Non-sterile • Box • 50 Pieces', 1, 'box', 1, 1, 5.00, 5.00, '2026-08-17 23:59:47'),
(123, 65, '2b1bff6c-96f6-11f1-9fb5-706871ff20d7', 'AA Batteries 2-Pack', 'Eveready', '', 1, 'Blister pack', 1, 1, 20.00, 20.00, '2026-08-18 06:09:00'),
(124, 65, '2b1be895-96f6-11f1-9fb5-706871ff20d7', 'Disposable Face Mask 50 pcs Box', 'Indoplas', '3-Ply • Adult • Non-woven polypropylene • Non-sterile • Box • 50 Pieces', 1, 'pcs', 1, 1, 5.00, 5.00, '2026-08-18 06:09:00'),
(126, 66, '2b1be895-96f6-11f1-9fb5-706871ff20d7', 'Disposable Face Mask 50 pcs Box', 'Indoplas', '3-Ply • Adult • Non-woven polypropylene • Non-sterile • Box • 50 Pieces', 1, 'pcs', 1, 1, 5.00, 5.00, '2026-08-18 06:09:51'),
(134, 73, '2b1be895-96f6-11f1-9fb5-706871ff20d7', 'Disposable Face Mask 50 pcs Box', 'Indoplas', '3-Ply • Adult • Non-woven polypropylene • Non-sterile', 2, 'pcs', 1, 2, 5.00, 10.00, '2026-08-27 01:41:24');

-- --------------------------------------------------------

--
-- Table structure for table `sales_order_status_history`
--

CREATE TABLE `sales_order_status_history` (
  `history_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `old_status` varchar(50) DEFAULT NULL,
  `new_status` varchar(50) NOT NULL,
  `changed_by` char(36) DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `changed_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sales_order_status_history`
--

INSERT INTO `sales_order_status_history` (`history_id`, `order_id`, `old_status`, `new_status`, `changed_by`, `remarks`, `changed_at`) VALUES
(63, 63, NULL, 'draft', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'Draft saved by sales clerk.', '2026-08-17 23:57:30'),
(64, 63, 'draft', 'waiting_cashier', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'Order sent to cashier queue.', '2026-08-17 23:57:31'),
(65, 63, 'waiting_cashier', 'accepted_by_cashier', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Order accepted by cashier.', '2026-08-17 23:57:44'),
(66, 63, 'accepted_by_cashier', 'completed', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Payment completed by cashier.', '2026-08-17 23:58:49'),
(67, 64, NULL, 'draft', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'Draft saved by sales clerk.', '2026-08-17 23:59:47'),
(68, 64, 'draft', 'waiting_cashier', 'e61815fe-7781-11f1-ae3b-0a002700000b', 'Order sent to cashier queue.', '2026-08-17 23:59:47'),
(69, 64, 'waiting_cashier', 'accepted_by_cashier', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Order accepted by cashier.', '2026-08-17 23:59:56'),
(70, 64, 'accepted_by_cashier', 'completed', '9db5292a-7788-11f1-ae3b-0a002700000b', 'Payment completed by cashier.', '2026-08-18 00:00:09'),
(71, 65, NULL, 'draft', '09632669-6a16-11f1-895a-0a002700000b', 'Draft saved by sales clerk.', '2026-08-18 06:09:00'),
(72, 65, 'draft', 'waiting_cashier', '09632669-6a16-11f1-895a-0a002700000b', 'Order sent to cashier queue.', '2026-08-18 06:09:00'),
(73, 66, NULL, 'draft', '09632669-6a16-11f1-895a-0a002700000b', 'Draft saved by sales clerk.', '2026-08-18 06:09:51'),
(74, 66, 'draft', 'waiting_cashier', '09632669-6a16-11f1-895a-0a002700000b', 'Order sent to cashier queue.', '2026-08-18 06:09:51'),
(75, 66, 'waiting_cashier', 'accepted_by_cashier', '09632669-6a16-11f1-895a-0a002700000b', 'Order accepted by cashier.', '2026-08-20 06:47:14'),
(76, 65, 'waiting_cashier', 'accepted_by_cashier', '09632669-6a16-11f1-895a-0a002700000b', 'Order accepted by cashier.', '2026-08-20 09:42:49'),
(77, 73, NULL, 'draft', '09632669-6a16-11f1-895a-0a002700000b', 'Draft saved by sales clerk.', '2026-08-27 01:41:24'),
(78, 73, 'draft', 'waiting_cashier', '09632669-6a16-11f1-895a-0a002700000b', 'Order sent to cashier queue.', '2026-08-27 01:41:24'),
(79, 73, 'waiting_cashier', 'accepted_by_cashier', '09632669-6a16-11f1-895a-0a002700000b', 'Order accepted by cashier.', '2026-08-27 01:41:31'),
(101, 73, 'accepted_by_cashier', 'completed', '09632669-6a16-11f1-895a-0a002700000b', 'Payment completed by cashier.', '2026-08-27 09:36:12');

-- --------------------------------------------------------

--
-- Table structure for table `sales_payments`
--

CREATE TABLE `sales_payments` (
  `payment_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `cashier_id` char(36) NOT NULL,
  `payment_method` enum('cash','gcash','card','mixed') NOT NULL DEFAULT 'cash',
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `sales_clerk_discount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `cashier_discount_type` varchar(30) NOT NULL DEFAULT 'none',
  `cashier_discount_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `final_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `amount_paid` decimal(10,2) NOT NULL DEFAULT 0.00,
  `change_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_status` enum('unpaid','paid','cancelled','refunded') NOT NULL DEFAULT 'unpaid',
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sales_payments`
--

INSERT INTO `sales_payments` (`payment_id`, `order_id`, `cashier_id`, `payment_method`, `total_amount`, `sales_clerk_discount`, `cashier_discount_type`, `cashier_discount_amount`, `final_amount`, `amount_paid`, `change_amount`, `payment_status`, `paid_at`, `created_at`) VALUES
(18, 63, '9db5292a-7788-11f1-ae3b-0a002700000b', 'cash', 250.00, 0.00, 'none', 0.00, 250.00, 1000.00, 750.00, 'paid', '2026-08-17 23:58:49', '2026-08-17 23:58:49'),
(19, 64, '9db5292a-7788-11f1-ae3b-0a002700000b', 'cash', 45.00, 0.00, 'none', 0.00, 45.00, 50.00, 5.00, 'paid', '2026-08-18 00:00:09', '2026-08-18 00:00:09'),
(26, 73, '09632669-6a16-11f1-895a-0a002700000b', 'cash', 10.00, 0.00, 'none', 0.00, 10.00, 50.00, 40.00, 'paid', '2026-08-27 09:36:12', '2026-08-27 09:36:12');

-- --------------------------------------------------------

--
-- Table structure for table `sales_receipts`
--

CREATE TABLE `sales_receipts` (
  `receipt_id` int(11) NOT NULL,
  `order_id` int(11) NOT NULL,
  `receipt_no` varchar(50) NOT NULL,
  `customer_name` varchar(150) DEFAULT NULL,
  `sales_clerk_id` char(36) DEFAULT NULL,
  `cashier_id` char(36) DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(50) DEFAULT NULL,
  `printed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sales_receipts`
--

INSERT INTO `sales_receipts` (`receipt_id`, `order_id`, `receipt_no`, `customer_name`, `sales_clerk_id`, `cashier_id`, `total_amount`, `payment_method`, `printed_at`, `created_at`) VALUES
(17, 63, 'RCPT-20260818-085849-3E8C', 'Walk-in Customer', 'e61815fe-7781-11f1-ae3b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 250.00, 'cash', '2026-08-17 23:58:49', '2026-08-17 23:58:49'),
(18, 64, 'RCPT-20260818-090009-79A7', 'Walk-in Customer', 'e61815fe-7781-11f1-ae3b-0a002700000b', '9db5292a-7788-11f1-ae3b-0a002700000b', 45.00, 'cash', '2026-08-18 00:00:09', '2026-08-18 00:00:09'),
(25, 73, 'RCPT-20260827-183612-9190', 'Walk-in Customer', '09632669-6a16-11f1-895a-0a002700000b', '09632669-6a16-11f1-895a-0a002700000b', 10.00, 'cash', '2026-08-27 09:36:12', '2026-08-27 09:36:12');

-- --------------------------------------------------------

--
-- Table structure for table `suppliers`
--

CREATE TABLE `suppliers` (
  `supplier_name` varchar(150) NOT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `archived_at` timestamp NULL DEFAULT NULL,
  `supplier_id` char(36) NOT NULL DEFAULT uuid()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `suppliers`
--

INSERT INTO `suppliers` (`supplier_name`, `contact_person`, `phone`, `email`, `address`, `created_at`, `archived_at`, `supplier_id`) VALUES
('Rose pharmacy', NULL, '099999999', 'rose@gmail.com', 'divisoria carmen', '2026-06-02 11:09:40', NULL, '09694904-6a16-11f1-895a-0a002700000b'),
('Medical_supplies.co', NULL, '0934837474', 'medicalsuppliers1234@gmail.com', 'sdcsdcsdcs', '2026-07-02 11:06:13', NULL, '09eaac64-7606-11f1-b27c-0a002700000b'),
('Dyna drug corporation', NULL, '(02) 672 3786', 'info@dynadrug.com', 'Banner streets, Bagong Ilog, Pasig City 1600', '2026-08-04 03:10:31', NULL, '0e02a7f7-8fb2-11f1-91e4-706871ff20d7'),
('Metro drug', NULL, '(02) 8539-4342', 'CMJimenez@metrodrug.com.ph', 'Sta. Rosa Estate, Brgy. Macabling, Sta. Rosa Laguna', '2026-08-04 03:06:11', NULL, '730e673c-8fb1-11f1-91e4-706871ff20d7'),
('Fast Distribution', NULL, '09778491113', 'dagonzaga@fastgroup.biz', 'Door 2 Fastcargo Bldg., Zone 6 Bulua Cagayan de Oro City', '2026-08-04 04:18:15', NULL, '846f3a9d-8fbb-11f1-91e4-706871ff20d7'),
('Golden Century', NULL, '', '', '', '2026-08-04 07:17:35', NULL, '91c15543-8fd4-11f1-91e4-706871ff20d7'),
('Buldak.co', NULL, '09989773737', 'buldak@gmail.com', 'somewhere', '2026-06-26 07:44:10', NULL, 'd17d2533-7132-11f1-a888-0a002700000b'),
('kianen Marketing', NULL, '09177082091', 'kianengroupofcompanies@gmail.com', '#172 Corales Avenue Cagayan de Oro City Misamis Oriental, 9000', '2026-08-04 03:02:44', NULL, 'f7e5ad94-8fb0-11f1-91e4-706871ff20d7');

-- --------------------------------------------------------

--
-- Table structure for table `supplier_claims`
--

CREATE TABLE `supplier_claims` (
  `affected_quantity` int(11) NOT NULL DEFAULT 0,
  `unit_conversion_id` char(36) NOT NULL,
  `damage_reason` varchar(80) NOT NULL,
  `disposition` varchar(40) DEFAULT NULL,
  `resolution_type` varchar(40) DEFAULT NULL,
  `requested_resolution_type` varchar(40) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `management_remarks` text DEFAULT NULL,
  `claim_status` varchar(40) NOT NULL DEFAULT 'Awaiting Supplier Resolution',
  `reported_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `resolved_at` timestamp NULL DEFAULT NULL,
  `claim_id` char(36) NOT NULL DEFAULT uuid(),
  `po_item_id` char(36) NOT NULL,
  `inventory_batch_id` char(36) DEFAULT NULL,
  `damaged_quantity` int(11) NOT NULL DEFAULT 0,
  `damaged_unit_conversion_id` char(36) DEFAULT NULL,
  `action_quantity` int(11) NOT NULL DEFAULT 0,
  `action_unit_conversion_id` char(36) DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `supplier_claim_damage_lines`
--

CREATE TABLE `supplier_claim_damage_lines` (
  `damage_line_id` char(36) NOT NULL DEFAULT uuid(),
  `claim_id` char(36) NOT NULL,
  `receiving_item_id` char(36) DEFAULT NULL,
  `sequence_no` int(11) NOT NULL,
  `affected_unit_conversion_id` char(36) NOT NULL,
  `affected_quantity` int(11) NOT NULL DEFAULT 1,
  `damaged_quantity` int(11) NOT NULL,
  `damaged_unit_conversion_id` char(36) NOT NULL,
  `inventory_batch_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Stand-in structure for view `supplier_claim_legacy_projection`
-- (See below for the actual view)
--
CREATE TABLE `supplier_claim_legacy_projection` (
`return_id` char(36)
,`claim_id` char(36)
,`po_id` char(36)
,`po_item_id` char(36)
,`inventory_batch_id` char(36)
,`affected_quantity` int(11)
,`unit_conversion_id` char(36)
,`affected_base_quantity` bigint(21)
,`return_quantity` bigint(21)
,`affected_unit_name` varchar(50)
,`affected_unit_base_quantity` int(11)
,`damaged_selected_quantity` int(11)
,`damaged_unit_conversion_id` char(36)
,`damaged_unit_name` varchar(50)
,`damaged_unit_base_quantity` int(11)
,`damaged_quantity` bigint(21)
,`action_quantity` int(11)
,`action_unit_conversion_id` char(36)
,`action_unit_name` varchar(50)
,`action_unit_base_quantity` int(11)
,`action_base_quantity` bigint(21)
,`damage_reason` varchar(80)
,`disposition` varchar(40)
,`resolution_type` varchar(40)
,`requested_resolution_type` varchar(40)
,`return_status` varchar(40)
,`claim_status` varchar(40)
,`reported_by` char(36)
,`remarks` text
,`management_remarks` text
,`created_at` timestamp
,`resolved_at` timestamp
,`delivered_quantity` int(11)
,`missing_quantity` int(11)
,`replacement_expected_qty` bigint(21)
,`replacement_received_qty` decimal(32,0)
,`supplier_adjustment` decimal(12,2)
,`parent_return_id` binary(0)
);

-- --------------------------------------------------------

--
-- Table structure for table `supplier_credits`
--

CREATE TABLE `supplier_credits` (
  `credit_id` char(36) NOT NULL DEFAULT uuid(),
  `claim_id` char(36) NOT NULL,
  `credit_amount` decimal(12,2) NOT NULL,
  `credit_status` varchar(40) NOT NULL DEFAULT 'Available',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Table structure for table `supplier_credit_applications`
--

CREATE TABLE `supplier_credit_applications` (
  `application_id` char(36) NOT NULL DEFAULT uuid(),
  `credit_id` char(36) NOT NULL,
  `po_id` char(36) NOT NULL,
  `amount_applied` decimal(12,2) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `applied_by` char(36) DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `supplier_products`
--

CREATE TABLE `supplier_products` (
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `supplier_product_id` char(36) NOT NULL DEFAULT uuid(),
  `supplier_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `supplier_cost_price` decimal(12,4) DEFAULT NULL,
  `supplier_cost_input` decimal(10,2) DEFAULT NULL,
  `supplier_cost_basis` varchar(20) NOT NULL DEFAULT 'inventory',
  `purchase_unit` varchar(50) DEFAULT NULL,
  `purchase_unit_contains` int(11) DEFAULT NULL,
  `inner_unit` varchar(50) DEFAULT NULL,
  `units_per_inner_unit` int(11) DEFAULT NULL,
  `inventory_unit` varchar(50) DEFAULT NULL,
  `units_per_purchase_unit` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `supplier_products`
--

INSERT INTO `supplier_products` (`created_at`, `supplier_product_id`, `supplier_id`, `product_id`, `supplier_cost_price`, `supplier_cost_input`, `supplier_cost_basis`, `purchase_unit`, `purchase_unit_contains`, `inner_unit`, `units_per_inner_unit`, `inventory_unit`, `units_per_purchase_unit`) VALUES
('2026-09-05 06:48:59', 'df806e6a-a8f5-11f1-8c79-0a002700000b', 'f7e5ad94-8fb0-11f1-91e4-706871ff20d7', 'e6d43886-a6dd-11f1-b4bd-706871ff20d7', NULL, NULL, 'inventory', 'box', 12, NULL, NULL, 'Bottle', 12),
('2026-09-05 06:48:59', 'df951af0-a8f5-11f1-8c79-0a002700000b', 'f7e5ad94-8fb0-11f1-91e4-706871ff20d7', 'b9bd0e07-a6fb-11f1-b4bd-706871ff20d7', NULL, NULL, 'inventory', 'box', 100, NULL, NULL, 'tablet', 100);

-- --------------------------------------------------------

--
-- Table structure for table `supplier_product_unit_conversions`
--

CREATE TABLE `supplier_product_unit_conversions` (
  `conversion_id` char(36) NOT NULL DEFAULT uuid(),
  `supplier_product_id` char(36) NOT NULL,
  `unit_name` varchar(50) NOT NULL,
  `base_quantity` int(11) NOT NULL,
  `level_order` int(11) NOT NULL DEFAULT 0,
  `is_transfer_unit` tinyint(1) NOT NULL DEFAULT 1,
  `is_selling_unit` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ;

--
-- Dumping data for table `supplier_product_unit_conversions`
--

INSERT INTO `supplier_product_unit_conversions` (`conversion_id`, `supplier_product_id`, `unit_name`, `base_quantity`, `level_order`, `is_transfer_unit`, `is_selling_unit`, `created_at`) VALUES
('df815946-a8f5-11f1-8c79-0a002700000b', 'df806e6a-a8f5-11f1-8c79-0a002700000b', 'bottle', 1, 0, 1, 1, '2026-09-05 06:48:59'),
('df817b88-a8f5-11f1-8c79-0a002700000b', 'df806e6a-a8f5-11f1-8c79-0a002700000b', 'box', 12, 1, 1, 0, '2026-09-05 06:48:59'),
('df96ebeb-a8f5-11f1-8c79-0a002700000b', 'df951af0-a8f5-11f1-8c79-0a002700000b', 'tablet', 1, 0, 1, 1, '2026-09-05 06:48:59'),
('df9712da-a8f5-11f1-8c79-0a002700000b', 'df951af0-a8f5-11f1-8c79-0a002700000b', 'box', 100, 1, 1, 0, '2026-09-05 06:48:59');

-- --------------------------------------------------------

--
-- Table structure for table `supplier_refunds`
--

CREATE TABLE `supplier_refunds` (
  `refund_id` char(36) NOT NULL DEFAULT uuid(),
  `claim_id` char(36) NOT NULL,
  `amount_due` decimal(12,2) NOT NULL,
  `amount_received` decimal(12,2) NOT NULL DEFAULT 0.00,
  `refund_status` varchar(30) NOT NULL DEFAULT 'Due',
  `received_date` date DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `recorded_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `system_settings`
--

CREATE TABLE `system_settings` (
  `setting_id` int(11) NOT NULL,
  `pharmacy_name` varchar(150) NOT NULL DEFAULT 'Dr. R Pharmacy',
  `pharmacy_email` varchar(150) DEFAULT NULL,
  `contact_number` varchar(50) DEFAULT NULL,
  `tin_license_number` varchar(100) DEFAULT NULL,
  `pharmacy_address` text DEFAULT NULL,
  `website` varchar(150) DEFAULT NULL,
  `timezone` varchar(100) NOT NULL DEFAULT 'Asia/Manila',
  `logo_path` varchar(255) DEFAULT NULL,
  `currency` varchar(10) NOT NULL DEFAULT 'PHP',
  `tax_rate` decimal(5,2) NOT NULL DEFAULT 0.00,
  `receipt_footer` text DEFAULT NULL,
  `grn_received_by_name` varchar(150) DEFAULT NULL,
  `grn_approved_by_name` varchar(150) DEFAULT NULL,
  `pr_prepared_name` varchar(150) DEFAULT NULL,
  `pr_prepared_role` varchar(100) NOT NULL DEFAULT 'Manager',
  `pr_reviewed_name` varchar(150) DEFAULT NULL,
  `pr_reviewed_role` varchar(100) NOT NULL DEFAULT 'Supervisor',
  `po_prepared_name` varchar(150) DEFAULT NULL,
  `po_prepared_role` varchar(100) NOT NULL DEFAULT 'Manager',
  `po_approved_name` varchar(150) DEFAULT NULL,
  `po_approved_role` varchar(100) NOT NULL DEFAULT 'Supervisor',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `system_settings`
--

INSERT INTO `system_settings` (`setting_id`, `pharmacy_name`, `pharmacy_email`, `contact_number`, `tin_license_number`, `pharmacy_address`, `website`, `timezone`, `logo_path`, `currency`, `tax_rate`, `receipt_footer`, `grn_received_by_name`, `grn_approved_by_name`, `pr_prepared_name`, `pr_prepared_role`, `pr_reviewed_name`, `pr_reviewed_role`, `po_prepared_name`, `po_prepared_role`, `po_approved_name`, `po_approved_role`, `created_at`, `updated_at`) VALUES
(1, 'Dr. R Pharmacy', 'docRpharmacy@gmail.com', '09813538366.', '11222222222', 'Capistrano corner Cruz Taal Street, Barangay 08, Cagayan de Oro City', NULL, 'Asia/Manila', NULL, 'PHP', 0.00, NULL, NULL, NULL, 'Jeham Aragase', 'Manager', 'Hamida Aminola', 'Supervisor', NULL, 'Manager', NULL, 'Supervisor', '2026-07-02 07:05:22', '2026-08-24 11:06:25');

-- --------------------------------------------------------

--
-- Table structure for table `tenants`
--

CREATE TABLE `tenants` (
  `tenant_id` char(36) NOT NULL DEFAULT uuid(),
  `name` varchar(120) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'active',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tenants`
--

INSERT INTO `tenants` (`tenant_id`, `name`, `slug`, `status`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('c9721049-6adf-11f1-b9ca-0a002700000b', 'Dr. R Pharmacy', 'dr-r-pharmacy', 'active', 1, 0, 0, '2026-06-18 06:34:41', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `tenant_domains`
--

CREATE TABLE `tenant_domains` (
  `tenant_domain_id` char(36) NOT NULL DEFAULT uuid(),
  `tenant_id` char(36) NOT NULL,
  `domain_name` varchar(255) NOT NULL,
  `domain_type` varchar(50) NOT NULL DEFAULT 'platform',
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `verification_status` varchar(50) NOT NULL DEFAULT 'pending',
  `ssl_status` varchar(50) NOT NULL DEFAULT 'pending',
  `target_type` varchar(100) DEFAULT NULL,
  `target_id` char(36) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `tenant_domains`
--

INSERT INTO `tenant_domains` (`tenant_domain_id`, `tenant_id`, `domain_name`, `domain_type`, `is_primary`, `verification_status`, `ssl_status`, `target_type`, `target_id`, `is_active`, `is_archived`, `is_deleted`, `created_at`, `updated_at`) VALUES
('c973a674-6adf-11f1-b9ca-0a002700000b', 'c9721049-6adf-11f1-b9ca-0a002700000b', 'localhost', 'platform', 1, 'verified', 'active', 'tenant', 'c9721049-6adf-11f1-b9ca-0a002700000b', 1, 0, 0, '2026-06-18 06:34:41', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `username` varchar(50) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `contact_number` varchar(50) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `full_name` varchar(100) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `role` enum('super_admin','admin','manager','supervisor','cashier','salesclerk') NOT NULL DEFAULT 'salesclerk',
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `last_login` datetime DEFAULT NULL,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  `user_id` char(36) NOT NULL DEFAULT uuid()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`username`, `email`, `contact_number`, `password`, `password_hash`, `full_name`, `first_name`, `last_name`, `role`, `status`, `last_login`, `is_archived`, `is_deleted`, `created_at`, `updated_at`, `user_id`) VALUES
('admin', 'admin@gmail.com', NULL, '$2y$10$NRJp4XHvJNRxELsbiyPGcuIJcIP5EPqtwfrrDq4Q5KV0ON6Vvxooy', '$2y$10$NRJp4XHvJNRxELsbiyPGcuIJcIP5EPqtwfrrDq4Q5KV0ON6Vvxooy', 'Dr. ADMIN', 'Dr.', 'ADMIN', 'admin', 'Active', '2026-09-06 00:12:59', 0, 0, '2026-06-01 11:52:31', '2026-09-06 07:12:59', '09632669-6a16-11f1-895a-0a002700000b'),
('Cashier', 'cashier.test@example.com', '09170000000', '$2y$10$8bfHSBZQJ/G.eFwKAcCbXOncOMMwaAXYWYHpS6qUPeHj58H36x4aq', '$2y$10$8bfHSBZQJ/G.eFwKAcCbXOncOMMwaAXYWYHpS6qUPeHj58H36x4aq', 'Cashier', NULL, NULL, 'cashier', 'Active', '2026-09-06 00:28:28', 0, 0, '2026-07-04 09:13:27', '2026-09-06 07:28:28', '9db5292a-7788-11f1-ae3b-0a002700000b'),
('supervisor', NULL, NULL, '$2y$10$srQK8AlUBKmEp1f4Y3DeLutCO1zKXwjCs66H4ZWV9s7SoA2L4j3Q6', '$2y$10$srQK8AlUBKmEp1f4Y3DeLutCO1zKXwjCs66H4ZWV9s7SoA2L4j3Q6', 'Inventory Supervisor', NULL, NULL, 'supervisor', 'Active', '2026-09-06 00:32:37', 0, 0, '2026-08-07 08:18:55', '2026-09-06 07:32:37', 'a1f91cde-9238-11f1-a711-706871ff20d7'),
('salesclerk', 'salesclerktest@gmail.com', '0983989028', '$2y$10$WfPyCe3/75cOUR/kLIe0V.xrWtahyzrszXzOP3fmL0h11jLofa.Pe', '$2y$10$WfPyCe3/75cOUR/kLIe0V.xrWtahyzrszXzOP3fmL0h11jLofa.Pe', 'Sales Clerk', NULL, NULL, 'salesclerk', 'Active', '2026-09-06 00:17:03', 0, 0, '2026-07-04 08:25:22', '2026-09-06 07:17:03', 'e61815fe-7781-11f1-ae3b-0a002700000b'),
('manager', 'manager@gmail.com', '0999999988888777', '$2y$10$v8Z1ehsKIFmUi593JMehguWcDEj6X4gSKCci.KL8fKKPYBo2NFIqe', '$2y$10$v8Z1ehsKIFmUi593JMehguWcDEj6X4gSKCci.KL8fKKPYBo2NFIqe', 'Manager', NULL, NULL, 'manager', 'Active', '2026-08-03 19:49:23', 0, 0, '2026-07-27 14:53:21', '2026-08-04 02:49:23', 'e92f19bf-89ca-11f1-ad23-706871ff20d7'),
('cashier_rbac_qa', NULL, NULL, '$2y$10$gBX7HZAm7PjJV4jfp0W3s.dZZk8WdUD5LqPkNU.S3ERshqJ8ICDBO', '$2y$10$gBX7HZAm7PjJV4jfp0W3s.dZZk8WdUD5LqPkNU.S3ERshqJ8ICDBO', 'Cashier RBAC QA', NULL, NULL, 'cashier', 'Inactive', '2026-07-27 08:02:47', 0, 0, '2026-07-27 15:00:34', '2026-07-27 15:04:45', 'eb546a74-89cb-11f1-ad23-706871ff20d7'),
('salesclerk_rbac_qa', NULL, NULL, '$2y$10$VDjkLn1lElMys1hVrv3kvecPQT3R948BIgrmsYp/D4x4piTLQYUvS', '$2y$10$VDjkLn1lElMys1hVrv3kvecPQT3R948BIgrmsYp/D4x4piTLQYUvS', 'Sales Clerk RBAC QA Edited', NULL, NULL, 'salesclerk', 'Inactive', '2026-07-27 08:03:30', 0, 0, '2026-07-27 15:00:52', '2026-07-27 15:04:36', 'f6114576-89cb-11f1-ad23-706871ff20d7');

-- --------------------------------------------------------

--
-- Structure for view `purchase_order_receiving_item_summary`
--
DROP TABLE IF EXISTS `purchase_order_receiving_item_summary`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `purchase_order_receiving_item_summary`  AS SELECT `ri`.`receiving_item_id` AS `receiving_item_id`, `ri`.`receiving_id` AS `receiving_id`, `ri`.`po_item_id` AS `po_item_id`, `ri`.`parent_receiving_item_id` AS `parent_receiving_item_id`, `ri`.`received_quantity` AS `received_quantity`, `ri`.`accepted_quantity` AS `accepted_quantity`, `ri`.`damaged_quantity` AS `damaged_quantity`, greatest(0,`ri`.`received_quantity` - `ri`.`accepted_quantity`) AS `action_quantity` FROM `purchase_order_receiving_items` AS `ri` ;

-- --------------------------------------------------------

--
-- Structure for view `supplier_claim_legacy_projection`
--
DROP TABLE IF EXISTS `supplier_claim_legacy_projection`;

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `supplier_claim_legacy_projection`  AS SELECT `sc`.`claim_id` AS `return_id`, `sc`.`claim_id` AS `claim_id`, `poi`.`po_id` AS `po_id`, `sc`.`po_item_id` AS `po_item_id`, `sc`.`inventory_batch_id` AS `inventory_batch_id`, `sc`.`affected_quantity` AS `affected_quantity`, `sc`.`unit_conversion_id` AS `unit_conversion_id`, `sc`.`affected_quantity`* `affected_c`.`base_quantity` AS `affected_base_quantity`, CASE WHEN `sc`.`action_unit_conversion_id` is not null THEN `sc`.`action_quantity`* `action_c`.`base_quantity` ELSE `sc`.`affected_quantity`* `affected_c`.`base_quantity` END AS `return_quantity`, `affected_c`.`unit_name` AS `affected_unit_name`, `affected_c`.`base_quantity` AS `affected_unit_base_quantity`, `sc`.`damaged_quantity` AS `damaged_selected_quantity`, `sc`.`damaged_unit_conversion_id` AS `damaged_unit_conversion_id`, `damaged_c`.`unit_name` AS `damaged_unit_name`, coalesce(`damaged_c`.`base_quantity`,1) AS `damaged_unit_base_quantity`, CASE WHEN `sc`.`damaged_unit_conversion_id` is not null THEN `sc`.`damaged_quantity`* `damaged_c`.`base_quantity` ELSE `sc`.`damaged_quantity` END AS `damaged_quantity`, `sc`.`action_quantity` AS `action_quantity`, `sc`.`action_unit_conversion_id` AS `action_unit_conversion_id`, `action_c`.`unit_name` AS `action_unit_name`, coalesce(`action_c`.`base_quantity`,1) AS `action_unit_base_quantity`, CASE WHEN `sc`.`action_unit_conversion_id` is not null THEN `sc`.`action_quantity`* `action_c`.`base_quantity` ELSE `sc`.`affected_quantity`* `affected_c`.`base_quantity` END AS `action_base_quantity`, `sc`.`damage_reason` AS `damage_reason`, `sc`.`disposition` AS `disposition`, `sc`.`resolution_type` AS `resolution_type`, `sc`.`requested_resolution_type` AS `requested_resolution_type`, `sc`.`claim_status` AS `return_status`, `sc`.`claim_status` AS `claim_status`, `sc`.`reported_by` AS `reported_by`, `sc`.`remarks` AS `remarks`, `sc`.`management_remarks` AS `management_remarks`, `sc`.`created_at` AS `created_at`, `sc`.`resolved_at` AS `resolved_at`, coalesce((select max(`ri`.`received_quantity`) from ((`supplier_claim_damage_lines` `dl` join `purchase_order_receiving_items` `ri` on(`ri`.`receiving_item_id` = `dl`.`receiving_item_id`)) join `purchase_order_receiving` `pr` on(`pr`.`receiving_id` = `ri`.`receiving_id`)) where `dl`.`claim_id` = `sc`.`claim_id` and `pr`.`receiving_type` = 'Original'),0) AS `delivered_quantity`, coalesce((select max(`ri`.`missing_quantity`) from ((`supplier_claim_damage_lines` `dl` join `purchase_order_receiving_items` `ri` on(`ri`.`receiving_item_id` = `dl`.`receiving_item_id`)) join `purchase_order_receiving` `pr` on(`pr`.`receiving_id` = `ri`.`receiving_id`)) where `dl`.`claim_id` = `sc`.`claim_id` and `pr`.`receiving_type` = 'Original'),0) AS `missing_quantity`, CASE WHEN `sc`.`resolution_type` = 'Replacement' THEN CASE WHEN `sc`.`action_unit_conversion_id` is not null THEN `sc`.`action_quantity`* `action_c`.`base_quantity` ELSE `sc`.`affected_quantity`* `affected_c`.`base_quantity` END ELSE 0 END AS `replacement_expected_qty`, coalesce((select sum(`replacement_item`.`accepted_quantity`) from (`purchase_order_receiving` `replacement` join `purchase_order_receiving_items` `replacement_item` on(`replacement_item`.`receiving_id` = `replacement`.`receiving_id`)) where `replacement`.`claim_id` = `sc`.`claim_id` and `replacement`.`receiving_type` = 'Replacement'),0) AS `replacement_received_qty`, coalesce((select `cr`.`credit_amount` from `supplier_credits` `cr` where `cr`.`claim_id` = `sc`.`claim_id` limit 1),0) AS `supplier_adjustment`, NULL AS `parent_return_id` FROM ((((`supplier_claims` `sc` join `purchase_order_items` `poi` on(`poi`.`po_item_id` = `sc`.`po_item_id`)) join `supplier_product_unit_conversions` `affected_c` on(`affected_c`.`conversion_id` = `sc`.`unit_conversion_id`)) left join `supplier_product_unit_conversions` `damaged_c` on(`damaged_c`.`conversion_id` = `sc`.`damaged_unit_conversion_id`)) left join `supplier_product_unit_conversions` `action_c` on(`action_c`.`conversion_id` = `sc`.`action_unit_conversion_id`)) ;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `accounts`
--
ALTER TABLE `accounts`
  ADD PRIMARY KEY (`account_id`),
  ADD UNIQUE KEY `uniq_accounts_context` (`user_id`,`tenant_id`,`account_type_id`,`accountable_id`),
  ADD KEY `idx_accounts_user` (`user_id`),
  ADD KEY `idx_accounts_tenant` (`tenant_id`),
  ADD KEY `idx_accounts_type` (`account_type_id`),
  ADD KEY `fk_accounts_parent` (`parent_account_id`);

--
-- Indexes for table `account_roles`
--
ALTER TABLE `account_roles`
  ADD PRIMARY KEY (`account_role_id`),
  ADD UNIQUE KEY `uniq_account_roles_account_role` (`account_id`,`role_id`),
  ADD KEY `idx_account_roles_role` (`role_id`);

--
-- Indexes for table `account_types`
--
ALTER TABLE `account_types`
  ADD PRIMARY KEY (`account_type_id`),
  ADD UNIQUE KEY `uniq_account_types_code` (`code`);

--
-- Indexes for table `activity_logs`
--
ALTER TABLE `activity_logs`
  ADD PRIMARY KEY (`activity_id`),
  ADD KEY `idx_activity_logs_created_at` (`created_at`),
  ADD KEY `idx_activity_logs_module_action` (`module`,`action`),
  ADD KEY `idx_activity_logs_reference` (`reference_id`);

--
-- Indexes for table `auth_sessions`
--
ALTER TABLE `auth_sessions`
  ADD PRIMARY KEY (`auth_session_id`),
  ADD UNIQUE KEY `uniq_auth_sessions_token_hash` (`session_token_hash`),
  ADD KEY `idx_auth_sessions_php_session` (`php_session_id`),
  ADD KEY `idx_auth_sessions_user` (`user_id`),
  ADD KEY `idx_auth_sessions_account` (`account_id`),
  ADD KEY `idx_auth_sessions_tenant` (`tenant_id`);

--
-- Indexes for table `business_hours`
--
ALTER TABLE `business_hours`
  ADD PRIMARY KEY (`business_hour_id`),
  ADD UNIQUE KEY `unique_day_of_week` (`day_of_week`);

--
-- Indexes for table `business_hour_exceptions`
--
ALTER TABLE `business_hour_exceptions`
  ADD PRIMARY KEY (`exception_id`),
  ADD UNIQUE KEY `unique_exception_date` (`exception_date`);

--
-- Indexes for table `cashier_queue`
--
ALTER TABLE `cashier_queue`
  ADD PRIMARY KEY (`queue_id`),
  ADD UNIQUE KEY `order_id` (`order_id`),
  ADD KEY `idx_cashier_queue_status` (`queue_status`),
  ADD KEY `idx_cashier_queue_cashier` (`cashier_id`);

--
-- Indexes for table `entity_dimensions`
--
ALTER TABLE `entity_dimensions`
  ADD PRIMARY KEY (`dimension_id`),
  ADD UNIQUE KEY `uniq_entity_dimension` (`entity_type`,`entity_id`,`dimension_type`,`unit`,`text_value`),
  ADD KEY `idx_entity_dimensions_entity` (`entity_type`,`entity_id`),
  ADD KEY `idx_entity_dimensions_type` (`dimension_type`,`unit`);

--
-- Indexes for table `grocery_details`
--
ALTER TABLE `grocery_details`
  ADD PRIMARY KEY (`grocery_detail_id`),
  ADD KEY `fk_grocery_details_product` (`product_id`);

--
-- Indexes for table `inventory_batches`
--
ALTER TABLE `inventory_batches`
  ADD PRIMARY KEY (`batch_id`),
  ADD UNIQUE KEY `uniq_inventory_batches_legacy_inventory_id` (`legacy_inventory_id`),
  ADD UNIQUE KEY `uniq_inventory_batches_po_item` (`po_id`,`po_item_id`),
  ADD KEY `idx_inventory_batches_product_status` (`product_id`,`batch_status`),
  ADD KEY `idx_inventory_batches_fefo` (`product_id`,`expiry_date`,`received_date`),
  ADD KEY `idx_inventory_batches_po_id` (`po_id`),
  ADD KEY `idx_inventory_batches_po_item_id` (`po_item_id`),
  ADD KEY `idx_inventory_batches_supplier_id` (`supplier_id`);

--
-- Indexes for table `inventory_receiving_transactions`
--
ALTER TABLE `inventory_receiving_transactions`
  ADD PRIMARY KEY (`transaction_id`),
  ADD UNIQUE KEY `uq_inventory_receiving_transaction_request` (`transaction_request_key`),
  ADD KEY `idx_inventory_receiving_transaction_claim` (`claim_id`),
  ADD KEY `idx_inventory_receiving_transaction_po_item` (`po_id`,`po_item_id`),
  ADD KEY `idx_inventory_receiving_transaction_batch` (`inventory_batch_id`),
  ADD KEY `fk_inventory_receiving_transaction_receiving` (`receiving_id`),
  ADD KEY `fk_inventory_receiving_transaction_receiving_item` (`receiving_item_id`),
  ADD KEY `fk_inventory_receiving_transaction_po_item` (`po_item_id`),
  ADD KEY `fk_inventory_receiving_transaction_product` (`product_id`),
  ADD KEY `fk_inventory_receiving_transaction_supplier` (`supplier_id`),
  ADD KEY `fk_inventory_receiving_transaction_user` (`created_by`);

--
-- Indexes for table `inventory_transfers`
--
ALTER TABLE `inventory_transfers`
  ADD PRIMARY KEY (`transfer_id`),
  ADD KEY `idx_inventory_transfers_product_date` (`product_id`,`created_at`),
  ADD KEY `idx_inventory_transfers_user` (`transferred_by`);

--
-- Indexes for table `inventory_transfer_allocations`
--
ALTER TABLE `inventory_transfer_allocations`
  ADD PRIMARY KEY (`allocation_id`),
  ADD KEY `idx_transfer_allocations_transfer` (`transfer_id`),
  ADD KEY `idx_transfer_allocations_batch` (`source_batch_id`),
  ADD KEY `fk_transfer_allocations_selling` (`selling_stock_id`);

--
-- Indexes for table `login_attempts`
--
ALTER TABLE `login_attempts`
  ADD PRIMARY KEY (`attempt_id`),
  ADD KEY `idx_login_attempts_user` (`user_id`),
  ADD KEY `idx_login_attempts_username` (`username`),
  ADD KEY `idx_login_attempts_ip` (`ip_address`),
  ADD KEY `idx_login_attempts_created` (`created_at`);

--
-- Indexes for table `lookup_values`
--
ALTER TABLE `lookup_values`
  ADD PRIMARY KEY (`lookup_id`),
  ADD UNIQUE KEY `uniq_lookup_values_type_code` (`lookup_type`,`lookup_code`),
  ADD KEY `idx_lookup_values_type_active` (`lookup_type`,`is_active`,`sort_order`);

--
-- Indexes for table `medical_supply_details`
--
ALTER TABLE `medical_supply_details`
  ADD PRIMARY KEY (`medical_supply_detail_id`),
  ADD KEY `fk_medical_supply_details_product` (`product_id`);

--
-- Indexes for table `medicine_details`
--
ALTER TABLE `medicine_details`
  ADD PRIMARY KEY (`medicine_detail_id`),
  ADD KEY `fk_medicine_details_product` (`product_id`);

--
-- Indexes for table `product`
--
ALTER TABLE `product`
  ADD PRIMARY KEY (`product_id`),
  ADD KEY `idx_product_category_id` (`category_id`),
  ADD KEY `idx_product_type_id` (`type_id`),
  ADD KEY `idx_product_brand_name` (`brand_name`),
  ADD KEY `idx_product_product_name` (`product_name`),
  ADD KEY `idx_product_inventory_unit` (`inventory_unit_id`);

--
-- Indexes for table `product_categories`
--
ALTER TABLE `product_categories`
  ADD PRIMARY KEY (`category_id`),
  ADD UNIQUE KEY `category_name` (`category_name`);

--
-- Indexes for table `product_inventory`
--
ALTER TABLE `product_inventory`
  ADD PRIMARY KEY (`inventory_id`),
  ADD KEY `idx_product_inventory_product_id_variation_id` (`product_id`),
  ADD KEY `idx_product_inventory_expiration_date` (`expiration_date`),
  ADD KEY `idx_product_inventory_batch_number` (`batch_number`);

--
-- Indexes for table `product_measurement_units`
--
ALTER TABLE `product_measurement_units`
  ADD PRIMARY KEY (`measurement_unit_id`),
  ADD UNIQUE KEY `uq_measurement_unit_group_name` (`measurement_group`,`unit_name`),
  ADD UNIQUE KEY `uq_measurement_unit_group_symbol` (`measurement_group`,`unit_symbol`);

--
-- Indexes for table `product_selling_options`
--
ALTER TABLE `product_selling_options`
  ADD PRIMARY KEY (`selling_option_id`),
  ADD UNIQUE KEY `uq_product_selling_option_unit` (`product_id`,`unit_name`),
  ADD KEY `idx_product_selling_options_pos` (`product_id`,`pos_enabled`,`is_active`,`is_default`);

--
-- Indexes for table `product_selling_stock`
--
ALTER TABLE `product_selling_stock`
  ADD PRIMARY KEY (`selling_stock_id`),
  ADD KEY `idx_product_selling_stock_product_id_variation_id` (`product_id`),
  ADD KEY `idx_product_selling_stock_source_inventory_id` (`source_inventory_id`);

--
-- Indexes for table `product_specifications`
--
ALTER TABLE `product_specifications`
  ADD PRIMARY KEY (`specification_id`),
  ADD UNIQUE KEY `uq_product_specification_name` (`specification_name`);

--
-- Indexes for table `product_specification_choices`
--
ALTER TABLE `product_specification_choices`
  ADD PRIMARY KEY (`choice_id`),
  ADD UNIQUE KEY `uq_specification_choice` (`specification_id`,`choice_value`);

--
-- Indexes for table `product_specification_values`
--
ALTER TABLE `product_specification_values`
  ADD PRIMARY KEY (`product_id`,`specification_id`),
  ADD KEY `fk_spec_value_definition` (`specification_id`),
  ADD KEY `fk_spec_value_unit` (`measurement_unit_id`);

--
-- Indexes for table `product_types`
--
ALTER TABLE `product_types`
  ADD PRIMARY KEY (`type_id`),
  ADD UNIQUE KEY `uniq_product_types_category_id_type_name` (`category_id`,`type_name`),
  ADD KEY `idx_product_types_category_id` (`category_id`);

--
-- Indexes for table `product_type_specifications`
--
ALTER TABLE `product_type_specifications`
  ADD PRIMARY KEY (`type_id`,`specification_id`),
  ADD KEY `fk_type_spec_definition` (`specification_id`);

--
-- Indexes for table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  ADD PRIMARY KEY (`po_id`),
  ADD UNIQUE KEY `uniq_purchase_orders_po_number` (`po_number`),
  ADD KEY `idx_purchase_orders_supplier_id` (`supplier_id`),
  ADD KEY `idx_purchase_orders_status` (`status`),
  ADD KEY `idx_purchase_orders_created_at` (`created_at`),
  ADD KEY `idx_purchase_orders_pr` (`pr_id`);

--
-- Indexes for table `purchase_order_approval_audit`
--
ALTER TABLE `purchase_order_approval_audit`
  ADD PRIMARY KEY (`audit_id`),
  ADD KEY `idx_po_approval_audit_po` (`po_id`),
  ADD KEY `idx_po_approval_audit_created` (`created_at`);

--
-- Indexes for table `purchase_order_invoices`
--
ALTER TABLE `purchase_order_invoices`
  ADD PRIMARY KEY (`invoice_id`),
  ADD UNIQUE KEY `uq_purchase_order_invoice_po` (`po_id`),
  ADD KEY `idx_purchase_order_invoice_number` (`invoice_number`),
  ADD KEY `fk_purchase_order_invoice_user` (`recorded_by`);

--
-- Indexes for table `purchase_order_invoice_items`
--
ALTER TABLE `purchase_order_invoice_items`
  ADD PRIMARY KEY (`invoice_item_id`),
  ADD UNIQUE KEY `uq_purchase_order_invoice_line` (`invoice_id`,`po_item_id`),
  ADD KEY `idx_purchase_order_invoice_item_po_line` (`po_item_id`);

--
-- Indexes for table `purchase_order_items`
--
ALTER TABLE `purchase_order_items`
  ADD PRIMARY KEY (`po_item_id`),
  ADD KEY `idx_purchase_order_items_po_id` (`po_id`),
  ADD KEY `idx_purchase_order_items_product_id` (`product_id`),
  ADD KEY `idx_purchase_order_items_pr_item` (`pr_item_id`);

--
-- Indexes for table `purchase_order_payments`
--
ALTER TABLE `purchase_order_payments`
  ADD PRIMARY KEY (`payment_id`),
  ADD UNIQUE KEY `uniq_purchase_order_payments_idempotency` (`payment_request_key`),
  ADD KEY `idx_purchase_order_payments_po_id` (`po_id`),
  ADD KEY `idx_purchase_order_payments_payment_date` (`payment_date`),
  ADD KEY `fk_purchase_order_payments_recorded_by` (`recorded_by`);

--
-- Indexes for table `purchase_order_receiving`
--
ALTER TABLE `purchase_order_receiving`
  ADD PRIMARY KEY (`receiving_id`),
  ADD UNIQUE KEY `uq_po_receiving_request_key` (`receiving_request_key`),
  ADD KEY `idx_purchase_order_receiving_inspection_status` (`inspection_status`),
  ADD KEY `idx_purchase_order_receiving_inspected_by` (`inspected_by`),
  ADD KEY `idx_po_receiving_po_type` (`po_id`,`receiving_type`),
  ADD KEY `idx_po_receiving_parent` (`parent_receiving_id`),
  ADD KEY `idx_po_receiving_claim` (`claim_id`);

--
-- Indexes for table `purchase_order_receiving_items`
--
ALTER TABLE `purchase_order_receiving_items`
  ADD PRIMARY KEY (`receiving_item_id`),
  ADD UNIQUE KEY `uniq_purchase_order_receiving_items_receiving_id_po_item_id` (`receiving_id`,`po_item_id`),
  ADD KEY `idx_purchase_order_receiving_items_po_item_id` (`po_item_id`),
  ADD KEY `idx_po_receiving_items_parent` (`parent_receiving_item_id`);

--
-- Indexes for table `purchase_order_receiving_revisions`
--
ALTER TABLE `purchase_order_receiving_revisions`
  ADD PRIMARY KEY (`revision_id`),
  ADD KEY `idx_receiving_revisions_receiving_date` (`receiving_id`,`edited_at`),
  ADD KEY `idx_receiving_revisions_editor` (`edited_by`);

--
-- Indexes for table `purchase_requests`
--
ALTER TABLE `purchase_requests`
  ADD PRIMARY KEY (`pr_id`),
  ADD UNIQUE KEY `uniq_purchase_requests_number` (`pr_number`),
  ADD KEY `idx_purchase_requests_status_date` (`status`,`request_date`),
  ADD KEY `idx_purchase_requests_requester` (`requested_by`),
  ADD KEY `idx_purchase_requests_supervisor` (`supervisor_user_id`);

--
-- Indexes for table `purchase_request_items`
--
ALTER TABLE `purchase_request_items`
  ADD PRIMARY KEY (`pr_item_id`),
  ADD UNIQUE KEY `uniq_purchase_request_product` (`pr_id`,`product_id`),
  ADD KEY `idx_purchase_request_items_product` (`product_id`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`role_id`),
  ADD UNIQUE KEY `uniq_roles_identifier` (`role_identifier`);

--
-- Indexes for table `sales_orders`
--
ALTER TABLE `sales_orders`
  ADD PRIMARY KEY (`order_id`),
  ADD UNIQUE KEY `order_no` (`order_no`),
  ADD KEY `idx_sales_orders_status` (`status`),
  ADD KEY `idx_sales_orders_clerk` (`sales_clerk_id`),
  ADD KEY `idx_sales_orders_cashier` (`assigned_cashier_id`),
  ADD KEY `idx_sales_orders_created` (`created_at`);

--
-- Indexes for table `sales_order_items`
--
ALTER TABLE `sales_order_items`
  ADD PRIMARY KEY (`order_item_id`),
  ADD KEY `idx_sales_order_items_order` (`order_id`),
  ADD KEY `idx_sales_order_items_product` (`product_id`);

--
-- Indexes for table `sales_order_status_history`
--
ALTER TABLE `sales_order_status_history`
  ADD PRIMARY KEY (`history_id`),
  ADD KEY `idx_sales_status_history_order` (`order_id`),
  ADD KEY `idx_sales_status_history_changed` (`changed_at`);

--
-- Indexes for table `sales_payments`
--
ALTER TABLE `sales_payments`
  ADD PRIMARY KEY (`payment_id`),
  ADD KEY `idx_sales_payments_order` (`order_id`),
  ADD KEY `idx_sales_payments_cashier` (`cashier_id`),
  ADD KEY `idx_sales_payments_status` (`payment_status`);

--
-- Indexes for table `sales_receipts`
--
ALTER TABLE `sales_receipts`
  ADD PRIMARY KEY (`receipt_id`),
  ADD UNIQUE KEY `order_id` (`order_id`),
  ADD UNIQUE KEY `receipt_no` (`receipt_no`),
  ADD KEY `idx_sales_receipts_order` (`order_id`),
  ADD KEY `idx_sales_receipts_no` (`receipt_no`);

--
-- Indexes for table `suppliers`
--
ALTER TABLE `suppliers`
  ADD PRIMARY KEY (`supplier_id`);

--
-- Indexes for table `supplier_claims`
--
ALTER TABLE `supplier_claims`
  ADD PRIMARY KEY (`claim_id`),
  ADD KEY `idx_supplier_claims_po_item` (`po_item_id`),
  ADD KEY `idx_supplier_claims_inventory_batch` (`inventory_batch_id`),
  ADD KEY `idx_supplier_claims_unit_conversion` (`unit_conversion_id`),
  ADD KEY `idx_supplier_claims_status` (`claim_status`),
  ADD KEY `idx_supplier_claims_reported_by` (`reported_by`),
  ADD KEY `idx_supplier_claims_damaged_conversion` (`damaged_unit_conversion_id`),
  ADD KEY `idx_supplier_claims_action_conversion` (`action_unit_conversion_id`);

--
-- Indexes for table `supplier_claim_damage_lines`
--
ALTER TABLE `supplier_claim_damage_lines`
  ADD PRIMARY KEY (`damage_line_id`),
  ADD UNIQUE KEY `uq_supplier_claim_damage_sequence` (`claim_id`,`sequence_no`),
  ADD KEY `idx_claim_damage_affected_conversion` (`affected_unit_conversion_id`),
  ADD KEY `idx_claim_damage_damaged_conversion` (`damaged_unit_conversion_id`),
  ADD KEY `idx_claim_damage_inventory_batch` (`inventory_batch_id`),
  ADD KEY `idx_claim_damage_receiving_item` (`receiving_item_id`),
  ADD KEY `idx_claim_damage_claim_receiving` (`claim_id`,`receiving_item_id`);

--
-- Indexes for table `supplier_credits`
--
ALTER TABLE `supplier_credits`
  ADD PRIMARY KEY (`credit_id`),
  ADD UNIQUE KEY `uq_supplier_credits_claim` (`claim_id`),
  ADD KEY `idx_supplier_credits_status` (`credit_status`);

--
-- Indexes for table `supplier_credit_applications`
--
ALTER TABLE `supplier_credit_applications`
  ADD PRIMARY KEY (`application_id`),
  ADD UNIQUE KEY `uq_supplier_credit_application` (`credit_id`,`po_id`),
  ADD KEY `idx_supplier_credit_applications_po` (`po_id`),
  ADD KEY `idx_supplier_credit_applications_user` (`applied_by`);

--
-- Indexes for table `supplier_products`
--
ALTER TABLE `supplier_products`
  ADD PRIMARY KEY (`supplier_product_id`),
  ADD UNIQUE KEY `uniq_supplier_products_supplier_id_product_id` (`supplier_id`,`product_id`),
  ADD KEY `idx_supplier_products_product_id` (`product_id`);

--
-- Indexes for table `supplier_product_unit_conversions`
--
ALTER TABLE `supplier_product_unit_conversions`
  ADD PRIMARY KEY (`conversion_id`),
  ADD UNIQUE KEY `uq_supplier_product_unit` (`supplier_product_id`,`unit_name`),
  ADD KEY `idx_supplier_product_unit_factor` (`supplier_product_id`,`base_quantity`);

--
-- Indexes for table `supplier_refunds`
--
ALTER TABLE `supplier_refunds`
  ADD PRIMARY KEY (`refund_id`),
  ADD UNIQUE KEY `uq_supplier_refund_claim` (`claim_id`);

--
-- Indexes for table `system_settings`
--
ALTER TABLE `system_settings`
  ADD PRIMARY KEY (`setting_id`);

--
-- Indexes for table `tenants`
--
ALTER TABLE `tenants`
  ADD PRIMARY KEY (`tenant_id`),
  ADD UNIQUE KEY `uniq_tenants_slug` (`slug`);

--
-- Indexes for table `tenant_domains`
--
ALTER TABLE `tenant_domains`
  ADD PRIMARY KEY (`tenant_domain_id`),
  ADD UNIQUE KEY `uniq_tenant_domains_domain_name` (`domain_name`),
  ADD KEY `idx_tenant_domains_tenant` (`tenant_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`),
  ADD KEY `idx_users_email` (`email`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `business_hours`
--
ALTER TABLE `business_hours`
  MODIFY `business_hour_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17377;

--
-- AUTO_INCREMENT for table `business_hour_exceptions`
--
ALTER TABLE `business_hour_exceptions`
  MODIFY `exception_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `cashier_queue`
--
ALTER TABLE `cashier_queue`
  MODIFY `queue_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=74;

--
-- AUTO_INCREMENT for table `sales_orders`
--
ALTER TABLE `sales_orders`
  MODIFY `order_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=84;

--
-- AUTO_INCREMENT for table `sales_order_items`
--
ALTER TABLE `sales_order_items`
  MODIFY `order_item_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=152;

--
-- AUTO_INCREMENT for table `sales_order_status_history`
--
ALTER TABLE `sales_order_status_history`
  MODIFY `history_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=102;

--
-- AUTO_INCREMENT for table `sales_payments`
--
ALTER TABLE `sales_payments`
  MODIFY `payment_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=27;

--
-- AUTO_INCREMENT for table `sales_receipts`
--
ALTER TABLE `sales_receipts`
  MODIFY `receipt_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=26;

--
-- AUTO_INCREMENT for table `system_settings`
--
ALTER TABLE `system_settings`
  MODIFY `setting_id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `accounts`
--
ALTER TABLE `accounts`
  ADD CONSTRAINT `fk_accounts_parent` FOREIGN KEY (`parent_account_id`) REFERENCES `accounts` (`account_id`),
  ADD CONSTRAINT `fk_accounts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`),
  ADD CONSTRAINT `fk_accounts_type` FOREIGN KEY (`account_type_id`) REFERENCES `account_types` (`account_type_id`),
  ADD CONSTRAINT `fk_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `account_roles`
--
ALTER TABLE `account_roles`
  ADD CONSTRAINT `fk_account_roles_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`),
  ADD CONSTRAINT `fk_account_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`);

--
-- Constraints for table `auth_sessions`
--
ALTER TABLE `auth_sessions`
  ADD CONSTRAINT `fk_auth_sessions_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`),
  ADD CONSTRAINT `fk_auth_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`),
  ADD CONSTRAINT `fk_auth_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `cashier_queue`
--
ALTER TABLE `cashier_queue`
  ADD CONSTRAINT `cashier_queue_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE;

--
-- Constraints for table `grocery_details`
--
ALTER TABLE `grocery_details`
  ADD CONSTRAINT `fk_grocery_details_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `inventory_receiving_transactions`
--
ALTER TABLE `inventory_receiving_transactions`
  ADD CONSTRAINT `fk_inventory_receiving_transaction_batch` FOREIGN KEY (`inventory_batch_id`) REFERENCES `inventory_batches` (`batch_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_claim` FOREIGN KEY (`claim_id`) REFERENCES `supplier_claims` (`claim_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_po` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_po_item` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`po_item_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_receiving` FOREIGN KEY (`receiving_id`) REFERENCES `purchase_order_receiving` (`receiving_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_receiving_item` FOREIGN KEY (`receiving_item_id`) REFERENCES `purchase_order_receiving_items` (`receiving_item_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`),
  ADD CONSTRAINT `fk_inventory_receiving_transaction_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `inventory_transfers`
--
ALTER TABLE `inventory_transfers`
  ADD CONSTRAINT `fk_inventory_transfers_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`),
  ADD CONSTRAINT `fk_inventory_transfers_user` FOREIGN KEY (`transferred_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `inventory_transfer_allocations`
--
ALTER TABLE `inventory_transfer_allocations`
  ADD CONSTRAINT `fk_transfer_allocations_batch` FOREIGN KEY (`source_batch_id`) REFERENCES `inventory_batches` (`batch_id`),
  ADD CONSTRAINT `fk_transfer_allocations_selling` FOREIGN KEY (`selling_stock_id`) REFERENCES `product_selling_stock` (`selling_stock_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_transfer_allocations_transfer` FOREIGN KEY (`transfer_id`) REFERENCES `inventory_transfers` (`transfer_id`) ON DELETE CASCADE;

--
-- Constraints for table `login_attempts`
--
ALTER TABLE `login_attempts`
  ADD CONSTRAINT `fk_login_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `medical_supply_details`
--
ALTER TABLE `medical_supply_details`
  ADD CONSTRAINT `fk_medical_supply_details_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `medicine_details`
--
ALTER TABLE `medicine_details`
  ADD CONSTRAINT `fk_medicine_details_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `product`
--
ALTER TABLE `product`
  ADD CONSTRAINT `fk_product_category_id` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`category_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_product_inventory_unit` FOREIGN KEY (`inventory_unit_id`) REFERENCES `product_measurement_units` (`measurement_unit_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_product_type_id` FOREIGN KEY (`type_id`) REFERENCES `product_types` (`type_id`);

--
-- Constraints for table `product_inventory`
--
ALTER TABLE `product_inventory`
  ADD CONSTRAINT `fk_product_inventory_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `product_selling_options`
--
ALTER TABLE `product_selling_options`
  ADD CONSTRAINT `fk_product_selling_options_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE;

--
-- Constraints for table `product_selling_stock`
--
ALTER TABLE `product_selling_stock`
  ADD CONSTRAINT `fk_product_selling_stock_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_product_selling_stock_source_inventory_id` FOREIGN KEY (`source_inventory_id`) REFERENCES `product_inventory` (`inventory_id`) ON DELETE SET NULL;

--
-- Constraints for table `product_specification_choices`
--
ALTER TABLE `product_specification_choices`
  ADD CONSTRAINT `fk_spec_choice_definition` FOREIGN KEY (`specification_id`) REFERENCES `product_specifications` (`specification_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `product_specification_values`
--
ALTER TABLE `product_specification_values`
  ADD CONSTRAINT `fk_spec_value_definition` FOREIGN KEY (`specification_id`) REFERENCES `product_specifications` (`specification_id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_spec_value_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_spec_value_unit` FOREIGN KEY (`measurement_unit_id`) REFERENCES `product_measurement_units` (`measurement_unit_id`) ON UPDATE CASCADE;

--
-- Constraints for table `product_types`
--
ALTER TABLE `product_types`
  ADD CONSTRAINT `fk_product_types_category_id` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`category_id`) ON DELETE SET NULL;

--
-- Constraints for table `product_type_specifications`
--
ALTER TABLE `product_type_specifications`
  ADD CONSTRAINT `fk_type_spec_definition` FOREIGN KEY (`specification_id`) REFERENCES `product_specifications` (`specification_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_type_spec_type` FOREIGN KEY (`type_id`) REFERENCES `product_types` (`type_id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Constraints for table `purchase_orders`
--
ALTER TABLE `purchase_orders`
  ADD CONSTRAINT `fk_purchase_orders_pr` FOREIGN KEY (`pr_id`) REFERENCES `purchase_requests` (`pr_id`),
  ADD CONSTRAINT `fk_purchase_orders_supplier_id` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`);

--
-- Constraints for table `purchase_order_invoices`
--
ALTER TABLE `purchase_order_invoices`
  ADD CONSTRAINT `fk_purchase_order_invoice_po` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`),
  ADD CONSTRAINT `fk_purchase_order_invoice_user` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `purchase_order_invoice_items`
--
ALTER TABLE `purchase_order_invoice_items`
  ADD CONSTRAINT `fk_purchase_order_invoice_item_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `purchase_order_invoices` (`invoice_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_purchase_order_invoice_item_po_line` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`po_item_id`);

--
-- Constraints for table `purchase_order_items`
--
ALTER TABLE `purchase_order_items`
  ADD CONSTRAINT `fk_purchase_order_items_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_purchase_order_items_pr_item` FOREIGN KEY (`pr_item_id`) REFERENCES `purchase_request_items` (`pr_item_id`),
  ADD CONSTRAINT `fk_purchase_order_items_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`);

--
-- Constraints for table `purchase_order_payments`
--
ALTER TABLE `purchase_order_payments`
  ADD CONSTRAINT `fk_purchase_order_payments_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`),
  ADD CONSTRAINT `fk_purchase_order_payments_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `purchase_order_receiving`
--
ALTER TABLE `purchase_order_receiving`
  ADD CONSTRAINT `fk_po_receiving_claim` FOREIGN KEY (`claim_id`) REFERENCES `supplier_claims` (`claim_id`),
  ADD CONSTRAINT `fk_po_receiving_parent` FOREIGN KEY (`parent_receiving_id`) REFERENCES `purchase_order_receiving` (`receiving_id`),
  ADD CONSTRAINT `fk_purchase_order_receiving_inspected_by` FOREIGN KEY (`inspected_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_purchase_order_receiving_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`) ON DELETE CASCADE;

--
-- Constraints for table `purchase_order_receiving_items`
--
ALTER TABLE `purchase_order_receiving_items`
  ADD CONSTRAINT `fk_po_receiving_items_parent` FOREIGN KEY (`parent_receiving_item_id`) REFERENCES `purchase_order_receiving_items` (`receiving_item_id`),
  ADD CONSTRAINT `fk_purchase_order_receiving_items_po_item_id` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`po_item_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_purchase_order_receiving_items_receiving_id` FOREIGN KEY (`receiving_id`) REFERENCES `purchase_order_receiving` (`receiving_id`) ON DELETE CASCADE;

--
-- Constraints for table `purchase_order_receiving_revisions`
--
ALTER TABLE `purchase_order_receiving_revisions`
  ADD CONSTRAINT `fk_receiving_revisions_editor` FOREIGN KEY (`edited_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_receiving_revisions_receiving` FOREIGN KEY (`receiving_id`) REFERENCES `purchase_order_receiving` (`receiving_id`) ON DELETE CASCADE;

--
-- Constraints for table `purchase_requests`
--
ALTER TABLE `purchase_requests`
  ADD CONSTRAINT `fk_purchase_requests_requester` FOREIGN KEY (`requested_by`) REFERENCES `users` (`user_id`),
  ADD CONSTRAINT `fk_purchase_requests_supervisor` FOREIGN KEY (`supervisor_user_id`) REFERENCES `users` (`user_id`);

--
-- Constraints for table `purchase_request_items`
--
ALTER TABLE `purchase_request_items`
  ADD CONSTRAINT `fk_purchase_request_items_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`),
  ADD CONSTRAINT `fk_purchase_request_items_request` FOREIGN KEY (`pr_id`) REFERENCES `purchase_requests` (`pr_id`) ON DELETE CASCADE;

--
-- Constraints for table `sales_order_items`
--
ALTER TABLE `sales_order_items`
  ADD CONSTRAINT `sales_order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE;

--
-- Constraints for table `sales_order_status_history`
--
ALTER TABLE `sales_order_status_history`
  ADD CONSTRAINT `sales_order_status_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE;

--
-- Constraints for table `sales_payments`
--
ALTER TABLE `sales_payments`
  ADD CONSTRAINT `sales_payments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE;

--
-- Constraints for table `sales_receipts`
--
ALTER TABLE `sales_receipts`
  ADD CONSTRAINT `sales_receipts_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE;

--
-- Constraints for table `supplier_claims`
--
ALTER TABLE `supplier_claims`
  ADD CONSTRAINT `fk_supplier_claims_action_conversion` FOREIGN KEY (`action_unit_conversion_id`) REFERENCES `supplier_product_unit_conversions` (`conversion_id`),
  ADD CONSTRAINT `fk_supplier_claims_damaged_conversion` FOREIGN KEY (`damaged_unit_conversion_id`) REFERENCES `supplier_product_unit_conversions` (`conversion_id`),
  ADD CONSTRAINT `fk_supplier_claims_inventory_batch` FOREIGN KEY (`inventory_batch_id`) REFERENCES `inventory_batches` (`batch_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_supplier_claims_po_item` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`po_item_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_supplier_claims_reported_by` FOREIGN KEY (`reported_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_supplier_claims_unit_conversion` FOREIGN KEY (`unit_conversion_id`) REFERENCES `supplier_product_unit_conversions` (`conversion_id`);

--
-- Constraints for table `supplier_claim_damage_lines`
--
ALTER TABLE `supplier_claim_damage_lines`
  ADD CONSTRAINT `fk_claim_damage_affected_conversion` FOREIGN KEY (`affected_unit_conversion_id`) REFERENCES `supplier_product_unit_conversions` (`conversion_id`),
  ADD CONSTRAINT `fk_claim_damage_claim` FOREIGN KEY (`claim_id`) REFERENCES `supplier_claims` (`claim_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_claim_damage_damaged_conversion` FOREIGN KEY (`damaged_unit_conversion_id`) REFERENCES `supplier_product_unit_conversions` (`conversion_id`),
  ADD CONSTRAINT `fk_claim_damage_inventory_batch` FOREIGN KEY (`inventory_batch_id`) REFERENCES `inventory_batches` (`batch_id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_claim_damage_receiving_item` FOREIGN KEY (`receiving_item_id`) REFERENCES `purchase_order_receiving_items` (`receiving_item_id`) ON DELETE CASCADE;

--
-- Constraints for table `supplier_credits`
--
ALTER TABLE `supplier_credits`
  ADD CONSTRAINT `fk_supplier_credits_claim` FOREIGN KEY (`claim_id`) REFERENCES `supplier_claims` (`claim_id`) ON DELETE CASCADE;

--
-- Constraints for table `supplier_credit_applications`
--
ALTER TABLE `supplier_credit_applications`
  ADD CONSTRAINT `fk_supplier_credit_applications_credit` FOREIGN KEY (`credit_id`) REFERENCES `supplier_credits` (`credit_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_supplier_credit_applications_po` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`),
  ADD CONSTRAINT `fk_supplier_credit_applications_user` FOREIGN KEY (`applied_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL;

--
-- Constraints for table `supplier_products`
--
ALTER TABLE `supplier_products`
  ADD CONSTRAINT `fk_supplier_products_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_supplier_products_supplier_id` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE CASCADE;

--
-- Constraints for table `supplier_product_unit_conversions`
--
ALTER TABLE `supplier_product_unit_conversions`
  ADD CONSTRAINT `fk_supplier_product_unit_supplier_product` FOREIGN KEY (`supplier_product_id`) REFERENCES `supplier_products` (`supplier_product_id`) ON DELETE CASCADE;

--
-- Constraints for table `tenant_domains`
--
ALTER TABLE `tenant_domains`
  ADD CONSTRAINT `fk_tenant_domains_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
