-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: 127.0.0.1    Database: pharma_db
-- ------------------------------------------------------
-- Server version	10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `pharma_db`
--

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `pharma_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;

USE `pharma_db`;

--
-- Table structure for table `account_roles`
--

DROP TABLE IF EXISTS `account_roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`account_role_id`),
  UNIQUE KEY `uniq_account_roles_account_role` (`account_id`,`role_id`),
  KEY `idx_account_roles_role` (`role_id`),
  CONSTRAINT `fk_account_roles_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`),
  CONSTRAINT `fk_account_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `account_types`
--

DROP TABLE IF EXISTS `account_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `account_types` (
  `account_type_id` char(36) NOT NULL DEFAULT uuid(),
  `code` varchar(50) NOT NULL,
  `name` varchar(80) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`account_type_id`),
  UNIQUE KEY `uniq_account_types_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uniq_accounts_context` (`user_id`,`tenant_id`,`account_type_id`,`accountable_id`),
  KEY `idx_accounts_user` (`user_id`),
  KEY `idx_accounts_tenant` (`tenant_id`),
  KEY `idx_accounts_type` (`account_type_id`),
  KEY `fk_accounts_parent` (`parent_account_id`),
  CONSTRAINT `fk_accounts_parent` FOREIGN KEY (`parent_account_id`) REFERENCES `accounts` (`account_id`),
  CONSTRAINT `fk_accounts_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`),
  CONSTRAINT `fk_accounts_type` FOREIGN KEY (`account_type_id`) REFERENCES `account_types` (`account_type_id`),
  CONSTRAINT `fk_accounts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `activity_logs`
--

DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_logs` (
  `activity_id` char(36) NOT NULL DEFAULT uuid(),
  `user_id` char(36) DEFAULT NULL,
  `role` varchar(80) DEFAULT NULL,
  `module` varchar(80) NOT NULL,
  `action` varchar(80) NOT NULL,
  `description` text NOT NULL,
  `reference_id` varchar(80) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`activity_id`),
  KEY `idx_activity_logs_created_at` (`created_at`),
  KEY `idx_activity_logs_module_action` (`module`,`action`),
  KEY `idx_activity_logs_reference` (`reference_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auth_sessions`
--

DROP TABLE IF EXISTS `auth_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`auth_session_id`),
  UNIQUE KEY `uniq_auth_sessions_token_hash` (`session_token_hash`),
  KEY `idx_auth_sessions_php_session` (`php_session_id`),
  KEY `idx_auth_sessions_user` (`user_id`),
  KEY `idx_auth_sessions_account` (`account_id`),
  KEY `idx_auth_sessions_tenant` (`tenant_id`),
  CONSTRAINT `fk_auth_sessions_account` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`),
  CONSTRAINT `fk_auth_sessions_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`),
  CONSTRAINT `fk_auth_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `business_hour_exceptions`
--

DROP TABLE IF EXISTS `business_hour_exceptions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `business_hour_exceptions` (
  `exception_id` int(11) NOT NULL AUTO_INCREMENT,
  `exception_date` date NOT NULL,
  `is_open` tinyint(1) NOT NULL DEFAULT 0,
  `opening_time` time DEFAULT NULL,
  `closing_time` time DEFAULT NULL,
  `reason` varchar(80) NOT NULL DEFAULT 'Custom Hours',
  `custom_reason` varchar(255) DEFAULT NULL,
  `created_by` varchar(150) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`exception_id`),
  UNIQUE KEY `unique_exception_date` (`exception_date`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `business_hours`
--

DROP TABLE IF EXISTS `business_hours`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `business_hours` (
  `business_hour_id` int(11) NOT NULL AUTO_INCREMENT,
  `day_of_week` enum('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') NOT NULL,
  `is_open` tinyint(1) NOT NULL DEFAULT 1,
  `opening_time` time DEFAULT NULL,
  `closing_time` time DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`business_hour_id`),
  UNIQUE KEY `unique_day_of_week` (`day_of_week`)
) ENGINE=InnoDB AUTO_INCREMENT=5673 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `cashier_queue`
--

