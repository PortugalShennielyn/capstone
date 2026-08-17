-- MariaDB dump 10.19  Distrib 10.4.32-MariaDB, for Win64 (AMD64)
--
-- Host: localhost    Database: pharma_db
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
-- Dumping data for table `purchase_order_payments`
--

LOCK TABLES `purchase_order_payments` WRITE;
/*!40000 ALTER TABLE `purchase_order_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_payments` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `purchase_order_receiving`
--

LOCK TABLES `purchase_order_receiving` WRITE;
/*!40000 ALTER TABLE `purchase_order_receiving` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_receiving` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `purchase_order_receiving_items`
--

LOCK TABLES `purchase_order_receiving_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_receiving_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_receiving_items` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `purchase_order_returns`
--

LOCK TABLES `purchase_order_returns` WRITE;
/*!40000 ALTER TABLE `purchase_order_returns` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_returns` ENABLE KEYS */;
UNLOCK TABLES;

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
  `is_selling_unit` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`conversion_id`),
  UNIQUE KEY `uq_supplier_product_unit` (`supplier_product_id`,`unit_name`),
  KEY `idx_supplier_product_unit_factor` (`supplier_product_id`,`base_quantity`),
  CONSTRAINT `fk_supplier_product_unit_supplier_product` FOREIGN KEY (`supplier_product_id`) REFERENCES `supplier_products` (`supplier_product_id`) ON DELETE CASCADE,
  CONSTRAINT `chk_supplier_product_unit_base` CHECK (`base_quantity` > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_product_unit_conversions`
--

LOCK TABLES `supplier_product_unit_conversions` WRITE;
/*!40000 ALTER TABLE `supplier_product_unit_conversions` DISABLE KEYS */;
INSERT INTO `supplier_product_unit_conversions` VALUES ('16b5758e-972f-11f1-9fb5-706871ff20d7','2b1ddf97-96f6-11f1-9fb5-706871ff20d7','Pc',1,0,1,0,'2026-08-13 15:53:12'),('16b586c6-972f-11f1-9fb5-706871ff20d7','2b1ddf97-96f6-11f1-9fb5-706871ff20d7','Pack',10,1,0,0,'2026-08-13 15:53:12'),('16b5a1aa-972f-11f1-9fb5-706871ff20d7','2b1ddf97-96f6-11f1-9fb5-706871ff20d7','Box',50,2,0,0,'2026-08-13 15:53:12'),('449e80ee-978f-11f1-9306-706871ff20d7','2b1de1ef-96f6-11f1-9fb5-706871ff20d7','pcs',1,0,1,0,'2026-08-14 03:21:41'),('449e9008-978f-11f1-9306-706871ff20d7','2b1de1ef-96f6-11f1-9fb5-706871ff20d7','Pack',12,1,0,0,'2026-08-14 03:21:41'),('449e9b31-978f-11f1-9306-706871ff20d7','2b1de1ef-96f6-11f1-9fb5-706871ff20d7','Box',240,2,0,0,'2026-08-14 03:21:41'),('476a23d9-97a1-11f1-9306-706871ff20d7','2b1de422-96f6-11f1-9fb5-706871ff20d7','pcs',1,0,1,0,'2026-08-14 05:30:36'),('476a2f1c-97a1-11f1-9306-706871ff20d7','2b1de422-96f6-11f1-9fb5-706871ff20d7','Box',50,1,0,0,'2026-08-14 05:30:36'),('476a3877-97a1-11f1-9306-706871ff20d7','2b1de422-96f6-11f1-9fb5-706871ff20d7','Carton',1000,2,0,0,'2026-08-14 05:30:36'),('604bdd4d-978e-11f1-ac0b-706871ff20d7','2b1de659-96f6-11f1-9fb5-706871ff20d7','Bottle',1,0,1,0,'2026-08-14 03:15:18'),('604c7f04-978e-11f1-ac0b-706871ff20d7','2b1de659-96f6-11f1-9fb5-706871ff20d7','Box',10,1,0,0,'2026-08-14 03:15:18'),('94378c3d-972e-11f1-9fb5-706871ff20d7','2b1ddb67-96f6-11f1-9fb5-706871ff20d7','Piece',1,0,1,0,'2026-08-13 15:49:33'),('b143484c-978e-11f1-ac0b-706871ff20d7','2b1de9cb-96f6-11f1-9fb5-706871ff20d7','Blister pack',1,0,1,0,'2026-08-14 03:17:34'),('b1435b46-978e-11f1-ac0b-706871ff20d7','2b1de9cb-96f6-11f1-9fb5-706871ff20d7','Box',5,1,0,0,'2026-08-14 03:17:34'),('b14430fe-978e-11f1-ac0b-706871ff20d7','2b1de9cb-96f6-11f1-9fb5-706871ff20d7','Carton',50,2,0,0,'2026-08-14 03:17:34'),('d0a79091-978e-11f1-ac0b-706871ff20d7','2b1d30f5-96f6-11f1-9fb5-706871ff20d7','Blister pack',1,0,1,0,'2026-08-14 03:18:26'),('d0a79eec-978e-11f1-ac0b-706871ff20d7','2b1d30f5-96f6-11f1-9fb5-706871ff20d7','Box',10,1,0,0,'2026-08-14 03:18:26'),('d0a7ab84-978e-11f1-ac0b-706871ff20d7','2b1d30f5-96f6-11f1-9fb5-706871ff20d7','Carton',100,2,0,0,'2026-08-14 03:18:26'),('fdf2513d-972c-11f1-9fb5-706871ff20d7','2b1de85b-96f6-11f1-9fb5-706871ff20d7','Blister pack',1,0,1,0,'2026-08-13 15:38:12'),('fdf341e0-972c-11f1-9fb5-706871ff20d7','2b1de85b-96f6-11f1-9fb5-706871ff20d7','Box',10,1,0,0,'2026-08-13 15:38:12'),('fdf353c3-972c-11f1-9fb5-706871ff20d7','2b1de85b-96f6-11f1-9fb5-706871ff20d7','Carton',100,2,0,0,'2026-08-13 15:38:12');
/*!40000 ALTER TABLE `supplier_product_unit_conversions` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `inventory_batches`
--

LOCK TABLES `inventory_batches` WRITE;
/*!40000 ALTER TABLE `inventory_batches` DISABLE KEYS */;
/*!40000 ALTER TABLE `inventory_batches` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-16  1:12:38
