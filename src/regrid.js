import {
  getHeaderHTML,
  getBodyHTML,
  getRowHTML,
  getColumnHTML,
  prepareRowHeader,
  prepareRows,
  getDefault,
  escapeRegExp
} from './utils.js';
import $ from 'jQuery';
import Clusterize from 'clusterize.js';

import './style.scss';

export default class ReGrid {
  constructor({
    wrapper,
    events,
    data,
    addSerialNoColumn,
    enableClusterize,
    enableLogs
  }) {
    this.wrapper = $(wrapper);
    if (this.wrapper.length === 0) {
      throw new Error('Invalid argument given for `wrapper`');
    }

    this.events = getDefault(events, {});
    this.addSerialNoColumn = getDefault(addSerialNoColumn, false);
    this.enableClusterize = getDefault(enableClusterize, false);
    this.enableLogs = getDefault(enableLogs, true);

    this.makeDom();
    this.bindEvents();
    if (data) {
      this.data = this.prepareData(data);
      this.render();
    }
  }

  makeDom() {
    this.wrapper.html(`
      <div class="data-table">
        <table class="data-table-header table table-bordered">
        </table>
        <div class="body-scrollable">
        </div>
        <div class="data-table-footer">
        </div>
        <div class="data-table-popup">
          <div class="edit-popup"></div>
        </div>
      </div>
    `);

    this.header = this.wrapper.find('.data-table-header');
    this.bodyScrollable = this.wrapper.find('.body-scrollable');
    // this.body = this.wrapper.find('.data-table-body');
    this.footer = this.wrapper.find('.data-table-footer');
  }

  render() {
    if (this.wrapper.find('.data-table').length === 0) {
      this.makeDom();
      this.bindEvents();
    }

    this.renderHeader();
    this.renderBody();
    this.setDimensions();
  }

  renderHeader() {
    // fixed header
    this.header.html(getHeaderHTML(this.data.columns));
  }

  renderBody() {
    if (this.enableClusterize) {
      this.renderBodyWithClusterize();
    } else {
      this.renderBodyHTML();
    }
  }

  renderBodyHTML() {
    // scrollable body
    this.bodyScrollable.html(`
      <table class="data-table-body table table-bordered">
        ${getBodyHTML(this.data.rows)}
      </table>
    `);
  }

  renderBodyWithClusterize() {
    // empty body
    this.bodyScrollable.html(`
      <table class="data-table-body table table-bordered">
        ${getBodyHTML([])}
      </table>
    `);

    this.start = 0;
    this.pageLength = 1000;
    this.end = this.start + this.pageLength;

    const initialData = this.getDataForClusterize(
      // only append ${this.pageLength} rows in the beginning
      // defer remaining rows
      this.data.rows.slice(this.start, this.end)
    );

    this.clusterize = new Clusterize({
      rows: initialData,
      scrollElem: this.bodyScrollable.get(0),
      contentElem: this.bodyScrollable.find('tbody').get(0)
    });

    this.appendRemainingData();
  }

  appendRemainingData() {
    let dataAppended = this.pageLength;
    const promises = [];

    while (dataAppended + this.pageLength < this.data.rows.length) {
      this.start = this.end;
      this.end = this.start + this.pageLength;
      promises.push(this.appendNextPagePromise(this.start, this.end));
      dataAppended += this.pageLength;
    }

    if (this.data.rows.length % this.pageLength > 0) {
      // last page
      this.start = this.end;
      this.end = this.start + this.pageLength;
      promises.push(this.appendNextPagePromise(this.start, this.end));
    }

    return promises.reduce(
      (prev, cur) => prev.then(cur), Promise.resolve()
    );
  }

  appendNextPagePromise(start, end) {
    return new Promise(resolve => {
      setTimeout(() => {
        const rows = this.data.rows.slice(start, end);
        const data = this.getDataForClusterize(rows);

        this.clusterize.append(data);
        this.log('dataAppended', rows.length);
        resolve();
      }, 0);
    });
  }

  getDataForClusterize(rows) {
    return rows.map((row) => getRowHTML(row, { rowIndex: row[0].rowIndex }));
  }

  updateCell(rowIndex, colIndex, value) {
    const row = this.getRow(rowIndex);
    const cell = row.find(cell => cell.col_index === colIndex);

    cell.data = value;
    this.refreshCell(cell);
  }

  refreshRows() {
    this.renderBody();
    this.setDimensions();
  }

  refreshCell(cell) {
    const selector = `.data-table-col[data-row-index="${cell.row_index}"][data-col-index="${cell.col_index}"]`;
    const $cell = this.body.find(selector);
    const $newCell = $(getColumnHTML(cell));

    $cell.replaceWith($newCell);
  }

