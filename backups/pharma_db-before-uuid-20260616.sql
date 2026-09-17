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
-- Table structure for table `grocery_items`
--

DROP TABLE IF EXISTS `grocery_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `grocery_items` (
  `grocery_id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `goods_type` enum('Wet Goods','Dry Goods') NOT NULL,
  `size_weight` varchar(50) NOT NULL,
  PRIMARY KEY (`grocery_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `grocery_items_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `grocery_items`
--

LOCK TABLES `grocery_items` WRITE;
/*!40000 ALTER TABLE `grocery_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `grocery_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `medicine_items`
--

DROP TABLE IF EXISTS `medicine_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `medicine_items` (
  `medicine_id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `generic_name` varchar(150) NOT NULL,
  `dosage` varchar(50) NOT NULL,
  PRIMARY KEY (`medicine_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `medicine_items_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `medicine_items`
--

LOCK TABLES `medicine_items` WRITE;
/*!40000 ALTER TABLE `medicine_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `medicine_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product`
--

DROP TABLE IF EXISTS `product`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product` (
  `product_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) DEFAULT NULL,
  `type_id` int(11) NOT NULL,
  `measurement_unit_id` int(11) DEFAULT NULL,
  `barcode` varchar(100) NOT NULL,
  `brand_name` varchar(100) NOT NULL,
  `product_name` varchar(150) NOT NULL,
  `generic_name` varchar(150) DEFAULT NULL,
  `strength_size` varchar(100) DEFAULT NULL,
  `goods_type` varchar(100) DEFAULT NULL,
  `size_weight` varchar(100) DEFAULT NULL,
  `variant_flavor` varchar(100) DEFAULT NULL,
  `size_value` varchar(100) DEFAULT NULL,
  `display_size` varchar(50) DEFAULT NULL,
  `weight_volume_value` varchar(50) DEFAULT NULL,
  `weight_volume_unit` varchar(20) DEFAULT NULL,
  `packaging` varchar(100) DEFAULT NULL,
  `product_unit` varchar(50) DEFAULT NULL,
  `strength_size_value` varchar(50) DEFAULT NULL,
  `strength_value` varchar(50) DEFAULT NULL,
  `strength_unit` varchar(20) DEFAULT NULL,
  `volume_value` varchar(50) DEFAULT NULL,
  `volume_unit` varchar(20) DEFAULT NULL,
  `unit` varchar(50) DEFAULT NULL,
  `price` decimal(10,2) NOT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `supplier_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`product_id`),
  UNIQUE KEY `barcode` (`barcode`),
  KEY `fk_product_type` (`type_id`),
  CONSTRAINT `fk_product_type` FOREIGN KEY (`type_id`) REFERENCES `product_types` (`type_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product`
--

LOCK TABLES `product` WRITE;
/*!40000 ALTER TABLE `product` DISABLE KEYS */;
INSERT INTO `product` VALUES (2,1,3,11,'AUTO-59E3F9EB69F6','Neozep','Chlorphenamine Maleate','neozep forte','500mg',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'pcs','500mg','500','mg',NULL,NULL,'bottle',10.00,NULL,'2026-06-02 13:33:18',2),(3,1,20,14,'AUTO-57E3BA7EB07F','Betadine','Povidone-iodine','Betadine',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'bottle','50g','50','g',NULL,NULL,'box',1000.00,NULL,'2026-06-04 06:56:13',2),(4,2,34,12,'AUTO-B042B754B9DB','Baby Dry','Pampers',NULL,NULL,NULL,NULL,'ultra-cushy and absorbent','small','small',NULL,NULL,'by pcs','pack','small','small',NULL,NULL,NULL,NULL,150.00,NULL,'2026-06-04 07:39:20',2),(5,2,24,16,'AUTO-540D37DEE3B0','Fresca','Fresca Tuna',NULL,NULL,NULL,NULL,'Menudo','Medium','Medium','175','g','can','can',NULL,NULL,NULL,NULL,NULL,NULL,30.00,NULL,'2026-06-10 06:51:28',2);
/*!40000 ALTER TABLE `product` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_categories`
--

DROP TABLE IF EXISTS `product_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_categories` (
  `category_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_name` varchar(50) NOT NULL,
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB AUTO_INCREMENT=1047 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_categories`
--

LOCK TABLES `product_categories` WRITE;
/*!40000 ALTER TABLE `product_categories` DISABLE KEYS */;
INSERT INTO `product_categories` VALUES (2,'Grocery'),(1,'Medicine');
/*!40000 ALTER TABLE `product_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_inventory`
--

DROP TABLE IF EXISTS `product_inventory`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_inventory` (
  `inventory_id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `variation_id` int(11) DEFAULT NULL,
  `batch_number` varchar(50) NOT NULL,
  `quantity_stocked` int(11) NOT NULL,
  `quantity_remaining` int(11) NOT NULL,
  `expiration_date` date DEFAULT NULL,
  `status` enum('Available','Low Stock','Out of Stock','Expired') DEFAULT 'Available',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `expiry_date` date DEFAULT NULL,
  `expiry_alert_days` int(11) NOT NULL DEFAULT 30,
  PRIMARY KEY (`inventory_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `product_inventory_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_inventory`
--

LOCK TABLES `product_inventory` WRITE;
/*!40000 ALTER TABLE `product_inventory` DISABLE KEYS */;
INSERT INTO `product_inventory` VALUES (2,4,NULL,'PO-20260604-095045-3733-9',90,90,NULL,'Available','2026-06-05 06:30:26','2026-06-05 07:26:26',NULL,30),(3,3,NULL,'PO-20260604-085715-6481-12',90,90,NULL,'Available','2026-06-05 08:48:37','2026-06-05 08:48:37',NULL,30),(4,2,NULL,'PO-20260604-085715-6481-13',90,40,'2026-12-31','Available','2026-06-08 05:52:46','2026-06-05 08:48:37',NULL,30);
/*!40000 ALTER TABLE `product_inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_measurement_units`
--

DROP TABLE IF EXISTS `product_measurement_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_measurement_units` (
  `measurement_unit_id` int(11) NOT NULL AUTO_INCREMENT,
  `unit_name` varchar(40) NOT NULL,
  PRIMARY KEY (`measurement_unit_id`),
  UNIQUE KEY `unit_name` (`unit_name`)
) ENGINE=InnoDB AUTO_INCREMENT=10818 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_measurement_units`
--

LOCK TABLES `product_measurement_units` WRITE;
/*!40000 ALTER TABLE `product_measurement_units` DISABLE KEYS */;
INSERT INTO `product_measurement_units` VALUES (7,'%'),(8661,'ampule'),(8669,'blister pack'),(14,'bottle'),(13,'box'),(16,'can'),(46,'capsule'),(8671,'carton'),(8651,'cc'),(2,'g'),(8,'IU'),(8666,'jar'),(3,'kg'),(6,'L'),(8653,'lb'),(4,'mcg'),(1,'mg'),(10,'mg/5mL'),(9,'mg/mL'),(5,'mL'),(17,'N/A'),(42,'oz'),(12,'pack'),(11,'pcs'),(8670,'plastic pack'),(8672,'pouch'),(8667,'roll'),(15,'sachet'),(8668,'strip'),(45,'tablet'),(52,'tube'),(8660,'vial');
/*!40000 ALTER TABLE `product_measurement_units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_selling_stock`
--

DROP TABLE IF EXISTS `product_selling_stock`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_selling_stock` (
  `selling_stock_id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `variation_id` int(11) DEFAULT NULL,
  `source_inventory_id` int(11) DEFAULT NULL,
  `batch_number` varchar(80) DEFAULT NULL,
  `quantity_stocked` int(11) NOT NULL DEFAULT 0,
  `quantity_remaining` int(11) NOT NULL DEFAULT 0,
  `expiration_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`selling_stock_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_selling_stock`
--

LOCK TABLES `product_selling_stock` WRITE;
/*!40000 ALTER TABLE `product_selling_stock` DISABLE KEYS */;
INSERT INTO `product_selling_stock` VALUES (1,2,NULL,4,'PO-20260604-085715-6481-13',40,50,'2026-12-31','2026-06-15 06:41:29');
/*!40000 ALTER TABLE `product_selling_stock` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_types`
--

DROP TABLE IF EXISTS `product_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_types` (
  `type_id` int(11) NOT NULL AUTO_INCREMENT,
  `category_id` int(11) DEFAULT NULL,
  `type_name` varchar(80) NOT NULL,
  PRIMARY KEY (`type_id`),
  UNIQUE KEY `type_name` (`type_name`)
) ENGINE=InnoDB AUTO_INCREMENT=17056 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_types`
--

LOCK TABLES `product_types` WRITE;
/*!40000 ALTER TABLE `product_types` DISABLE KEYS */;
INSERT INTO `product_types` VALUES (1,1,'Medicine'),(2,2,'Grocery'),(3,1,'Tablet'),(4,1,'Capsule'),(5,1,'Syrup'),(6,1,'Suspension'),(7,1,'Drops'),(8,1,'Ointment'),(9,1,'Cream'),(10,1,'Gel'),(11,1,'Lotion'),(12,1,'Solution'),(13,1,'Injection'),(14,1,'Inhaler'),(15,1,'Nebulizer'),(16,1,'Suppository'),(17,1,'Patch'),(18,1,'Powder'),(19,1,'Vitamins/Supplements'),(20,1,'First Aid'),(21,1,'Medical Supply'),(22,1,'Personal Protective Equipment'),(23,1,'Device/Equipment'),(24,2,'Canned Goods'),(25,2,'Beverage'),(26,2,'Snacks'),(27,2,'Biscuits'),(28,2,'Noodles'),(29,2,'Condiments'),(30,2,'Dairy'),(31,2,'Bread/Bakery'),(32,2,'Personal Care'),(33,2,'Hygiene Product'),(34,2,'Baby Care'),(35,2,'Household Item');
/*!40000 ALTER TABLE `product_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_variations`
--

DROP TABLE IF EXISTS `product_variations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_variations` (
  `variation_id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
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
  PRIMARY KEY (`variation_id`),
  UNIQUE KEY `unique_product_variation_barcode` (`barcode`),
  KEY `idx_product_variations_product` (`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_variations`
--

LOCK TABLES `product_variations` WRITE;
/*!40000 ALTER TABLE `product_variations` DISABLE KEYS */;
INSERT INTO `product_variations` VALUES (1,2,NULL,'500','mg',NULL,NULL,NULL,NULL,NULL,NULL,'pcs',NULL,NULL,NULL,10.00,'AUTO-59E3F9EB69F6',NULL,0,0,'2026-06-10 04:16:36'),(2,3,NULL,'50','g',NULL,NULL,'Small',NULL,NULL,NULL,'First Aid','Bottle',NULL,'pcs',50.00,'AUTO-57E3BA7EB07F',NULL,1,0,'2026-06-10 04:16:36'),(3,4,'ultra-cushy and absorbent',NULL,NULL,NULL,NULL,'Small',NULL,NULL,NULL,'pack','pack',12,'pcs',150.00,'AUTO-B042B754B9DB',NULL,1,0,'2026-06-10 04:16:36'),(4,5,'Menudo',NULL,NULL,NULL,NULL,'Medium',NULL,'175','g','can','can',NULL,NULL,30.00,'AUTO-540D37DEE3B0',NULL,1,0,'2026-06-10 06:51:28'),(5,5,'adobo',NULL,NULL,NULL,NULL,'Medium',NULL,'176','g','can','can',NULL,NULL,30.00,'AUTO-BF65DE63CFC7',NULL,0,0,'2026-06-10 06:51:28'),(6,3,NULL,NULL,NULL,NULL,NULL,'Medium',NULL,NULL,NULL,'First Aid','Bottle',NULL,NULL,80.00,'AUTO-BCA5963CB5B2',NULL,0,0,'2026-06-15 08:21:32');
/*!40000 ALTER TABLE `product_variations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_items` (
  `po_item_id` int(11) NOT NULL AUTO_INCREMENT,
  `po_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `variation_id` int(11) DEFAULT NULL,
  `quantity` int(11) NOT NULL,
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
  `unit_price_snapshot` decimal(12,2) DEFAULT NULL,
  PRIMARY KEY (`po_item_id`),
  KEY `fk_purchase_order_items_po` (`po_id`),
  KEY `fk_purchase_order_items_product` (`product_id`),
  CONSTRAINT `fk_purchase_order_items_po` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_order_items_product` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_items`
--

LOCK TABLES `purchase_order_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_items` DISABLE KEYS */;
INSERT INTO `purchase_order_items` VALUES (9,4,4,NULL,100,'Pampers','Baby Dry','Grocery','Baby Care',NULL,'ultra-cushy and absorbent',NULL,'small','pack','by pcs',150.00),(12,3,3,NULL,100,'Povidone-iodine','Betadine','Medicine','First Aid','Betadine',NULL,'50 g',NULL,'bottle',NULL,1000.00),(13,3,2,NULL,100,'Chlorphenamine Maleate','Neozep','Medicine','Tablet','neozep forte',NULL,'500 mg',NULL,'pcs','bottle',10.00),(16,2,2,NULL,100,'Chlorphenamine Maleate','Neozep','Medicine','Tablet','neozep forte','N/A','500 mg','500mg','pcs','bottle',10.00);
/*!40000 ALTER TABLE `purchase_order_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_order_receiving`
--

DROP TABLE IF EXISTS `purchase_order_receiving`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_receiving` (
  `receiving_id` int(11) NOT NULL AUTO_INCREMENT,
  `po_id` int(11) NOT NULL,
  `received_date` timestamp NOT NULL DEFAULT current_timestamp(),
  `remarks` text DEFAULT NULL,
  PRIMARY KEY (`receiving_id`),
  UNIQUE KEY `unique_po_receiving` (`po_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_receiving`
--

LOCK TABLES `purchase_order_receiving` WRITE;
/*!40000 ALTER TABLE `purchase_order_receiving` DISABLE KEYS */;
INSERT INTO `purchase_order_receiving` VALUES (3,4,'2026-06-05 06:30:26','seal is broken'),(4,3,'2026-06-05 08:48:37','');
/*!40000 ALTER TABLE `purchase_order_receiving` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_order_receiving_items`
--

DROP TABLE IF EXISTS `purchase_order_receiving_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_receiving_items` (
  `receiving_item_id` int(11) NOT NULL AUTO_INCREMENT,
  `receiving_id` int(11) NOT NULL,
  `po_item_id` int(11) NOT NULL,
  `received_quantity` int(11) NOT NULL DEFAULT 0,
  `damaged_quantity` int(11) NOT NULL DEFAULT 0,
  PRIMARY KEY (`receiving_item_id`),
  UNIQUE KEY `unique_receiving_item` (`receiving_id`,`po_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_receiving_items`
--

LOCK TABLES `purchase_order_receiving_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_receiving_items` DISABLE KEYS */;
INSERT INTO `purchase_order_receiving_items` VALUES (1,3,9,90,10),(2,4,12,100,10),(3,4,13,100,10);
/*!40000 ALTER TABLE `purchase_order_receiving_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_order_returns`
--

DROP TABLE IF EXISTS `purchase_order_returns`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_order_returns` (
  `return_id` int(11) NOT NULL AUTO_INCREMENT,
  `po_id` int(11) NOT NULL,
  `po_item_id` int(11) NOT NULL,
  `return_quantity` int(11) NOT NULL DEFAULT 0,
  `damage_reason` varchar(80) NOT NULL,
  `remarks` text DEFAULT NULL,
  `return_status` varchar(40) NOT NULL DEFAULT 'Open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`return_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_returns`
--

LOCK TABLES `purchase_order_returns` WRITE;
/*!40000 ALTER TABLE `purchase_order_returns` DISABLE KEYS */;
INSERT INTO `purchase_order_returns` VALUES (1,4,9,10,'Damaged during delivery','seal is broken','Resolved','2026-06-05 06:30:26'),(2,3,12,10,'Damaged during delivery','','Open','2026-06-05 08:48:37'),(3,3,13,10,'Wrong item delivered','','Open','2026-06-05 08:48:37');
/*!40000 ALTER TABLE `purchase_order_returns` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `purchase_orders` (
  `po_id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_id` int(11) NOT NULL,
  `po_number` varchar(50) NOT NULL,
  `payment_terms` varchar(40) DEFAULT NULL,
  `expected_delivery_date` date DEFAULT NULL,
  `final_payment` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(40) NOT NULL DEFAULT 'Pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `payment_status` varchar(40) NOT NULL DEFAULT 'Unpaid',
  `total_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`po_id`),
  UNIQUE KEY `po_number` (`po_number`),
  KEY `fk_purchase_orders_supplier` (`supplier_id`),
  CONSTRAINT `fk_purchase_orders_supplier` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES (2,2,'PO-20260602-153427-A433','Cash','2026-06-10',0.00,'In transit','2026-06-02 13:34:27','Unpaid',0.00),(3,2,'PO-20260604-085715-6481','Cash','2026-06-10',91400.00,'Delivered with Return/Damage','2026-06-04 06:57:15','Adjusted',101000.00),(4,2,'PO-20260604-095045-3733','Cash','2026-06-11',90000.00,'Delivered with Return/Damage','2026-06-04 07:50:45','Adjusted',0.00);
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `supplier_products`
--

DROP TABLE IF EXISTS `supplier_products`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `supplier_products` (
  `supplier_product_id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`supplier_product_id`),
  UNIQUE KEY `unique_supplier_item` (`supplier_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `supplier_products_ibfk_1` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE CASCADE,
  CONSTRAINT `supplier_products_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1585 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_products`
--

LOCK TABLES `supplier_products` WRITE;
/*!40000 ALTER TABLE `supplier_products` DISABLE KEYS */;
INSERT INTO `supplier_products` VALUES (2,2,2,'2026-06-04 05:57:44'),(40,2,3,'2026-06-04 06:56:13'),(84,2,4,'2026-06-04 07:39:20'),(1070,2,5,'2026-06-10 06:51:28');
/*!40000 ALTER TABLE `supplier_products` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `suppliers` (
  `supplier_id` int(11) NOT NULL AUTO_INCREMENT,
  `supplier_name` varchar(150) NOT NULL,
  `contact_person` varchar(100) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(100) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `archived_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`supplier_id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES (2,'Rose pharmacy',NULL,'099999999','rose@gmail.com','divisoria carmen','2026-06-02 11:09:40',NULL);
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `user_id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(50) NOT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `role` enum('Admin','Sales Clerk','Cashier') NOT NULL,
  `status` enum('Active','Inactive') DEFAULT 'Active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'admin','$2y$10$tn3tsuMtfgWok9UrnnDv6.URPW1sToZUy5w0bfnSIvZDKV6GnG9wO','Dr. ADMIN','Admin','Active','2026-06-01 11:52:31');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-16 23:29:50
