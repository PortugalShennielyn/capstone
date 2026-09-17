<?php
if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('CLI only.');
}
require __DIR__.'/../pharma-api/config/db_connection.php';
$pdo->beginTransaction();
try {
 $s=$pdo->prepare('SELECT * FROM purchase_requests WHERE pr_number=? FOR UPDATE');$s->execute(['PR-RELATED-PO-96CD123B']);$pr=$s->fetch();
 if(!$pr){echo "Target already absent.\n";$pdo->rollBack();exit;}
 $s=$pdo->prepare('SELECT * FROM purchase_orders WHERE pr_id=? FOR UPDATE');$s->execute([$pr['pr_id']]);$pos=$s->fetchAll();
 $audit=['pr'=>$pr,'orders'=>$pos,'dependencies'=>[]];
 $s=$pdo->prepare('SELECT COUNT(*) FROM purchase_request_items WHERE pr_id=?');$s->execute([$pr['pr_id']]);if($s->fetchColumn()!=0)throw new Exception('PR contains items; aborting.');
 $columns=$pdo->query("SELECT c.TABLE_NAME FROM information_schema.COLUMNS c INNER JOIN information_schema.TABLES t ON t.TABLE_SCHEMA=c.TABLE_SCHEMA AND t.TABLE_NAME=c.TABLE_NAME WHERE c.TABLE_SCHEMA=DATABASE() AND c.COLUMN_NAME='po_id' AND c.TABLE_NAME<>'purchase_orders' AND t.TABLE_TYPE='BASE TABLE'")->fetchAll(PDO::FETCH_COLUMN);
 foreach($pos as $po){foreach($columns as $table){$s=$pdo->prepare("SELECT * FROM `$table` WHERE po_id=? FOR UPDATE");$s->execute([$po['po_id']]);$rows=$s->fetchAll();$audit['dependencies'][$po['po_number']][$table]=$rows;if($rows)throw new Exception("Dependent records in $table; aborting for review.");}}
 file_put_contents(__DIR__.'/../backups/empty_pr_cleanup_96CD123B.json',json_encode($audit,JSON_PRETTY_PRINT|JSON_THROW_ON_ERROR));
 echo json_encode($audit,JSON_PRETTY_PRINT)."\n";
 if(in_array('--apply',$argv,true)){$s=$pdo->prepare('DELETE FROM purchase_orders WHERE pr_id=?');$s->execute([$pr['pr_id']]);$s=$pdo->prepare('DELETE FROM purchase_requests WHERE pr_id=?');$s->execute([$pr['pr_id']]);$pdo->commit();echo "Removed only target PR and its ".count($pos)." empty POs.\n";}else{$pdo->rollBack();echo "Inspection only.\n";}
}catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
