/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * Libtables2: framework for building web-applications on relational databases *
 * Copyright (C) 2017  Bart Noordervliet, MMVI                                 *
 *                                                                             *
 * This program is free software: you can redistribute it and/or modify        *
 * it under the terms of the GNU Affero General Public License as              *
 * published by the Free Software Foundation, either version 3 of the          *
 * License, or (at your option) any later version.                             *
 *                                                                             *
 * This program is distributed in the hope that it will be useful,             *
 * but WITHOUT ANY WARRANTY; without even the implied warranty of              *
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the               *
 * GNU Affero General Public License for more details.                         *
 *                                                                             *
 * You should have received a copy of the GNU Affero General Public License    *
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.       *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

/* * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * *
 * Notes on variable names:                                        *
 *                                                                 *
 *   r     = table row iterator                                    *
 *   c     = table column iterator                                 *
 *   i, j  = generic iterators                                     *
 *   attr  = jQuery object built from HTML5 "data-" attributes     *
 *   table, thead, tbody, tfoot, row, cell                         *
 *         = jQuery object wrapping the corresponding DOM element  *
 *   data  = object parsed from server JSON response               *
 *   key   = unique identifier string for the table                *
 *             composed of <block>:<tag>_<params>                  *
 *             where the _<params> part is only present            *
 *             if the table has been passed parameters             *
 * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * * */

// Start changes for DokuWiki integration
var $ = jQuery;
var ajaxUrl = "lib/plugins/libtables2/data.php";
// End changes

var tables = {};

function tr(str) {
  switch (navigator.language) {
    case "nl":
      switch (str) {
        case "Totals": return "Totalen";
        case "Page": return "Pagina";
        case "of": return "van";
        case "Error": return "Fout";
        case "Insert": return "Toevoegen";
        case "Export as": return "Exporteren als";
        case "Row has errors and cannot be inserted": return "Rij heeft fouten en kan niet worden toegevoegd";
        case "Select": return "Selecteren";
        case "rows for export": return "rijen om te exporteren";
        default: return str;
      }
    default: return str;
  }
}

function userError(msg) {
  alert(tr('Error') + ': ' + msg);
}
function appError(msg, context) {
  console.log('Error: ' + msg);
  if (context) console.log('Context:', context);
}

$(document).ready(function() {
  $('.lt-div:visible').each(function() {
    var attr = $(this).data();
    loadTable($(this), attr);
  });
  window.setInterval(refreshAll, 30000);
});

function refreshAll() {
  $('.lt-table:visible').each(function() {
    var table = $(this);
    var key = $(this).attr('id');
    if (!table.length || !tables[key]) return;
    if (tables[key].data.rowcount) return; // rowcount is set for exports with nopreview=true
    refreshTable(table, key);
  });
}

function loadOrRefreshCollection(coll, sub) {
  coll.each(function() {
    var attr = $(this).data();
    var key = attr.source + (attr.params?'_' + attr.params:'');
    if (!tables[key] || !document.getElementById(key)) loadTable($(this), attr, sub); // Using getElementById() because jQuery gets confused by the colon in the id
    else refreshTable($(this).find('table'), key);
  });
}

function doFunction(button) {
  button = $(button);
  var key = button.closest('table').attr('id');

  if (button.hasClass('lt-tablefunc')) {
    $.ajax({
      method: 'post',
      url: ajaxUrl,
      dataType: 'json',
      context: button.closest('table'),
      data: { mode: 'function', type: 'table', src: tables[key].data.block + ':' + tables[key].data.tag, params: tables[key].data.params },
      success: function(data) {
        if (data.error) appError(data.error, this);
        else {
          refreshTable(this, key);
          if (tables[key].data.options.tablefunction.trigger) loadOrRefreshCollection($('#' + tables[key].data.options.tablefunction.trigger));
          if (tables[key].data.options.tablefunction.replacetext) this.find('.lt-tablefunc').val(tables[key].data.options.tablefunction.replacetext);
        }
      }
    });
  }
}

function showTableInDialog(table) {
  if (!table.dialog) {
    appError('jQuery UI Dialog widget not loaded', table);
    return;
  }
  table.find('thead > tr:first').hide();
  table.dialog({
    title: table.find('.lt-title').text(),
    width: table.outerWidth()+30,
    close: function(evt, ui) {
      $(this).dialog("destroy");
      $(this).find('thead > tr:first').show();
    }
  });
}

function changeParams(div, params) {
  var attr = div.data();
  var key = attr.source + (attr.params?'_' + attr.params:'');
  if (typeof params === 'string') {
    if (params === attr.params) {
      refreshTable(div.find('table').first(), key);
      return;
    }
    attr.params = params;
  }
  else {
    var str = btoa(JSON.stringify(params));
    if (str === attr.params) {
      refreshTable(div.find('table').first(), key);
      return;
    }
    attr.params = str;
  }
  if (tables[key]) delete tables[key];
  div.html("Loading...");
  loadTable(div, attr);
}

function loadTable(div, attr, sub) {
  if (attr.params === "-") return;
  var key = attr.source + (attr.params?'_' + attr.params:'');
  var table = $('<table id="' + key + '" class="lt-table"/>');

  if (tables[key]) {
    if (tables[key].doingajax) {
      console.log('Skipping load for', key, '(already in progress)');
      return;
    }
    tables[key].table = table;
    console.log('Rendering table ' + key + ' from existing data');
    renderTable(table, tables[key].data);
    div.empty().append(table);
    refreshTable(table, key);
  }
  else if (attr.embedded) {
    tables[key] = {};
    tables[key].table = table;
    var json = atob(attr.embedded.replace(/\n/g, ''));
    var data = JSON.parse(json);
    tables[key].data = data;
    renderTable(table, data);
    div.empty().append(table);
    div.removeAttr('embedded');
  }
  else {
    tables[key] = {};
    tables[key].table = table;
    tables[key].start = Date.now();
    tables[key].doingajax = true;
    $.ajax({
      dataType: "json",
      url: ajaxUrl,
      data: "mode=gettable&src=" + attr.source + (attr.params ? "&params=" + attr.params : ""),
      context: div,
      success: function(data) {
        if (data.error) {
          this.empty().append('<p>Error from server while loading table. Technical information is available in the console log.</p>');
          appError(data.error, this);
        }
        else {
          data.downloadtime = Date.now() - tables[key].start - data.querytime;
          tables[key].data = data;
          renderTable(table, data, sub);
          this.empty().append(table);
          if (data.options.callbacks && data.options.callbacks.load) window.setTimeout(data.options.callbacks.load.replace('#src', this.data('source')), 0);
        }
        tables[key].doingajax = false;
      },
      error: function(xhr, status) { this.empty().append('Error while loading table ' + this.data('source') + ' (' + status + ' from server)'); }
    });
  }
}

