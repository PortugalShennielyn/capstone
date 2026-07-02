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
-- Dumping data for table `account_roles`
--

LOCK TABLES `account_roles` WRITE;
/*!40000 ALTER TABLE `account_roles` DISABLE KEYS */;
INSERT INTO `account_roles` VALUES ('c97f42e0-6adf-11f1-b9ca-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c979a660-6adf-11f1-b9ca-0a002700000b',NULL,NULL,NULL,'2026-06-18 06:34:41',NULL,NULL,NULL,0,1,1,0,0,'2026-06-18 06:34:41',NULL);
/*!40000 ALTER TABLE `account_roles` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `account_types`
--

LOCK TABLES `account_types` WRITE;
/*!40000 ALTER TABLE `account_types` DISABLE KEYS */;
INSERT INTO `account_types` VALUES ('c9749f5a-6adf-11f1-b9ca-0a002700000b','staff','Staff',1,0,0,'2026-06-18 06:34:41',NULL),('c9759d17-6adf-11f1-b9ca-0a002700000b','customer','Customer',1,0,0,'2026-06-18 06:34:41',NULL),('c9771112-6adf-11f1-b9ca-0a002700000b','vendor','Vendor',1,0,0,'2026-06-18 06:34:41',NULL),('c9783c6b-6adf-11f1-b9ca-0a002700000b','contractor','Contractor',1,0,0,'2026-06-18 06:34:41',NULL);
/*!40000 ALTER TABLE `account_types` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
INSERT INTO `accounts` VALUES ('c97e079a-6adf-11f1-b9ca-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','c9749f5a-6adf-11f1-b9ca-0a002700000b','staff','09632669-6a16-11f1-895a-0a002700000b',NULL,1,1,0,0,'2026-06-18 06:34:41',NULL);
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `auth_sessions`
--

LOCK TABLES `auth_sessions` WRITE;
/*!40000 ALTER TABLE `auth_sessions` DISABLE KEYS */;
INSERT INTO `auth_sessions` VALUES ('0021fd5b-7444-11f1-a369-0a002700000b','eigsohosdef39lvl7alhtr6s6h','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','19882281ce711c61da2ab8a3f62a653937113b49e7322aeba0b2d49332459e4f','2026-07-01 05:24:43','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:24:43',NULL),('05b47564-6ae0-11f1-b9ca-0a002700000b','b036g1scalhe7o3rcah4fds879','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','86d6f31a23583c88ab5521c9307882f2d76250b05bcbdd3cecbf74d9fb5eba42','2026-06-18 06:36:22','::1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,'2026-06-18 06:36:22','logout',0,0,0,'2026-06-18 06:36:22','2026-06-18 06:36:22'),('08f59d05-7445-11f1-a369-0a002700000b','5cqhnfe580tsjj9o42i9hgpt61','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','7df054036a3155d446b34c1a8500074e9b21046c2269d44900ed9a7ebf296cc0','2026-07-01 05:32:07','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 05:32:07',NULL),('10f64877-743c-11f1-a369-0a002700000b','bnb2llmp8niu0nu7itqjj08rqm','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','6ca28195e981c0dbef748c01a05da98afa8e1139d27675e8c2929d091ae28c1e','2026-07-01 04:27:55','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,NULL,NULL,1,0,0,'2026-06-30 04:27:55',NULL),('1ab434f1-75da-11f1-aaef-0a002700000b','bf84ia00ktn75dot6c7sh37mc0','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','1fbaf0a96f16b277897aaf85aa60798928786d49c734a10dedc98fcdd68398db','2026-07-03 05:51:43','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-02 05:51:43',NULL),('2787662e-7444-11f1-a369-0a002700000b','aleai6qngrt9m0ss5smre0je01','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','1dc8a737197c0ef653a53107512bdad335ce252de7c5c43e41fb5ad80c3c4492','2026-07-01 05:25:49','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 05:25:49',NULL),('2e02c0aa-7443-11f1-a369-0a002700000b','044r4d19v6a1fidggm1185ab08','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','c236c356593d189c3323c22bc7693479b0705d740e5a9d4e422d1e2eecc5696c','2026-07-01 05:18:50','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 05:18:50',NULL),('2ff70f27-7045-11f1-9e75-0a002700000b','2hrb4si1aump82d17mrb6qrv6s','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','51d163640df6d7a9ca3ef07e2fea89e18e8567ad8a567cae285db3e0f8e5f0cf','2026-06-26 03:23:08','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-25 03:23:08',NULL),('31387642-6e17-11f1-bbba-0a002700000b','7p5glm9ghepvi7k1bn9qqlrui6','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','1c5d4a3417ff1e0a8dcfab2e7f46c6f97a32315eb4d2ae96f003c222176612a8','2026-06-23 08:48:51','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-22 08:48:51',NULL),('44de52d1-6f96-11f1-8f3c-0a002700000b','0jalnrqj3s3fgk4l4rr77m37kn','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','f040359f9118c306ffe20c6bdb7e6462bedf24dd0a326b0e1329b5a92a2fb042','2026-06-25 06:31:01','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,NULL,NULL,1,0,0,'2026-06-24 06:31:01',NULL),('490167a8-7442-11f1-a369-0a002700000b','jog74173s4tdgm5i68hj7k83ip','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','05e0f9ea0e5e72bdc588ed95b9e12347a110970146037a112e046b598b35ce11','2026-07-01 05:12:26','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 05:12:26',NULL),('4cf4ad17-72d3-11f1-9cf4-0a002700000b','e07901udl8gm2pqu1jgmh7ded7','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','f0e5b2e736c645b116711510923621e444e4868f291c893ddc90c695658d52f4','2026-06-29 09:25:27','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-28 09:25:27',NULL),('533c2be1-7505-11f1-9d3c-0a002700000b','9mprt10t5m9htce6842fi0gvqi','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','ddbd83bff773754bed2e7450f0b281ea16f6be59531d5ce0523a52e5b44c1f6b','2026-07-02 04:28:35','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-01 04:28:35',NULL),('54edf1ee-743b-11f1-a369-0a002700000b','3hpc2mu4l3o4disq671fi81d80','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','7484725e875513c27b9093a8da98ea064a0cf01c850919e2061436eccb4be9a9','2026-07-01 04:22:40','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 04:22:40',NULL),('55d69794-72d3-11f1-9cf4-0a002700000b','gfih81ba94as80fn0o5r5ra8a7','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','6458121e6ab4c022b4105849e21b12f48fac8a62a24c23408b9a1390c98a569d','2026-06-29 09:25:42','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-28 09:25:42',NULL),('572c8ca8-7445-11f1-a369-0a002700000b','ugqbsg765hv4pk81uj69bkhlr0','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','53127282550eec456bdd4b5deb231f5f966e813fcf0c6a048bc203888445648a','2026-07-01 05:34:18','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:34:18',NULL),('5dcd9b94-743b-11f1-a369-0a002700000b','clsv7rlnr4ipso02l2guhjd8jp','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','bf7e09c46b24ab6881bd87f119b39090bea371a31b92cd89ce2babad68a5bc04','2026-06-30 04:22:55','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,'2026-06-30 04:22:55','logout',0,0,0,'2026-06-30 04:22:55','2026-06-30 04:22:55'),('5e2a565f-7443-11f1-a369-0a002700000b','qrsnaonihhh3hcfrtv6d6iuuct','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','dc8c60611f6e051918cdc1c0ab31f99b7a6be47b3c63c75b2c75d0ca82275552','2026-07-01 05:20:11','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:20:11',NULL),('693249c3-7503-11f1-9d3c-0a002700000b','k06enordp0c7dvdeutb01qoaok','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','f78a2f56841eab4ae9dee849ff8b73ff1f9b0f5ce9a84903a1946879b5639f99','2026-07-02 04:14:53','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-01 04:14:53',NULL),('6bdf6fc5-743d-11f1-a369-0a002700000b','g2ve4emgsjsrpqh16qgk2clej2','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','213e722f7f760d8e66e41d588da4a14aa22e99e44093311f9b924e7c15530b04','2026-07-01 04:37:37','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 04:37:37',NULL),('6d686b82-6b95-11f1-9859-0a002700000b','b6djkb8agdmj7gp717pf8sp8qv','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','e8286a7c24b7eaa359714180ea1722fa12d649432251a40592c19fa5855f2d20','2026-06-20 04:14:55','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-19 04:14:55',NULL),('73484600-75db-11f1-ba9e-0a002700000b','mo97p996jcfrv7g0m577roli11','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','d004dcb7a62b0dc79d0386754a4d3312bc041fcc7a29e6b6e740e392dc1a27be','2026-07-03 06:01:21','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-07-02 06:01:21',NULL),('76b0c710-7442-11f1-a369-0a002700000b','k03cu9t6v2ufrhnmd56in42m6t','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','107976f408002c0f15c3e63663365028ff241e1f84d1a6a7b887965c42ab48da','2026-07-01 05:13:43','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:13:43',NULL),('76c7c4ed-72c8-11f1-88b7-0a002700000b','t5hk7v21q1sdpu1sgjus41f7sg','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','94a5273438d7473f8252d4ce3c221211e72783054983e16f95272f792e141649','2026-06-29 08:07:53','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-28 08:07:53',NULL),('79955b63-7442-11f1-a369-0a002700000b','ns2pqc96grnb25oevjnd262el5','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','87745d722e1771da15a7018cff6ffae30e89f8a67cebb2d2f25a265ed22088c2','2026-07-01 05:13:48','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:13:48',NULL),('7bbe1f5a-711d-11f1-a888-0a002700000b','cglp7li7du61ekj57dia1albqn','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','a883ffa09c62e03dec9f51ddc4b3034189f92ea8c696d7f5e2f38af09dc0d541','2026-06-27 05:11:26','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-26 05:11:26',NULL),('7fef3b96-752f-11f1-ba65-0a002700000b','o84otaapmou321aak7e8i1i1q2','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','b73c62a3d07ab6948bd6685114deee30f871ef10c0b0e609222a42e2a1f67aa7','2026-07-02 09:30:29','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-01 09:30:29',NULL),('816217bd-743b-11f1-a369-0a002700000b','3r050epv4m6j3hut8j4ol8k02n','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','d5b36c97cd5b97103d43e340bb8250b388b94aee96e1fbeac3110db1e00f991c','2026-07-01 04:23:54','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,NULL,NULL,1,0,0,'2026-06-30 04:23:54',NULL),('84b040d5-7456-11f1-a369-0a002700000b','seevnqg6klp5t0fb0b7b09osja','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','0f0acb75cd8846a109139e8274b460d49e0de1f78c25becf94d918565c720975','2026-07-01 07:37:16','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 07:37:16',NULL),('87830398-7444-11f1-a369-0a002700000b','r0nrmas7h5b90gk75uekk2f5k1','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','db0ea61692b51d8dcbcc49bfcfd414562a8096ec3cb88db6f255728b8cebef18','2026-07-01 05:28:30','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:28:30',NULL),('8eb42736-7444-11f1-a369-0a002700000b','m4np8q9t5s75d2io8crq270ats','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','ab5445a71fb2f6b0a376f572c0419acbb1221e47939dfb47c5836dfd16f42b38','2026-07-01 05:28:42','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:28:42',NULL),('a0955f90-738d-11f1-a2fe-0a002700000b','ho3c1ul8ut9q5co12mt9ltgf7p','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','d8bca543a083da741dbed1c7f71ac70699ffaac37a72fd57e412509d03ddd95f','2026-06-30 07:39:14','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-29 07:39:14',NULL),('a113d72a-6ec9-11f1-84cf-0a002700000b','qsqob0h460p7hdt38qqgiar4tc','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','30bd31e673a093274692159351dbc3ddcd568e20112b85ba43ff035cdf95232b','2026-06-24 06:06:09','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,NULL,NULL,1,0,0,'2026-06-23 06:06:09',NULL),('a330534b-6ba2-11f1-9859-0a002700000b','vsfrmg6cbjdi8pju7pv2ad7ood','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','681243abcb61f8c5fad6dc625e9894ac7c2b0ff9b491ef64b30b1a757499ad6c','2026-06-20 05:49:29','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-19 05:49:29',NULL),('a378700d-6ba2-11f1-9859-0a002700000b','togtpvlmoh63ec87fhp38iibq4','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','65ac7e0ee88dcf00583f0dcfdbbf9bc8a722de9fc296b10224e1104dc62d729e','2026-06-20 05:49:29','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-19 05:49:29',NULL),('a55048b4-708f-11f1-9ad7-0a002700000b','6nd7bne2t9d4r43r7k87feeh6j','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','04087ff0b1f37e1e36738eab355f4842bc8f447dfbb4daee69fd68aec17a44c7','2026-06-26 12:16:08','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-25 12:16:08',NULL),('a55f898f-743e-11f1-a369-0a002700000b','uhk7a5oqr79108sovslmn92a30','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','28fd0ae3ab815b9cb5c39a072f989562df0600e373600e90f7b3e5064884d3a0','2026-07-01 04:46:23','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 04:46:23',NULL),('aba525f8-7455-11f1-a369-0a002700000b','nso0g6r7d42d9bncjg073dk6nu','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','77bea0c52da9dd04941b12ca8cfd78a5f39b7b8245c79c6282e893dc6989973d','2026-07-01 07:31:12','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 07:31:12',NULL),('b5b00321-7515-11f1-9d3c-0a002700000b','u07hhvcjbcbeemvouk303jdibf','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','a3a4d9978a973303bdda6f663a4148397efa870de64dd04b10fb4a2d15fe4ec0','2026-07-02 06:25:52','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-01 06:25:52',NULL),('b7f99979-7514-11f1-9d3c-0a002700000b','jmne0nvg5la1n2tbf15vpv6ddk','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','22e8a9a11c9c41e0e2023375dce24e042c83ced90958beda1b27af9c8ac591c3','2026-07-02 06:18:47','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-01 06:18:47',NULL),('bd0df0ca-743b-11f1-a369-0a002700000b','jrmgpiru57sb8651engd505f48','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','022dbc9ab5bf9211eb787e8a2e75a3f7614b354f7bec4b5fef3f4d9d4837d6e6','2026-07-01 04:25:34','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,NULL,NULL,1,0,0,'2026-06-30 04:25:34',NULL),('cb8266db-7456-11f1-a369-0a002700000b','3tnk8up96852lln0g8bi1rku90','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','a3e2c338c590c3ef3ad0ff45cf0b66e65f44e764b0d84642120de8e95924ffde','2026-07-01 07:39:15','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 07:39:15',NULL),('d7ef96c3-75d9-11f1-aab9-0a002700000b','b0j3aifa9j0h4e8dofof04ho9i','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','a174be759117534833f92ee4f99f0740a9fc69f7b6c93d1eb0c7d3f642d853c4','2026-07-03 05:49:51','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-07-02 05:49:51',NULL),('e68f4668-75d9-11f1-aab9-0a002700000b','eacfk0op9o2a4veaokee5iggd5','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','3687053331c0efa14ff82bea1f121622a4301c5df50f01f7d5821245a3b9bfcf','2026-07-03 05:50:16','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-07-02 05:50:16',NULL),('e8759767-7500-11f1-9d3c-0a002700000b','qh5df807006crbkp7faq92ndjf','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','455e120275715c92aec82448dc2a10ba2c530727b22f606987c7cb8094200be9','2026-07-02 03:56:58','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-01 03:56:58',NULL),('eb4dc805-7445-11f1-a369-0a002700000b','5fu3ab9vo4q1ri2n1dvpqrf822','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','5ea70dc284e6887b99be70db1b313526a3ab001572cd09f82ede84dd4e90491b','2026-07-01 05:38:27','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,NULL,NULL,1,0,0,'2026-06-30 05:38:27',NULL),('f25b1b8b-75d9-11f1-aab9-0a002700000b','l7tburnrjdklhnes1prqf49g6e','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','b7e3392b32ca3a346043dbcdfab00a14fbed1c3afd1ec67f833afa8da5a4921c','2026-07-03 05:50:35','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-07-02 05:50:35',NULL),('f472801c-6f86-11f1-8f3c-0a002700000b','d1l4bhl6667b6fj2s6lpk3o7l5','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','13160f8e49a0897575c1d19104f24bc61965781cc4a628ef9478908ed5b033a0','2026-06-25 04:41:24','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-24 04:41:24',NULL),('f7ca485a-743b-11f1-a369-0a002700000b','8m511tem8qcvppqis9imefflhp','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','276b6464e408ab1a878a81ae4259aba7d19838a6cc9240db969467b5447ebd32','2026-07-01 04:27:13','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,NULL,NULL,1,0,0,'2026-06-30 04:27:13',NULL),('fc8dc83c-6ec7-11f1-84cf-0a002700000b','195u1jbuvp8hbj3o0pnf4dr7c4','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','60ad0ec93ec659f061595d01914d7fa4d3b0d18c3d706e1232b627b4eecaee84','2026-06-24 05:54:23','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-23 05:54:23',NULL),('fd327084-6adf-11f1-b9ca-0a002700000b','qdbgsbcjvc0e3cthfrrcsq80ei','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','0ac3e1a55dd9ee725b3257ab219a8257909eded782f1493626d4d2b3688a6827','2026-06-18 06:36:39','::1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,'2026-06-18 06:36:39','verification_cleanup',0,0,0,'2026-06-18 06:36:08','2026-06-18 06:36:39'),('fd53f412-713a-11f1-a888-0a002700000b','mul9uo0f5pirn9c3p9eskcmq0o','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','6080c04057f4f2c4ae27b859217566e807ce22d0ae5f4768ee78a751786972ad','2026-06-27 08:42:39','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,NULL,NULL,1,0,0,'2026-06-26 08:42:39',NULL),('fda8d80c-7443-11f1-a369-0a002700000b','39fgm4hng1gecf4duatgkgjpu5','09632669-6a16-11f1-895a-0a002700000b','c97e079a-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','7e1b9f9f96e50ba84a1a20f4983dcf2d8b876920e11aa77f57fbe40d3476d7d3','2026-07-01 05:24:39','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,NULL,NULL,1,0,0,'2026-06-30 05:24:39',NULL);
/*!40000 ALTER TABLE `auth_sessions` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `entity_dimensions`
--

LOCK TABLES `entity_dimensions` WRITE;
/*!40000 ALTER TABLE `entity_dimensions` DISABLE KEYS */;
INSERT INTO `entity_dimensions` VALUES ('0f265bae-6a16-11f1-895a-0a002700000b','product_variation','098f9007-6a16-11f1-895a-0a002700000b','strength',500.0000,'mg',NULL,'2026-06-17 06:30:40'),('0f270530-6a16-11f1-895a-0a002700000b','product_variation','098fc205-6a16-11f1-895a-0a002700000b','strength',50.0000,'g',NULL,'2026-06-17 06:30:40'),('0f276446-6a16-11f1-895a-0a002700000b','product_variation','098fc205-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Small','2026-06-17 06:30:40'),('0f27bb21-6a16-11f1-895a-0a002700000b','product_variation','098fc205-6a16-11f1-895a-0a002700000b','pack_content',NULL,'pcs',NULL,'2026-06-17 06:30:40'),('0f28397d-6a16-11f1-895a-0a002700000b','product_variation','098fc3e2-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Small','2026-06-17 06:30:40'),('0f28918d-6a16-11f1-895a-0a002700000b','product_variation','098fc3e2-6a16-11f1-895a-0a002700000b','pack_content',12.0000,'pcs',NULL,'2026-06-17 06:30:40'),('0f28d2c1-6a16-11f1-895a-0a002700000b','product_variation','098fc4df-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Medium','2026-06-17 06:30:40'),('0f290387-6a16-11f1-895a-0a002700000b','product_variation','098fc4df-6a16-11f1-895a-0a002700000b','weight',175.0000,'g',NULL,'2026-06-17 06:30:40'),('0f293456-6a16-11f1-895a-0a002700000b','product_variation','098fc590-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Medium','2026-06-17 06:30:40'),('0f29b281-6a16-11f1-895a-0a002700000b','product_variation','098fc590-6a16-11f1-895a-0a002700000b','weight',176.0000,'g',NULL,'2026-06-17 06:30:40'),('0f2a0165-6a16-11f1-895a-0a002700000b','product_variation','098fc635-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Medium','2026-06-17 06:30:40'),('4bd68dc5-6a16-11f1-895a-0a002700000b','product_variation','098f9007-6a16-11f1-895a-0a002700000b','strength',500.0000,'mg',NULL,'2026-06-17 06:32:21'),('4bd7b990-6a16-11f1-895a-0a002700000b','product_variation','098fc205-6a16-11f1-895a-0a002700000b','strength',50.0000,'g',NULL,'2026-06-17 06:32:21'),('4bd8685b-6a16-11f1-895a-0a002700000b','product_variation','098fc205-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Small','2026-06-17 06:32:21'),('4bd8c7a1-6a16-11f1-895a-0a002700000b','product_variation','098fc205-6a16-11f1-895a-0a002700000b','pack_content',NULL,'pcs',NULL,'2026-06-17 06:32:21'),('4bd953d7-6a16-11f1-895a-0a002700000b','product_variation','098fc3e2-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Small','2026-06-17 06:32:21'),('4bd9b577-6a16-11f1-895a-0a002700000b','product_variation','098fc3e2-6a16-11f1-895a-0a002700000b','pack_content',12.0000,'pcs',NULL,'2026-06-17 06:32:21'),('4bda1326-6a16-11f1-895a-0a002700000b','product_variation','098fc4df-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Medium','2026-06-17 06:32:21'),('4bda6634-6a16-11f1-895a-0a002700000b','product_variation','098fc4df-6a16-11f1-895a-0a002700000b','weight',175.0000,'g',NULL,'2026-06-17 06:32:21'),('4bdab8af-6a16-11f1-895a-0a002700000b','product_variation','098fc590-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Medium','2026-06-17 06:32:21'),('4bdb08c8-6a16-11f1-895a-0a002700000b','product_variation','098fc590-6a16-11f1-895a-0a002700000b','weight',176.0000,'g',NULL,'2026-06-17 06:32:21'),('4bdb58b6-6a16-11f1-895a-0a002700000b','product_variation','098fc635-6a16-11f1-895a-0a002700000b','size',NULL,NULL,'Medium','2026-06-17 06:32:21');
/*!40000 ALTER TABLE `entity_dimensions` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `grocery_details`
--

LOCK TABLES `grocery_details` WRITE;
/*!40000 ALTER TABLE `grocery_details` DISABLE KEYS */;
INSERT INTO `grocery_details` VALUES ('4b3de7a2-7133-11f1-a888-0a002700000b','4b3d0b22-7133-11f1-a888-0a002700000b','Carbonara','Single Pack','140','g','Pack','pcs','2026-06-26 07:47:34'),('514d814e-6a6c-11f1-967a-0a002700000b','09801b88-6a16-11f1-895a-0a002700000b','ultra-cushy and absorbent','small',NULL,NULL,'pack','12 pcs','2026-06-17 16:48:07'),('514d846a-6a6c-11f1-967a-0a002700000b','09801c5d-6a16-11f1-895a-0a002700000b','Menudo','Medium','175','g','can',NULL,'2026-06-17 16:48:07'),('dc0bab39-6b22-11f1-b9ca-0a002700000b','dc0a4964-6b22-11f1-b9ca-0a002700000b','adobo','Medium','176','g','can',NULL,'2026-06-18 14:34:49'),('dc0fad20-6b22-11f1-b9ca-0a002700000b','dc0f8ba4-6b22-11f1-b9ca-0a002700000b','Hot & Spicy',NULL,'100','g','Can','g','2026-06-18 14:34:49'),('f059bc8c-714f-11f1-a888-0a002700000b','f059104f-714f-11f1-a888-0a002700000b','Cheesy','Regular','140','g','Pack','g','2026-06-26 11:12:37');
/*!40000 ALTER TABLE `grocery_details` ENABLE KEYS */;
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
  `unit_cost` decimal(10,2) DEFAULT 0.00,
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
INSERT INTO `inventory_batches` VALUES ('a4584560-6edb-11f1-84cf-0a002700000b','099b1056-6a16-11f1-895a-0a002700000b','09a6d8f6-6a16-11f1-895a-0a002700000b','09ac9fa1-6a16-11f1-895a-0a002700000b','09801b88-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','2026-06-04 23:30:26','2026-12-31',90,90,0,10,0,150.00,'active','2026-06-05 07:26:26'),('a4584907-6edb-11f1-84cf-0a002700000b','099b1277-6a16-11f1-895a-0a002700000b','09a6d841-6a16-11f1-895a-0a002700000b','09aca2f7-6a16-11f1-895a-0a002700000b','098019c5-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','2026-06-05 01:48:37','2026-12-31',90,70,20,10,0,100.00,'active','2026-06-05 08:48:37'),('a45849ac-6edb-11f1-84cf-0a002700000b','099b1315-6a16-11f1-895a-0a002700000b','09a6d841-6a16-11f1-895a-0a002700000b','09aca3f5-6a16-11f1-895a-0a002700000b','09800423-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','2026-06-05 01:48:37','2026-12-31',140,40,50,10,0,10.00,'active','2026-06-05 08:48:37'),('d8211523-7397-11f1-a2fe-0a002700000b','d8200045-7397-11f1-a2fe-0a002700000b','223e02dd-72c9-11f1-9796-0a002700000b','223f50fa-72c9-11f1-9796-0a002700000b','4b3d0b22-7133-11f1-a888-0a002700000b','d17d2533-7132-11f1-a888-0a002700000b','2026-06-29 01:52:22','2028-09-29',100,98,0,0,2,50.00,'active','2026-06-29 08:52:22'),('d823dd04-7397-11f1-a2fe-0a002700000b','d8237ba9-7397-11f1-a2fe-0a002700000b','223e02dd-72c9-11f1-9796-0a002700000b','223f938b-72c9-11f1-9796-0a002700000b','f059104f-714f-11f1-a888-0a002700000b','d17d2533-7132-11f1-a888-0a002700000b','2026-06-29 01:52:22','2028-10-29',190,188,0,2,0,50.00,'active','2026-06-29 08:52:22');
/*!40000 ALTER TABLE `inventory_batches` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `login_attempts`
--

LOCK TABLES `login_attempts` WRITE;
/*!40000 ALTER TABLE `login_attempts` DISABLE KEYS */;
INSERT INTO `login_attempts` VALUES ('0023e804-7444-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:24:43',NULL),('05b5b33e-6ae0-11f1-b9ca-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admin','::1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-18 06:36:22',NULL),('08f6d262-7445-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 05:32:07',NULL),('09023015-743b-11f1-a369-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,'invalid_credentials',0,0,0,'2026-06-30 04:20:32','2026-07-02 05:50:16'),('10f7c187-743c-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1,NULL,1,0,0,'2026-06-30 04:27:55',NULL),('146b5dda-72d3-11f1-a072-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,'invalid_credentials',0,0,0,'2026-06-28 09:23:53','2026-06-30 04:22:40'),('1ab6ee4c-75da-11f1-aaef-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-02 05:51:43',NULL),('278a17b0-7444-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 05:25:49',NULL),('2e0521c5-7443-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 05:18:50',NULL),('2ff9f179-7045-11f1-9e75-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-25 03:23:08',NULL),('313b07af-6e17-11f1-bbba-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-22 08:48:51',NULL),('44df8272-6f96-11f1-8f3c-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1,NULL,1,0,0,'2026-06-24 06:31:01',NULL),('4903452c-7442-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 05:12:26',NULL),('4cf58001-72d3-11f1-9cf4-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-28 09:25:28',NULL),('533e50de-7505-11f1-9d3c-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-01 04:28:35',NULL),('54f18490-743b-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 04:22:40',NULL),('55e335fd-72d3-11f1-9cf4-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-28 09:25:42',NULL),('572e50d2-7445-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:34:18',NULL),('5dcf082b-743b-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 04:22:55',NULL),('5e2bdbe8-7443-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:20:11',NULL),('693431eb-7503-11f1-9d3c-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-01 04:14:53',NULL),('6be0e342-743d-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 04:37:37',NULL),('6d6c0dda-6b95-11f1-9859-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-19 04:14:55',NULL),('734b1547-75db-11f1-ba9e-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admin','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-07-02 06:01:21',NULL),('7367713a-7456-11f1-a369-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,'invalid_credentials',0,0,0,'2026-06-30 07:36:47','2026-07-02 05:50:16'),('76b28081-7442-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:13:43',NULL),('76ca3b01-72c8-11f1-88b7-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-28 08:07:53',NULL),('7996ec35-7442-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:13:48',NULL),('7bc13819-711d-11f1-a888-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-26 05:11:26',NULL),('7ff24ceb-752f-11f1-ba65-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-01 09:30:29',NULL),('80eeda07-7090-11f1-9ad7-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,'invalid_credentials',0,0,0,'2026-06-25 12:22:16','2026-07-02 05:50:16'),('8163788a-743b-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1,NULL,1,0,0,'2026-06-30 04:23:54',NULL),('84b1ce5d-7456-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 07:37:16',NULL),('87845e35-7444-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:28:30',NULL),('8eb6689e-7444-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:28:42',NULL),('9250f487-6ba2-11f1-9859-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,'invalid_credentials',0,0,0,'2026-06-19 05:49:00','2026-07-02 05:50:16'),('a0984273-738d-11f1-a2fe-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-29 07:39:14',NULL),('a115fbc2-6ec9-11f1-84cf-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1,NULL,1,0,0,'2026-06-23 06:06:09',NULL),('a1bba048-6ba2-11f1-9859-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,'invalid_credentials',0,0,0,'2026-06-19 05:49:26','2026-07-02 05:50:16'),('a333328d-6ba2-11f1-9859-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-19 05:49:29',NULL),('a3798da6-6ba2-11f1-9859-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-19 05:49:29',NULL),('a5522c82-708f-11f1-9ad7-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-25 12:16:08',NULL),('a560ed50-743e-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 04:46:23',NULL),('ababac91-7455-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 07:31:12',NULL),('b5b15941-7515-11f1-9d3c-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-01 06:25:52',NULL),('b7fb711c-7514-11f1-9d3c-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-01 06:18:47',NULL),('bd0feccc-743b-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1,NULL,1,0,0,'2026-06-30 04:25:34',NULL),('c67785d4-75d9-11f1-aab9-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,'invalid_credentials',0,0,0,'2026-07-02 05:49:22','2026-07-02 05:50:16'),('cb842fed-7456-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 07:39:15',NULL),('cf5e8987-75d9-11f1-aab9-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',0,'invalid_credentials',0,0,0,'2026-07-02 05:49:37','2026-07-02 05:50:16'),('d7f492f2-75d9-11f1-aab9-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-07-02 05:49:51',NULL),('db58c6b1-713a-11f1-a888-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,'invalid_credentials',0,0,0,'2026-06-26 08:41:42','2026-07-02 05:50:16'),('e69070a8-75d9-11f1-aab9-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admin','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-07-02 05:50:16',NULL),('e87b2004-7500-11f1-9d3c-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-01 03:56:58',NULL),('eb4ef4de-7445-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-30 05:38:27',NULL),('ed6484a7-713a-11f1-a888-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',0,'invalid_credentials',0,0,0,'2026-06-26 08:42:13','2026-07-02 05:50:16'),('ef1a99cb-6f86-11f1-8f3c-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,'invalid_credentials',0,0,0,'2026-06-24 04:41:15','2026-07-02 05:50:16'),('f25d3e7c-75d9-11f1-aab9-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-07-02 05:50:35',NULL),('f2ffd6fa-6f86-11f1-8f3c-0a002700000b',NULL,'admin','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',0,'invalid_credentials',0,0,0,'2026-06-24 04:41:21','2026-07-02 05:50:16'),('f4747347-6f86-11f1-8f3c-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-24 04:41:24',NULL),('f7cc6c2e-743b-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1,NULL,1,0,0,'2026-06-30 04:27:13',NULL),('fc900788-6ec7-11f1-84cf-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-23 05:54:24',NULL),('fd33aced-6adf-11f1-b9ca-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admin','::1','Mozilla/5.0 (Windows NT; Windows NT 10.0; en-PH) WindowsPowerShell/5.1.26100.8655',1,NULL,1,0,0,'2026-06-18 06:36:08',NULL),('fd566e65-713a-11f1-a888-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',1,NULL,1,0,0,'2026-06-26 08:42:39',NULL),('fdad7b55-7443-11f1-a369-0a002700000b','09632669-6a16-11f1-895a-0a002700000b','admins','127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',1,NULL,1,0,0,'2026-06-30 05:24:39',NULL);
/*!40000 ALTER TABLE `login_attempts` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `lookup_values`
--

LOCK TABLES `lookup_values` WRITE;
/*!40000 ALTER TABLE `lookup_values` DISABLE KEYS */;
INSERT INTO `lookup_values` VALUES ('0f2040d3-6a16-11f1-895a-0a002700000b','purchase_order_status','pending','Pending',1,1,'2026-06-17 06:30:40'),('0f207caf-6a16-11f1-895a-0a002700000b','purchase_order_status','approved_by_the_owner','Approved by the owner',2,1,'2026-06-17 06:30:40'),('0f20c304-6a16-11f1-895a-0a002700000b','purchase_order_status','in_transit','In transit',3,1,'2026-06-17 06:30:40'),('0f211597-6a16-11f1-895a-0a002700000b','purchase_order_status','arrived','Arrived',4,1,'2026-06-17 06:30:40'),('0f217527-6a16-11f1-895a-0a002700000b','purchase_order_status','delivered','Delivered',5,1,'2026-06-17 06:30:40'),('0f21d93f-6a16-11f1-895a-0a002700000b','purchase_order_status','delivered_with_return_damage','Delivered with Return/Damage',6,1,'2026-06-17 06:30:40'),('0f2231d6-6a16-11f1-895a-0a002700000b','purchase_order_status','cancelled','Cancelled',7,1,'2026-06-17 06:30:40'),('0f22766a-6a16-11f1-895a-0a002700000b','payment_terms','cash','Cash',1,1,'2026-06-17 06:30:40'),('0f22b062-6a16-11f1-895a-0a002700000b','payment_terms','gcash','GCash',2,1,'2026-06-17 06:30:40'),('0f22d7db-6a16-11f1-895a-0a002700000b','payment_terms','bank_transfer','Bank Transfer',3,1,'2026-06-17 06:30:40'),('0f230cd8-6a16-11f1-895a-0a002700000b','return_reason','expired','Expired',1,1,'2026-06-17 06:30:40'),('0f23434d-6a16-11f1-895a-0a002700000b','return_reason','broken_package','Broken package',2,1,'2026-06-17 06:30:40'),('0f23710c-6a16-11f1-895a-0a002700000b','return_reason','wrong_item_delivered','Wrong item delivered',3,1,'2026-06-17 06:30:40'),('0f239f79-6a16-11f1-895a-0a002700000b','return_reason','incorrect_quantity','Incorrect quantity',4,1,'2026-06-17 06:30:40'),('0f23d17b-6a16-11f1-895a-0a002700000b','return_reason','damaged_during_delivery','Damaged during delivery',5,1,'2026-06-17 06:30:40'),('0f2401e6-6a16-11f1-895a-0a002700000b','return_reason','other','Other',6,1,'2026-06-17 06:30:40'),('0f24575a-6a16-11f1-895a-0a002700000b','stock_status','available','Available',1,1,'2026-06-17 06:30:40'),('0f24afb3-6a16-11f1-895a-0a002700000b','stock_status','low_stock','Low Stock',2,1,'2026-06-17 06:30:40'),('0f24e7c6-6a16-11f1-895a-0a002700000b','stock_status','out_of_stock','Out of Stock',3,1,'2026-06-17 06:30:40'),('0f252427-6a16-11f1-895a-0a002700000b','stock_status','expired','Expired',4,1,'2026-06-17 06:30:40');
/*!40000 ALTER TABLE `lookup_values` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `medical_supply_details`
--

LOCK TABLES `medical_supply_details` WRITE;
/*!40000 ALTER TABLE `medical_supply_details` DISABLE KEYS */;
/*!40000 ALTER TABLE `medical_supply_details` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `medicine_details`
--

LOCK TABLES `medicine_details` WRITE;
/*!40000 ALTER TABLE `medicine_details` DISABLE KEYS */;
INSERT INTO `medicine_details` VALUES ('5148bd4b-6a6c-11f1-967a-0a002700000b','09800423-6a16-11f1-895a-0a002700000b','Chlorphenamine Maleate',500.00,'mg','500 mg','Tablet','Blister Pack',NULL,'sachet','2026-06-17 16:48:07'),('5148c010-6a6c-11f1-967a-0a002700000b','098019c5-6a16-11f1-895a-0a002700000b','Povidone-iodine',10.00,'%','10 %','Solution','Bottle',15.00,'ml','2026-06-17 16:48:07');
/*!40000 ALTER TABLE `medicine_details` ENABLE KEYS */;
UNLOCK TABLES;

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
  `price` decimal(10,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `product_id` char(36) NOT NULL DEFAULT uuid(),
  `category_id` char(36) DEFAULT NULL,
  `type_id` char(36) NOT NULL,
  PRIMARY KEY (`product_id`),
  KEY `idx_product_category_id` (`category_id`),
  KEY `idx_product_type_id` (`type_id`),
  KEY `idx_product_brand_name` (`brand_name`),
  KEY `idx_product_product_name` (`product_name`),
  CONSTRAINT `fk_product_category_id` FOREIGN KEY (`category_id`) REFERENCES `product_categories` (`category_id`) ON DELETE SET NULL,
  CONSTRAINT `fk_product_type_id` FOREIGN KEY (`type_id`) REFERENCES `product_types` (`type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product`
--

LOCK TABLES `product` WRITE;
/*!40000 ALTER TABLE `product` DISABLE KEYS */;
INSERT INTO `product` VALUES ('AUTO-59E3F9EB69F6','Neozep','Forte',10.00,'2026-06-02 13:33:18','09800423-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b','097446e8-6a16-11f1-895a-0a002700000b'),('AUTO-57E3BA7EB07F','Betadine','Betadine-Solution',100.00,'2026-06-04 06:56:13','098019c5-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b','09744e38-6a16-11f1-895a-0a002700000b'),('AUTO-B042B754B9DB','Baby Dry','Pampers',150.00,'2026-06-04 07:39:20','09801b88-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b','09745410-6a16-11f1-895a-0a002700000b'),('AUTO-540D37DEE3B0','Fresca','Fresca Tuna',30.00,'2026-06-10 06:51:28','09801c5d-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b','09744fea-6a16-11f1-895a-0a002700000b'),('AUTO-92815956692C','Buldak','Spicy Ramen',75.00,'2026-06-26 07:47:34','4b3d0b22-7133-11f1-a888-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b','0974518f-6a16-11f1-895a-0a002700000b'),('AUTO-BF65DE63CFC7','Fresca','Fresca Tuna',30.00,'2026-06-10 06:51:28','dc0a4964-6b22-11f1-b9ca-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b','09744fea-6a16-11f1-895a-0a002700000b'),('AUTO-1A5A3D9FCE48','Fresca','Tuna',25.00,'2026-06-18 12:38:00','dc0f8ba4-6b22-11f1-b9ca-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b','09744fea-6a16-11f1-895a-0a002700000b'),('AUTO-6C7735E19F06','Buldak','Spicy Ramen',75.00,'2026-06-26 11:12:37','f059104f-714f-11f1-a888-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b','0974518f-6a16-11f1-895a-0a002700000b');
/*!40000 ALTER TABLE `product` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_categories`
--

DROP TABLE IF EXISTS `product_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_categories` (
  `category_name` varchar(50) NOT NULL,
  `category_id` char(36) NOT NULL DEFAULT uuid(),
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_name` (`category_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_categories`
--

LOCK TABLES `product_categories` WRITE;
/*!40000 ALTER TABLE `product_categories` DISABLE KEYS */;
INSERT INTO `product_categories` VALUES ('Grocery','096f558e-6a16-11f1-895a-0a002700000b'),('Medical Supplies','1a56c769-7139-11f1-a888-0a002700000b'),('Medicine','096f52fa-6a16-11f1-895a-0a002700000b');
/*!40000 ALTER TABLE `product_categories` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `product_inventory`
--

LOCK TABLES `product_inventory` WRITE;
/*!40000 ALTER TABLE `product_inventory` DISABLE KEYS */;
INSERT INTO `product_inventory` VALUES ('PO-20260604-095045-3733-9',90,90,'2026-12-31','Available','2026-06-18 14:04:30','2026-06-05 07:26:26','2026-12-31',30,'099b1056-6a16-11f1-895a-0a002700000b',NULL,'09801b88-6a16-11f1-895a-0a002700000b'),('PO-20260604-085715-6481-12',90,70,'2026-12-31','Available','2026-06-23 08:28:15','2026-06-05 08:48:37','2026-12-31',30,'099b1277-6a16-11f1-895a-0a002700000b',NULL,'098019c5-6a16-11f1-895a-0a002700000b'),('PO-20260604-085715-6481-13',90,40,'2026-12-31','Available','2026-06-17 06:30:31','2026-06-05 08:48:37',NULL,30,'099b1315-6a16-11f1-895a-0a002700000b',NULL,'09800423-6a16-11f1-895a-0a002700000b'),('PO-20260628-101241-0C32-223f50fa-72c9-11f1-9796-0a',98,98,'2028-09-29','Available','2026-06-29 08:52:22','2026-06-29 08:52:22',NULL,30,'d8200045-7397-11f1-a2fe-0a002700000b',NULL,'4b3d0b22-7133-11f1-a888-0a002700000b'),('PO-20260628-101241-0C32-223f938b-72c9-11f1-9796-0a',188,188,'2028-10-29','Available','2026-06-29 08:52:22','2026-06-29 08:52:22',NULL,30,'d8237ba9-7397-11f1-a2fe-0a002700000b',NULL,'f059104f-714f-11f1-a888-0a002700000b');
/*!40000 ALTER TABLE `product_inventory` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `product_measurement_units`
--

DROP TABLE IF EXISTS `product_measurement_units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `product_measurement_units` (
  `unit_name` varchar(40) NOT NULL,
  `measurement_unit_id` char(36) NOT NULL DEFAULT uuid(),
  PRIMARY KEY (`measurement_unit_id`),
  UNIQUE KEY `unit_name` (`unit_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `product_measurement_units`
--

LOCK TABLES `product_measurement_units` WRITE;
/*!40000 ALTER TABLE `product_measurement_units` DISABLE KEYS */;
INSERT INTO `product_measurement_units` VALUES ('%','09797a08-6a16-11f1-895a-0a002700000b'),('ampule','097981a7-6a16-11f1-895a-0a002700000b'),('blister pack','09798354-6a16-11f1-895a-0a002700000b'),('bottle','09797d0c-6a16-11f1-895a-0a002700000b'),('box','09797ca0-6a16-11f1-895a-0a002700000b'),('can','09797de3-6a16-11f1-895a-0a002700000b'),('capsule','09797f8e-6a16-11f1-895a-0a002700000b'),('carton','09798442-6a16-11f1-895a-0a002700000b'),('cc','09798066-6a16-11f1-895a-0a002700000b'),('g','097976bb-6a16-11f1-895a-0a002700000b'),('IU','09797a7c-6a16-11f1-895a-0a002700000b'),('jar','09798210-6a16-11f1-895a-0a002700000b'),('kg','0979780e-6a16-11f1-895a-0a002700000b'),('L','09797994-6a16-11f1-895a-0a002700000b'),('lb','097980d1-6a16-11f1-895a-0a002700000b'),('mcg','097978b6-6a16-11f1-895a-0a002700000b'),('mg','097963a4-6a16-11f1-895a-0a002700000b'),('mg/5mL','09797b58-6a16-11f1-895a-0a002700000b'),('mg/mL','09797aed-6a16-11f1-895a-0a002700000b'),('mL','09797925-6a16-11f1-895a-0a002700000b'),('oz','09797eb9-6a16-11f1-895a-0a002700000b'),('pack','09797c31-6a16-11f1-895a-0a002700000b'),('pcs','09797bc5-6a16-11f1-895a-0a002700000b'),('plastic pack','097983cd-6a16-11f1-895a-0a002700000b'),('pouch','097984bc-6a16-11f1-895a-0a002700000b'),('roll','0979827b-6a16-11f1-895a-0a002700000b'),('sachet','09797d78-6a16-11f1-895a-0a002700000b'),('strip','097982eb-6a16-11f1-895a-0a002700000b'),('tablet','09797f23-6a16-11f1-895a-0a002700000b'),('tube','09797ffa-6a16-11f1-895a-0a002700000b'),('vial','0979813e-6a16-11f1-895a-0a002700000b');
/*!40000 ALTER TABLE `product_measurement_units` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `product_selling_stock`
--

LOCK TABLES `product_selling_stock` WRITE;
/*!40000 ALTER TABLE `product_selling_stock` DISABLE KEYS */;
INSERT INTO `product_selling_stock` VALUES ('PO-20260604-085715-6481-13',40,50,'2026-12-31','2026-06-15 06:41:29','09a11562-6a16-11f1-895a-0a002700000b','09800423-6a16-11f1-895a-0a002700000b','099b1315-6a16-11f1-895a-0a002700000b','a45849ac-6edb-11f1-84cf-0a002700000b'),('PO-20260604-085715-6481',20,20,'2026-12-31','2026-06-23 08:27:34','63a36300-6edd-11f1-84cf-0a002700000b','098019c5-6a16-11f1-895a-0a002700000b','099b1277-6a16-11f1-895a-0a002700000b','a4584907-6edb-11f1-84cf-0a002700000b');
/*!40000 ALTER TABLE `product_selling_stock` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `product_types`
--

LOCK TABLES `product_types` WRITE;
/*!40000 ALTER TABLE `product_types` DISABLE KEYS */;
INSERT INTO `product_types` VALUES ('Capsule','0974475f-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Cream','09744983-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Device/Equipment','40da6116-714d-11f1-a888-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Drops','097448ab-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('First Aid','09744e38-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Gel','097449ee-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Inhaler','09744ba9-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Injection','09744b40-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Lotion','09744a6d-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Medical Supply','40d9f06c-714d-11f1-a888-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Medicine','09744174-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Nebulizer','40d7ec55-714d-11f1-a888-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Ointment','09744918-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Patch','09744ce6-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Powder','09744d4e-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Solution','09744ad7-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Suppository','09744c7e-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Suspension','0974483e-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Syrup','097447ce-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Tablet','097446e8-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Vitamins/Supplements','09744db8-6a16-11f1-895a-0a002700000b','096f52fa-6a16-11f1-895a-0a002700000b'),('Baby Care','09745410-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Beverage','09745054-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Biscuits','09745125-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Bread/Bakery','097452c9-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Canned Goods','09744fea-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Condiments','097451f6-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Dairy','0974525e-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Grocery','0974461b-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Household Item','0974547b-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Hygiene Product','097453a1-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Noodles','0974518f-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Personal Care','09745332-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Snacks','097450bc-6a16-11f1-895a-0a002700000b','096f558e-6a16-11f1-895a-0a002700000b'),('Alcohol','1a73d96b-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Bandage','1a6b3d85-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Cotton','1a6f313f-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Device/Equipment','09744f7e-6a16-11f1-895a-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Face Mask','1a5daad9-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('First Aid Supply','1a7d1fae-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Gloves','1a616e7c-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Medical Supply','09744e9f-6a16-11f1-895a-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Medical Tape','1a84af10-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Nebulizer','09744c13-6a16-11f1-895a-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Personal Protective Equipment','09744f0c-6a16-11f1-895a-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Syringe','1a65957f-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Thermometer','1a790ae5-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b'),('Wound Care','1a80b83f-7139-11f1-a888-0a002700000b','1a56c769-7139-11f1-a888-0a002700000b');
/*!40000 ALTER TABLE `product_types` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `product_variations_backup`
--

LOCK TABLES `product_variations_backup` WRITE;
/*!40000 ALTER TABLE `product_variations_backup` DISABLE KEYS */;
INSERT INTO `product_variations_backup` VALUES (NULL,'500','mg',NULL,NULL,NULL,NULL,NULL,NULL,'pcs',NULL,NULL,NULL,10.00,'AUTO-59E3F9EB69F6',NULL,0,0,'2026-06-10 04:16:36','098f9007-6a16-11f1-895a-0a002700000b','09800423-6a16-11f1-895a-0a002700000b'),(NULL,'50','g',NULL,NULL,'Small',NULL,NULL,NULL,'First Aid','Bottle',NULL,'pcs',50.00,'AUTO-57E3BA7EB07F',NULL,1,0,'2026-06-10 04:16:36','098fc205-6a16-11f1-895a-0a002700000b','098019c5-6a16-11f1-895a-0a002700000b'),('ultra-cushy and absorbent',NULL,NULL,NULL,NULL,'Small',NULL,NULL,NULL,'pack','pack',12,'pcs',150.00,'AUTO-B042B754B9DB',NULL,1,0,'2026-06-10 04:16:36','098fc3e2-6a16-11f1-895a-0a002700000b','09801b88-6a16-11f1-895a-0a002700000b'),('Menudo',NULL,NULL,NULL,NULL,'Medium',NULL,'175','g','can','can',NULL,NULL,30.00,'AUTO-540D37DEE3B0',NULL,1,0,'2026-06-10 06:51:28','098fc4df-6a16-11f1-895a-0a002700000b','09801c5d-6a16-11f1-895a-0a002700000b'),('adobo',NULL,NULL,NULL,NULL,'Medium',NULL,'176','g','can','can',NULL,NULL,30.00,'AUTO-BF65DE63CFC7',NULL,0,0,'2026-06-10 06:51:28','098fc590-6a16-11f1-895a-0a002700000b','09801c5d-6a16-11f1-895a-0a002700000b'),(NULL,NULL,NULL,NULL,NULL,'Medium',NULL,NULL,NULL,'First Aid','Bottle',NULL,NULL,80.00,'AUTO-BCA5963CB5B2',NULL,0,0,'2026-06-15 08:21:32','098fc635-6a16-11f1-895a-0a002700000b','098019c5-6a16-11f1-895a-0a002700000b'),('Hot & Spicy',NULL,NULL,NULL,NULL,NULL,NULL,'100','g','Select category first...','can',NULL,NULL,25.00,'AUTO-1A5A3D9FCE48',NULL,0,0,'2026-06-18 12:38:00','8a63fb2a-6b12-11f1-b9ca-0a002700000b','09801c5d-6a16-11f1-895a-0a002700000b');
/*!40000 ALTER TABLE `product_variations_backup` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `purchase_order_approval_audit`
--

LOCK TABLES `purchase_order_approval_audit` WRITE;
/*!40000 ALTER TABLE `purchase_order_approval_audit` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_approval_audit` ENABLE KEYS */;
UNLOCK TABLES;

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
  `unit_price_snapshot` decimal(12,2) DEFAULT NULL,
  `line_total` decimal(10,2) NOT NULL DEFAULT 0.00,
  `po_item_id` char(36) NOT NULL DEFAULT uuid(),
  `po_id` char(36) NOT NULL,
  `product_id` char(36) NOT NULL,
  PRIMARY KEY (`po_item_id`),
  KEY `idx_purchase_order_items_po_id` (`po_id`),
  KEY `idx_purchase_order_items_product_id` (`product_id`),
  CONSTRAINT `fk_purchase_order_items_po_id` FOREIGN KEY (`po_id`) REFERENCES `purchase_orders` (`po_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_purchase_order_items_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_items`
--

LOCK TABLES `purchase_order_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_items` DISABLE KEYS */;
INSERT INTO `purchase_order_items` VALUES (100,100,'by pcs',1,100,'Pampers','Baby Dry','Grocery','Baby Care',NULL,'ultra-cushy and absorbent',NULL,'small','pack','by pcs',150.00,15000.00,'09ac9fa1-6a16-11f1-895a-0a002700000b','09a6d8f6-6a16-11f1-895a-0a002700000b','09801b88-6a16-11f1-895a-0a002700000b'),(100,100,'bottle',1,100,'Povidone-iodine','Betadine','Medicine','First Aid','Betadine',NULL,'50 g',NULL,'bottle',NULL,1000.00,100000.00,'09aca2f7-6a16-11f1-895a-0a002700000b','09a6d841-6a16-11f1-895a-0a002700000b','098019c5-6a16-11f1-895a-0a002700000b'),(100,100,'bottle',1,100,'Chlorphenamine Maleate','Neozep','Medicine','Tablet','neozep forte',NULL,'500 mg',NULL,'pcs','bottle',10.00,1000.00,'09aca3f5-6a16-11f1-895a-0a002700000b','09a6d841-6a16-11f1-895a-0a002700000b','09800423-6a16-11f1-895a-0a002700000b'),(100,1,'Box',100,100,'Forte','Neozep','Medicine','Tablet','Chlorphenamine Maleate',NULL,'500 mg',NULL,'pcs','Blister Pack',10.00,1000.00,'09aca4db-6a16-11f1-895a-0a002700000b','09a6d656-6a16-11f1-895a-0a002700000b','09800423-6a16-11f1-895a-0a002700000b'),(100,1,'Box',100,100,'Spicy Ramen Carbonara','Buldak','Grocery','Noodles',NULL,'Carbonara',NULL,'Single Pack','g','Pack',50.00,5000.00,'223f50fa-72c9-11f1-9796-0a002700000b','223e02dd-72c9-11f1-9796-0a002700000b','4b3d0b22-7133-11f1-a888-0a002700000b'),(190,2,'Box',95,190,'Spicy Ramen Cheesy','Buldak','Grocery','Noodles',NULL,'Cheesy',NULL,'Regular','g','Pack',50.00,9500.00,'223f938b-72c9-11f1-9796-0a002700000b','223e02dd-72c9-11f1-9796-0a002700000b','f059104f-714f-11f1-a888-0a002700000b'),(100,1,'Box',100,100,'Tuna','Fresca','Grocery','Canned Goods',NULL,'adobo',NULL,'Medium','g','can',25.00,2500.00,'8a034a2a-7501-11f1-9d3c-0a002700000b','4ee9bf3b-7501-11f1-9d3c-0a002700000b','dc0a4964-6b22-11f1-b9ca-0a002700000b'),(95,1,'Box',95,95,'Spicy Ramen Cheesy','Buldak','Grocery','Noodles',NULL,'Cheesy',NULL,'Regular','g','Pack',50.00,4750.00,'e89eeb84-73c8-11f1-a2fe-0a002700000b','e89dff05-73c8-11f1-a2fe-0a002700000b','f059104f-714f-11f1-a888-0a002700000b');
/*!40000 ALTER TABLE `purchase_order_items` ENABLE KEYS */;
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
INSERT INTO `purchase_order_receiving` VALUES ('2026-06-05 06:30:26','seal is broken','09b1cfb7-6a16-11f1-895a-0a002700000b','09a6d8f6-6a16-11f1-895a-0a002700000b'),('2026-06-05 08:48:37','','09b1d2d8-6a16-11f1-895a-0a002700000b','09a6d841-6a16-11f1-895a-0a002700000b'),('2026-06-29 08:52:22','','d81dcc25-7397-11f1-a2fe-0a002700000b','223e02dd-72c9-11f1-9796-0a002700000b');
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
INSERT INTO `purchase_order_receiving_items` VALUES (90,10,'09b834bd-6a16-11f1-895a-0a002700000b','09b1cfb7-6a16-11f1-895a-0a002700000b','09ac9fa1-6a16-11f1-895a-0a002700000b'),(100,10,'09b8398d-6a16-11f1-895a-0a002700000b','09b1d2d8-6a16-11f1-895a-0a002700000b','09aca2f7-6a16-11f1-895a-0a002700000b'),(100,10,'09b83a6b-6a16-11f1-895a-0a002700000b','09b1d2d8-6a16-11f1-895a-0a002700000b','09aca3f5-6a16-11f1-895a-0a002700000b'),(100,2,'d81f6158-7397-11f1-a2fe-0a002700000b','d81dcc25-7397-11f1-a2fe-0a002700000b','223f50fa-72c9-11f1-9796-0a002700000b'),(190,2,'d8232f2f-7397-11f1-a2fe-0a002700000b','d81dcc25-7397-11f1-a2fe-0a002700000b','223f938b-72c9-11f1-9796-0a002700000b');
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
INSERT INTO `purchase_order_returns` VALUES (10,'Damaged during delivery','seal is broken','Resolved','2026-06-05 06:30:26','09be3d40-6a16-11f1-895a-0a002700000b','09a6d8f6-6a16-11f1-895a-0a002700000b','09ac9fa1-6a16-11f1-895a-0a002700000b'),(10,'Damaged during delivery','','Open','2026-06-05 08:48:37','09be40e6-6a16-11f1-895a-0a002700000b','09a6d841-6a16-11f1-895a-0a002700000b','09aca2f7-6a16-11f1-895a-0a002700000b'),(10,'Wrong item delivered','','Open','2026-06-05 08:48:37','09be41aa-6a16-11f1-895a-0a002700000b','09a6d841-6a16-11f1-895a-0a002700000b','09aca3f5-6a16-11f1-895a-0a002700000b'),(2,'Returned during receiving','','Open','2026-06-29 08:52:22','d8222801-7397-11f1-a2fe-0a002700000b','223e02dd-72c9-11f1-9796-0a002700000b','223f50fa-72c9-11f1-9796-0a002700000b'),(2,'Damaged during delivery','','Open','2026-06-29 08:52:22','d8242902-7397-11f1-a2fe-0a002700000b','223e02dd-72c9-11f1-9796-0a002700000b','223f938b-72c9-11f1-9796-0a002700000b');
/*!40000 ALTER TABLE `purchase_order_returns` ENABLE KEYS */;
UNLOCK TABLES;

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
  `supplier_id` char(36) NOT NULL,
  PRIMARY KEY (`po_id`),
  UNIQUE KEY `uniq_purchase_orders_po_number` (`po_number`),
  KEY `idx_purchase_orders_supplier_id` (`supplier_id`),
  KEY `idx_purchase_orders_status` (`status`),
  KEY `idx_purchase_orders_created_at` (`created_at`),
  CONSTRAINT `fk_purchase_orders_supplier_id` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES ('PO-20260602-153427-A433','Cash','2026-06-10',0.00,'In transit','Approved','2026-06-02 13:34:27','Unpaid',1000.00,'09a6d656-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b'),('PO-20260604-085715-6481','Cash','2026-06-10',91400.00,'Delivered with Return/Damage','Approved','2026-06-04 06:57:15','Adjusted',101000.00,'09a6d841-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b'),('PO-20260604-095045-3733','Cash','2026-06-11',90000.00,'Delivered with Return/Damage','Approved','2026-06-04 07:50:45','Adjusted',0.00,'09a6d8f6-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b'),('PO-20260628-101241-0C32','Cash','2026-06-29',14400.00,'Delivered with Return/Damage','Approved','2026-06-28 08:12:41','Adjusted',14500.00,'223e02dd-72c9-11f1-9796-0a002700000b','d17d2533-7132-11f1-a888-0a002700000b'),('PO-20260701-055950-D7C1','Cash','2026-06-30',0.00,'Pending','Pending','2026-07-01 03:59:50','Unpaid',2500.00,'4ee9bf3b-7501-11f1-9d3c-0a002700000b','09694904-6a16-11f1-895a-0a002700000b'),('PO-20260629-164333-C7AB','Cash','2026-06-30',0.00,'Cancelled','Rejected','2026-06-29 14:43:33','Unpaid',4750.00,'e89dff05-73c8-11f1-a2fe-0a002700000b','d17d2533-7132-11f1-a888-0a002700000b');
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES ('c979a660-6adf-11f1-b9ca-0a002700000b','ro-admin','Admin','Full pharmacy administration access.',1,1,0,0,'2026-06-18 06:34:41',NULL),('c97a7dbc-6adf-11f1-b9ca-0a002700000b','ro-sales-clerk','Sales Clerk','Sales clerk pharmacy counter access.',1,1,0,0,'2026-06-18 06:34:41',NULL),('c97b7932-6adf-11f1-b9ca-0a002700000b','ro-cashier','Cashier','Cashier point-of-sale access.',1,1,0,0,'2026-06-18 06:34:41',NULL);
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

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
  `supplier_cost_price` decimal(10,2) DEFAULT NULL,
  `purchase_unit` varchar(50) DEFAULT NULL,
  `units_per_purchase_unit` int(11) NOT NULL DEFAULT 1,
  PRIMARY KEY (`supplier_product_id`),
  UNIQUE KEY `uniq_supplier_products_supplier_id_product_id` (`supplier_id`,`product_id`),
  KEY `idx_supplier_products_product_id` (`product_id`),
  CONSTRAINT `fk_supplier_products_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_supplier_products_supplier_id` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers` (`supplier_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `supplier_products`
--

LOCK TABLES `supplier_products` WRITE;
/*!40000 ALTER TABLE `supplier_products` DISABLE KEYS */;
INSERT INTO `supplier_products` VALUES ('2026-06-04 05:57:44','09958933-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','09800423-6a16-11f1-895a-0a002700000b',30.00,'Box',100),('2026-06-04 07:39:20','09958c94-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','09801b88-6a16-11f1-895a-0a002700000b',100.00,'Box',100),('2026-06-10 06:51:28','09958d19-6a16-11f1-895a-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','09801c5d-6a16-11f1-895a-0a002700000b',20.00,'Box',100),('2026-06-18 15:48:14','1fc5ffd5-6b2d-11f1-b9ca-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','098019c5-6a16-11f1-895a-0a002700000b',10.00,'Box',100),('2026-06-26 07:47:34','4b3e516f-7133-11f1-a888-0a002700000b','d17d2533-7132-11f1-a888-0a002700000b','4b3d0b22-7133-11f1-a888-0a002700000b',50.00,'Box',100),('2026-06-18 14:34:49','dc0caf1f-6b22-11f1-b9ca-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','dc0a4964-6b22-11f1-b9ca-0a002700000b',25.00,'Box',100),('2026-06-18 14:34:49','dc0fd1cf-6b22-11f1-b9ca-0a002700000b','09694904-6a16-11f1-895a-0a002700000b','dc0f8ba4-6b22-11f1-b9ca-0a002700000b',20.00,'Box',100),('2026-06-26 11:12:37','f05abfbc-714f-11f1-a888-0a002700000b','d17d2533-7132-11f1-a888-0a002700000b','f059104f-714f-11f1-a888-0a002700000b',50.00,'Box',95);
/*!40000 ALTER TABLE `supplier_products` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES ('Rose pharmacy',NULL,'099999999','rose@gmail.com','divisoria carmen','2026-06-02 11:09:40',NULL,'09694904-6a16-11f1-895a-0a002700000b'),('Buldak.co',NULL,'09989773737','buldak@gmail.com','somewhere','2026-06-26 07:44:10',NULL,'d17d2533-7132-11f1-a888-0a002700000b');
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `tenant_domains`
--

LOCK TABLES `tenant_domains` WRITE;
/*!40000 ALTER TABLE `tenant_domains` DISABLE KEYS */;
INSERT INTO `tenant_domains` VALUES ('c973a674-6adf-11f1-b9ca-0a002700000b','c9721049-6adf-11f1-b9ca-0a002700000b','localhost','platform',1,'verified','active','tenant','c9721049-6adf-11f1-b9ca-0a002700000b',1,0,0,'2026-06-18 06:34:41',NULL);
/*!40000 ALTER TABLE `tenant_domains` ENABLE KEYS */;
UNLOCK TABLES;

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
-- Dumping data for table `tenants`
--

LOCK TABLES `tenants` WRITE;
/*!40000 ALTER TABLE `tenants` DISABLE KEYS */;
INSERT INTO `tenants` VALUES ('c9721049-6adf-11f1-b9ca-0a002700000b','Dr. R Pharmacy','dr-r-pharmacy','active',1,0,0,'2026-06-18 06:34:41',NULL);
/*!40000 ALTER TABLE `tenants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `username` varchar(50) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
  `role` enum('Admin','Sales Clerk','Cashier') NOT NULL,
  `status` enum('Active','Inactive') DEFAULT 'Active',
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
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES ('admin','admin@gmail.com','$2y$10$NRJp4XHvJNRxELsbiyPGcuIJcIP5EPqtwfrrDq4Q5KV0ON6Vvxooy','Dr. ADMIN','Dr.','ADMIN','Admin','Active',0,0,'2026-06-01 11:52:31','2026-07-02 05:50:01','09632669-6a16-11f1-895a-0a002700000b');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

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

-- Dump completed on 2026-07-01 23:01:45
