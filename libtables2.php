<?
// Start changes for DokuWiki integration
namespace Lt2;

if ((session_status() == PHP_SESSION_NONE) && !headers_sent()) {
  session_name('DokuWiki'); // Use DokuWiki's session cookie
  session_start();
}
require(dirname(__FILE__) . '/config.php');
// End changes

$tables = array();

function lt_table($tag, $title, $query, $options = array()) {
  global $lt_settings;
  global $tables;
  global $basename; // Set by lt_print_block()
  global $block_options; // Set by lt_print_block()

  if (!$basename) { // lt_table run from data.php
    $table = array();
    $table['tag'] = $tag;
    $table['title'] = $title;
    $table['query'] = $query;
    $table['options'] = $options;
    $tables[] = $table;
    return;
  }

  if (empty($tag)) {
    print "<p>Table in block $basename has no tag specified</p>";
    return;
  }
  if (empty($title)) {
    print "<p>Table $tag in block $basename has no title specified</p>";
    return;
  }
  if (empty($query)) {
    print "<p>No query specified for table $tag in block $basename</p>";
    return;
  }

  if (!empty($block_options['params'])) $params = $block_options['params'];
  elseif (!empty($options['params'])) {
    if (is_numeric($options['params'])) $params = array();
    elseif (is_array($options['params'])) {
      $params = array();
      foreach ($options['params'] as $param) {
        if (!empty($_GET[$param])) $params[] = $_GET[$param];
        else $params[] = $param;
      }
    }
  }
  else $params = array();
  if (!empty($options['classes']['div'])) $divclasses = 'lt-div ' . $options['classes']['div'];
  else $divclasses = 'lt-div';

  if (!empty($options['embed'])) {
    $data = lt_query($query, $params);
    if (isset($data['error'])) {
      print '<p>Query for table ' . $table['title'] . ' in block ' . $basename . ' returned error: ' . $data['error'] . '</p>';
      return;
    }
    $data['options'] = $options;
    if (empty($lt_settings['checksum']) || ($lt_settings['checksum'] == 'php')) $data['crc'] = crc32(json_encode($data['rows']));
    elseif ($lt_settings['checksum'] == 'psql') {
      $data['crc'] = lt_query_single("SELECT md5(string_agg(q::text, '')) FROM ($query) AS q)");
      if (strpos($data['crc'], 'Error:') === 0) {
        print '<p>Checksum query for table ' . $table['title'] . ' in block ' . $basename . ' returned error: ' . substr($data['crc'], 6);
        return;
      }
    }
    $data['title'] = $title;
    $data['block'] = $basename;
    $data['tag'] = $tag;

    if (empty($params)) {
      if (!empty($options['params'])) print ' <div id="' . $tag . '" class="' . $divclasses . '" data-source="' . $basename . ':' . $tag . '" data-embedded="' . "\n" . chunk_split(base64_encode(json_encode($data)), 79, "\n") . '" data-params="-">Loading table ' . $title . "...</div>\n";
      else print '  <div id="' . $tag . '" class="' . $divclasses . '" data-source="' . $basename . ':' . $tag . '" data-embedded="' . "\n" . chunk_split(base64_encode(json_encode($data)), 79, "\n") . '">Loading table ' . $title . "...</div>\n";
    }
    else {
      $data['params'] = base64_encode(json_encode($params));
      print ' <div id="' . $tag . '" class="' . $divclasses . '" data-source="' . $basename . ':' . $tag . '" data-embedded="' . "\n" . chunk_split(base64_encode(json_encode($data)), 79, "\n") . '" data-params="' . base64_encode(json_encode($params)) . '">Loading table ' . $title . "...</div>\n";
    }
  }
  elseif (empty($params)) {
    if (!empty($options['params'])) print '  <div id="' . $tag . '" class="' . $divclasses . '" data-source="' . $basename . ':' . $tag . '" data-params="-">Loading table ' . $title . "...</div>\n";
    else print '  <div id="' . $tag . '" class="' . $divclasses . '" data-source="' . $basename . ':' . $tag . '">Loading table ' . $title . "...</div>\n";
  }
  else print '  <div id="' . $tag . '" class="' . $divclasses . '" data-source="' . $basename . ':' . $tag . '" data-params="' . base64_encode(json_encode($params)) . '">Loading table ' . $title . "...</div>\n";
}

function lt_calendar($tag, $queries, $options = array()) {
  global $lt_settings;
  global $tables;
  global $basename;

  if (!$basename) { // run from data.php
    $table = array();
    $table['tag'] = $tag;
    $table['queries'] = $queries;
    $table['options'] = $options;
    $tables[] = $table;
  }
}