function refreshTable(table, key) {
  if (tables[key].doingajax) {
    console.log('Skipping refresh on ' + key + ' (already in progress)');
    return;
  }
  tables[key].start = Date.now();
  tables[key].doingajax = true;
  $.ajax({
    dataType: "json",
    url: ajaxUrl,
    data: "mode=refreshtable&src=" + tables[key].data.block + ':' + tables[key].data.tag +
          "&crc=" + tables[key].data.crc + (tables[key].data.params ? "&params=" + tables[key].data.params : ""),
    context: table,
    success: function(data) {
      if (data.error) appError(data.error, this);
      else if (data.nochange);
      else {
        tables[key].data.downloadtime = Date.now() - tables[key].start - data.querytime;
        if (tables[key].data.headers.length != data.headers.length) {
          if ($('#editbox').length) return; // Don't reload the table if user is editing
          console.log('Column count changed; reloading table');
          tables[key].data.headers = data.headers;
          tables[key].data.rows = data.rows;
          tables[key].data.crc = data.crc;
          tables[key].doingajax = false;
          loadTable(this.parent(), this.parent().data());
          return;
        }
        updateHeaders(this.find('thead'), data.headers);
        updateTable(this.find('tbody'), tables[key].data, data.rows);
        tables[key].data.rows = data.rows;
        tables[key].data.crc = data.crc;
        var options = tables[key].data.options;
        if (options.sum) updateSums(this.find('tfoot'), tables[key].data);
        if (options.callbacks && options.callbacks.change) window.setTimeout(options.callbacks.change.replace('#src', this.parent().data('source')), 0);
        if (options.tablefunction && typeof options.tablefunction.hidecondition != 'undefined') {
          if (options.tablefunction.hidecondition) this.find('.lt-tablefunc').hide();
          else this.find('.lt-tablefunc').show();
        }
      }
      tables[key].doingajax = false;
    }
  });
}

function updateHeaders(thead, headers) {
  thead.find('.lt-head').each(function(i) {
    var th = $(this);
    if (th.html() != headers[i+1]) {
      th.html(headers[i+1]).css('background-color', 'green');
      setTimeout(function(th) { th.css('background-color', 'rgba(0,255,0,0.25)'); }, 2000, th);
    }
  });
}

function sortOnColumn(a, b, index) {
  if (a[index] === null) return -1;
  if (a[index] === b[index]) return 0;
  else if (a[index] < b[index]) return -1;
  else return 1;
}

function colVisualToReal(data, idx) {
  if (!data.options.mouseover && !data.options.hidecolumn && !data.options.selectone && !data.options.selectany) return idx;
  if (data.options.selectone) idx--;
  if (data.options.selectany) idx--;
  for (c = 1; c <= data.headers.length; c++) {
    if (data.options.mouseover && data.options.mouseover[c]) idx++;
    else if (data.options.hidecolumn && data.options.hidecolumn[c]) idx++;
    if (c == idx) return c;
  }
}

function sortBy(tableId, el) {
  el = $(el);
  var table = tables[tableId].table;
  var data = tables[tableId].data;
  if (data.options.sortby == el.html()) {
    if (data.options.sortdir == 'ascending') data.options.sortdir = 'descending';
    else data.options.sortdir = 'ascending';
  }
  else {
    data.options.sortby = el.html();
    data.options.sortdir = 'ascending';
  }
  console.log('Sort table ' + tableId + ' on column ' + el.html() + ' ' + data.options.sortdir);

  var c = colVisualToReal(data, el.index()+1);
  if (data.options.sortdir == 'ascending') {
    data.rows.sort(function(a, b) { return sortOnColumn(a, b, c); });
    el.siblings().removeClass('lt-sorted-asc lt-sorted-desc');
    el.removeClass('lt-sorted lt-sorted-desc').addClass('lt-sorted-asc');
  }
  else {
    data.rows.sort(function(a, b) { return sortOnColumn(b, a, c); });
    el.siblings().removeClass('lt-sorted-asc lt-sorted-desc');
    el.removeClass('lt-sorted lt-sorted-asc').addClass('lt-sorted-desc');
  }

  var tbody = table.find('tbody');
  var rowcount = renderTbody(tbody, data);
}

function goPage(tableId, which) {
  var table = tables[tableId].table;
  var data = tables[tableId].data;
  var old = data.options.page;
  if (isNaN(which)) {
    if (which == 'prev') data.options.page -= 1;
    else if (which == 'next') data.options.page += 1;
  }
  else data.options.page = which;
  if ((data.options.page <= 0) || ((data.options.page-1) * data.options.limit > data.rows.length)) {
    data.options.page = old;
    return;
  }
  var tbody = table.find('tbody');
  var rowcount = renderTbody(tbody, data);
  if (data.options.limit) table.find('.lt-pages').html(tr('Page') + ' ' + data.options.page + ' ' + tr('of') + ' ' + Math.ceil(rowcount/data.options.limit));
}