  prepareData(data) {
    let { columns, rows } = data;

    if (this.addSerialNoColumn) {
      const serialNoColumn = {
        content: 'Sr. No',
        resizable: false
      };

      columns = [serialNoColumn].concat(columns);

      rows = rows.map((row, i) => {
        const val = (i + 1) + '';

        return [val].concat(row);
      });
    }

    const _columns = prepareRowHeader(columns);
    const _rows = prepareRows(rows);

    return {
      columns: _columns,
      rows: _rows
    };
  }

  prepareColumns(columns) {
    return columns.map((col, i) => {
      col.colIndex = i;
      col.isHeader = 1;
      col.format = val => `<span>${val}</span>`;
      return col;
    });
  }

  bindEvents() {
    const self = this;

    this.bodyScrollable.on('click', '.data-table-col', function () {
      const $col = $(this);

      self.bodyScrollable.find('.data-table-col').removeClass('selected');
      $col.addClass('selected');
    });

    this.bindEditCell();
    this.bindResizeColumn();
    this.bindSortColumn();
  }

  setDimensions() {
    const self = this;

    // setting width as 0 will ensure that the
    // header doesn't take the available space
    this.header.css({
      width: 0,
      margin: 0
    });

    this.minWidthMap = [];
    // set the width for each column
    this.header.find('.data-table-col').each(function () {
      const col = $(this);
      const width = col.find('.content').width();
      const colIndex = col.attr('data-col-index');

      self.minWidthMap[colIndex] = width;
      self.setColumnWidth(colIndex, width);
    });

    this.setBodyWidth();

    this.setStyle(
      '.data-table .body-scrollable',
      `margin-top: ${this.header.height() + 1}px;`
    );

    this.bodyScrollable.find('.table').css('margin', 0);
  }

  bindEditCell() {
    const { events } = this;
    const $editPopup = this.wrapper.find('.edit-popup');

    $editPopup.hide();
    if (!events.on_cell_doubleclick) return;

    this.bodyScrollable.on('dblclick', '.data-table-col', function () {
      const $cell = $(this);
      const rowIndex = $cell.attr('data-row-index');
      const colIndex = $cell.attr('data-col-index');

      $editPopup.empty();
      const { top, left } = $cell.position();

      $editPopup.css({
        top: top - 12,
        left: left - 12
      });

      // showing the popup is the responsibility of event handler
      events.on_cell_doubleclick(
        $cell.get(0),
        $editPopup,
        rowIndex,
        colIndex
      );
    });

    $(document.body).on('click', e => {
      if ($(e.target).is('.edit-popup, .edit-popup *')) return;
      $editPopup.hide();
    });
  }

  bindResizeColumn() {
    const self = this;
    let isDragging = false;
    let $currCell, startWidth, startX;

    this.header.on('mousedown', '.data-table-col', function (e) {
      $currCell = $(this);
      const colIndex = $currCell.attr('data-col-index');
      const col = self.getColumn(colIndex);

      if (col && col.resizable === false) {
        return;
      }

      isDragging = true;
      startWidth = $currCell.find('.content').width();
      startX = e.pageX;
    });

    $('body').on('mouseup', function (e) {
      if (!$currCell) return;
      isDragging = false;
      // const colIndex = $currCell.attr('data-col-index');

      if ($currCell) {
        // const width = $currCell.find('.content').css('width');

        // self.setColumnWidth(colIndex, width);
        // self.setBodyWidth();
        $currCell = null;
      }
    });

    $('body').on('mousemove', function (e) {
      if (!isDragging) return;
      const finalWidth = startWidth + (e.pageX - startX);
      const colIndex = $currCell.attr('data-col-index');

      if (self.getColumnMinWidth(colIndex) > finalWidth) {
        // don't resize past minWidth
        return;
      }

      self.setColumnWidth(colIndex, finalWidth);
      self.setBodyWidth();
      // self.setColumnHeaderWidth($currCell, finalWidth);
    });
  }

  bindSortColumn() {
    const self = this;

    this.header.on('click', '.data-table-col .content span', function () {
      const $cell = $(this).closest('.data-table-col');
      const sortAction = getDefault($cell.attr('data-sort-action'), 'none');
      const colIndex = $cell.attr('data-col-index');

      if (sortAction === 'none') {
        $cell.attr('data-sort-action', 'asc');
        $cell.find('.sort-indicator').text('▲');
      } else if (sortAction === 'asc') {
        $cell.attr('data-sort-action', 'desc');
        $cell.find('.sort-indicator').text('▼');
      } else if (sortAction === 'desc') {
        $cell.attr('data-sort-action', 'none');
        $cell.find('.sort-indicator').text('');
      }

      // sortWith this action
      const sortWith = $cell.attr('data-sort-action');

      if (self.events.onSort) {
        self.events.onSort(colIndex, sortWith);
      } else {
        self.sortRows(colIndex, sortWith);
        self.refreshRows();
      }
    });
  }