function lt_print_block($block, $params = array(), $options = array()) {
  global $lt_settings;
  global $basename;
  global $block_options;

  $basename = $block;
  $block_options = $options;

  if ($lt_settings['security'] == 'php') {
    if (empty($lt_settings['allowed_blocks_query'])) {
      print "Configuration sets security to 'php' but no allowed_blocks_query defined";
      return;
    }
    if (!($res = $dbh->query($lt_settings['allowed_blocks_query']))) {
      $err = $dbh->errorInfo();
      print "Allowed-blocks query returned error: " . $err[2];
      return;
    }
    $allowed_blocks = $res->fetchAll(\PDO::FETCH_COLUMN, 0);
    if (!in_array($basename, $allowed_blocks)) {
      print "Block $basename is not in our list of allowed blocks";
      return;
    }
  }

  if (is_array($lt_settings['blocks_dir'])) $dirs = $lt_settings['blocks_dir'];
  else $dirs[] = $lt_settings['blocks_dir'];

  foreach($dirs as $dir) {
    if (file_exists($dir . $basename . '.html')) {
      readfile($dir . $basename . '.html');
      return;
    }
    if (function_exists('yaml_parse_file') && file_exists($dir . $basename . '.yml')) {
      $yaml = yaml_parse_file($dir . $basename . '.yml', -1);
      if ($yaml === false) print("<p>YAML syntax error in block $basename</p>");
      else {
        foreach ($yaml as $table) {
          lt_table($table[0], $table[1], $table[2], isset($table[3])?$table[3]:array());
        }
      }
      return;
    }
    if (file_exists($dir . $basename . '.php')) {
      if (!empty($params)) {
        $block_options['params'] = $params;
        print '<div id="block_' . $basename . '_' . base64_encode(json_encode($params)) . '"';
      }
      else print '<div id="block_' . $basename . '"';
      if (!empty($block_options['style'])) print ' style="' . $block_options['style'] . '"';
      print ">\n";
      if (eval(file_get_contents($dir . $basename . '.php')) === FALSE) print "<p>PHP syntax error in block $basename</p>";
      print "</div>\n";
      return;
    }
  }

  print "Block $basename not found in blocks_dir " . implode(", ", $dirs);
}

function lt_query($query, $params = array(), $id = 0) {
  global $dbh;
  $ret = array();

  $start = microtime(TRUE);
  if (empty($params)) {
    if (!($res = $dbh->query($query))) {
      $err = $dbh->errorInfo();
      $ret['error'] = $err[2];
      return $ret;
    }
  }
  else {
    if (!($res = $dbh->prepare($query))) {
      $err = $dbh->errorInfo();
      $ret['error'] = $err[2];
      return $ret;
    }
    if (!$res->execute($params)) {
      $err = $res->errorInfo();
      $ret['error'] = $err[2];
      return $ret;
    }
  }
  $ret['querytime'] = intval((microtime(TRUE)-$start)*1000);

  if ($id) {
    while ($row = $res->fetch(\PDO::FETCH_NUM)) {
      if ($row[0] == $id) {
        $ret['rows'][0] = $row;
        break;
      }
    }
    if (empty($ret['rows'][0])) $ret['error'] = 'row id ' . $id . ' not found';
  }
  else {
    $ret['headers'] = array();
    $ret['types'] = array();
    for ($i = 0; $i < $res->columnCount(); $i++) {
      $col = $res->getColumnMeta($i);
      $ret['headers'][] = $col['name'];
      $ret['types'][] = $col['native_type'];
    }
    $ret['rows'] = $res->fetchAll(\PDO::FETCH_NUM);

    // Do datatype correction because PHP PDO is dumb about floating point values
    for ($i = 0; $i < $res->columnCount(); $i++) {
      if ($ret['types'][$i] == 'float4') {
        foreach ($ret['rows'] as &$row) $row[$i] = floatval($row[$i]);
      }
    }
  }

  return $ret;
}

function lt_query_to_string($query, $format) {
  global $dbh;
  global $basename; // Set by lt_print_block()
  global $block_options; // Set by lt_print_block()

  if (!$basename) return "no basename";

  if (empty($block_options['params'])) {
    if (!($res = $dbh->query($query))) {
      $err = $dbh->errorInfo();
      return "SQL-error: " . $err[2];
    }
  }
  else {
    if (!($res = $dbh->prepare($query))) {
      $err = $dbh->errorInfo();
      return "SQL-error: " . $err[2];
    }
    if (!$res->execute($block_options['params'])) {
      $err = $res->errorInfo();
      return "SQL-error: " . $err[2];
    }
  }
  if (!$res->rowCount()) return "Query for lt_query_to_string() did not return any rows";
  if (!$res->columnCount()) return "Query for lt_query_to_string() did not return any columns";

  $n = 0;
  $ret = "";
  while ($row = $res->fetch(\PDO::FETCH_NUM)) {
    $str = $format;
    $n++;
    for ($i = $res->columnCount(); $i >= 0; $i--) {
      $str = str_replace('#'.$i, $row[$i], $str);
    }
    $str = str_replace('##', $n, $str);
    $ret .= $str;
  }
  return $ret;
}