function replaceHashes(str, row) {
  if (str.indexOf('#') >= 0) {
    str = str.replace(/#id/g, row[0]);
    for (var c = row.length-1; c >= 0; c--) {
      if (str.indexOf('#'+c) >= 0) str = str.replace(new RegExp('#'+c, 'g'), row[c] === null ? '' : row[c]);
    }
  }
  return str;
}

function renderTable(table, data, sub) {
  var start = Date.now();
  if (data.options.format) renderTableFormat(table, data, sub);
  else renderTableGrid(table, data, sub);
  console.log('Load timings for ' + (sub?'sub':'') + 'table ' + data.tag + ': sql ' + data.querytime +
              ' download ' + (data.downloadtime?data.downloadtime:'n/a') + ' render ' + (Date.now()-start) + ' ms');
}

function renderTableFormat(table, data, sub) {
  if (data.options.classes && data.options.classes.table) table.addClass(data.options.classes.table);
  var headstr = '<thead><tr><th class="lt-title" colspan="' + data.headers.length + '">' + data.title;
  if (data.options.popout && (data.options.popout.type == 'floating-div')) {
    headstr += '<span class="lt-popout ' + (data.options.popout.icon_class?data.options.popout.icon_class:"");
    headstr += '" onclick="showTableInDialog($(this).closest(\'table\'));">';
  }
  headstr += '</th></tr></thead>';

  if (!data.options.page) data.options.page = 1;
  var offset = data.options.page - 1;

  if (data.rows.length > 1) {
    headstr += '<tr class="lt-limit"><th colspan="' + data.headers.length + '">';
    headstr += '<a href="javascript:goPage(\'' + table.attr('id') + '\', \'prev\')">&lt;</a> ';
    headstr += tr('Page') + ' ' + data.options.page + ' ' + tr('of') + ' ' + data.rows.length;
    headstr += ' <a href="javascript:goPage(\'' + table.attr('id') + '\', \'next\')">&gt;</a></th></tr>';
  }

  var thead = $(headstr);

  if (data.options.pagetitle) document.title = replaceHashes(data.options.pagetitle, data.rows[offset]);

  var tbody = $('<tbody/>');
  if (typeof(data.options.format) == 'string') var fmt = data.options.format.split('\n');
  else var fmt = data.options.format;
  var headcount = 0;
  var colcount = 0;
  var colspan;
  var rowspan = 0;

  if (data.rows[offset]) {
    for (var r = 0; fmt[r]; r++) {
      var row = $('<tr class="lt-row" data-rowid="' + data.rows[offset][0] + '"/>');
      for (var c = 0; fmt[r][c]; c++) {
        if (fmt[r][c] == 'H') {
          if (headcount++ >= data.headers.length) {
            appError('Too many headers specified in format string for ' + data.block + ':' + data.tag, data.options.format);
            break;
          }
          for (rowspan = 1; fmt[r+rowspan] && fmt[r+rowspan][c] == '|'; rowspan++);
          for (colspan = 1; fmt[r][c+colspan] == '-'; colspan++);
          var tdstr = '<td class="lt-head"' + (colspan > 1?' colspan="' + colspan + '"':'') + (rowspan > 1?' rowspan="' + rowspan + '"':'') + '>';
          tdstr += data.headers[headcount] + '</td>';
          row.append(tdstr);
        }
        else if (fmt[r][c] == 'C') {
          if (colcount++ >= data.rows[offset].length) {
            appError('Too many columns specified in format string for ' + data.block + ':' + data.tag, data.options.format);
            break;
          }
          for (rowspan = 1; fmt[r+rowspan] && fmt[r+rowspan][c] == '|'; rowspan++);
          for (colspan = 1; fmt[r][c+colspan] == '-'; colspan++);
          var cell = $(renderCell(data.options, data.rows[offset], colcount));
          if (colspan > 1) cell.attr('colspan', colspan);
          if (rowspan > 1) cell.attr('rowspan', rowspan);
          row.append(cell);
        }
        else if ((fmt[r][c] == 'A') && data.options.appendcell) {
          for (rowspan = 1; fmt[r+rowspan] && fmt[r+rowspan][c] == '|'; rowspan++);
          for (colspan = 1; fmt[r][c+colspan] == '-'; colspan++);
          var tdstr = '<td class="lt-cell"' + (colspan > 1?' colspan="' + colspan + '"':'') + (rowspan > 1?' rowspan="' + rowspan + '"':'') + '>';
          tdstr += replaceHashes(data.options.appendcell, data.rows[offset]) + '</td>';
          row.append(tdstr);
        }
        else if (fmt[r][c] == 'x') row.append('<td class="lt-unused"/>');
      }
      tbody.append(row);
    }
  }

  table.append(thead, tbody);
  table.parent().data('crc', data.crc);

  if (data.options.subtables) loadOrRefreshCollection(tbody.find('.lt-div'), true);
}

function renderTableGrid(table, data, sub) {
  var pagetitle;
  if (data.options.classes && data.options.classes.table) table.addClass(data.options.classes.table);
  var headstr = '<thead>';
  if (!sub) {
    headstr += '<tr><th class="lt-title" colspan="' + data.headers.length + '">' + data.title;
    if (data.options.popout && (data.options.popout.type == 'floating-div')) {
      headstr += '<span class="lt-popout ' + (data.options.popout.icon_class?data.options.popout.icon_class:"");
      headstr += '" onclick="showTableInDialog($(this).closest(\'table\'));">';
    }
    if (data.options.tablefunction && data.options.tablefunction.text) {
      if (data.params) {
        var params = JSON.parse(atob(data.params));
        params.unshift('');
      }
      else var params = [];
      if (data.options.tablefunction.hidecondition) var disp = ' style="display: none;"';
      else var disp = '';
      if (data.options.tablefunction.confirm) {
        headstr += '<input type="button" class="lt-tablefunc"' + disp + ' onclick="if (confirm(\'' + replaceHashes(data.options.tablefunction.confirm, params);
        headstr += '\')) doFunction(this);" value="' + replaceHashes(data.options.tablefunction.text, params) + '">';
      }
      else {
        headstr += '<input type="button" class="lt-tablefunc"' + disp + ' onclick="doFunction(this);" value="';
        headstr += replaceHashes(data.options.tablefunction.text, params) + '">';
      }
    }
    headstr += '</th></tr>';
  }
  headstr += '</thead>';
  var thead = $(headstr);

  if (data.options.limit) {
    if (!data.options.page) data.options.page = 1;
    var trstr = '<tr class="lt-limit"><th colspan="' + data.headers.length + '"><a href="javascript:goPage(\'' + table.attr('id');
    trstr += '\', \'prev\')">&lt;</a> <span class="lt-pages"></span> <a href="javascript:goPage(\'' + table.attr('id') + '\', \'next\')">&gt;</a></th></tr>';
    thead.append(trstr);
  }
  if (data.rows.length || data.rowcount) { // rowcount is set for exports with nopreview=true
    var row = $('<tr class="lt-row"/>');
    if (data.options.selectone) {
      if (typeof selectones == 'undefined') selectones = 1;
      else selectones++;
      if (data.options.selectone.name) row.append('<td class="lt-head">' + data.options.selectone.name + '</td>');
      else row.append('<td class="lt-head">' + tr('Select') + '</td>');
    }
    if (data.options.selectany) {
      if (data.options.selectany.name) row.append('<td class="lt-head">' + data.options.selectany.name + '</td>');
      else row.append('<td class="lt-head">' + tr('Select') + '</td>');
    }
    for (var c = 0; c < data.headers.length; c++) { // Loop over the columns for the headers
      if (data.options.sortby) {
        if (data.options.sortby == data.headers[c]) {
          if (data.options.sortdir == 'ascending') data.rows.sort(function(a, b) { return sortOnColumn(a, b, c); });
          else data.rows.sort(function(a, b) { return sortOnColumn(b, a, c); });
        }
      }
      if (c) {
        if (data.options.mouseover && data.options.mouseover[c]) continue;
        if (data.options.hidecolumn && data.options.hidecolumn[c]) continue;
        var onclick = "";
        var classes = [ "lt-head" ];
        if (data.options.sortable) {
          if (typeof(data.options.sortable) == 'boolean') {
            onclick = "sortBy('" + table.attr('id') + "', this);";
            if (data.options.sortby == data.headers[c]) {
              if (data.options.sortdir == 'ascending') classes.push('lt-sorted-asc');
              else classes.push('lt-sorted-desc');
            }
            else classes.push('lt-sort');
          }
        }
        row.append('<td class="' + classes.join(' ') + '" onclick="' + onclick + '">' + data.headers[c] + '</td>');
      }
    }
    thead.append(row);
  }
  else if (data.options.textifempty) {
    var tbody = '<td>' + data.options.textifempty + '</td>';
    table.append(thead, tbody);
    table.parent().data('crc', data.crc);
    return;
  }
  else if (data.options.hideifempty) {
    table.hide();
    return;
  }

  if (data.rowcount) { // rowcount is set for exports with nopreview=true
    var tbody = '<td colspan="' + data.headers.length + '" class="lt-cell"> ... ' + data.rowcount + ' ' + tr('rows for export') + ' ... </td>';
    table.append(thead, tbody);
  }

  if (data.options.filter && (typeof data.options.filter != 'function')) {
    var row = $('<tr class="lt-row"/>');
    if (data.options.selectone) row.append('<td/>');
    if (data.options.selectany) row.append('<td/>');
    for (var c = 1; c < data.headers.length; c++) {
      if (data.options.mouseover && data.options.mouseover[c]) continue;
      if (data.options.hidecolumn && data.options.hidecolumn[c]) continue;
      if ((data.options.filter === true) || data.options.filter[c]) {
        row.append('<td class="lt-filter"><input type="text" size="5" oninput="updateFilter(this);"></td>');
      }
      else row.append('<td/>');
    }
    var filtertext = "Use these fields to filter the table\n" +
                     "Multiple filtered columns combine with AND logic\n" +
                     "Numeric matching is supported by starting with =, <, >, <= or >=\n" +
                     "Regular expressions can also be used, for example:\n" +
                     "  '^text' to match at the start\n" +
                     "  'text$' to match at the end\n" +
                     "  '(one|two)' to match one or two";
    row.find('td').first()
      .css('position', 'relative')
      .prepend('<span class="lt-label-filter"><img src="filter.svg" style="width: 15px; height: 15px;" title="' + filtertext + '"></span>');
    row.find('td').last()
      .css('position', 'relative')
      .append('<span class="lt-label-clear"><a href="javascript:clearFilters(\'' + table.attr('id') + '\');"><img src="clear.svg"></a></span>');
    thead.append(row);
  }

  var tbody = $('<tbody/>');
  var rowcount = renderTbody(tbody, data);
  if (data.options.limit) thead.find('.lt-pages').html(tr('Page') + ' ' + data.options.page + ' ' + tr('of') + ' ' + Math.ceil(rowcount/data.options.limit));
  if (data.options.selectone && data.options.selectone.default) {
    if (data.options.selectone.default == 'first') tbody.find('input[name^=select]:first').prop('checked', true);
    else if (data.options.selectone.default == 'last') tbody.find('input[name^=select]:last').prop('checked', true);
  }

  var tfoot = $('<tfoot/>');
  if (data.options.sum) calcSums(tfoot, data);

  if (data.options.insert && (typeof(data.options.insert) == 'object')) {
    if (data.options.insert.include == 'edit') var fields = jQuery.extend({}, data.options.edit, data.options.insert);
    else var fields = data.options.insert;

    row = $('<tr class="lt-row"/>');
    for (var c = 1; ; c++) {
      if (data.options.mouseover && data.options.mouseover[c]) continue;
      if (data.options.hidecolumn && data.options.hidecolumn[c]) continue;
      if (!fields[c]) {
        if (c == data.headers.length) break;
        str = '<td class="lt-head">' + data.headers[c] + '</td>';
      }
      else {
        if ((typeof(fields[c]) == 'object') && fields[c].label) str = '<td class="lt-head">' + fields[c].label + '</td>';
        else str = '<td class="lt-head">' + data.headers[c] + '</td>';
      }
      row.append(str);
    }
    tfoot.append(row);

    row = $('<tr class="lt-row"/>');
    for (var c = 1; ; c++) {
      if (!fields[c]) {
        if (c >= data.headers.length-1) break;
        else {
          row.append('<td/>');
          continue;
        }
      }
      var cell = $('<td class="lt-cell"></td>');
      if (typeof(fields[c]) == 'string') var input = $('<input type="text" name="' + fields[c] + '">');
      else if (Object.keys(fields[c]).length == 1) var input = $('<input type="text" name="' + fields[c][0] + '">');
      else if (fields[c].type == 'multiline') {
        var input = $('<textarea class="lt_insert" name="' + fields[c].target + '" oninput="$(this).textareaAutoSize();"/>');
      }
      else if (fields[c].type == 'checkbox') var input = $('<input type="checkbox" name="' + fields[c].target + '">');
      else if (fields[c].type == 'date') var input = $('<input type="date" name="' + fields[c].target + '" value="' + new Date().toISOString().slice(0, 10) + '">');
      else if (fields[c].type == 'password') var input = $('<input type="password" name="' + fields[c].target + '">');
      else if (fields[c].target && !fields[c].query) var input = $('<input type="text" name="' + fields[c].target + '">');
      else {
        if (fields[c].target) var input = $('<select name="' + fields[c].target + '"/>');
        else var input = $('<select name="' + fields[c][0] + '"/>');
        $.ajax({
          method: 'get',
          url: ajaxUrl,
          dataType: 'json',
          context: input,
          data: { mode: 'selectbox', src: data.block + ':' + data.tag, col: c },
          success: function(data) {
            if (data.error) {
              this.parent().css({ backgroundColor: '#ffa0a0' });
              appError(data.error, cell);
            }
            else {
              var items = data.items;
              if (data.null) this.append('<option value=""></option>');
              for (var i = 0; items[i]; i++) this.append('<option value="' + items[i][0] + '">' + items[i][1] + '</option>');
              this.prop('selectedIndex', -1); // This selects nothing, rather than the first option
            }
          }
        });
      }
      if ((typeof fields[c] == 'object') && fields[c].required) {
        input.addClass('lt-input-required');
        input.on('input', fields[c].required, function(evt) {
          if (evt.data === true) {
            var input = $(this);
            if ((input.val() === '') || (input.val() === null)) input.addClass('lt-input-error');
            else input.removeClass('lt-input-error');
          }
          else if (evt.data.regex) {
            var input = $(this);
            if (input.val().search(new RegExp(evt.data.regex)) >= 0) {
              input.removeClass('lt-input-error');
              input.attr('title', '');
            }
            else {
              input.addClass('lt-input-error');
              if (evt.data.message) input.attr('title', evt.data.message);
            }
          }
        });
      }
      cell.append(input);
      row.append(cell);
    }
    row.append('<td class="lt-cell"><input type="button" value="' + tr('Insert') + '" onclick="doInsert(this)"></td>');
    tfoot.append(row);
  }

  if (data.options.export) {
    if (data.options.export.xlsx) tfoot.append('<tr><td colspan="' + data.headers.length + '">' + tr('Export as') + ': <a href="' + ajaxUrl + '?mode=excelexport&src=' +
                                               data.block + ':' + data.tag + '">Excel</a></td></tr>');
  }

  table.append(thead, tbody, tfoot);
  table.parent().data('crc', data.crc);
}

function renderTbody(tbody, data) {
  if (data.options.page) var offset = data.options.limit * (data.options.page - 1);
  else var offset = 0;
  var rowcount = 0;
  rows = [];
  mainloop:
  for (var r = 0; r < data.rows.length; r++) { // Main loop over the data rows
    if (data.filters) {
      for (i in data.filters) {
        if (data.filters[i] instanceof RegExp) {
          if ((typeof data.rows[r][i] == 'string') && (data.rows[r][i].search(data.filters[i]) >= 0)) continue;
          if (typeof data.rows[r][i] == 'boolean') {
            if (String(data.rows[r][i]).search(data.filters[i]) >= 0) continue;
            if (data.rows[r][i] && data.options.edit && data.options.edit[i] && data.options.edit[i].truevalue &&
                 (data.options.edit[i].truevalue.search(data.filters[i]) >= 0)) continue;
            if (!data.rows[r][i] && data.options.edit && data.options.edit[i] && data.options.edit[i].falsevalue &&
                 (data.options.edit[i].falsevalue.search(data.filters[i]) >= 0)) continue;
          }
        }
        else if (data.filters[i].startsWith('>=')) {
          if (data.rows[r][i] >= parseFloat(data.filters[i].substring(2))) continue;
        }
        else if (data.filters[i].startsWith('>')) {
          if (data.rows[r][i] > parseFloat(data.filters[i].substring(1))) continue;
        }
        else if (data.filters[i].startsWith('<=')) {
          if (data.rows[r][i] <= parseFloat(data.filters[i].substring(2))) continue;
        }
        else if (data.filters[i].startsWith('<')) {
          if (data.rows[r][i] < parseFloat(data.filters[i].substring(1))) continue;
        }
        else if (data.filters[i].startsWith('=')) {
          if (data.rows[r][i] == parseFloat(data.filters[i].substring(1))) continue;
        }
        continue mainloop;
      }
    }
    rowcount++;
    if (rowcount <= offset) continue;
    if (data.options.limit && (offset+data.options.limit < rowcount)) continue;
    if ((rowcount == offset) && data.options.pagetitle) document.title = replaceHashes(data.options.pagetitle, data.rows[r]);
    row = [ '<tr class="lt-row" data-rowid="'+data.rows[r][0]+'"/>' ];
    if (data.options.selectone) {
      if (data.options.selectone.trigger) var trigger = ' data-trigger="' + data.options.selectone.trigger + '"';
      else var trigger = '';
      row.push('<td><input type="radio" name="select' + selectones + '" ' + trigger + '></td>');
    }
    if (data.options.selectany) {
      if (data.options.selectany.links && (data.options.selectany.links.indexOf(data.rows[r][0]) >= 0)) var checked = ' checked';
      else var checked = '';
      row.push('<td class="lt-cell"><input type="checkbox" onchange="doSelect(this)"' + checked + '></td>');
    }
    for (var c = 1; c < data.rows[r].length; c++) { // Loop over each column
      if (data.options.mouseover && data.options.mouseover[c]) continue;
      if (data.options.hidecolumn && data.options.hidecolumn[c]) continue;
      row.push(renderCell(data.options, data.rows[r], c));
    }
    if (data.options.appendcell) row.push('<td class="lt-cell">' + replaceHashes(data.options.appendcell, data.rows[r]) + '</td>');
    if (data.options.delete) {
      if (data.options.delete.text) var value = data.options.delete.text;
      else var value = '✖';
      if (data.options.delete.notids && (data.options.delete.notids.indexOf(data.rows[r][0]) >= 0));
      else row.push('<td class="lt-cell"><input type="button" class="lt-delete" value="' + value + '" onclick="doDelete(this);"></td>');
    }
    rows.push(row.join(''));
  }
  tbody[0].innerHTML = rows.join('');
  return rowcount;
}

function doSelect(el) {
  input = $(el);
  input.parent().css('background-color', 'red');
  key = input.closest('table').attr('id');
  id = input.closest('tr').data('rowid');
  $.ajax({
    method: 'post',
    url: ajaxUrl,
    dataType: 'json',
    context: input,
    data: { mode: 'select', src: tables[key].data.block + ':' + tables[key].data.tag, params: tables[key].data.params, id: id, link: input.prop('checked') },
    success: function(data) {
      console.log(this);
      if (data.error) appError(data.error, this);
      else this.parent().css('background-color', '');
    }
  });
}

function renderCell(options, row, c) {
  var classes = [ "lt-cell", "lt-data" ];
  if (options.class && options.class[c]) classes.push(options.class[c]);
  if (options.edit && options.edit[c]) {
    if (typeof(options.edit[c]) == 'string') var onclick = ' onclick="doEdit(this)"';
    else if (typeof(options.edit[c]) == 'object') {
      if (options.edit[c].query || (!options.edit[c].target && (options.edit[c].length == 2))) var onclick = ' onclick="doEditSelect(this)"';
      else var onclick = ' onclick="doEdit(this)"';
    }
    classes.push('lt-edit');
  }
  else var onclick = "";
  if (options.mouseover && options.mouseover[c+1] && row[c+1]) {
    var mouseover = ' title="' + row[c+1] + '"';
  }
  else var mouseover = '';
  if (options.style && options.style[c]) var style = ' style="' + replaceHashes(options.style[c], row) + '"';
  else var style = '';

  if (options.subtables && (options.subtables[c])) {
    if (typeof(row[c]) == 'string') {
      if (row[c].startswith('[')) var params = btoa(row[c]);
      else var params = btoa('[ "' + row[c] + '" ]');
    }
    else if (typeof(row[c]) == 'number') var params = btoa('[ ' + row[c] + ' ]');
    else var params = '';
    var content = '<div class="lt-div" data-source="' + options.subtables[c] + '" data-params="' + params + '">Loading subtable ' + options.subtables[c] + '</div>';
  }
  else var content = row[c] === null ? '' : row[c];
  return '<td class="' + classes.join(' ') + '"' + style + onclick + mouseover + '>' + content + '</td>';
}

function calcSums(tfoot, data, update) {
  var avgs = [];
//  if ((typeof(data.options.sum) === 'string') && (data.options.sum.indexOf('#') == 0)) {
//    var col = parseInt(data.options.sum.substring(1));
//    if (!isNaN(col)) sums.push(col);
//  }

  var labeldone = 0;
  var row = $('<tr class="lt-sums">');
  for (var c = 1; c < data.headers.length; c++) {
    var classes = [ "lt-cell", "lt-sum" ];
    if (data.options.class && data.options.class[c]) classes.push(data.options.class[c]);
    if (data.options.sum[c]) {
      var sum = 0;
      for (var r = 0; r < data.rows.length; r++) {
        if (data.rows[r][c]) sum += parseFloat(data.rows[r][c]);
      }
      row.append('<td class="' + classes.join(' ') + '">' + (Math.round(sum*1000000)/1000000) + '</td>');
    }
    else if (!labeldone) {
      row.append('<td class="' + classes.join(' ') + '">' + tr('Totals') + '</td>');
      labeldone = 1;
    }
    else row.append('<td/>');
  }
  tfoot.append(row);
}
function updateSums(tfoot, data) {
  var row = tfoot.find('tr.lt-sums');
  for (var c = 1; c < data.headers.length; c++) {
    if (data.options.sum[c]) {
      var sum = 0;
      for (var r = 0; r < data.rows.length; r++) {
        if (data.rows[r][c]) sum += parseFloat(data.rows[r][c]);
      }
      sum = String(Math.round(sum*1000000)/1000000);
      var oldsum = row.children().eq(c-1).html();
      if (sum != oldsum) {
        var cell = row.children().eq(c-1);
        cell.html(sum);
        cell.css('background-color', 'green');
        setTimeout(function(cell) { cell.css('background-color', 'rgba(0,255,0,0.25)'); }, 2000, cell);
      }
    }
  }
}

function updateTable(tbody, data, newrows) {
  var start = Date.now();
  var oldrows = data.rows;
  var newrows = newrows.slice(); // Copy the array so that we can filter out the existing rows

  for (var i = 0, found; i < oldrows.length; i++) {
    found = 0;
    for (var j = 0; j < newrows.length; j++) {
      if (oldrows[i][0] == newrows[j][0]) { // Row remains
        if (!data.options.format || (i+1 == data.options.page)) updateRow(data.options, tbody, oldrows[i], newrows[j]);
        newrows.remove(j);
        found = 1;
        break;
      }
    }
    if (!found) { // Row deleted
      var row = tbody.children('[data-rowid="' + oldrows[i][0] + '"]');
      if (row.length) {
        if (data.options.format) {
          row.css('background-color', 'red');
        }
        else {
          row.css('background-color', 'red');
          row.animate({ opacity: 0 }, 2000, 'swing', function() {
            $(this).css('height', $(this).height());
            $(this).empty();
            $(this).animate({ height: 0 }, 1000, 'linear', function() { $(this).remove(); });
          });
        }
      }
    }
  }
  if (data.options.format) {
    // Update page-number here
  }
  else {
    for (var i = 0; i < newrows.length; i++) { // Row added
      var row = $('<tr class="lt-row" data-rowid="'+newrows[i][0]+'"/>');
      for (c = 1; c < newrows[i].length; c++) {
        if (data.options.mouseover && data.options.mouseover[c]) continue;
        if (data.options.hidecolumn && data.options.hidecolumn[c]) continue;
        row.append($(renderCell(data.options, newrows[i], c)));
      }
      if (data.options.appendcell) row.append('<td class="lt-cell">' + replaceHashes(data.options.appendcell, newrows[i]) + '</td>');
      if (data.options.delete && data.options.delete.text) var value = data.options.delete.text;
      else var value = '✖';
      if (data.options.delete) row.append('<td class="lt-cell"><input type="button" class="lt-delete" value="' + value + '" onclick="doDelete(this);"></td>');
      row.css({ backgroundColor: 'green' });
      tbody.append(row);
      setTimeout(function(row) { row.css({ backgroundColor: 'transparent' }); }, 1000, row);
    }
  }
  console.log('Refresh timings for table ' + data.tag + ': sql ' + data.querytime + ' download ' + data.downloadtime + ' render ' + (Date.now()-start) + ' ms');
}
function updateRow(options, tbody, oldrow, newrow) {
  var offset = 1;
  for (var c = 1; c < oldrow.length; c++) {
    var cell = null;
    if (options.mouseover && options.mouseover[c]) {
      offset++;
      if (oldrow[c] != newrow[c]) {
        if (options.format) var cell = tbody.find('.lt-data').eq(c-1);
        else var cell = tbody.children('[data-rowid="' + oldrow[0] + '"]').children().eq(c-offset);
        if (cell) {
          cell.attr('title', newrow[c]?newrow[c]:(newrow[c]===false?'false':''));
          cell.css('background-color', 'green');
          setTimeout(function(cell) { cell.css('background-color', 'rgba(0,255,0,0.25)'); }, 2000, cell);
        }
      }
    }
    else if (options.hidecolumn && options.hidecolumn[c]) offset++;
    else if (oldrow[c] != newrow[c]) {
      if (options.format) cell = tbody.find('.lt-data').eq(c-1);
      else cell = tbody.children('[data-rowid="' + oldrow[0] + '"]').children().eq(c-offset);
      if (cell) {
        cell.html(newrow[c]?newrow[c]:(newrow[c]===false?'false':''));
        cell.css('background-color', 'green');
        setTimeout(function(cell) { cell.css('background-color', 'rgba(0,255,0,0.25)'); }, 2000, cell);
      }
      else appError('Updated cell not found', tbody);
    }

    if (options.style && options.style[c]) {
      if (!cell) {
        if (options.format) cell = tbody.find('.lt-data').eq(c-1);
        else cell = tbody.children('[data-rowid="' + oldrow[0] + '"]').children().eq(c-offset);
      }
      if (cell) cell.attr('style', replaceHashes(options.style[c], newrow));
    }
  }
}

function updateFilter(edit) {
  edit = $(edit);
  var table = edit.closest('table');
  var data = tables[table.attr('id')].data;
  var c = colVisualToReal(data, edit.parent().index()+1);
  if (!data.filters) data.filters = {};
  edit.css('background-color', '');
  if (edit.val() === "") delete data.filters[c];
  else if (edit.val().search(/^[<>= ]+$/) >= 0) edit.css('background-color', 'rgba(255,0,0,0.5)');
  else if (edit.val().startsWith('<') || edit.val().startsWith('>') || edit.val().startsWith('=')) data.filters[c] = edit.val();
  else {
    try { data.filters[c] = new RegExp(edit.val(), 'i'); }
    catch (e) { edit.css('background-color', 'rgba(255,0,0,0.5)'); }
  }
  runFilters(table, data);
}
function runFilters(table, data) {
  if (data.options.page > 1) data.options.page = 1;
  var tbody = table.find('tbody');
  var rowcount = renderTbody(tbody, data);
  if (data.options.limit) table.find('.lt-pages').html(tr('Page') + ' ' + data.options.page + ' ' + tr('of') + ' ' + Math.ceil(rowcount/data.options.limit));
}
function clearFilters(key) {
  var table = $(document.getElementById(key));
  var data = tables[table.attr('id')].data;
  table.find('.lt-filter').children('input').css('background-color', '').val('');
  data.filters = {};
  runFilters(table, data);
}

function doEdit(cell) {
  if ($('#editbox').length) return;
  cell = $(cell);
  cell.addClass('lt-editing');
  var content = cell.html();
  var data = tables[cell.closest('table').attr('id')].data;
  if (data.options.format) var c = cell.closest('tbody').find('.lt-data').index(cell)+1;
  else var c = cell.parent().children('.lt-data').index(cell)+1;
  if ((typeof(data.options.edit[c]) == 'object') && data.options.edit[c].type == 'multiline') {
    edit = $('<textarea id="editbox" name="input">');
    edit.html(content);
    edit.css({ width: cell.width() + 'px', height: cell.height() + 'px' });
  }
  else if ((typeof(data.options.edit[c]) == 'object') && data.options.edit[c].type == 'checkbox') {
    var truevalue;
    edit = $('<input type="checkbox" id="editbox" name="input">');
    if (data.options.edit[c].truevalue) truevalue = data.options.edit[c].truevalue;
    else truevalue = 'true';
    if (content === truevalue) edit.prop('checked', true);
  }
  else if ((typeof(data.options.edit[c]) == 'object') && data.options.edit[c].type == 'password') {
    edit = $('<input type="password" id="editbox" name="input">');
  }
  else if ((typeof(data.options.edit[c]) == 'object') && data.options.edit[c].type == 'date') {
    edit = $('<input type="date" id="editbox" name="input">');
    var res;
    if (res = content.match(/^([0-9]{2})-([0-9]{2})-([0-9]{4})$/)) edit.val(res[3] + '-' + res[2] + '-' + res[1]);
    else edit.val(content);
  }
  else {
    edit = $('<input type="text" id="editbox" name="input">');
    edit.val(content);
    edit.css({ width: cell.width() + 'px', maxHeight: cell.height() + 'px' });
  }
  cell.empty().append(edit);
  if (edit.prop('nodeName') == 'TEXTAREA') edit.textareaAutoSize();
  edit.select();
  edit.on('keydown', cell, function(evt){
    var cell = evt.data;
    var edit = $(this);
    if (edit.prop('nodeName') == 'TEXTAREA') edit.textareaAutoSize();
    if ((evt.which != 9) && (evt.which != 13) && (evt.which != 27) && (evt.which != 38) && (evt.which != 40)) return;
    if ((edit.prop('nodeName') == 'TEXTAREA') && ((evt.which == 13) || (evt.which == 38) || (evt.which == 40))) return;

    if (evt.which == 27) cell.html(content); // Escape
    else checkEdit(cell, edit, content);

    if (evt.which == 38) { // Arrow up
      cell.parent().prev().children().eq(cell.index()).trigger('click');
    }
    else if (evt.which == 40) { // Arrow down
      cell.parent().next().children().eq(cell.index()).trigger('click');
    }
    else if (evt.which == 9) { // Tab
      if (evt.shiftKey) cell.prev().trigger('click');
      else findNextEdit(cell, evt);
    }
    cell.removeClass('lt-editing');
    return false;
  });
  edit.on('blur', cell, function(evt){
    checkEdit(evt.data, $(this), content);
    evt.data.removeClass('lt-editing');
  });
  if ((typeof(data.options.edit[c]) == 'object') && data.options.edit[c].type == 'color') {
    $(cell).colpick({
      color: content,
      layout: 'hex',
      onSubmit: function(hsb, hex, rgb, el) {
        edit.val('#' + hex);
        checkEdit(cell, edit, content);
        $(cell).colpickHide();
      }
    }).colpickShow();
    return;
  }
  else edit.focus();
}

function doEditSelect(cell) {
  if ($('#editbox').length) return;
  cell = $(cell);
  cell.addClass('lt-editing');
  var key = cell.closest('table').attr('id');
  var content = cell.html();
  if (tables[key].data.options.format) var c = cell.closest('tbody').find('.lt-data').index(cell)+1;
  else var c = cell.parent().children('.lt-data').index(cell)+1;
  $.ajax({
    method: 'get',
    url: ajaxUrl,
    dataType: 'json',
    context: cell,
    data: { mode: 'selectbox', src: tables[key].data.block + ':' + tables[key].data.tag, col: c },
    success: function(data) {
      if (data.error) appError(data.error, cell);
      else {
        var oldvalue = null;
        this.css({ backgroundColor: 'transparent' });
        var items = data.items;
        var selectbox = $('<select id="editbox"></select>');
        selectbox.css({ width: this.width() + 'px', maxHeight: this.height() + 'px' });
        var selected = 0;
        if (data.null) selectbox.append('<option value=""></option>');
        for (var i = 0; items[i]; i++) {
          if (items[i][1] == content) {
             selectbox.append('<option value="' + items[i][0] + '" selected>' + items[i][1] + '</option>');
             oldvalue = String(items[i][0]);
             selected = 1;
          }
          else selectbox.append('<option value="' + items[i][0] + '">' + items[i][1] + '</option>');
        }
        this.empty().append(selectbox);
        if (!selected) selectbox.prop('selectedIndex', -1);
        selectbox.focus();
        selectbox.on('keydown', this, function(evt) {
          var cell = evt.data;
          if (evt.which == 27) cell.html(content); // Escape
          else if (evt.which == 13) checkEdit(cell, selectbox, oldvalue); // Enter
          else if (evt.keyCode == 9) { // Tab
            checkEdit(cell, selectbox, oldvalue);
            if (evt.shiftKey) cell.prev().trigger('click');
            else findNextEdit(cell, evt);
          }
          else {
            return true; // Allow default action (for instance list searching)
//            if (selectbox.data('filter')) {
//              if (evt.which == 8) selectbox.data('filter', selectbox.data('filter').substring(0, selectbox.data('filter').length-1));
//              else selectbox.data('filter', selectbox.data('filter') + String.fromCharCode(evt.keyCode));
//              console.log(selectbox.data('filter'));
//              selectbox.find('option').each(function() {
//                var option = $(this);
//                var regex = new RegExp(option.parent().data('filter'),"i")
//                if (option.text().search(regex) != -1) option.removeProp('hidden');
//                else option.prop('hidden', 'hidden');
//              });
//            }
//            else selectbox.data('filter', String.fromCharCode(evt.keyCode));
          }
          cell.removeClass('lt-editing');
          return false;
        });
        selectbox.on('blur', this, function(evt) {
          checkEdit(evt.data, $(this), oldvalue);
          evt.data.removeClass('lt-editing');
        });
      }
    }
  });
  cell.css({ backgroundColor: '#ffa0a0' });
}

function checkRequirements(options, c, value) {
  if (options.edit[c].required === true) {
    if (value === '') {
      alert('Column ' + c + ' may not be empty');
      return false;
    }
  }
  else if (typeof options.edit[c].required == 'object') {
    if (options.edit[c].required.regex) {
      if (value.search(new RegExp(options.edit[c].required.regex))) return true;
      if (options.edit[c].required.message) alert(options.edit[c].required.message);
      else alert('Invalid input for column ' + c);
      return false;
    }
    else if (value === '') {
      if (options.edit[c].required.message) alert(options.edit[c].required.message);
      else alert('Column ' + c + ' may not be empty');
      return false;
    }
  }
  return true;
}

function checkEdit(cell, edit, oldvalue) {
  var newvalue = edit.val();
  var key = cell.closest('table').attr('id');
  var options = tables[key].data.options;
  if (options.format) var c = cell.closest('tbody').find('.lt-data').index(cell)+1;
  else var c = cell.parent().children('.lt-data').index(cell)+1;
  if (options.edit[c].type == 'checkbox') {
    if (edit.prop('checked')) {
      if (options.edit[c].truevalue) newvalue = options.edit[c].truevalue;
      else newvalue = 'true';
    }
    else {
      if (options.edit[c].falsevalue) newvalue = options.edit[c].falsevalue;
      else newvalue = 'false';
    }
  }

  if (newvalue !== oldvalue) {
    if (options.edit[c].required) {
      if (!checkRequirements(options, c, newvalue)) return;
    }
    var data = { mode: 'inlineedit', src: tables[key].data.block + ':' + tables[key].data.tag, col: c, row: cell.parent().data('rowid'), val: newvalue };
    if (tables[key].data.params) data['params'] = tables[key].data.params;
    if (options.sql) data['sql'] = options.sql;
    $.ajax({
      method: 'post',
      url: ajaxUrl,
      dataType: 'json',
      context: cell,
      data: data,
      success: function(data) {
        if (data.error) userError(data.error);
        else {
          tables[key].data.crc = '-';
          if (!options.style || !options.style[c]) this.css({ backgroundColor: 'transparent' });
          var rows = tables[key].data.rows;
          for (var r = 0; r < rows.length; r++) {
            if (rows[r][0] == this.parent().data('rowid')) break;
          }
          if (r == rows.length) console.log('Row not found in table data');
          else {
            if ((data.input == 'true') || (data.input == options.edit[c].truevalue)) data.input = true;
            else if ((data.input == 'false') || (data.input == options.edit[c].falsevalue)) data.input = false;
            if ((data.input === '') && (data.rows[0][c] === null)) data.input = null;

            if ((typeof(options.edit[c]) == 'object') && (options.edit[c].query || (!options.edit[c].target && (options.edit[c].length == 2)))) {
              rows[r][c] = data.rows[0][c];
            }
            else rows[r][c] = data.input;
            updateRow(options, this.closest('tbody'), rows[r], data.rows[0]);
            rows[r] = data.rows[0];
            if (options.callbacks && options.callbacks.change) window.setTimeout(options.callbacks.change, 0);
            if (options.edit.trigger) loadOrRefreshCollection($('#' + options.edit.trigger));
          }
        }
      }
    });
    if (edit.prop('nodeName') == 'SELECT') cell.html(edit.find('option:selected').text());
    else if (options.edit[c].type == 'password') cell.empty();
    else cell.html(newvalue);
    if (!options.style || !options.style[c]) cell.css({ backgroundColor: '#ffa0a0' });
  }
  else if (edit.prop('nodeName') == 'SELECT') cell.html(edit.find('option[value="' + oldvalue + '"]').text());
  else cell.html(oldvalue);
}

function doInsert(el) {
  el = $(el);
  row = el.parent().parent();
  var error = false;
  postdata = row.find('input,select,textarea').not(el).map(function() {
    input = $(this);
    if (input.prop('type') == 'checkbox') value = input.prop('checked');
    else value = input.val();
    if (value === null) value = '';
    input.trigger('input');
    if (input.hasClass('lt-input-error')) error = true;
    return input.prop('name').replace('.', ':') + '=' + encodeURIComponent(value);
  }).get().join('&');
  if (error) {
    alert(tr('Row has errors and cannot be inserted'));
    return;
  }
  table = tables[row.closest('table').attr('id')].data;
  if (table.options.insert.hidden) {
    if (typeof(table.options.insert.hidden[0]) == 'object') { // Multiple hidden fields (array of arrays)
      for (i = 0; table.options.insert.hidden[i]; i++) processHiddenInsert(table.options.insert.hidden[i], row.closest('.lt-div').data('params'));
    }
    else processHiddenInsert(table.options.insert.hidden, row.closest('.lt-div').data('params'));
  }
  $.ajax({
    dataType: 'json',
    url: ajaxUrl,
    method: 'post',
    context: row,
    data: 'mode=insertrow&src=' + table.block + ':' + table.tag + '&' + postdata,
    success: function(data) {
      if (data.error) userError(data.error);
      else {
        this.find('input,select,textarea').each(function() {
          var el = $(this);
          if (el.prop('type') == 'button');
          else if (el.prop('type') == 'date') el.val(new Date().toISOString().slice(0, 10));
          else if (el.prop('type') == 'checkbox') el.prop('checked', false);
          else if (el.prop('nodeName') == 'select') el.prop('selectedIndex', -1);
          else el.val('');
        });
        var table = this.closest('table');
        updateTable(table.find('tbody'), tables[table.attr('id')].data, data.rows);
        tables[table.attr('id')].data.rows = data.rows;
        tables[table.attr('id')].data.crc = data.crc;
        if (tables[table.attr('id')].data.options.sum) updateSums(table.find('tfoot'), tables[table.attr('id')].data);
        if (tables[table.attr('id')].data.options.edit.trigger) loadOrRefreshCollection($('#' + tables[table.attr('id')].data.options.edit.trigger));
      }
    }
  });
}

function processHiddenInsert(hidden, paramstr) {
  if (!hidden.target || !hidden.value) appError('No target or value defined in insert hidden');
  value = String(hidden.value);
  if (value.indexOf('#') >= 0) {
    if (paramstr) {
      params = JSON.parse(atob(paramstr));
      for (var i = 0; params[i]; i++) {
        value = value.replace('#param' + (i+1), params[i]);
      }
      postdata = 'params=' + paramstr + '&' + postdata;
    }
  }
  postdata += '&' + hidden.target.replace('.', ':') + '=' + value;
}

function doDelete(el) {
  el = $(el);
  var rowid = el.closest('tr').data('rowid');
  var table = tables[el.closest('table').attr('id')].data;
  if (table.options.delete.confirm) {
    for (var r = 0; r < table.rows.length; r++) {
      if (table.rows[r][0] == rowid) break;
    }
    if (r == table.rows.length) {
      appError('Row to be deleted not found', table.rows);
      return;
    }
    if (!confirm(replaceHashes(table.options.delete.confirm, table.rows[r]))) return;
  }
  $.ajax({
    dataType: 'json',
    url: ajaxUrl,
    method: 'post',
    context: el.closest('tbody'),
    data: 'mode=deleterow&src=' + table.block + ':' + table.tag + '&id=' + rowid,
    success: function(data) {
      if (data.error) userError(data.error);
      else {
        var newrows = table.rows.slice();
        for (var r = 0; r < newrows.length; r++) {
          if (newrows[r][0] == rowid) break;
        }
        if (r == newrows.length) {
          appError('Deleted row not found', newrows);
          return;
        }
        newrows.remove(r);
        updateTable(this, table, newrows);
        if (table.options.trigger) {
          if (table.options.trigger.indexOf(':') > 0) var triggered = document.getElementById(table.options.trigger);
          else var triggered = document.getElementById(table.block + ':' + table.options.trigger);
          loadOrRefreshCollection($(triggered).parent());
        }
      }
    }
  });
}

function findNextEdit(el, evt) {
  while (el.next().length > 0) {
    if (el.next().hasClass('lt-edit')) {
      el.next().trigger('click');
//      el.next().scrollIntoViewLazy();
      return;
    }
    if (el.next().hasClass('form')) {
      el.next().children(':first').focus();
//      el.next().scrollIntoViewLazy();
      el.removeClass('lt-editing');
      return;
    }
    el = el.next();
  }
  el.removeClass('lt-editing');
}

function run_sql(form) {
  var textarea = $(form).find('textarea');
  $.ajax({
    dataType: "json",
    url: ajaxUrl,
    method: "post",
    data: "mode=sqlrun&sql=" + encodeURIComponent(textarea.val()),
    context: this,
    success: function(data) {
      var table = $('#sqlrun\\:table');
      if (data.error) {
        table.empty();
        table.append('<tr class="lt-row"><td class="lt-cell" style="font-family: monospace; border-color: red;">' + data.error + '</td></tr>');
        textarea.focus();
      }
      else {
        tables['sqlrun:table'] = {};
        tables['sqlrun:table'].data = data;
        table.empty();
        renderTable(table, data);
        textarea.focus();
      }
    },
    error: function(xhr, status) { $(this).empty().append('Error while loading table ' + $(this).data('source') + ' (' + status + ' from server)'); }
  });
}

/* * * * * * * * * * * * * * * * * * * * * *
 *                                         *
 * Functions for FullCalendar integration  *
 *                                         *
 * * * * * * * * * * * * * * * * * * * * * */

function calendarSelect(start, end, timezone, callback) {
  $.ajax({
    url: ajaxUrl,
    type: 'POST',
    dataType: 'json',
    data: {
      mode: 'calendarselect',
      src: this.options.src,
      start: start.format(),
      end: end.format()
    },
    success: function(data) {
      if (data.error) {
        alert(data.error);
        if (data.redirect) window.location = data.redirect;
      }
      else callback(data);
    },
    error: function(jqXHR, testStatus, errorThrown) {
      alert(errorThrown);
    }
  });
}
function calendarUpdate(event, delta, revertFunc) {
  $.ajax({
    url: ajaxUrl,
    type: 'POST',
    dataType: 'json',
    data: {
      mode: 'calendarupdate',
      src: event.src,
      id: event.id,
      start: event.start.format(),
      end: event.end.format()
    },
    error: function(jqXHR, textStatus, errorThrown) {
      alert(errorThrown);
      revertFunc();
    }
  });
}
function calendarInsert(start, end) {
  if (this.calendar.options.allDayOnly && start.hasTime()) return;
  if (this.calendar.options.insertTitle) {
    var title = this.calendar.options.insertTitle();
    if (!title) return;
  }
  else var title = '';
  for (var i = 1; this.calendar.options.params[i]; i++) {
    var checked = $('input[name=select'+i+']:checked');
    if (this.calendar.options.params[i].required && !checked.length) {
      if (this.calendar.options.params[i].missingtext) userError(this.calendar.options.params[i].missingtext);
      else userError(tr('Missing parameter'));
      return;
    }
  }
  $.ajax({
    url: ajaxUrl,
    type: 'POST',
    dataType: 'json',
    data: {
      mode: 'calendarinsert',
      src: this.calendar.options.src,
      param1: $('input[name=select1]:checked').closest('tr').data('rowid'),
      param2: $('input[name=select2]:checked').closest('tr').data('rowid'),
      start: start.format(),
      end: end.format(),
      title: title
    },
    context: this,
    success: function(data) {
      if (data.error) alert(data.error);
      this.calendar.refetchEvents();
    },
    error: function(jqXHR, testStatus, errorThrown) {
      alert(errorThrown);
    }
  });
}
function calendarDelete(src, id, successFunc) {
  $.ajax({
    url: ajaxUrl,
    type: 'POST',
    dataType: 'json',
    data: {
      mode: 'calendardelete',
      src: src,
      id: id
    },
    success: successFunc,
    error: function(jqXHR, textStatus, errorThrown) {
      alert(errorThrown);
    }
  });
}

/* * * * * * * * * * * * *
 *                       *
 *   3rd-party scripts   *
 *                       *
 * * * * * * * * * * * * */

// Array Remove - By John Resig (MIT licensed) - http://ejohn.org/blog/javascript-array-remove/
Array.prototype.remove = function(from, to) {
  var rest = this.slice((to || from) + 1 || this.length);
  this.length = from < 0 ? this.length + from : from;
  return this.push.apply(this, rest);
};

// jQuery Textarea AutoSize plugin - By Javier Julio (MIT licensed) - https://github.com/javierjulio/textarea-autosize
;(function ($, window, document, undefined) {
  var pluginName = "textareaAutoSize";
  var pluginDataName = "plugin_" + pluginName;
  var containsText = function (value) {
    return (value.replace(/\s/g, '').length > 0);
  };

  function Plugin(element, options) {
    this.element = element;
    this.$element = $(element);
    this.init();
  }

  Plugin.prototype = {
    init: function() {
      var height = this.$element.outerHeight();
      var diff = parseInt(this.$element.css('paddingBottom')) +
                 parseInt(this.$element.css('paddingTop')) || 0;

      if (containsText(this.element.value)) {
        this.$element.height(this.element.scrollHeight - diff);
      }

      // keyup is required for IE to properly reset height when deleting text
      this.$element.on('input keyup', function(event) {
        var $window = $(window);
        var currentScrollPosition = $window.scrollTop();

        $(this)
          .height(0)
          .height(this.scrollHeight - diff);

        $window.scrollTop(currentScrollPosition);
      });
    }
  };

  $.fn[pluginName] = function (options) {
    this.each(function() {
      if (!$.data(this, pluginDataName)) {
        $.data(this, pluginDataName, new Plugin(this, options));
      }
    });
    return this;
  };

})(jQuery, window, document);
