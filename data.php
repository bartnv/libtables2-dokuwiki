<?
// Start changes for DokuWiki integration
namespace Lt2;

require(dirname(__FILE__) . '/libtables2.php');
// End changes

global $dbh;

function fatalerr($msg, $redirect = "") {
  $ret['error'] = $msg;
  if (!empty($redirect)) $ret['redirect'] = $redirect;
  print json_encode($ret);
  exit;
}

function lt_col_allow_null($table, $column) {
  global $dbh;

  if (!($dbtype = $dbh->getAttribute(\PDO::ATTR_DRIVER_NAME))) fatalerr('Unable to query SQL server type');
  if ($dbtype == 'mysql') {
    if (!($res = $dbh->query("DESC $table $column"))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL-error: " . $err[2]);
    }
    if ($res->rowCount() != 1) fatalerr('editselect target query returned invalid results');
    $row = $res->fetch();
    if (empty($row['Null'])) fatalerr('editselect target query did not contain a "Null" column');
    if ($row['Null'] == "YES") return true;
    elseif ($row['Null'] == "NO") return false;
    else fatalerr('editselect target query returned invalid "Null" column');
  }
  elseif ($dbtype == 'sqlite') {
    if (!($res = $dbh->query("PRAGMA table_info($table)"))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL-error: " . $err[2]);
    }
    foreach ($res as $row) {
      if ($row['name'] == $column) {
        $found = $row;
        break;
      }
    }
    if (!$found) fatalerr('editselect target query did not return data for column ' . $column);
    if (!isset($found['notnull'])) fatalerr('editselect target query did not contain a "notnull" column');
    if ($found['notnull'] == "1") return false;
    elseif ($found['notnull'] == "0") return true;
    else fatalerr('editselect target query returned invalid "notnull" column');
  }
  elseif ($dbtype == 'pgsql') {
    if (!($res = $dbh->query("SELECT is_nullable FROM information_schema.columns WHERE table_name = '$table' AND column_name = '$column'"))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL-error: " . $err[2]);
    }
    if ($res->columnCount() != 1) fatalerr('editselect target query returned invalid results');
    $row = $res->fetch();
    if (empty($row['is_nullable'])) fatalerr('editselect target query for table ' . $table . ' column ' . $column . ' did not contain a "is_nullable" column (does it exist?)');
    if ($row['is_nullable'] == "YES") return true;
    elseif ($row['is_nullable'] == "NO") return false;
    else fatalerr('editselect target query returned invalid "is_nullable" column');
  }
}

function lt_find_table($src) {
  global $lt_settings;
  global $tables;

  $src = explode(':', $src);
  if (is_array($lt_settings['blocks_dir'])) $dirs = $lt_settings['blocks_dir'];
  else $dirs[] = $lt_settings['blocks_dir'];

  foreach($dirs as $dir) {
    if (function_exists('yaml_parse_file') && file_exists($dir . $src[0] . '.yml')) {
      $yaml = yaml_parse_file($dir . $src[0] . '.yml', -1);
      if ($yaml === false) fatalerr('YAML syntax error in block ' . $src[0]);
      else {
        foreach ($yaml as $table) {
          lt_table($table[0], $table[1], $table[2], isset($table[3])?$table[3]:array());
        }
      }
      break;
    }
    elseif (file_exists($dir . $src[0] . '.php')) {
      ob_start();
      if (eval(file_get_contents($dir . $src[0] . '.php')) === FALSE) fatalerr('PHP syntax error in block ' . $src[0]);
      ob_end_clean();
      break;
    }
  }

  if (!empty($error)) fatalerr($error, $redirect);
  if (count($tables) == 0) fatalerr('Block ' . $src[0] . ' not found');

  $table = 0;
  foreach ($tables as $atable) {
    if (isset($atable['tag']) && ($atable['tag'] == $src[1])) {
      $atable['block'] = $src[0];
      if (!empty($lt_settings['default_options'])) $atable['options'] = array_merge($lt_settings['default_options'], $atable['options']);
      return $atable;
    }
  }
  fatalerr('Specified table not found in block ' . $src[0]);
}