  sortRows(colIndex, sortAction = 'none') {
    colIndex = +colIndex;

    this.data.rows.sort((a, b) => {
      const _aIndex = a[0].rowIndex;
      const _bIndex = b[0].rowIndex;
      const _a = a[colIndex].content;
      const _b = b[colIndex].content;

      if (sortAction === 'none') {
        return _aIndex - _bIndex;
      } else if (sortAction === 'asc') {
        if (_a < _b) return -1;
        if (_a > _b) return 1;
        if (_a === _b) return 0;
      } else if (sortAction === 'desc') {
        if (_a < _b) return 1;
        if (_a > _b) return -1;
        if (_a === _b) return 0;
      }
      return 0;
    });
  }

  setColumnWidth(colIndex, width) {
    this.setStyle(
      `[data-col-index="${colIndex}"] .content`,
      `width: ${width}px;`
    );
  }

  setRowHeight(rowIndex, height) {
    self.setStyle(
      `[data-row-index="${rowIndex}"] .content`,
      `width: ${height}px;`
    );
  }

  setColumnHeaderWidth(colIndex, width) {
    colIndex = +colIndex;
    let $cell;

    if (typeof colIndex === 'number') {
      $cell = this.getColumnHeaderElement(colIndex);
    } else {
      // directly element is passed
      $cell = colIndex;
    }

    $cell.find('.content').width(width);
  }

  setColumnWidths() {
    const availableWidth = this.wrapper.width();
    const headerWidth = this.header.width();

    if (headerWidth > availableWidth) {
      // don't resize, horizontal scroll takes place
      return;
    }

    const deltaWidth = (availableWidth - headerWidth) / this.data.columns.length;

    this.data.columns.map(col => {
      const width = this.getColumnHeaderElement(col.colIndex).width();
      let finalWidth = width + deltaWidth - 16;

      if (this.addSerialNoColumn && col.colIndex === 0) {
        return;
      }

      this.setColumnHeaderWidth(col.colIndex, finalWidth);
      this.setColumnWidth(col.colIndex, finalWidth);
    });
    this.setBodyWidth();
  }

  setBodyWidth() {
    this.bodyScrollable.css(
      'width',
      parseInt(this.header.css('width'), 10) + 1
    );
  }

  setStyle(rule, style) {
    this.getStyleEl();

    let styles = this.$style.text();
    const rulePatternStr = `${escapeRegExp(rule)} {([^}]*)}`;
    const rulePattern = new RegExp(rulePatternStr, 'g');

    if (styles.match(rulePattern)) {
      // rules exists, append/replace properties
      const property = style.split(':')[0];
      const propPattern = new RegExp(`${escapeRegExp(property)}[^;]*;`);

      styles = styles.replace(rulePattern, function (match, propertyStr) {
        if (propertyStr.match(propPattern)) {
          // property exists, replace with empty string
          propertyStr = propertyStr.replace(propPattern, '');
        }
        propertyStr = propertyStr.trim();

        const replacer =
          `${rule} {${propertyStr}${style}}`;

        return replacer;
      });
    } else {
      // rules doesn't exists, add rule with properties
      styles += `${rule} {${style}}`;
    }

    this.$style.html(styles);
  }

  getStyleEl() {
    if (!this.$style) {
      this.$style = $('<style data-id="regrid"></style>')
        .prependTo(this.wrapper);
    }

    return this.$style;
  }

  getColumn(colIndex) {
    colIndex = +colIndex;
    return this.data.columns.find(col => col.colIndex === colIndex);
  }

  getRow(rowIndex) {
    rowIndex = +rowIndex;
    return this.data.rows.find(row => row[0].rowIndex === rowIndex);
  }

  getColumnHeaderElement(colIndex) {
    colIndex = +colIndex;
    if (colIndex < 0) return null;
    return this.wrapper.find(
      `.data-table-col[data-is-header][data-col-index="${colIndex}"]`
    );
  }

  getColumnMinWidth(colIndex) {
    colIndex = +colIndex;
    return this.minWidthMap && this.minWidthMap[colIndex];
  }

  log() {
    if (this.enableLogs) {
      console.log.apply(console, arguments);
    }
  }
}