DROP TABLE IF EXISTS `cashier_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `cashier_queue` (
  `queue_id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `cashier_id` char(36) DEFAULT NULL,
  `queue_status` enum('waiting','accepted','processing','completed','cancelled','rejected') NOT NULL DEFAULT 'waiting',
  `queued_at` datetime NOT NULL DEFAULT current_timestamp(),
  `accepted_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`queue_id`),
  UNIQUE KEY `order_id` (`order_id`),
  KEY `idx_cashier_queue_status` (`queue_status`),
  KEY `idx_cashier_queue_cashier` (`cashier_id`),
  CONSTRAINT `cashier_queue_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=50 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `entity_dimensions`
--

DROP TABLE IF EXISTS `entity_dimensions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `entity_dimensions` (
  `dimension_id` char(36) NOT NULL DEFAULT uuid(),
  `entity_type` varchar(80) NOT NULL,
  `entity_id` char(36) NOT NULL,
  `dimension_type` varchar(80) NOT NULL,
  `numeric_value` decimal(12,4) DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `text_value` varchar(150) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`dimension_id`),
  UNIQUE KEY `uniq_entity_dimension` (`entity_type`,`entity_id`,`dimension_type`,`unit`,`text_value`),
  KEY `idx_entity_dimensions_entity` (`entity_type`,`entity_id`),
  KEY `idx_entity_dimensions_type` (`dimension_type`,`unit`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `grocery_details`
--

DROP TABLE IF EXISTS `grocery_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `grocery_details` (
  `grocery_detail_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL,
  `variant` varchar(150) DEFAULT NULL,
  `size` varchar(50) DEFAULT NULL,
  `net_weight` varchar(50) DEFAULT NULL,
  `unit` varchar(20) DEFAULT NULL,
  `package_type` varchar(100) DEFAULT NULL,
  `pack_content` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`grocery_detail_id`),
  KEY `fk_grocery_details_product` (`product_id`),
  CONSTRAINT `fk_grocery_details_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_batches`
--

DROP TABLE IF EXISTS `inventory_batches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`batch_id`),
  UNIQUE KEY `uniq_inventory_batches_legacy_inventory_id` (`legacy_inventory_id`),
  UNIQUE KEY `uniq_inventory_batches_po_item` (`po_id`,`po_item_id`),
  KEY `idx_inventory_batches_product_status` (`product_id`,`batch_status`),
  KEY `idx_inventory_batches_fefo` (`product_id`,`expiry_date`,`received_date`),
  KEY `idx_inventory_batches_po_id` (`po_id`),
  KEY `idx_inventory_batches_po_item_id` (`po_item_id`),
  KEY `idx_inventory_batches_supplier_id` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_transfer_allocations`
--

DROP TABLE IF EXISTS `inventory_transfer_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `inventory_transfer_allocations` (
  `allocation_id` char(36) NOT NULL DEFAULT uuid(),
  `transfer_id` char(36) NOT NULL,
  `source_batch_id` char(36) NOT NULL,
  `selling_stock_id` char(36) DEFAULT NULL,
  `batch_number` varchar(80) DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `base_quantity` int(11) NOT NULL,
  PRIMARY KEY (`allocation_id`),
  KEY `idx_transfer_allocations_transfer` (`transfer_id`),
  KEY `idx_transfer_allocations_batch` (`source_batch_id`),
  KEY `fk_transfer_allocations_selling` (`selling_stock_id`),
  CONSTRAINT `fk_transfer_allocations_batch` FOREIGN KEY (`source_batch_id`) REFERENCES `inventory_batches` (`batch_id`),
  CONSTRAINT `fk_transfer_allocations_selling` FOREIGN KEY (`selling_stock_id`) REFERENCES `product_selling_stock` (`selling_stock_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_transfer_allocations_transfer` FOREIGN KEY (`transfer_id`) REFERENCES `inventory_transfers` (`transfer_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_transfer_allocation_quantity` CHECK (`base_quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `inventory_transfers`
--

DROP TABLE IF EXISTS `inventory_transfers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`transfer_id`),
  KEY `idx_inventory_transfers_product_date` (`product_id`,`created_at`),
  KEY `idx_inventory_transfers_user` (`transferred_by`),
  CONSTRAINT `fk_inventory_transfers_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`),
  CONSTRAINT `fk_inventory_transfers_user` FOREIGN KEY (`transferred_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL,
  CONSTRAINT `chk_inventory_transfer_quantities` CHECK (`selected_quantity` > 0 and `base_quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `login_attempts`
--

DROP TABLE IF EXISTS `login_attempts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`attempt_id`),
  KEY `idx_login_attempts_user` (`user_id`),
  KEY `idx_login_attempts_username` (`username`),
  KEY `idx_login_attempts_ip` (`ip_address`),
  KEY `idx_login_attempts_created` (`created_at`),
  CONSTRAINT `fk_login_attempts_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `lookup_values`
--

DROP TABLE IF EXISTS `lookup_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `lookup_values` (
  `lookup_id` char(36) NOT NULL DEFAULT uuid(),
  `lookup_type` varchar(80) NOT NULL,
  `lookup_code` varchar(120) NOT NULL,
  `lookup_label` varchar(150) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`lookup_id`),
  UNIQUE KEY `uniq_lookup_values_type_code` (`lookup_type`,`lookup_code`),
  KEY `idx_lookup_values_type_active` (`lookup_type`,`is_active`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `medical_supply_details`
--

DROP TABLE IF EXISTS `medical_supply_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medical_supply_details` (
  `medical_supply_detail_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `variant` varchar(100) DEFAULT NULL,
  `size` varchar(100) DEFAULT NULL,
  `material` varchar(100) DEFAULT NULL,
  `sterile_status` varchar(50) DEFAULT NULL,
  `package_type` varchar(100) DEFAULT NULL,
  `pack_content` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`medical_supply_detail_id`),
  KEY `fk_medical_supply_details_product` (`product_id`),
  CONSTRAINT `fk_medical_supply_details_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `medicine_details`
--

DROP TABLE IF EXISTS `medicine_details`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`medicine_detail_id`),
  KEY `fk_medicine_details_product` (`product_id`),
  CONSTRAINT `fk_medicine_details_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product`
--

DROP TABLE IF EXISTS `product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `status` varchar(20) NOT NULL DEFAULT 'Active',
  PRIMARY KEY (`product_id`),
  KEY `idx_product_category_id` (`category_id`),
  KEY `idx_product_type_id` (`type_id`),
  KEY `idx_product_brand_name` (`brand_name`),
  KEY `idx_product_product_name` (`product_name`),
  KEY `idx_product_inventory_unit` (`inventory_unit_id`),
  CONSTRAINT `fk_product_category_id` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`category_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_product_inventory_unit` FOREIGN KEY (`inventory_unit_id`) REFERENCES `product_measurement_units` (`measurement_unit_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_product_type_id` FOREIGN KEY (`type_id`) REFERENCES `product_types` (`type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_categories`
--

DROP TABLE IF EXISTS `product_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_categories` (
  `category_name` varchar(50) NOT NULL,
  `default_markup_percentage` decimal(7,2) NOT NULL DEFAULT 0.00,
  `pricing_behavior` varchar(30) NOT NULL DEFAULT 'review_required',
  `category_id` char(36) NOT NULL DEFAULT uuid(),
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_inventory`
--

DROP TABLE IF EXISTS `product_inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `product_id` char(36) NOT NULL,
  PRIMARY KEY (`inventory_id`),
  KEY `idx_product_inventory_product_id_variation_id` (`product_id`),
  KEY `idx_product_inventory_expiration_date` (`expiration_date`),
  KEY `idx_product_inventory_batch_number` (`batch_number`),
  CONSTRAINT `fk_product_inventory_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_measurement_units`
--

DROP TABLE IF EXISTS `product_measurement_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_measurement_units` (
  `unit_name` varchar(40) NOT NULL,
  `unit_symbol` varchar(20) DEFAULT NULL,
  `measurement_group` varchar(30) NOT NULL DEFAULT 'General Size',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_system` tinyint(1) NOT NULL DEFAULT 0,
  `measurement_unit_id` char(36) NOT NULL DEFAULT uuid(),
  PRIMARY KEY (`measurement_unit_id`),
  UNIQUE KEY `uq_measurement_unit_group_name` (`measurement_group`,`unit_name`),
  UNIQUE KEY `uq_measurement_unit_group_symbol` (`measurement_group`,`unit_symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_selling_stock`
--

DROP TABLE IF EXISTS `product_selling_stock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_selling_stock` (
  `batch_number` varchar(80) DEFAULT NULL,
  `quantity_stocked` int(11) NOT NULL DEFAULT 0,
  `quantity_remaining` int(11) NOT NULL DEFAULT 0,
  `expiration_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `selling_stock_id` char(36) NOT NULL DEFAULT uuid(),
  `product_id` char(36) NOT NULL,
  `source_inventory_id` char(36) DEFAULT NULL,
  `source_batch_id` char(36) DEFAULT NULL,
  PRIMARY KEY (`selling_stock_id`),
  KEY `idx_product_selling_stock_product_id_variation_id` (`product_id`),
  KEY `idx_product_selling_stock_source_inventory_id` (`source_inventory_id`),
  CONSTRAINT `fk_product_selling_stock_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_product_selling_stock_source_inventory_id` FOREIGN KEY (`source_inventory_id`) REFERENCES `product_inventory` (`inventory_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_specification_choices`
--

DROP TABLE IF EXISTS `product_specification_choices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_specification_choices` (
  `choice_id` char(36) NOT NULL DEFAULT uuid(),
  `specification_id` char(36) NOT NULL,
  `choice_value` varchar(120) NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`choice_id`),
  UNIQUE KEY `uq_specification_choice` (`specification_id`,`choice_value`),
  CONSTRAINT `fk_spec_choice_definition` FOREIGN KEY (`specification_id`) REFERENCES `product_specifications` (`specification_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_specification_values`
--

DROP TABLE IF EXISTS `product_specification_values`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_specification_values` (
  `product_id` char(36) NOT NULL,
  `specification_id` char(36) NOT NULL,
  `value_text` varchar(255) DEFAULT NULL,
  `value_number` decimal(14,4) DEFAULT NULL,
  `measurement_unit_id` char(36) DEFAULT NULL,
  PRIMARY KEY (`product_id`,`specification_id`),
  KEY `fk_spec_value_definition` (`specification_id`),
  KEY `fk_spec_value_unit` (`measurement_unit_id`),
  CONSTRAINT `fk_spec_value_definition` FOREIGN KEY (`specification_id`) REFERENCES `product_specifications` (`specification_id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_spec_value_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_spec_value_unit` FOREIGN KEY (`measurement_unit_id`) REFERENCES `product_measurement_units` (`measurement_unit_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_specifications`
--

DROP TABLE IF EXISTS `product_specifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_specifications` (
  `specification_id` char(36) NOT NULL DEFAULT uuid(),
  `specification_name` varchar(80) NOT NULL,
  `field_style` varchar(30) NOT NULL,
  `measurement_group` varchar(30) DEFAULT NULL,
  `allow_custom_value` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`specification_id`),
  UNIQUE KEY `uq_product_specification_name` (`specification_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_type_specifications`
--

DROP TABLE IF EXISTS `product_type_specifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_type_specifications` (
  `type_id` char(36) NOT NULL,
  `specification_id` char(36) NOT NULL,
  `display_label` varchar(80) DEFAULT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`type_id`,`specification_id`),
  KEY `fk_type_spec_definition` (`specification_id`),
  CONSTRAINT `fk_type_spec_definition` FOREIGN KEY (`specification_id`) REFERENCES `product_specifications` (`specification_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_type_spec_type` FOREIGN KEY (`type_id`) REFERENCES `product_types` (`type_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_types`
--

DROP TABLE IF EXISTS `product_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_types` (
  `type_name` varchar(80) NOT NULL,
  `type_id` char(36) NOT NULL DEFAULT uuid(),
  `category_id` char(36) DEFAULT NULL,
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `uniq_product_types_category_id_type_name` (`category_id`,`type_name`),
  KEY `idx_product_types_category_id` (`category_id`),
  CONSTRAINT `fk_product_types_category_id` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`category_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `product_variations_backup`
--

DROP TABLE IF EXISTS `product_variations_backup`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_approval_audit`
--

DROP TABLE IF EXISTS `purchase_order_approval_audit`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`audit_id`),
  KEY `idx_po_approval_audit_po` (`po_id`),
  KEY `idx_po_approval_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `line_total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `po_item_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `pr_item_id` char(36) DEFAULT NULL,
  `product_id` char(36) NOT NULL,
  PRIMARY KEY (`po_item_id`),
  KEY `idx_purchase_order_items_po_id` (`po_id`),
  KEY `idx_purchase_order_items_product_id` (`product_id`),
  KEY `idx_purchase_order_items_pr_item` (`pr_item_id`),
  CONSTRAINT `fk_purchase_order_items_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_order_items_pr_item` FOREIGN KEY (`pr_item_id`) REFERENCES `purchase_request_items` (`pr_item_id`),
  CONSTRAINT `fk_purchase_order_items_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_payments`
--

DROP TABLE IF EXISTS `purchase_order_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_payments` (
  `payment_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_method` varchar(40) NOT NULL,
  `payment_date` date NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `recorded_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `idempotency_key` varchar(100) NOT NULL,
  PRIMARY KEY (`payment_id`),
  UNIQUE KEY `uniq_purchase_order_payments_idempotency` (`idempotency_key`),
  KEY `idx_purchase_order_payments_po_id` (`po_id`),
  KEY `idx_purchase_order_payments_payment_date` (`payment_date`),
  KEY `fk_purchase_order_payments_recorded_by` (`recorded_by`),
  CONSTRAINT `fk_purchase_order_payments_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`),
  CONSTRAINT `fk_purchase_order_payments_recorded_by` FOREIGN KEY (`recorded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_receiving`
--

DROP TABLE IF EXISTS `purchase_order_receiving`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_receiving` (
  `received_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `remarks` text DEFAULT NULL,
  `receiving_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  PRIMARY KEY (`receiving_id`),
  UNIQUE KEY `uniq_purchase_order_receiving_po_id` (`po_id`),
  CONSTRAINT `fk_purchase_order_receiving_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_receiving_items`
--

DROP TABLE IF EXISTS `purchase_order_receiving_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_receiving_items` (
  `received_quantity` int(11) NOT NULL DEFAULT 0,
  `damaged_quantity` int(11) NOT NULL DEFAULT 0,
  `receiving_item_id` char(36) NOT NULL DEFAULT uuid(),
  `receiving_id` char(36) NOT NULL,
  `po_item_id` char(36) NOT NULL,
  PRIMARY KEY (`receiving_item_id`),
  UNIQUE KEY `uniq_purchase_order_receiving_items_receiving_id_po_item_id` (`receiving_id`,`po_item_id`),
  KEY `idx_purchase_order_receiving_items_po_item_id` (`po_item_id`),
  CONSTRAINT `fk_purchase_order_receiving_items_po_item_id` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`po_item_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_order_receiving_items_receiving_id` FOREIGN KEY (`receiving_id`) REFERENCES `purchase_order_receiving` (`receiving_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_order_returns`
--

DROP TABLE IF EXISTS `purchase_order_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_returns` (
  `return_quantity` int(11) NOT NULL DEFAULT 0,
  `damage_reason` varchar(80) NOT NULL,
  `remarks` text DEFAULT NULL,
  `return_status` varchar(40) NOT NULL DEFAULT 'Open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `return_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `po_item_id` char(36) NOT NULL,
  PRIMARY KEY (`return_id`),
  KEY `idx_purchase_order_returns_po_id` (`po_id`),
  KEY `idx_purchase_order_returns_po_item_id` (`po_item_id`),
  KEY `idx_purchase_order_returns_return_status` (`return_status`),
  CONSTRAINT `fk_purchase_order_returns_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_order_returns_po_item_id` FOREIGN KEY (`po_item_id`) REFERENCES `purchase_order_items` (`po_item_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_orders` (
  `po_number` varchar(50) NOT NULL,
  `payment_terms` varchar(40) DEFAULT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `final_payment` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(40) NOT NULL DEFAULT 'Pending',
  `approval_status` enum('Pending','Approved','Revision Requested','Rejected') NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `payment_status` varchar(40) NOT NULL DEFAULT 'Unpaid',
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `po_id` char(36) NOT NULL DEFAULT uuid(),
  `pr_id` char(36) DEFAULT NULL,
  `supplier_id` char(36) NOT NULL,
  PRIMARY KEY (`po_id`),
  UNIQUE KEY `uniq_purchase_orders_po_number` (`po_number`),
  KEY `idx_purchase_orders_supplier_id` (`supplier_id`),
  KEY `idx_purchase_orders_status` (`status`),
  KEY `idx_purchase_orders_created_at` (`created_at`),
  KEY `idx_purchase_orders_pr` (`pr_id`),
  CONSTRAINT `fk_purchase_orders_pr` FOREIGN KEY (`pr_id`) REFERENCES `purchase_requests` (`pr_id`),
  CONSTRAINT `fk_purchase_orders_supplier_id` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_request_items`
--

DROP TABLE IF EXISTS `purchase_request_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_request_items` (
  `pr_item_id` char(36) NOT NULL DEFAULT uuid(),
  `pr_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  `supplier_product_id` char(36) DEFAULT NULL,
  `current_stock_snapshot` decimal(12,2) NOT NULL DEFAULT 0.00,
  `requested_qty` decimal(12,2) NOT NULL,
  `unit_snapshot` varchar(80) DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`pr_item_id`),
  UNIQUE KEY `uniq_purchase_request_product` (`pr_id`,`product_id`),
  KEY `idx_purchase_request_items_product` (`product_id`),
  KEY `idx_purchase_request_items_supplier_product` (`supplier_product_id`),
  CONSTRAINT `fk_purchase_request_items_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`),
  CONSTRAINT `fk_purchase_request_items_request` FOREIGN KEY (`pr_id`) REFERENCES `purchase_requests` (`pr_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_request_items_supplier_product` FOREIGN KEY (`supplier_product_id`) REFERENCES `supplier_products` (`supplier_product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `purchase_requests`
--

DROP TABLE IF EXISTS `purchase_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_requests` (
  `pr_id` char(36) NOT NULL DEFAULT uuid(),
  `pr_number` varchar(40) NOT NULL,
  `requested_by` char(36) NOT NULL,
  `request_date` date NOT NULL,
  `reason` text DEFAULT NULL,
  `status` enum('Draft','Pending Supervisor Approval','Approved','Revision Requested','Rejected') NOT NULL DEFAULT 'Draft',
  `supervisor_user_id` char(36) DEFAULT NULL,
  `decision_reason` text DEFAULT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `converted_po_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`pr_id`),
  UNIQUE KEY `uniq_purchase_requests_number` (`pr_number`),
  UNIQUE KEY `uniq_purchase_requests_converted_po` (`converted_po_id`),
  KEY `idx_purchase_requests_status_date` (`status`,`request_date`),
  KEY `idx_purchase_requests_requester` (`requested_by`),
  KEY `idx_purchase_requests_supervisor` (`supervisor_user_id`),
  CONSTRAINT `fk_purchase_requests_po` FOREIGN KEY (`converted_po_id`) REFERENCES `purchase_orders` (`po_id`),
  CONSTRAINT `fk_purchase_requests_requester` FOREIGN KEY (`requested_by`) REFERENCES `users` (`user_id`),
  CONSTRAINT `fk_purchase_requests_supervisor` FOREIGN KEY (`supervisor_user_id`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `uniq_roles_identifier` (`role_identifier`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_order_items`
--

DROP TABLE IF EXISTS `sales_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_order_items` (
  `order_item_id` int(11) NOT NULL AUTO_INCREMENT,
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
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`order_item_id`),
  KEY `idx_sales_order_items_order` (`order_id`),
  KEY `idx_sales_order_items_product` (`product_id`),
  CONSTRAINT `sales_order_items_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=83 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_order_status_history`
--

DROP TABLE IF EXISTS `sales_order_status_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_order_status_history` (
  `history_id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `old_status` varchar(50) DEFAULT NULL,
  `new_status` varchar(50) NOT NULL,
  `changed_by` char(36) DEFAULT NULL,
  `remarks` varchar(255) DEFAULT NULL,
  `changed_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`history_id`),
  KEY `idx_sales_status_history_order` (`order_id`),
  KEY `idx_sales_status_history_changed` (`changed_at`),
  CONSTRAINT `sales_order_status_history_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=63 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_orders`
--

DROP TABLE IF EXISTS `sales_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_orders` (
  `order_id` int(11) NOT NULL AUTO_INCREMENT,
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
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`order_id`),
  UNIQUE KEY `order_no` (`order_no`),
  KEY `idx_sales_orders_status` (`status`),
  KEY `idx_sales_orders_clerk` (`sales_clerk_id`),
  KEY `idx_sales_orders_cashier` (`assigned_cashier_id`),
  KEY `idx_sales_orders_created` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_payments`
--

DROP TABLE IF EXISTS `sales_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_payments` (
  `payment_id` int(11) NOT NULL AUTO_INCREMENT,
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
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`payment_id`),
  KEY `idx_sales_payments_order` (`order_id`),
  KEY `idx_sales_payments_cashier` (`cashier_id`),
  KEY `idx_sales_payments_status` (`payment_status`),
  CONSTRAINT `sales_payments_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sales_receipts`
--

DROP TABLE IF EXISTS `sales_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `sales_receipts` (
  `receipt_id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `receipt_no` varchar(50) NOT NULL,
  `customer_name` varchar(150) DEFAULT NULL,
  `sales_clerk_id` char(36) DEFAULT NULL,
  `cashier_id` char(36) DEFAULT NULL,
  `total_amount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `payment_method` varchar(50) DEFAULT NULL,
  `printed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`receipt_id`),
  UNIQUE KEY `order_id` (`order_id`),
  UNIQUE KEY `receipt_no` (`receipt_no`),
  KEY `idx_sales_receipts_order` (`order_id`),
  KEY `idx_sales_receipts_no` (`receipt_no`),
  CONSTRAINT `sales_receipts_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `sales_orders` (`order_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `supplier_product_unit_conversions`
--

DROP TABLE IF EXISTS `supplier_product_unit_conversions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `supplier_product_unit_conversions` (
  `conversion_id` char(36) NOT NULL DEFAULT uuid(),
  `supplier_product_id` char(36) NOT NULL,
  `unit_name` varchar(50) NOT NULL,
  `base_quantity` int(11) NOT NULL,
  `level_order` int(11) NOT NULL DEFAULT 0,
  `is_transfer_unit` tinyint(1) NOT NULL DEFAULT 1,
  `is_selling_unit` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`conversion_id`),
  UNIQUE KEY `uq_supplier_product_unit` (`supplier_product_id`,`unit_name`),
  KEY `idx_supplier_product_unit_factor` (`supplier_product_id`,`base_quantity`),
  CONSTRAINT `fk_supplier_product_unit_supplier_product` FOREIGN KEY (`supplier_product_id`) REFERENCES `supplier_products` (`supplier_product_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_supplier_product_unit_base` CHECK (`base_quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `supplier_products`
--

DROP TABLE IF EXISTS `supplier_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `units_per_purchase_unit` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`supplier_product_id`),
  UNIQUE KEY `uniq_supplier_products_supplier_id_product_id` (`supplier_id`,`product_id`),
  KEY `idx_supplier_products_product_id` (`product_id`),
  CONSTRAINT `fk_supplier_products_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_supplier_products_supplier_id` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `suppliers` (
  `supplier_name` varchar(150) NOT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `archived_at` timestamp NULL DEFAULT NULL,
  `supplier_id` char(36) NOT NULL DEFAULT uuid(),
  PRIMARY KEY (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_settings`
--

DROP TABLE IF EXISTS `system_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `system_settings` (
  `setting_id` int(11) NOT NULL AUTO_INCREMENT,
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
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`setting_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tenant_domains`
--

DROP TABLE IF EXISTS `tenant_domains`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`tenant_domain_id`),
  UNIQUE KEY `uniq_tenant_domains_domain_name` (`domain_name`),
  KEY `idx_tenant_domains_tenant` (`tenant_id`),
  CONSTRAINT `fk_tenant_domains_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `tenants` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `tenants`
--

DROP TABLE IF EXISTS `tenants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tenants` (
  `tenant_id` char(36) NOT NULL DEFAULT uuid(),
  `name` varchar(120) NOT NULL,
  `slug` varchar(80) NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'active',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_archived` tinyint(1) NOT NULL DEFAULT 0,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT NULL ON UPDATE current_timestamp(),
  PRIMARY KEY (`tenant_id`),
  UNIQUE KEY `uniq_tenants_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
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
  `user_id` char(36) NOT NULL DEFAULT uuid(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_users_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping events for database 'pharma_db'
--

--
-- Dumping routines for database 'pharma_db'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-13  2:03:54