function allowed_block($block) {
  if (!empty($lt_settings['security']) && ($lt_settings['security'] == 'php')) {
    if (empty($lt_settings['allowed_blocks_query'])) fatalerr("Configuration sets security to 'php' but no allowed_blocks_query defined");
    if (!($res = $dbh->query($lt_settings['allowed_blocks_query']))) {
      $err = $dbh->errorInfo();
      fatalerr("Allowed-blocks query returned error: " . $err[2]);
    }
    $allowed_blocks = $res->fetchAll(\PDO::FETCH_COLUMN, 0);
    if (!in_array($basename, $allowed_blocks)) return false;
  }
  return true;
}

function lt_remove_parens($str) {
  $c = 0;
  $ret = "";
  for ($i = 0; $i < strlen($str); $i++) {
    if ($str[$i] == '(') $c++;
    elseif ($str[$i] == ')') {
      $c--;
      continue;
    }
    if ($c == 0) $ret .= $str[$i];
  }
  return $ret;
}
function lt_edit_from_query($query) {
  if (!preg_match('/^\s*SELECT (.*) FROM (\S+)(.*)$/i', $_POST['sql'], $matches)) return false;
  $cols = preg_split('/\s*,\s*/', lt_remove_parens($matches[1]));
  $firsttable = $matches[2];
  $joins = array();
  preg_match_all('/JOIN\s+([^ ]+)\s+ON\s+([^ .]+\.[^ ]+)\s*=\s*([^ .]+\.[^ ]+)/i', $matches[3], $sets, PREG_SET_ORDER);
  foreach ($sets as $set) {
    $left = explode('.', $set[2]);
    $right = explode('.', $set[3]);
    if (($left[0] == $set[1]) && ($left[1] == 'id') && ($right[0] == $firsttable)) $joins[$set[1]] = array('pk' => $set[2], 'fk' => $set[3]);
    elseif (($right[1] == 'id') && ($left[0] == $firsttable)) $joins[$set[1]] = array('pk' => $set[3], 'fk' => $set[2]);
  }
  $edit = array();
  for ($i = 0; $i < count($cols); $i++) {
    if (strpos($cols[$i], '.') === false) continue;
    $val = explode('.', $cols[$i]);
    if ($val[0] == $firsttable) {
      if ($i) $edit[$i] = $cols[$i];
    }
    elseif ($i == 0) return false;
    elseif ($joins[$val[0]]) {
      $edit[$i] = array($joins[$val[0]]['fk'], 'SELECT id, ' . $val[1] . ' FROM ' . $val[0]);
    }
  }
  return $edit;
}

if (!empty($_GET['mode'])) $mode = $_GET['mode'];
elseif (!empty($_POST['mode'])) $mode = $_POST['mode'];
else fatalerr('No mode specified');

