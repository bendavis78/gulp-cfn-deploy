var inq = require('inquirer');
var chalk = require('chalk');
var BaseTable = require('cli-table');
var extend = require('util')._extend;

var theme = {
  error: chalk.red,
  warn: chalk.yellow,
  notice: chalk.cyan,
  ok: chalk.green,
  info: chalk.blue
};

function getLogger(type) {
  return function(msg) {
    msg = theme[type].bold('[%s]') + ' ' + msg;
    var params = [msg, type].concat(Array.prototype.slice.call(arguments, 1));
    var logger = type === 'warn' ? 'error' : (console[type] ? type: 'log');
    return console[logger].apply(console, params);
  };
}

var log = {};
for (var k in theme) {
  log[k] = getLogger(k);
}

function confirm(msg, cbYes, cbNo) {
  var opts = {
    type: 'confirm',
    name: 'val',
    message: msg,
    default: false
  };
  return inq.prompt([opts], function(res) {
    if (res.val) {
      cbYes(null);
    } else if (cbNo) {
      cbNo(null);
    }
  });
}

function Table(map, config) {
  this.map = map;
  config = extend({
    head: Object.keys(this.map),
    style: {head: ['gray', 'bold']}
  }, config || {});
  BaseTable.call(this, config);
}
Table.prototype = Object.create(BaseTable.prototype);
Table.constructor = Table;

Table.prototype.push = function(data) {
  var row = [];
  for (var header in this.map) {
    row.push(data[this.map[header]] || '');
  }
  BaseTable.prototype.push.call(this, row);
};

Table.prototype.print = function() {
  console.log(this.toString());
};

module.exports = {
  log: log,
  confirm: confirm,
  theme: theme,
  Table: Table
};