function lt_query_single($query, $params = array()) {
  global $dbh;

  if (!empty($params)) {
    if (!($res = $dbh->prepare($query))) {
      $err = $dbh->errorInfo();
      return "Error: query prepare failed: " . $err[2];
    }
    if (!$res->execute($params)) {
      $err = $res->errorInfo();
      return "Error: query execute failed: " . $err[2];
    }
    if (!($row = $res->fetch())) return "";
  }
  else {
    if (!($res = $dbh->query($query))) {
      $err = $dbh->errorInfo();
      return "Error: query failed: " . $err[2];
    }
    if ($res->rowCount() == 0) return "";
    if (!($row = $res->fetch())) return "";
  }
  return $row[0];
}

function lt_query_count($query) {
  global $dbh;
  if (!($res = $dbh->query('SELECT COUNT(*) FROM (' . $query . ') AS tmp'))) return -1;
  if (!($row = $res->fetch())) return -1;
  if (!is_numeric($row[0])) return -1;
  return $row[0]+0;
}

function lt_gantt($title, $query_tasks, $query_links = '', $options = array()) {
  global $dbh;

  $tasks = [];
  $links = [];
  if (!($res = $dbh->query($query_tasks))) {
    print "SQL error in query_tasks";
    return;
  }
  while ($row = $res->fetch(\PDO::FETCH_ASSOC)) {
    $tasks[] = $row;
  }
  if (!empty($query_links)) {
    if (!($res = $dbh->query($query_links))) {
      print "SQL error in query_links";
      return;
    }
    while ($row = $res->fetch(\PDO::FETCH_ASSOC)) {
      $links[] = $row;
    }
  }
  $data = json_encode(array('data' => $tasks, 'links' => $links));
  print <<<END
  <div id="ganttchart" style="width: 100%; height: 500px;"></div>
  <script src="3rdparty/dhtmlxgantt.js"></script>
  <link href="3rdparty/dhtmlxgantt.css" rel="stylesheet">
  <script>
    var tasks = $data;
    gantt.config.scale_unit = 'year';
    gantt.init('ganttchart');
    gantt.parse(tasks);
  </script>
END;
}

function lt_buttongrid($tag, $queries, $options) {
  print '<div class="buttongrid"><p>This\'ll be the buttongrid...</p></div>';
}

function lt_numpad($tag, $title) {
  print '<div class="numpad">' . $title . '<br>';
  print '<span class="numpad_row">';
  print '<input id="numpad_button_7" class="numpad_button" type="button" value="7" onclick="numpad_click(\'' . $tag . '\', \'7\');">';
  print '<input id="numpad_button_8" class="numpad_button" type="button" value="8" onclick="numpad_click(\'' . $tag . '\', \'8\');">';
  print '<input id="numpad_button_9" class="numpad_button" type="button" value="9" onclick="numpad_click(\'' . $tag . '\', \'9\');">';
  print '</span><br>';
  print '<span class="numpad_row">';
  print '<input id="numpad_button_4" class="numpad_button" type="button" value="4" onclick="numpad_click(\'' . $tag . '\', \'4\');">';
  print '<input id="numpad_button_5" class="numpad_button" type="button" value="5" onclick="numpad_click(\'' . $tag . '\', \'5\');">';
  print '<input id="numpad_button_6" class="numpad_button" type="button" value="6" onclick="numpad_click(\'' . $tag . '\', \'6\');">';
  print '</span><br>';
  print '<span class="numpad_row">';
  print '<input id="numpad_button_1" class="numpad_button" type="button" value="1" onclick="numpad_click(\'' . $tag . '\', \'1\');">';
  print '<input id="numpad_button_2" class="numpad_button" type="button" value="2" onclick="numpad_click(\'' . $tag . '\', \'2\');">';
  print '<input id="numpad_button_3" class="numpad_button" type="button" value="3" onclick="numpad_click(\'' . $tag . '\', \'3\');">';
  print '</span><br>';
  print '<span class="numpad_row">';
  print '<input id="numpad_button_0" class="numpad_button" type="button" value="0" onclick="numpad_click(\'' . $tag . '\', \'0\');">';
  print '<div id="numpad_display"></div>';
  print '<input id="numpad_button_c" class="numpad_button" type="button" value="C" onclick="numpad_click(\'' . $tag . '\', null);">';
  print '</span><br>';
  print '</div>';
}

function lt_sqlrun() {
  global $basename; // Set by lt_print_block()

  if (!$basename) { // lt_table run from data.php
    return;
  }

  print <<<END
<p>
  <form action="data.php" method="post">
    <input type="hidden" name="mode" value="sqlrun">
    <textarea id="sqlrun" name="sql" oninput="check_sql(this)" autofocus="autofocus"></textarea><br>
    <input type="button" value="Run" onclick="run_sql(this.parentNode)">
  </form>
</p>
<p>
  <table id="sqlrun:table" class="lt-table"></table>
</p>
END;
}