switch ($mode) {
  case 'getblock':
    if (empty($_GET['block'])) fatalerr('No blockname specified in mode getblock');
    if (!allowed_block($_GET['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    if (preg_match('/(\.\.|\\|\/)/', $_GET['block'])) fatalerr('Invalid blockname in mode getblock');
    if (empty($_GET['params'])) lt_print_block($_GET['block']);
    else {
      if (!($params = json_decode(base64_decode($_GET['params'])))) fatalerr('Invalid params in mode getblock');
      lt_print_block($_GET['block'], $params);
    }
  break;
  case 'gettable':
    if (empty($_GET['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_GET['src'])) fatalerr('Invalid src in mode gettable');
    if (!empty($_GET['params'])) $params = json_decode(base64_decode($_GET['params']));
    else $params = array();

    $table = lt_find_table($_GET['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    if (isset($table['options']['export']['nopreview']) && $table['options']['export']['nopreview']) {
      $data = lt_query($table['query'] . ' LIMIT 0', $params);
      $data['rowcount'] = lt_query_single('SELECT COUNT(*) FROM (' . $table['query'] . ') AS tmp', $params);
    }
    else $data = lt_query($table['query'], $params);
    if (isset($data['error'])) fatalerr('Query for table ' . $table['title'] . ' in block ' . $table['block'] . " returned error:\n\n" . $data['error']);
    $data['block'] = $table['block'];
    $data['tag'] = $table['tag'];
    if (!empty($table['options']['titlequery'])) $data['title'] = lt_query_single($table['options']['titlequery'], $params);
    else $data['title'] = $table['title'];
    $data['options'] = $table['options'];
    if (!empty($data['options']['tablefunction']['hidecondition'])) $data['options']['tablefunction']['hidecondition'] = lt_query_single($data['options']['tablefunction']['hidecondition'], $params);
    if (!empty($data['options']['selectany'])) {
      $tmp = lt_query('SELECT ' . $data['options']['selectany']['fields'][1] . ' FROM ' . $data['options']['selectany']['linktable'] . ' WHERE ' . $data['options']['selectany']['fields'][0] . ' = ?', $params);
      $data['options']['selectany']['links'] = array_column($tmp['rows'], 0);
    }
    if (empty($lt_settings['checksum']) || ($lt_settings['checksum'] == 'php')) $data['crc'] = crc32(json_encode($data['rows']));
    elseif ($lt_settings['checksum'] == 'psql') {
      $data['crc'] = lt_query_single("SELECT md5(string_agg(q::text, '')) FROM (" . $table['query'] . ") AS q)");
      if (strpos($data['crc'], 'Error:') === 0) fatalerr('<p>Checksum query for table ' . $table['title'] . ' in block ' . $table['block'] . ' returned error: ' . substr($data['crc'], 6));
    }
    if ($params) $data['params'] = base64_encode(json_encode($params));
    header('Content-type: application/json; charset=utf-8');
    print json_encode($data);
    break;
  case 'sqlrun':
    $matches = array();
    if (empty($lt_settings) || ($lt_settings['security'] != 'none')) fatalerr('SQLrun not enabled due to security setting');
    if (empty($_POST['sql']) || !preg_match('/^\s*SELECT /i', $_POST['sql'])) fatalerr('Invalid sql in mode sqlrun');
    $data = lt_query($_POST['sql']);
    $data['title'] = 'sqlrun';
    $data['tag'] = 'sqlrun';
    $data['options'] = array('sql' => $_POST['sql'], 'displayid' => true, 'edit' => lt_edit_from_query($_POST['sql']));
    if (empty($lt_settings['checksum']) || ($lt_settings['checksum'] == 'php')) $data['crc'] = crc32(json_encode($data['rows']));
    elseif ($lt_settings['checksum'] == 'psql') {
      $data['crc'] = lt_query_single("SELECT md5(string_agg(q::text, '')) FROM (" . $_POST['sql'] . ") AS q)");
      if (strpos($data['crc'], 'Error:') === 0) fatalerr('<p>Checksum query for table sqlrun returned error: ' . substr($data['crc'], 6));
    }
    header('Content-type: application/json; charset=utf-8');
    print json_encode($data);
    break;
  case 'refreshtable':
    if (empty($_GET['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_GET['src'])) fatalerr('Invalid src in mode refreshtable');
    if (empty($_GET['crc'])) fatalerr('No crc passed in mode refreshtable');
    if (!empty($_GET['params'])) $params = json_decode(base64_decode($_GET['params']));
    else $params = array();

    $table = lt_find_table($_GET['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    $data = lt_query($table['query'], $params);
    if (isset($data['error'])) fatalerr('Query for table ' . $table['title'] . ' in block ' . $src[0] . ' returned error: ' . $data['error']);
    header('Content-type: application/json; charset=utf-8');
    if (empty($lt_settings['checksum']) || ($lt_settings['checksum'] == 'php')) $crc = crc32(json_encode($data['rows']));
    elseif ($lt_settings['checksum'] == 'psql') $crc = lt_query_single("SELECT md5(string_agg(q::text, '')) FROM (" . $table['query'] . ") AS q)");
    if ($crc == $_GET['crc']) {
      $ret['nochange'] = 1;
      print json_encode($ret);
    }
    else {
      $data['crc'] = $crc;
      if (!empty($table['options']['tablefunction']['hidecondition'])) $data['options']['tablefunction']['hidecondition'] = lt_query_single($table['options']['tablefunction']['hidecondition'], $params);
      print json_encode($data);
    }
    break;
  case 'select':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode select');
    if (empty($_POST['id']) || !is_numeric($_POST['id'])) fatalerr('Invalid row id in mode select');
    if (empty($_POST['link'])) fatalerr('Invalid link data in mode select');
    if (empty($_POST['params'])) fatalerr('Invalid params in mode select');
    $params = json_decode(base64_decode($_POST['params']));

    $table = lt_find_table($_POST['src']);
    if (empty($table['options']['selectany'])) fatalerr('No selectany option found for table ' . $_POST['src']);
    if (empty($table['options']['selectany']['linktable'])) fatalerr('No linktable found for table ' . $_POST['src']);
    if (empty($table['options']['selectany']['fields'][0])) fatalerr('No left field found for table ' . $_POST['src']);
    if (empty($table['options']['selectany']['fields'][1])) fatalerr('No right field found for table ' . $_POST['src']);
    if ($_POST['link'] === "true") {
      if (!($stmt = $dbh->prepare("INSERT INTO " . $table['options']['selectany']['linktable'] . " (" . $table['options']['selectany']['fields'][0] . ", " . $table['options']['selectany']['fields'][1] . ") VALUES (?, " . $_POST['id'] . ")"))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!$stmt->execute($params)) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    else {
      if (!($stmt = $dbh->prepare("DELETE FROM " . $table['options']['selectany']['linktable'] . " WHERE " . $table['options']['selectany']['fields'][0] . " = ? AND " . $table['options']['selectany']['fields'][1] . " = " . $_POST['id']))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!$stmt->execute($params)) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    print '{ "status": "ok" }';
    break;
  case 'inlineedit':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode inlineedit');
    if (empty($_POST['col']) || !is_numeric($_POST['col'])) fatalerr('Invalid column id in mode inlineedit');
    if (empty($_POST['row']) || !is_numeric($_POST['row'])) fatalerr('Invalid row id in mode inlineedit');
    if (!isset($_POST['val'])) fatalerr('No value specified in mode inlineedit');

    if (($_POST['src'] == 'sqlrun:table') && (!empty($_POST['sql']))) {
      if (!($edit = lt_edit_from_query($_POST['sql']))) fatalerr('Invalid SQL in sqlrun inlineedit');
      $table['title'] = 'sqlrun';
      $table['query'] = $_POST['sql'];
    }
    else {
      $table = lt_find_table($_POST['src']);
      if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
      if (empty($table['options']['edit'][$_POST['col']])) fatalerr('No edit option found for column ' . $_POST['col'] . ' in table ' . $_POST['src']);
      $edit = $table['options']['edit'][$_POST['col']];
    }

    $type = 'default';
    if (is_array($edit)) {
      if (!empty($edit)) {
        if (!empty($edit['type'])) $type = $edit['type'];
        if (!empty($edit['target'])) $target = $edit['target'];
        elseif (count($edit) == 2) $target = $edit[0];
        else fatalerr('Invalid edit settings for column ' . $_POST['col'] . ' in table ' . $_POST['src']);
      }
      else $target = $edit[0];
    }
    else $target = $edit;

    if (!preg_match('/^[a-z0-9_-]+.[a-z0-9_-]+$/', $target)) fatalerr('Invalid target specified for column ' . $_POST['col'] . ' in table ' . $_POST['src'] . ' (' . $target . ')');
    $target = explode('.', $target);

    if ($_POST['val'] == '') {
      if (!($stmt = $dbh->prepare('UPDATE ' . $target[0] . ' SET ' . $target[1] . ' = NULL WHERE id = ?'))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($_POST['row'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    elseif (($type == 'checkbox') && !empty($edit['truevalue']) && ($edit['truevalue'] === $_POST['val'])) {
      if (!($stmt = $dbh->prepare('UPDATE ' . $target[0] . ' SET ' . $target[1] . ' = TRUE WHERE id = ?'))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($_POST['row'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    elseif (($type == 'checkbox') && !empty($edit['falsevalue']) && ($edit['falsevalue'] === $_POST['val'])) {
      if (!($stmt = $dbh->prepare('UPDATE ' . $target[0] . ' SET ' . $target[1] . ' = FALSE WHERE id = ?'))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($_POST['row'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    elseif (!empty($edit['phpfunction'])) {
      $func = 'return ' . str_replace('?', "'" . $_POST['val'] . "'", $edit['phpfunction']) . ';';
      $ret = eval($func);
      if (!($stmt = $dbh->prepare('UPDATE ' . $target[0] . ' SET ' . $target[1] . ' = ? WHERE id = ?'))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($ret, $_POST['row'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    elseif (!empty($edit['sqlfunction'])) {
      if (!($stmt = $dbh->prepare('UPDATE ' . $target[0] . ' SET ' . $target[1] . ' = ' . $edit['sqlfunction'] . ' WHERE id = ?'))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($_POST['val'], $_POST['row'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    else {
      if (!($stmt = $dbh->prepare('UPDATE ' . $target[0] . ' SET ' . $target[1] . ' = ? WHERE id = ?'))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($_POST['val'], $_POST['row'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }

    if (!empty($_POST['params'])) $params = json_decode(base64_decode($_POST['params']));
    else $params = array();
    $data = lt_query($table['query'], $params, $_POST['row']);
    if (isset($data['error'])) fatalerr('Query for table ' . $table['title'] . ' in block ' . $src[0] . " returned error:\n\n" . $data['error']);
    $data['input'] = $_POST['val'];
    header('Content-type: application/json; charset=utf-8');
    print json_encode($data);

    break;
  case 'selectbox':
    if (empty($_GET['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_GET['src'])) fatalerr('Invalid src in mode inlineedit');
    if (empty($_GET['col']) || !is_numeric($_GET['col'])) fatalerr('Invalid column id in mode inlineedit');

    if (($_GET['src'] == 'sqlrun:table') && (!empty($_GET['sql']))) {
      if (!($edit = lt_edit_from_query($_GET['sql']))) fatalerr('Invalid SQL in sqlrun selectbox');
      $table['title'] = 'sqlrun';
      $table['query'] = $_GET['sql'];
    }
    else {
      $table = lt_find_table($_GET['src']);
      if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
      $edit = $table['options']['edit'];
    }

    if (empty($edit[$_GET['col']])) fatalerr('No edit option found for column ' . $_GET['col'] . ' in table ' . $_GET['src']);
    if (!is_array($edit[$_GET['col']])) fatalerr('No editselect option found for column ' . $_GET['col'] . ' in table ' . $_GET['src']);
    if (count($edit[$_GET['col']]) < 2) fatalerr('No valid editselect option found for column ' . $_GET['col'] . ' in table ' . $_GET['src']);
    if (!empty($edit[$_GET['col']]['target'])) $target = $edit[$_GET['col']]['target'];
    else $target = $edit[$_GET['col']][0];
    if (!empty($edit[$_GET['col']]['query'])) $query = $edit[$_GET['col']]['query'];
    else $query = $edit[$_GET['col']][1];
    if (!preg_match('/^[a-z0-9_-]+\.[a-z0-9_-]+$/', $target)) fatalerr('Invalid target specified for column ' . $_GET['col'] . ' in table ' . $_GET['src'] . ' (' . $target . ')');
    $target = explode('.', $target);

    if (!($res = $dbh->query($query))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL error: " . $err[2]);
    }
    $data = array();
    $data['items'] = $res->fetchAll(\PDO::FETCH_NUM);
    $data['null'] = lt_col_allow_null($target[0], $target[1]);
    header('Content-type: application/json; charset=utf-8');
    print json_encode($data);
    break;
  case 'function':
    if (empty($_POST['type'])) fatalerr('No type specified for mode function');
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode function');
    if (!empty($_POST['params'])) $params = json_decode(base64_decode($_POST['params']));
    else $params = array();

    $table = lt_find_table($_POST['src']);
    if ($_POST['type'] == 'table') {
      if (empty($table['options']['tablefunction'])) fatalerr('No tablefunction defined in block ' . $_POST['src']);
      if (empty($table['options']['tablefunction']['query'])) fatalerr('No tablefunction query defined in block ' . $_POST['src']);

      if (!($stmt = $dbh->prepare($table['options']['tablefunction']['query']))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute($params))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
      print '{ "status": "ok" }';
    }
    else fatalerr('Invalid type in mode function');
    break;
  case 'excelexport':
    include('3rdparty/xlsxwriter.class.php');

    if (empty($_GET['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_GET['src'])) fatalerr('Invalid src in mode excelexport');

    $table = lt_find_table($_GET['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');

    $data = lt_query($table['query']);
    if (isset($data['error'])) fatalerr('Query for table ' . $table['title'] . ' in block ' . $src[0] . ' returned error: ' . $data['error']);
//    $types = str_replace([ 'int4', 'int8', 'float4', 'float8', 'bool', 'text' ], [ 'integer', 'integer', 'numeric', 'numeric', 'boolean', 'string' ], $data['types']);
//    $headers = array_combine($data['headers'], $types);
    $writer = new \XLSXWriter();
//    $writer->writeSheetHeader('Sheet1', $headers);
    $writer->writeSheetRow('Sheet1', $data['headers']);
    foreach ($data['rows'] as $row) {
      if (!empty($table['options']['export']['hideid']) && $table['options']['export']['hideid']) array_shift($row);
      $writer->writeSheetRow('Sheet1', $row);
    }
    header('Content-disposition: attachment; filename="'.\XLSXWriter::sanitize_filename($table['title'] . '.xlsx').'"');
    header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    header('Content-Transfer-Encoding: binary');
    header('Cache-Control: must-revalidate');
    header('Pragma: public');
    $writer->writeToStdOut();
    break;
  case 'insertrow':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode insertrow');
    if (!empty($_POST['params'])) $params = json_decode(base64_decode($_POST['params']));
    else $params = array();

    $tableinfo = lt_find_table($_POST['src']);
    if (!allowed_block($tableinfo['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    $tables = array();

    foreach ($_POST as $key => $value) {
      if (strpos($key, ':')) {
        list($table, $column) = explode(':', $key);
        if (!$table || !$column) fatalerr('<p>Incorrect target specification in mode insert: ' . $key);
        if ($value === "") {
          // Check required fields here
        }
        else $tables[$table]['columns'][$column] = $value;
      }
    }

    foreach ($tableinfo['options']['insert']['keys'] as $pkey => $fkey) {
      list($ptable, $pcolumn) = explode('.', $pkey);
      list($ftable, $fcolumn) = explode('.', $fkey);
      if (!isset($tables[$ftable]['columns'])) fatalerr('Invalid sequence in insert keys option to block ' . $_POST['src']);
      $tables[$ftable]['columns'][$fcolumn] = lt_run_insert($ptable, $tables[$ptable], $pcolumn);
      unset($tables[$ptable]['columns']);
    }
    foreach ($tables as $name => $value) {
      if (!isset($tables[$name]['columns'])) continue;
      lt_run_insert($name, $tables[$name]);
      unset($tables[$name]['columns']); // May not be necessary
    }

    $data = lt_query($tableinfo['query'], $params);
    if (isset($data['error'])) fatalerr('Query for table ' . $tableinfo['title'] . ' in block ' . $src[0] . ' returned error: ' . $data['error']);
    header('Content-type: application/json; charset=utf-8');
    if (empty($lt_settings['checksum']) || ($lt_settings['checksum'] == 'php')) $data['crc'] = crc32(json_encode($data['rows']));
    elseif ($lt_settings['checksum'] == 'psql') {
      $data['crc'] = lt_query_single("SELECT md5(string_agg(q::text, '')) FROM (" . $tableinfo['query'] . ") AS q)");
      if (strpos($data['crc'], 'Error:') === 0) fatalerr('<p>Checksum query for table ' . $tableinfo['title'] . ' returned error: ' . substr($data['crc'], 6));
    }
    print json_encode($data);
    break;
  case 'deleterow':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode deleterow');
    if (empty($_POST['id']) || !is_numeric($_POST['id'])) fatalerr('Invalid delete id in mode deleterow');

    $table = lt_find_table($_POST['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    if (empty($table['options']['delete']['table'])) fatalerr('No table defined in delete option in block ' . $_POST['src']);
    $target = $table['options']['delete']['table'];

    if (!empty($table['options']['delete']['update'])) {
      if (empty($table['options']['delete']['update']['column'])) fatalerr('No column defined in update setting for delete option in block ' . $_POST['src']);
      if (!isset($table['options']['delete']['update']['value'])) fatalerr('No value defined in update setting for delete option in block ' . $_POST['src']);
      if (!($stmt = $dbh->prepare("UPDATE " . $target . " SET " . $table['options']['delete']['update']['column'] . " = ? WHERE id = ?"))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($table['options']['delete']['update']['value'], $_POST['id'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    else {
      if (!($stmt = $dbh->prepare("DELETE FROM " . $target . " WHERE id = ?"))) {
        $err = $dbh->errorInfo();
        fatalerr("SQL prepare error: " . $err[2]);
      }
      if (!($stmt->execute(array($_POST['id'])))) {
        $err = $stmt->errorInfo();
        fatalerr("SQL execute error: " . $err[2]);
      }
    }
    print '{ "status": "ok" }';
    break;
  case 'calendarselect':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode calendarselect');
    if (empty($_POST['start'])) fatalerr('Invalid start date in mode calendarselect');
    if (empty($_POST['end'])) fatalerr('Invalid end date in mode calendarselect');
    $table = lt_find_table($_POST['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    if (empty($table['queries']['select'])) fatalerr('No select query defined in lt_calendar block ' . $_POST['src']);

    if (!($stmt = $dbh->prepare($table['queries']['select']))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL prepare error: " . $err[2]);
    }
    if (!($stmt->execute(array($_POST['start'], $_POST['end'])))) {
      $err = $stmt->errorInfo();
      fatalerr("SQL execute error: " . $err[2]);
    }

    $results = array();
    while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
      $results[] = array(
        'id' => $row['id'],
        'subid' => isset($row['subid'])?$row['subid']:null,
        'src' => $_POST['src'],
        'title' => $row['title'],
        'start' => $row['start'],
        'end' => $row['end'],
        'color' => $row['color'],
        'subcolor' => isset($row['subcolor'])?$row['subcolor']:null,
        'allDay' => isset($row['allday'])?$row['allday']:false
      );
    }

    print json_encode($results);
    break;
  case 'calendarupdate':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode calendarupdate');
    if (empty($_POST['id']) || !is_numeric($_POST['id'])) fatalerr('Invalid id in mode calendarupdate');
    if (empty($_POST['start'])) fatalerr('Invalid start date in mode calendarupdate');
    if (empty($_POST['end'])) fatalerr('Invalid end date in mode calendarupdate');
    $table = lt_find_table($_POST['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    if (empty($table['queries']['update'])) fatalerr('No update query defined in lt_calendar block ' . $_POST['src']);

    if (!($stmt = $dbh->prepare($table['queries']['update']))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL prepare error: " . $err[2]);
    }
    if (!($stmt->execute(array($_POST['start'], $_POST['end'], $_POST['id'])))) {
      $err = $stmt->errorInfo();
      fatalerr("SQL execute error: " . $err[2]);
    }
    print '{ "status": "ok" }';
  break;
  case 'calendarinsert':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode calendarinsert');
    if (empty($_POST['start'])) fatalerr('Invalid start date in mode calendarinsert');
    if (empty($_POST['end'])) fatalerr('Invalid end date in mode calendarinsert');
    $table = lt_find_table($_POST['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    if (empty($table['queries']['insert'])) fatalerr('No insert query defined in lt_calendar block ' . $_POST['src']);

    if (!($stmt = $dbh->prepare($table['queries']['insert']))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL prepare error: " . $err[2]);
    }
    $params = array($_POST['start'], $_POST['end']);
    if (!empty($_POST['param1'])) {
      $params[] = $_POST['param1'];
      if (!empty($_POST['param2'])) $params[] = $_POST['param2'];
    }
    if (!empty($_POST['title'])) $params[] = $_POST['title'];
    if (!($stmt->execute($params))) {
      $err = $stmt->errorInfo();
      fatalerr("SQL execute error: " . $err[2] . "\nwith params: " . json_encode($params));
    }
    print '{ "status": "ok" }';
  break;
  case 'calendardelete':
    if (empty($_POST['src']) || !preg_match('/^[a-z0-9_-]+:[a-z0-9_-]+$/', $_POST['src'])) fatalerr('Invalid src in mode calendardelete');
    if (empty($_POST['id']) || !is_numeric($_POST['id'])) fatalerr('Invalid id in mode calendardelete');
    $table = lt_find_table($_POST['src']);
    if (!allowed_block($table['block'])) fatalerr('Access to block ' . $_GET['block'] . ' denied');
    if (empty($table['queries']['delete'])) fatalerr('No insert query defined in lt_calendar block ' . $_POST['src']);

    if (!($stmt = $dbh->prepare($table['queries']['delete']))) {
      $err = $dbh->errorInfo();
      fatalerr("SQL prepare error: " . $err[2]);
    }
    if (!($stmt->execute(array($_POST['id'])))) {
      $err = $stmt->errorInfo();
      fatalerr("SQL execute error: " . $err[2]);
    }
    print '{ "status": "ok" }';
  break;
  default:
    fatalerr('Invalid mode specified');
}

function lt_run_insert($table, $data, $idcolumn = '') {
  global $dbh;
  $driver = $dbh->getAttribute(\PDO::ATTR_DRIVER_NAME);

  $query = "INSERT INTO $table (" . implode(',', array_keys($data['columns'])) . ") VALUES (" . rtrim(str_repeat('?, ', count($data['columns'])), ', ') . ")";
  if ($idcolumn && ($driver == 'pgsql')) $query .= " RETURNING $idcolumn";

  if (!($stmt = $dbh->prepare($query))) {
    $err = $dbh->errorInfo();
    fatalerr("SQL prepare error: " . $err[2]);
  }
  if (!($stmt->execute(array_values($data['columns'])))) {
    $err = $stmt->errorInfo();
    fatalerr("SQL execute error: " . $err[2]);
  }

  if ($idcolumn) {
    if ($driver == 'pgsql') {
      $row = $stmt->fetch(\PDO::FETCH_NUM);
      if (empty($row) || empty($row[0])) fatalerr("lastInsertId requested but not available");
      $id = $row[0];
    }
    else $id = $dbh->lastInsertId();
  }
  else $id = 0;

  return $id;
}
